#!/usr/bin/env python3
"""
MaiFarm Orchestrator — Professional Refactor

A robust tmux-based orchestrator to spin up multiple collaborating AI agents
(Claude or OpenAI) inside a single session with tiled panes.

Highlights vs. the original:
- Safer subprocess usage (no shell=True), explicit error handling, and rich logs.
- Cross-checks for required binaries (tmux and provider CLIs when applicable).
- Atomic JSON writes for coordination files to avoid partial/corrupt files.
- Stronger type hints and structured configuration.
- Clear separation of concerns (session mgmt, prompt prep, launching, monitoring).
- Path handling with pathlib; quoting for tmux send-keys commands.
- Optional reuse of existing sessions; graceful shutdown and time-bounded runs.
- Pane labeling so panes are self-describing.
- Optional steps orchestration: static assignment or collaborative queue with a simple file lock.

Note: Provider commands are best-effort templates. You can override via env vars
(e.g., CLAUDE_BIN) or adjust in build_provider_command().
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import re
import shlex
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    import yaml  # type: ignore
except Exception:  # pragma: no cover - optional dep
    yaml = None  # noqa: N816

# --------------------------------------------------------------------------------------
# Logging
# --------------------------------------------------------------------------------------
LOG_FORMAT = "[%(asctime)s] [%(levelname)s] %(message)s"
logging.basicConfig(level=logging.INFO, format=LOG_FORMAT, datefmt="%Y-%m-%d %H:%M:%S")
logger = logging.getLogger("maifarm.orchestrator")


# --------------------------------------------------------------------------------------
# Utility helpers
# --------------------------------------------------------------------------------------

def check_binary(name: str, env_var: Optional[str] = None) -> Optional[str]:
    """Return full path to a binary if present, else None.

    Looks up an optional env override (e.g., CLAUDE_BIN) before PATH.
    """
    if env_var and (override := os.environ.get(env_var)):
        if shutil.which(override):
            return override
        return None
    return shutil.which(name)


def run_cmd(
    args: List[str],
    *,
    check: bool = False,
    capture: bool = True,
    cwd: Optional[Path] = None,
) -> subprocess.CompletedProcess:
    """Run a subprocess with consistent defaults and logging."""
    log_cmd = " ".join(shlex.quote(a) for a in args)
    logger.debug("$ %s", log_cmd)

    # Set TMUX_TMPDIR=/tmp for tmux commands to ensure session visibility
    env = os.environ.copy()
    if len(args) > 0 and args[0] == "tmux":
        env["TMUX_TMPDIR"] = "/tmp"

    return subprocess.run(
        args,
        check=check,
        capture_output=capture,
        text=True,
        cwd=str(cwd) if cwd else None,
        env=env,
    )


def read_prompt_file(path: str) -> str:
    """Read the contents of a prompt file."""
    with open(path, 'r', encoding='utf-8') as f:
        return f.read().strip()


def atomic_write_json(path: Path, data: Any) -> None:
    """Atomically write JSON to disk to avoid partial files."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", delete=False, dir=str(path.parent), encoding="utf-8") as tmp:
        json.dump(data, tmp, indent=2)
        tmp.flush()
        os.fsync(tmp.fileno())
        tmp_path = Path(tmp.name)
    tmp_path.replace(path)


# --------------------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------------------

@dataclass
class OrchestratorConfig:
    session_name: str
    farm_id: str
    workspace_dir: Path
    coordination_dir: Path
    num_agents: int
    provider: str
    prompt: str
    agent_names: List[str]
    agent_configs: List[Dict[str, Any]]  # Added: Full agent configurations from YAML
    context_files: List[Path]
    harvest_id: Optional[str] = None
    # Steps & collaboration
    steps: List[Dict[str, Any]] = field(default_factory=list)
    bundle_size: Optional[int] = None
    collaborative: bool = False
    # Runtime behavior
    max_runtime: Optional[int] = None
    stagger_seconds: int = 0
    reuse_session: bool = False
    kill_on_exit: bool = True


# --------------------------------------------------------------------------------------
# Orchestrator
# --------------------------------------------------------------------------------------

class AgentOrchestrator:
    """Manage a tmux session with N collaborating agents."""

    def __init__(self, cfg: OrchestratorConfig) -> None:
        self.cfg = cfg
        self.start_time = datetime.now()
        self.shutdown_requested = False

        # Track Claude process PIDs for proper monitoring
        self.agent_pids: Dict[int, Optional[int]] = {}  # agent_idx -> claude_pid

        # Ensure dirs
        self.cfg.workspace_dir.mkdir(parents=True, exist_ok=True)
        self.cfg.coordination_dir.mkdir(parents=True, exist_ok=True)

        # Signals
        signal.signal(signal.SIGINT, self._on_signal)
        signal.signal(signal.SIGTERM, self._on_signal)

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------
    def _on_signal(self, signum, _frame) -> None:
        logger.info("Received signal %s; beginning graceful shutdown…", signum)
        self.shutdown_requested = True
        self.graceful_shutdown()

    def _write_orchestrator_status(self, status: str, panes_ready: List[int] = None, error: str = None) -> None:
        """Write orchestrator status for Node.js coordination."""
        if panes_ready is None:
            panes_ready = []

        status_data = {
            "status": status,
            "sessionName": self.cfg.session_name,
            "farmId": self.cfg.farm_id,
            "panesCreated": self.cfg.num_agents,
            "panesReady": panes_ready,
            "timestamp": datetime.now().isoformat(),
            "orchestratorPid": os.getpid()
        }

        if error:
            status_data["error"] = error

        # Write to coordination directory
        maibarn_root = Path.cwd() / "var" / "maibarn"
        coordination_dir = maibarn_root / "coordination"
        coordination_dir.mkdir(parents=True, exist_ok=True)

        status_file = coordination_dir / f"orchestrator_status_{self.cfg.farm_id}.json"
        atomic_write_json(status_file, status_data)
        logger.info("Wrote orchestrator status: %s -> %s", status, status_file)

    def run(self) -> None:
        if not check_binary("tmux"):
            logger.error("tmux is required but not found on PATH. Please install tmux.")
            sys.exit(1)

        # Write initial status
        self._write_orchestrator_status("initializing")

        exists = self._session_exists(self.cfg.session_name)
        if not self.cfg.reuse_session:
            self._kill_session_if_exists(self.cfg.session_name)

            # Write status before creating session
            self._write_orchestrator_status("creating_session")
            self._create_session(self.cfg.session_name, self.cfg.num_agents)
        else:
            if exists:
                logger.info("Reusing existing tmux session: %s", self.cfg.session_name)
                self._ensure_panes(self.cfg.session_name, self.cfg.num_agents)
            else:
                logger.info("No existing session found; creating new: %s", self.cfg.session_name)
                self._create_session(self.cfg.session_name, self.cfg.num_agents)

        # Verify session is ready with all panes
        if not self._verify_session_ready():
            logger.warning("Session verification failed, but continuing anyway")
        
        # Label panes with agent names for self-describing layout
        self._label_panes()

        # Prepare steps/assignments or collaborative queue for prompts
        self._prepare_steps()

        # Launch agents
        for agent_idx in range(self.cfg.num_agents):
            pane = f"{self.cfg.session_name}:agents.{agent_idx}"
            self._launch_agent(agent_idx, pane)
            if 0 < self.cfg.stagger_seconds and agent_idx < self.cfg.num_agents - 1:
                time.sleep(self.cfg.stagger_seconds)

        # Monitor and enforce max runtime
        self._monitor_agents()

        # Collect outputs (best-effort) and shutdown
        self.collect_outputs()
        self.graceful_shutdown()

    # ------------------------------------------------------------------
    # tmux session management
    # ------------------------------------------------------------------
    def _kill_session_if_exists(self, session: str) -> None:
        # tmux has-session returns 0 iff exists
        exists = run_cmd(["tmux", "has-session", "-t", session]).returncode == 0
        if exists:
            logger.info("Killing existing tmux session: %s", session)
            run_cmd(["tmux", "kill-session", "-t", session])
            time.sleep(0.2)

    def _session_exists(self, session: str) -> bool:
        return run_cmd(["tmux", "has-session", "-t", session]).returncode == 0

    def _get_pane_count(self, session: str) -> int:
        cp = run_cmd(["tmux", "display-message", "-p", "#{window_panes}", "-t", f"{session}:agents"], capture=True)
        try:
            return int((cp.stdout or "0").strip()) if cp.returncode == 0 else 0
        except ValueError:
            return 0

    def _setup_pipe_pane_for_all_panes(self, session: str, num_agents: int) -> None:
        """Set up pipe-pane for all panes in the session."""
        terminals_dir = Path.cwd() / "var" / "maibarn" / "terminals" / self.cfg.farm_id
        terminals_dir.mkdir(parents=True, exist_ok=True)
        logger.info("Ensuring terminals directory exists: %s", terminals_dir)

        for i in range(num_agents):
            log_file = terminals_dir / f"agent-{i}.log"
            pane_target = f"{session}:agents.{i}"

            # Create log file if it doesn't exist
            if not log_file.exists():
                log_file.write_text(f"# Terminal output for Agent {i}\n")
                logger.info("Created log file: %s", log_file)

            # Kill any existing pipe-pane first (idempotent)
            run_cmd(["tmux", "pipe-pane", "-t", pane_target], capture=True)  # Kill existing
            time.sleep(0.1)

            # Set up new pipe-pane
            run_cmd(["tmux", "pipe-pane", "-t", pane_target, "-o", f"cat >> {log_file}"])
            logger.info("Set up pipe-pane for pane %d -> %s", i, log_file)

            # Send initial marker to confirm pipe-pane is working
            run_cmd(["tmux", "send-keys", "-t", pane_target, f"echo '[PIPE-PANE] Output capture started for Agent {i}'", "Enter"])

    def _ensure_panes(self, session: str, num_agents: int) -> None:
        """Ensure session has correct number of panes with pipe-pane configured."""
        current = self._get_pane_count(session)
        if current >= num_agents:
            logger.info("Session already has %d panes (need %d)", current, num_agents)
            # Even if panes exist, ensure pipe-pane is set up for all
            self._setup_pipe_pane_for_all_panes(session, num_agents)
            return

        logger.info("Adding %d pane(s) to reach %d total", num_agents - current, num_agents)
        for i in range(current, num_agents):
            direction = "-h" if i % 2 else "-v"
            run_cmd(["tmux", "split-window", direction, "-t", f"{session}:agents"])
        run_cmd(["tmux", "select-layout", "-t", f"{session}:agents", "tiled"])  # best-effort

        # Set up pipe-pane for all panes (including existing ones)
        self._setup_pipe_pane_for_all_panes(session, num_agents)

    def _create_session(self, session: str, num_agents: int) -> None:
        """Create a new tmux session with all panes and pipe-pane configured."""
        logger.info("Creating tmux session '%s' with %d pane(s)", session, num_agents)

        cp = run_cmd(["tmux", "new-session", "-d", "-s", session, "-n", "agents"])
        if cp.returncode != 0:
            logger.error("Failed to create tmux session: %s", cp.stderr.strip())
            sys.exit(1)

        # Wait for session with proper verification loop
        session_ready = False
        for attempt in range(10):
            verify_cp = run_cmd(["tmux", "has-session", "-t", session])
            if verify_cp.returncode == 0:
                # Also verify the agents window exists
                window_check = run_cmd(["tmux", "list-windows", "-t", session, "-F", "#{window_name}"], capture=True)
                if window_check.returncode == 0 and "agents" in window_check.stdout:
                    session_ready = True
                    break
            time.sleep(0.5)

        if not session_ready:
            logger.error("Session %s was not created properly after 5 seconds", session)
            sys.exit(1)

        # Create additional panes (we start with 1 pane, need num_agents - 1 more)
        for i in range(1, num_agents):
            # Alternate split direction to get a pleasant grid before tiling
            direction = "-h" if i % 2 else "-v"
            cp = run_cmd(["tmux", "split-window", direction, "-t", f"{session}:agents"])
            if cp.returncode != 0:
                logger.warning("Failed to create pane %d: %s", i, cp.stderr.strip())
                logger.error("Tmux pane creation failed, expected %d panes but may have fewer", num_agents)
                continue

        run_cmd(["tmux", "select-layout", "-t", f"{session}:agents", "tiled"])  # best-effort

        # Set up pipe-pane for ALL panes using unified method
        self._setup_pipe_pane_for_all_panes(session, num_agents)

    def _verify_and_recover_pipe_pane(self, pane_index: int, session: str) -> bool:
        """Verify pipe-pane is active and recover if needed."""
        terminals_dir = Path.cwd() / "var" / "maibarn" / "terminals" / self.cfg.farm_id
        log_file = terminals_dir / f"agent-{pane_index}.log"
        pane = f"{session}:agents.{pane_index}"

        # Check if log file exists
        if not log_file.exists():
            logger.warning(f"Log file for pane {pane_index} missing, creating and setting up pipe-pane")
            log_file.write_text(f"# Terminal output for Agent {pane_index}\n")

        # Get initial file size
        initial_size = log_file.stat().st_size if log_file.exists() else 0

        # Send a test message
        test_msg = f"[PIPE-TEST] Verifying output capture for Agent {pane_index} at {datetime.now().isoformat()}"
        run_cmd(["tmux", "send-keys", "-t", pane, f"echo '{test_msg}'", "Enter"])
        time.sleep(0.5)

        # Check if file size increased
        current_size = log_file.stat().st_size if log_file.exists() else 0

        if current_size <= initial_size:
            logger.warning(f"Pipe-pane for pane {pane_index} not capturing, re-establishing")
            # Re-establish pipe-pane
            run_cmd(["tmux", "pipe-pane", "-t", pane, "-o", f"exec cat >> {log_file}"])
            time.sleep(0.5)

            # Test again
            run_cmd(["tmux", "send-keys", "-t", pane, f"echo '[PIPE-RECOVERED] Output capture restored for Agent {pane_index}'", "Enter"])
            time.sleep(0.5)

            final_size = log_file.stat().st_size if log_file.exists() else 0
            if final_size > current_size:
                logger.info(f"Successfully recovered pipe-pane for pane {pane_index}")
                return True
            else:
                logger.error(f"Failed to recover pipe-pane for pane {pane_index}")
                return False
        else:
            logger.debug(f"Pipe-pane for pane {pane_index} is working correctly")
            return True

    def _verify_session_ready(self, timeout: int = 30) -> bool:
        """Verify tmux session and panes are ready."""
        start_time = time.time()

        logger.info("Verifying tmux session %s is ready with %d panes...", self.cfg.session_name, self.cfg.num_agents)

        while time.time() - start_time < timeout:
            # Check session exists
            result = run_cmd(["tmux", "has-session", "-t", self.cfg.session_name])
            if result.returncode != 0:
                time.sleep(0.5)
                continue

            # Check pane count
            result = run_cmd(["tmux", "list-panes", "-t", f"{self.cfg.session_name}:0", "-F", "#{{pane_index}}"])
            if result.returncode == 0:
                pane_count = len([line for line in result.stdout.strip().split('\n') if line])
                if pane_count >= self.cfg.num_agents:
                    logger.info("Session %s verified with %d panes", self.cfg.session_name, pane_count)

                    # Verify pipe-pane is working for each pane
                    all_pipes_working = True
                    for i in range(self.cfg.num_agents):
                        if not self._verify_and_recover_pipe_pane(i, self.cfg.session_name):
                            all_pipes_working = False

                    if not all_pipes_working:
                        logger.warning("Some pipe-panes could not be recovered")

                    # Write verification status to coordination
                    status = {
                        "session": self.cfg.session_name,
                        "farm_id": self.cfg.farm_id,
                        "panes_ready": pane_count,
                        "pipes_verified": all_pipes_working,
                        "verified_at": datetime.now().isoformat(),
                        "orchestrator_pid": os.getpid(),
                        "orchestrator_status": "healthy"
                    }
                    atomic_write_json(self.cfg.coordination_dir / "session_verified.json", status)

                    # Also write orchestrator heartbeat file for monitoring
                    self._write_heartbeat()

                    # Write ready status with pane list
                    panes_ready = list(range(pane_count))
                    self._write_orchestrator_status("ready", panes_ready)

                    return True
                else:
                    logger.debug("Session has %d/%d panes", pane_count, self.cfg.num_agents)

            time.sleep(0.5)

        logger.error("Session %s verification timeout after %d seconds", self.cfg.session_name, timeout)

        # Write timeout status
        self._write_orchestrator_status("timeout", error=f"Session verification timeout after {timeout}s")

        return False

    def _write_heartbeat(self) -> None:
        """Write orchestrator heartbeat for health monitoring."""
        heartbeat = {
            "pid": os.getpid(),
            "session_name": self.cfg.session_name,
            "farm_id": self.cfg.farm_id,
            "num_agents": self.cfg.num_agents,
            "status": "running",
            "last_heartbeat": datetime.now().isoformat()
        }
        atomic_write_json(self.cfg.coordination_dir / "orchestrator_heartbeat.json", heartbeat)

    # ------------------------------------------------------------------
    # Steps preparation and assignment
    # ------------------------------------------------------------------
    def _prepare_steps(self) -> None:
        """Prepare steps/assignments/queue files based on CLI flags."""
        self.assignments: Dict[int, List[Dict[str, Any]]] = {}
        self.steps_for_prompt: List[Dict[str, Any]] = []
        steps = self.cfg.steps or []
        if not steps:
            return
        steps_path = self.cfg.coordination_dir / "steps.json"
        if self.cfg.collaborative:
            enriched: List[Dict[str, Any]] = []
            for i, s in enumerate(steps, 1):
                item = dict(s)
                item.setdefault("id", s.get("id", f"step_{i}"))
                item.setdefault("title", s.get("title", f"Step {i}"))
                item["status"] = "pending"
                item["assigned_to"] = None
                enriched.append(item)
            atomic_write_json(steps_path, {"steps": enriched})
            atomic_write_json(self.cfg.coordination_dir / "work_claims.json", [])
            logger.info("Prepared collaborative steps and claim file: %s", steps_path)
            # Write a small claim tool that uses a lock for concurrency safety
            self._ensure_claim_tool()
            self.steps_for_prompt = enriched
            return

        # Static assignment
        total = len(steps)
        ids = list(range(total))
        if self.cfg.bundle_size and self.cfg.bundle_size > 0:
            bundle = self.cfg.bundle_size
            cursor = 0
            for i in range(self.cfg.num_agents):
                self.assignments[i] = []
                for _ in range(bundle):
                    if cursor >= total:
                        break
                    idx = ids[cursor]
                    cursor += 1
                    self.assignments[i].append(steps[idx])
            agent = 0
            while cursor < total:
                idx = ids[cursor]
                cursor += 1
                self.assignments.setdefault(agent, []).append(steps[idx])
                agent = (agent + 1) % self.cfg.num_agents
        else:
            # pure round-robin
            for i, step in enumerate(steps):
                agent = i % self.cfg.num_agents
                self.assignments.setdefault(agent, []).append(step)

        # Persist assignments for transparency
        assign_file = self.cfg.coordination_dir / "steps_assignments.json"
        serializable = {f"agent_{i}": self.assignments.get(i, []) for i in range(self.cfg.num_agents)}
        atomic_write_json(assign_file, serializable)
        self.steps_for_prompt = steps
        logger.info("Prepared static step assignments: %s", assign_file)

    # ------------------------------------------------------------------
    # Pane labeling
    # ------------------------------------------------------------------
    def _label_panes(self) -> None:
        """Auto-label panes with agent names and show titles on borders."""
        run_cmd(["tmux", "set-option", "-w", "-t", f"{self.cfg.session_name}:agents", "pane-border-status", "top"], capture=False)
        run_cmd(["tmux", "set-option", "-w", "-t", f"{self.cfg.session_name}:agents", "pane-border-format", "#P #{pane_title}"], capture=False)

        for i in range(self.cfg.num_agents):
            name = self.cfg.agent_names[i] if i < len(self.cfg.agent_names) else f"Agent {i + 1}"
            target = f"{self.cfg.session_name}:agents.{i}"
            cp = run_cmd(["tmux", "select-pane", "-t", target, "-T", name], capture=True)
            if cp.returncode != 0:
                logger.debug("Could not label pane %s: %s", target, (cp.stderr or "").strip())

    # ------------------------------------------------------------------
    # Claim tool writer
    # ------------------------------------------------------------------
    def _ensure_claim_tool(self) -> None:
        if not self.cfg.collaborative:
            return
        tool = self.cfg.coordination_dir / "claim_tool.py"
        code = f'''#!/usr/bin/env python3
import json, os, sys, time, tempfile
from pathlib import Path

COORD = Path(r"{self.cfg.coordination_dir}")
STEPS = COORD / "steps.json"
CLAIMS = COORD / "work_claims.json"
LOCK = COORD / "work_claims.lock"

# --- atomic write ---

def atomic_write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", delete=False, dir=str(path.parent), encoding="utf-8") as tmp:
        json.dump(data, tmp, indent=2)
        tmp.flush(); os.fsync(tmp.fileno())
        tmp_path = Path(tmp.name)
    tmp_path.replace(path)

# --- lock helpers ---

def acquire_lock(timeout=10.0, stale=60.0, poll=0.1):
    end = time.time() + timeout
    while True:
        try:
            fd = os.open(LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            with os.fdopen(fd, 'w') as f:
                f.write(f"{{os.getpid()}} {{time.time()}}\n")
            return
        except FileExistsError:
            # check staleness
            try:
                with open(LOCK, 'r') as f:
                    parts = f.read().strip().split()
                    ts = float(parts[1]) if len(parts) > 1 else 0.0
                if time.time() - ts > stale:
                    os.unlink(LOCK)
                    continue
            except Exception:
                pass
            if time.time() > end:
                print("lock timeout", file=sys.stderr)
                sys.exit(2)
            time.sleep(poll)

def release_lock():
    try:
        os.unlink(LOCK)
    except FileNotFoundError:
        pass

# --- core ops ---

def load_json(path, default):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def claim_next(agent):
    acquire_lock()
    try:
        data = load_json(STEPS, {"steps": []})
        steps = data.get("steps", [])
        for s in steps:
            if s.get("status") == "pending":
                s["status"] = "in_progress"
                s["assigned_to"] = agent
                s["claimed_at"] = time.time()
                atomic_write_json(STEPS, {"steps": steps})
                claims = load_json(CLAIMS, [])
                claims.append({"op": "claim", "step_id": s.get("id"), "agent": agent, "ts": time.time()})
                atomic_write_json(CLAIMS, claims)
                print(s.get("id"))
                return 0
        print("no-pending")
        return 1
    finally:
        release_lock()


def complete(step_id, agent):
    acquire_lock()
    try:
        data = load_json(STEPS, {"steps": []})
        steps = data.get("steps", [])
        for s in steps:
            if s.get("id") == step_id and s.get("assigned_to") == agent:
                s["status"] = "done"
                s["completed_at"] = time.time()
                atomic_write_json(STEPS, {"steps": steps})
                claims = load_json(CLAIMS, [])
                claims.append({"op": "complete", "step_id": step_id, "agent": agent, "ts": time.time()})
                atomic_write_json(CLAIMS, claims)
                print("ok")
                return 0
        print("not-found-or-not-owned")
        return 1
    finally:
        release_lock()


def release(step_id, agent):
    acquire_lock()
    try:
        data = load_json(STEPS, {"steps": []})
        steps = data.get("steps", [])
        for s in steps:
            if s.get("id") == step_id and s.get("assigned_to") == agent and s.get("status") == "in_progress":
                s["status"] = "pending"
                s["assigned_to"] = None
                atomic_write_json(STEPS, {"steps": steps})
                claims = load_json(CLAIMS, [])
                claims.append({"op": "release", "step_id": step_id, "agent": agent, "ts": time.time()})
                atomic_write_json(CLAIMS, claims)
                print("ok")
                return 0
        print("not-found-or-not-owned")
        return 1
    finally:
        release_lock()


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: claim|complete|release <agent|step_id> [agent]", file=sys.stderr)
        sys.exit(2)
    cmd = sys.argv[1]
    if cmd == 'claim':
        agent = sys.argv[2]
        sys.exit(claim_next(agent))
    elif cmd == 'complete':
        if len(sys.argv) < 4:
            print("Usage: complete <step_id> <agent>", file=sys.stderr); sys.exit(2)
        sys.exit(complete(sys.argv[2], sys.argv[3]))
    elif cmd == 'release':
        if len(sys.argv) < 4:
            print("Usage: release <step_id> <agent>", file=sys.stderr); sys.exit(2)
        sys.exit(release(sys.argv[2], sys.argv[3]))
    else:
        print("unknown command", file=sys.stderr); sys.exit(2)
'''
        tool.write_text(code, encoding="utf-8")
        try:
            os.chmod(tool, 0o755)
        except Exception:
            pass

    # ------------------------------------------------------------------
    # Collaborative instructions helper
    # ------------------------------------------------------------------
    def _collab_instructions(self, agent_name: str) -> str:
        claim_tool = self.cfg.coordination_dir / "claim_tool.py"
        return (
            "Commands (safe under lock):\n"
            f"- Claim next task: python {claim_tool} claim \"{agent_name}\"\n"
            f"- Complete a task: python {claim_tool} complete <step_id> \"{agent_name}\"\n"
            f"- Release a task: python {claim_tool} release <step_id> \"{agent_name}\"\n\n"
        )

    # ------------------------------------------------------------------
    # Prompt and provider command construction
    # ------------------------------------------------------------------
    def build_agent_prompt(self, agent_idx: int) -> str:
        agent_name = (
            self.cfg.agent_names[agent_idx]
            if agent_idx < len(self.cfg.agent_names)
            else f"Agent {agent_idx + 1}"
        )
        
        # Get agent config if available
        agent_config = None
        if agent_idx < len(self.cfg.agent_configs):
            agent_config = self.cfg.agent_configs[agent_idx]
            logger.info(f"Using agent config for {agent_name}: {agent_config.get('role', 'No role')}")
        
        # Build header with role information
        role_text = ""
        if agent_config and agent_config.get("role"):
            role_text = f"Role: {agent_config['role']}\n"
        
        header = (
            f"You are {agent_name} (Agent {agent_idx + 1} of {self.cfg.num_agents}) "
            f"working on farm {self.cfg.farm_id}.\n"
            f"{role_text}\n"
            f"Workspace: {self.cfg.workspace_dir}\n"
            f"Coordination dir: {self.cfg.coordination_dir}\n\n"
        )
        
        # Add agent-specific tasks from YAML
        yaml_tasks_text = ""
        if agent_config and agent_config.get("tasks"):
            tasks = agent_config["tasks"]
            if isinstance(tasks, list) and tasks:
                task_bullets = []
                for i, task in enumerate(tasks, 1):
                    if isinstance(task, dict):
                        task_text = task.get("description", task.get("title", str(task)))
                    else:
                        task_text = str(task)
                    task_bullets.append(f"  {i}. {task_text}")
                yaml_tasks_text = (
                    "Your Assigned Tasks:\n" + 
                    "\n".join(task_bullets) + 
                    "\n\n"
                )
                logger.info(f"Agent {agent_idx} has {len(tasks)} tasks from YAML")
        
        # Add capabilities if defined
        capabilities_text = ""
        if agent_config and agent_config.get("capabilities"):
            caps = agent_config["capabilities"]
            if isinstance(caps, list) and caps:
                capabilities_text = f"Capabilities: {', '.join(str(c) for c in caps)}\n\n"
        
        collab = (
            "Collaboration Rules:\n"
            "- Read var/maibarn/coordination/active_agents.json to see peers.\n"
            "- Use var/maibarn/coordination/work_claims.json to claim and avoid duplicate work.\n"
            "- Update progress regularly and avoid conflicts.\n\n"
        )

        steps_text = ""
        if self.cfg.steps:
            if self.cfg.collaborative:
                steps_text = (
                    "Task Queue (Collaborative):\n"
                    f"- Steps file: {self.cfg.coordination_dir / 'steps.json'}\n"
                    f"- Claims file: {self.cfg.coordination_dir / 'work_claims.json'}\n\n"
                )
            else:
                assigned = getattr(self, "assignments", {}).get(agent_idx, [])
                if assigned:
                    bullet = "\n".join(f"  • [{s.get('id')}] {s.get('title')}" for s in assigned)
                    steps_text = (
                        "Assigned Tasks (Static):\n" + bullet + "\n\n"
                    )

        # Combine all parts
        full_prompt = (
            header + 
            capabilities_text + 
            yaml_tasks_text +  # Include YAML-defined tasks
            collab + 
            steps_text + 
            (self._collab_instructions(agent_name) if self.cfg.collaborative else "") + 
            self.cfg.prompt.strip()
        )
        
        # Write task assignment to coordination file for tracking
        if agent_config:
            task_file = self.cfg.coordination_dir / f"agent_{agent_idx}_config.json"
            atomic_write_json(task_file, agent_config)
        
        return full_prompt

    def build_provider_command(self, provider: str, prompt: str, agent_idx: int = 0) -> str:
        """Return a command string to execute the provider with a prompt.

        For Claude provider, launches real Claude Code CLI directly.
        For other providers, uses appropriate CLI or fallback.
        """
        agent_name = self.cfg.agent_names[agent_idx] if agent_idx < len(self.cfg.agent_names) else f"Agent {agent_idx + 1}"

        # Write prompt to file for agent to read
        prompt_file = self.cfg.coordination_dir / f"agent_{agent_idx}_prompt.txt"
        prompt_file.write_text(prompt, encoding='utf-8')

        if provider == "claude":
            # Check for API key
            api_key = os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("CLAUDE_API_KEY") or ""

            # Check if Claude CLI exists
            claude_bin = check_binary("claude", env_var="CLAUDE_BIN")

            # If no Claude CLI or no valid API key, use mock
            if not claude_bin or not api_key or api_key.startswith("test-"):
                logger.warning(f"No valid Claude CLI or API key for agent {agent_idx} (CLI: {claude_bin is not None}, API key len: {len(api_key) if api_key else 0})")
                logger.info(f"Using mock agent with realistic output simulation")

                # Return a marker that tells _launch_agent to use the mock agent
                # Environment variables will be set separately in _launch_agent
                return "MOCK_AGENT:simple_mock_agent.py"

            # Launch real Claude Code with valid API key and increased memory
            logger.info(f"Launching real Claude Code for agent {agent_idx} ({agent_name}) with valid API key")

            # Set NODE_OPTIONS for reasonable memory allocation per agent
            # Dynamic memory allocation based on farm mode (defaults to 2GB if not specified)
            node_memory = os.environ.get('NODE_MEMORY_PER_AGENT', "2048")

            # Store prompt in a persistent file (not temp) in the coordination directory
            prompt_file_path = self.cfg.coordination_dir / f"agent_{agent_idx}_prompt.txt"
            prompt_file_path.write_text(prompt, encoding='utf-8')
            logger.info(f"Wrote prompt for agent {agent_idx} to {prompt_file_path}")

            # Return a marker that signals this needs special handling
            return f"CLAUDE_LAUNCH:{agent_idx}:{prompt_file_path}:{node_memory}"
            
        elif provider == "openai":
            api_key = os.environ.get("OPENAI_API_KEY") or ""
            if not api_key:
                logger.warning(f"No OpenAI API key for agent {agent_idx}")
                return f"echo '[MOCK] Agent {agent_idx} ({agent_name}) - No OpenAI key'; sleep 999999"
            
            # OpenAI doesn't have an official CLI like Claude, so we'll use a mock
            # In production, this could use a custom OpenAI CLI wrapper
            return f"echo '[OpenAI] Agent {agent_idx} ({agent_name}) starting...'; sleep 999999"
            
        else:  # mock or unknown provider
            logger.info(f"Using mock provider for agent {agent_idx}")
            # Use 'sleep 999999' instead of 'sleep infinity' for macOS compatibility
            return f"echo '[MOCK] Agent {agent_idx} ({agent_name}) ready'; sleep 999999"

    # ------------------------------------------------------------------
    # Agent launch & monitoring
    # ------------------------------------------------------------------
    def _send_tmux(self, pane: str, command: str, *, clear: bool = False, chdir: Optional[Path] = None) -> None:
        """Send a command to a tmux pane.
        
        CRITICAL: Commands should be properly formatted and escaped before calling
        this method. The command is sent as-is to the tmux pane.
        """
        if clear:
            run_cmd(["tmux", "send-keys", "-t", pane, "clear", "Enter"])
        if chdir is not None:
            # Send cd command with proper quoting for paths with spaces
            cd_cmd = f"cd {shlex.quote(str(chdir))}"
            run_cmd(["tmux", "send-keys", "-t", pane, cd_cmd, "Enter"])
            time.sleep(0.1)  # Small delay to ensure cd completes
        
        # Send the command to tmux - it should already be properly formatted
        run_cmd(["tmux", "send-keys", "-t", pane, command, "Enter"])
    
    def _verify_agent_ready(self, pane: str, agent_idx: int, timeout: int = 30) -> bool:
        """Verify that an agent is ready to receive input.

        Checks for output in the pane to confirm agent has started.
        Returns True if ready, False if timeout.
        """
        start_time = time.time()
        check_interval = 0.5

        while time.time() - start_time < timeout:
            # Capture pane content to check if agent has initialized
            result = run_cmd(["tmux", "capture-pane", "-t", pane, "-p"], capture=True)

            if result.stdout and len(result.stdout.strip()) > 0:
                # Look for signs that Claude is ready
                output = result.stdout.lower()
                if any(indicator in output for indicator in [
                    "claude", "ready", "started", "initialized",
                    "welcome", "assistant", "how can i help"
                ]):
                    logger.info(f"Agent {agent_idx} is ready (detected output)")
                    return True

                # Even if we don't see specific keywords, any substantial output is a good sign
                if len(result.stdout.strip()) > 50:
                    logger.info(f"Agent {agent_idx} appears ready (output detected)")
                    return True

            time.sleep(check_interval)

        logger.warning(f"Agent {agent_idx} not ready after {timeout}s timeout")
        return False

    def _send_prompt_to_pane(self, pane: str, prompt: str) -> None:
        """Send a prompt text to a tmux pane (for two-stage launch).

        This is used when the provider doesn't support -p flag and we need to
        send the prompt after the agent has initialized.
        """
        # Escape the prompt for safe transmission through tmux
        # Split into manageable chunks if needed
        lines = prompt.split('\n')
        for line in lines:
            if line.strip():  # Skip empty lines
                # Use literal mode to avoid shell interpretation
                run_cmd(["tmux", "send-keys", "-t", pane, "-l", line])
                run_cmd(["tmux", "send-keys", "-t", pane, "Enter"])
                time.sleep(0.05)  # Small delay between lines to avoid overwhelming

    def _launch_agent(self, agent_idx: int, pane: str) -> None:
        agent_prompt = self.build_agent_prompt(agent_idx)
        command = self.build_provider_command(self.cfg.provider, agent_prompt, agent_idx)
        logger.info("Launching agent %d in %s using provider '%s'", agent_idx + 1, pane, self.cfg.provider)

        # SIMPLIFIED: API keys are ONLY from database via parent process
        # Never source workspace .env files - they could contain stale/test keys
        logger.info("Using API keys from database (passed via parent process)")

        # Check if this is a mock agent command
        if command.startswith("MOCK_AGENT:"):
            # For mock agents, we need to set environment variables first
            agent_name = self.cfg.agent_names[agent_idx] if agent_idx < len(self.cfg.agent_names) else f"Agent {agent_idx + 1}"

            # IMPORTANT: Verify pipe-pane is active BEFORE clearing and setting environment
            terminals_dir = Path.cwd() / "var" / "maibarn" / "terminals" / self.cfg.farm_id
            log_file = terminals_dir / f"agent-{agent_idx}.log"

            # Check if log file exists and pipe-pane is set up
            if not log_file.exists():
                logger.warning(f"Log file for agent {agent_idx} not found, recreating pipe-pane")
                log_file.write_text(f"# Terminal output for Agent {agent_idx}\n")
                run_cmd(["tmux", "pipe-pane", "-t", pane, "-o", f"exec cat >> {log_file}"])
                time.sleep(0.5)

            # Now clear and set environment (pipe-pane should persist)
            run_cmd(["tmux", "send-keys", "-t", pane, "clear", "Enter"])
            time.sleep(0.1)  # Small delay after clear

            if self.cfg.workspace_dir:
                run_cmd(["tmux", "send-keys", "-t", pane, f"cd {shlex.quote(str(self.cfg.workspace_dir))}", "Enter"])
                time.sleep(0.1)

            # Set environment variables separately
            run_cmd(["tmux", "send-keys", "-t", pane, f"export AGENT_ID={agent_idx}", "Enter"])
            run_cmd(["tmux", "send-keys", "-t", pane, f"export AGENT_NAME={shlex.quote(agent_name)}", "Enter"])
            run_cmd(["tmux", "send-keys", "-t", pane, f"export AGENT_PROMPT={shlex.quote(agent_prompt[:500])}", "Enter"])  # Limit prompt size for env var
            run_cmd(["tmux", "send-keys", "-t", pane, f"export SESSION_NAME={shlex.quote(self.cfg.session_name)}", "Enter"])
            run_cmd(["tmux", "send-keys", "-t", pane, f"export FARM_ID={shlex.quote(self.cfg.farm_id)}", "Enter"])
            time.sleep(0.2)  # Wait for env vars to be set

            # Verify pipe-pane is still active and re-establish if needed
            test_msg = f"[AGENT-START] Mock agent {agent_idx} ({agent_name}) initializing..."
            run_cmd(["tmux", "send-keys", "-t", pane, f"echo '{test_msg}'", "Enter"])
            time.sleep(0.2)

            # Now launch the Python script
            script_dir = Path(__file__).parent.resolve()
            mock_script = script_dir / "simple_mock_agent.py"  # Use simpler mock agent
            run_cmd(["tmux", "send-keys", "-t", pane, f"python3 '{mock_script}' 2>&1", "Enter"])

            # Add a small delay to ensure mock agent starts
            time.sleep(1)
            
        elif command.startswith("CLAUDE_LAUNCH:"):
            # Special handling for Claude launch with persistent prompt file
            parts = command.split(":", 3)
            if len(parts) >= 4:
                _, agent_id, prompt_file_path, node_memory = parts
                logger.info(f"Launching Claude agent {agent_idx} with prompt from {prompt_file_path}")

                # Clear pane and set working directory
                run_cmd(["tmux", "send-keys", "-t", pane, "clear", "Enter"])
                if self.cfg.workspace_dir:
                    run_cmd(["tmux", "send-keys", "-t", pane, f"cd {shlex.quote(str(self.cfg.workspace_dir))}", "Enter"])
                    time.sleep(0.2)

                # Set environment variables FIRST
                api_key = os.environ.get("ANTHROPIC_API_KEY") or ""
                if api_key:
                    run_cmd(["tmux", "send-keys", "-t", pane, f"export ANTHROPIC_API_KEY='{api_key}'", "Enter"])
                    time.sleep(0.1)

                run_cmd(["tmux", "send-keys", "-t", pane, f"export NODE_OPTIONS='--max-old-space-size={node_memory}'", "Enter"])
                time.sleep(0.2)

                # Launch Claude in INTERACTIVE mode
                # CRITICAL FIX: Launch Claude first, then send the prompt via tmux send-keys
                # This avoids the "Raw mode not supported" error from piping
                # Use --permission-mode bypassPermissions for sandbox environment
                claude_cmd = "claude --permission-mode bypassPermissions"
                run_cmd(["tmux", "send-keys", "-t", pane, claude_cmd, "Enter"])

                # Wait for Claude to fully initialize (it needs time to load)
                time.sleep(6)

                # Now send the prompt content by simulating typing
                # Read and send the prompt to the running Claude session
                prompt_content = read_prompt_file(prompt_file_path)
                # Use tmux's paste buffer to send multi-line prompts
                run_cmd(["tmux", "set-buffer", prompt_content])
                run_cmd(["tmux", "paste-buffer", "-t", pane])
                # Submit the prompt by sending Enter
                run_cmd(["tmux", "send-keys", "-t", pane, "Enter"])

                # Wait a bit for Claude to process
                time.sleep(2)

                # Track the Claude process PID for monitoring
                self._track_agent_pid(agent_idx, pane)

                if self._verify_agent_ready(pane, agent_idx, timeout=20):
                    logger.info(f"Claude agent {agent_idx} launched successfully (PID: {self.agent_pids.get(agent_idx, 'unknown')})")

                    # Write success status
                    status_file = self.cfg.coordination_dir / f"agent_{agent_idx}_status.json"
                    atomic_write_json(status_file, {
                        "agent_id": agent_idx,
                        "status": "active",
                        "timestamp": datetime.now().isoformat()
                    })
                else:
                    logger.warning(f"Claude agent {agent_idx} may not have started properly")

                    # Write warning status
                    status_file = self.cfg.coordination_dir / f"agent_{agent_idx}_status.json"
                    atomic_write_json(status_file, {
                        "agent_id": agent_idx,
                    "status": "uncertain",
                    "warning": "Agent may not have initialized properly",
                    "timestamp": datetime.now().isoformat()
                })
        else:
            # Direct launch for other providers and fallback
            self._send_tmux(pane, command, clear=True, chdir=self.cfg.workspace_dir)

    def _track_agent_pid(self, agent_idx: int, pane: str) -> None:
        """Track the Claude process PID for this agent."""
        try:
            # Get the PID of the shell running in the pane
            result = run_cmd(["tmux", "display-message", "-t", pane, "-p", "#{pane_pid}"], capture=True)
            if result.returncode == 0 and result.stdout:
                pane_pid = result.stdout.strip()

                # Find Claude process under this pane's shell
                # Use pgrep to find the claude process that's a child of the pane's shell
                claude_result = run_cmd(["pgrep", "-P", pane_pid, "claude"], capture=True)
                if claude_result.returncode == 0 and claude_result.stdout:
                    claude_pid = int(claude_result.stdout.strip().split('\n')[0])  # Get first match
                    self.agent_pids[agent_idx] = claude_pid
                    logger.info(f"Tracked Claude PID {claude_pid} for agent {agent_idx}")
                else:
                    # Claude might not have started yet, will try again in health check
                    self.agent_pids[agent_idx] = None
                    logger.debug(f"Claude process not yet visible for agent {agent_idx}")
            else:
                self.agent_pids[agent_idx] = None
                logger.warning(f"Could not get pane PID for agent {agent_idx}")
        except Exception as e:
            logger.warning(f"Failed to track PID for agent {agent_idx}: {e}")
            self.agent_pids[agent_idx] = None

    def _is_process_running(self, pid: Optional[int]) -> bool:
        """Check if a process with the given PID is running."""
        if pid is None:
            return False
        try:
            # Check if process exists using ps
            result = run_cmd(["ps", "-p", str(pid)], capture=True)
            return result.returncode == 0
        except:
            return False

    def _monitor_agents(self) -> None:
        logger.info("Writing active agent roster and monitoring runtime…")
        active_agents: List[Dict[str, Any]] = []
        for i in range(self.cfg.num_agents):
            name = self.cfg.agent_names[i] if i < len(self.cfg.agent_names) else f"Agent {i + 1}"

            # Check if agent has a failure status
            status_file = self.cfg.coordination_dir / f"agent_{i}_status.json"
            agent_status = "active"
            if status_file.exists():
                try:
                    with open(status_file, 'r') as f:
                        status_data = json.load(f)
                        agent_status = status_data.get("status", "active")
                except:
                    pass  # Default to active if can't read status

            active_agents.append(
                {
                    "id": f"agent_{i}",
                    "name": name,
                    "farm_id": self.cfg.farm_id,
                    "status": agent_status,
                    "started_at": self.start_time.isoformat(),
                    "pane": f"{self.cfg.session_name}:agents.{i}",
                    "health_check_enabled": True,
                    "health_check_interval": 30,  # 30 second heartbeat
                    "health_timeout": 120,  # 2 minute timeout
                }
            )
        atomic_write_json(self.cfg.coordination_dir / "active_agents.json", active_agents)

        # Optional max runtime enforcement
        deadline: Optional[datetime] = None
        if self.cfg.max_runtime and self.cfg.max_runtime > 0:
            deadline = datetime.now() + timedelta(seconds=self.cfg.max_runtime)
            logger.info(
                "Max runtime set to %d seconds (until %s)",
                self.cfg.max_runtime,
                deadline.isoformat(timespec="seconds"),
            )

        # Health check loop
        # CRITICAL: Add initial delay before first health check to allow agents to initialize
        # Claude agents take 6-8 seconds to launch, plus prompt processing time
        # Mock agents initialize faster but still need time for environment setup
        initial_delay = 30  # 30 seconds - allows Claude to fully initialize
        health_check_interval = 30  # Check every 30 seconds after first check

        logger.info(f"Waiting {initial_delay}s before first health check to allow agent initialization...")
        time.sleep(initial_delay)
        logger.info("Starting health monitoring...")

        last_health_check = time.time()

        try:
            while not self.shutdown_requested:
                if deadline and datetime.now() >= deadline:
                    logger.info("Max runtime reached; requesting shutdown.")
                    break

                # Perform periodic health checks
                if time.time() - last_health_check > health_check_interval:
                    self._check_agent_health()
                    last_health_check = time.time()

                time.sleep(2)
        except KeyboardInterrupt:
            logger.info("KeyboardInterrupt detected; shutting down…")

    def _check_agent_health(self) -> None:
        """Check health of all agents by examining their pane activity AND process status.

        ENHANCED: Write comprehensive health status for backend monitoring.
        CRITICAL FIX: Monitor actual Claude process, not just pane content.
        """
        agent_health_summary = []

        for i in range(self.cfg.num_agents):
            pane = f"{self.cfg.session_name}:agents.{i}"
            agent_name = self.cfg.agent_names[i] if i < len(self.cfg.agent_names) else f"Agent {i + 1}"

            # Capture recent pane content
            result = run_cmd(["tmux", "capture-pane", "-t", pane, "-p", "-S", "-100"], capture=True)

            # Check if pane exists and is responsive
            pane_exists = run_cmd(["tmux", "list-panes", "-t", pane, "-F", "#{pane_id}"], capture=True).returncode == 0

            # CRITICAL FIX: Check if Claude process is actually running
            claude_pid = self.agent_pids.get(i)
            if claude_pid is None:
                # Try to track the PID if we haven't yet
                self._track_agent_pid(i, pane)
                claude_pid = self.agent_pids.get(i)

            process_running = self._is_process_running(claude_pid)

            health_status = {
                "agent_id": i,
                "agent_name": agent_name,
                "pane": pane,
                "session_name": self.cfg.session_name,
                "farm_id": self.cfg.farm_id,
                "timestamp": datetime.now().isoformat(),
                "pane_exists": pane_exists,
                "has_output": bool(result.stdout),
                "output_size": len(result.stdout) if result.stdout else 0,
                "claude_pid": claude_pid,
                "process_running": process_running,
                "status": "healthy" if (pane_exists and process_running) else "warning",
                "uptime_seconds": (datetime.now() - self.start_time).total_seconds()
            }

            # Detect potential issues - PROCESS STATUS IS PRIMARY INDICATOR
            if not pane_exists:
                health_status["status"] = "dead"
                health_status["issue"] = "Pane does not exist"
                logger.error(f"Agent {i} ({agent_name}): Pane does not exist!")
            elif not process_running and claude_pid is not None:
                # Claude process has exited - THIS IS THE KEY DETECTION
                health_status["status"] = "completed"
                health_status["issue"] = f"Claude process (PID {claude_pid}) has exited"
                logger.info(f"Agent {i} ({agent_name}): Claude process completed (PID {claude_pid} no longer running)")
            elif claude_pid is None:
                # Couldn't track Claude process
                health_status["status"] = "uncertain"
                health_status["issue"] = "Could not track Claude process PID"
                logger.warning(f"Agent {i} ({agent_name}): Unable to track Claude process")
            elif not result.stdout:
                health_status["status"] = "stuck"
                health_status["issue"] = "No recent output detected"
                logger.warning(f"Agent {i} ({agent_name}): No recent output (may be stuck)")
            else:
                # Agent is healthy - check for error patterns
                if result.stdout and ("error" in result.stdout.lower() or "exception" in result.stdout.lower()):
                    health_status["status"] = "error"
                    health_status["issue"] = "Error messages detected in output"
                    logger.warning(f"Agent {i} ({agent_name}): Error patterns detected in output")

            # Write individual health file
            health_file = self.cfg.coordination_dir / f"agent_{i}_health.json"
            atomic_write_json(health_file, health_status)

            agent_health_summary.append(health_status)

        # Write consolidated health summary for efficient backend polling
        summary_file = self.cfg.coordination_dir / "agents_health_summary.json"
        atomic_write_json(summary_file, {
            "farm_id": self.cfg.farm_id,
            "session_name": self.cfg.session_name,
            "total_agents": self.cfg.num_agents,
            "timestamp": datetime.now().isoformat(),
            "agents": agent_health_summary,
            "overall_status": self._get_overall_health_status(agent_health_summary)
        })

        logger.debug(f"Health check complete: {len(agent_health_summary)} agents checked")

    def _get_overall_health_status(self, agent_health: List[Dict]) -> str:
        """Determine overall health status from individual agent statuses."""
        statuses = [a["status"] for a in agent_health]

        if any(s == "dead" for s in statuses):
            return "critical"  # At least one agent is dead
        elif any(s == "error" for s in statuses):
            return "degraded"  # Errors detected
        elif any(s == "stuck" for s in statuses):
            return "warning"  # Some agents may be stuck
        elif all(s == "healthy" for s in statuses):
            return "healthy"  # All agents healthy
        else:
            return "unknown"  # Mixed or unclear status

    # ------------------------------------------------------------------
    # Outputs & shutdown
    # ------------------------------------------------------------------
    def collect_outputs(self) -> None:
        """Collect outputs and agent status for harvest."""
        # Collect final agent status
        agent_statuses = []
        for i in range(self.cfg.num_agents):
            pane = f"{self.cfg.session_name}:agents.{i}"
            name = self.cfg.agent_names[i] if i < len(self.cfg.agent_names) else f"Agent {i + 1}"

            # Capture final pane content
            result = run_cmd(["tmux", "capture-pane", "-t", pane, "-p"], capture=True)

            # Check health and status files
            health_file = self.cfg.coordination_dir / f"agent_{i}_health.json"
            status_file = self.cfg.coordination_dir / f"agent_{i}_status.json"

            agent_status = {
                "id": i,
                "name": name,
                "pane": pane,
                "has_output": bool(result.stdout),
                "output_size": len(result.stdout) if result.stdout else 0,
                "health": "healthy" if health_file.exists() else "unknown",
                "status": "completed"
            }

            if status_file.exists():
                try:
                    with open(status_file, 'r') as f:
                        status_data = json.load(f)
                        agent_status["status"] = status_data.get("status", "completed")
                except:
                    pass

            agent_statuses.append(agent_status)

        # Create comprehensive harvest snapshot
        snapshot = {
            "farm_id": self.cfg.farm_id,
            "session": self.cfg.session_name,
            "provider": self.cfg.provider,
            "agents": self.cfg.num_agents,
            "agent_statuses": agent_statuses,
            "started_at": self.start_time.isoformat(),
            "finished_at": datetime.now().isoformat(),
            "duration_seconds": (datetime.now() - self.start_time).total_seconds(),
            "workspace_dir": str(self.cfg.workspace_dir),
            "coordination_dir": str(self.cfg.coordination_dir),
        }

        # Always write a coordination snapshot
        out = self.cfg.coordination_dir / f"harvest_{self.cfg.farm_id}.json"
        atomic_write_json(out, snapshot)
        logger.info("Wrote harvest snapshot: %s", out)

        # If a harvest_id is provided, also save metadata under maibarn/harvests/active/<harvest_id>
        if self.cfg.harvest_id:
            harvest_dir = Path.cwd() / "var" / "maibarn" / "harvests" / "active" / self.cfg.harvest_id
            harvest_dir.mkdir(parents=True, exist_ok=True)
            meta_file = harvest_dir / "metadata.json"
            atomic_write_json(meta_file, snapshot)
            logger.info("Wrote harvest metadata: %s", meta_file)

    def graceful_shutdown(self) -> None:
        # Write completion status before shutting down
        logger.info("Writing completion status for farm %s", self.cfg.farm_id)
        self._write_orchestrator_status("completed")

        # Clean up health monitoring files to prevent orphaned monitoring
        logger.info("Cleaning up health monitoring files for farm %s", self.cfg.farm_id)
        try:
            for i in range(self.cfg.num_agents):
                health_file = self.cfg.coordination_dir / f"agent_{i}_health.json"
                if health_file.exists():
                    health_file.unlink()
                    logger.debug(f"Removed health file: {health_file}")

            summary_file = self.cfg.coordination_dir / "agents_health_summary.json"
            if summary_file.exists():
                summary_file.unlink()
                logger.debug(f"Removed health summary file: {summary_file}")
        except Exception as e:
            logger.warning(f"Failed to clean up health files: {e}")

        if self.cfg.kill_on_exit:
            logger.info("Killing tmux session: %s", self.cfg.session_name)
            run_cmd(["tmux", "kill-session", "-t", self.cfg.session_name])
        else:
            logger.info("Leaving tmux session running: %s", self.cfg.session_name)


# --------------------------------------------------------------------------------------
# CLI helpers
# --------------------------------------------------------------------------------------

def load_prompt_and_names(prompt: Optional[str], prompt_file: Optional[Path]) -> tuple[str, List[str], List[Dict[str, Any]]]:
    """Return (prompt_text, agent_names_from_yaml, agent_configs_from_yaml)."""
    if prompt_file is None:
        return (prompt or "", [], [])

    if not prompt_file.exists():
        logger.error("Prompt file does not exist: %s", prompt_file)
        sys.exit(2)

    # YAML path
    if prompt_file.suffix.lower() in {".yaml", ".yml"}:
        if yaml is None:
            logger.error("PyYAML is required to read YAML prompt files. Install pyyaml.")
            sys.exit(2)
        with prompt_file.open("r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
        
        # Extract main prompt/description
        text = (data.get("initial_prompt") or data.get("description") or prompt or "").strip()
        
        # Extract agent configurations with names and tasks
        names: List[str] = []
        agent_configs: List[Dict[str, Any]] = []
        raw_agents = data.get("agents")
        
        if isinstance(raw_agents, list):
            for i, a in enumerate(raw_agents):
                if isinstance(a, dict):
                    agent_name = a.get("name", f"Agent {i+1}")
                    names.append(agent_name)
                    
                    # Extract agent-specific configuration
                    agent_config = {
                        "name": agent_name,
                        "role": a.get("role", ""),
                        "tasks": a.get("tasks", []),
                        "capabilities": a.get("capabilities", []),
                        "type": a.get("type", "worker")
                    }
                    agent_configs.append(agent_config)
                    logger.info(f"Parsed agent {i}: {agent_name} with {len(agent_config['tasks'])} tasks")
                elif isinstance(a, str):
                    names.append(a)
                    agent_configs.append({"name": a, "tasks": [], "role": "", "capabilities": []})
        
        # Store the full YAML data for reference
        if agent_configs:
            logger.info(f"Loaded {len(agent_configs)} agent configurations from YAML")
        
        return (text, names, agent_configs)

    # Plain text
    with prompt_file.open("r", encoding="utf-8") as f:
        text = f.read().strip()
    return (text or prompt or "", [], [])


def load_steps_spec(spec: Optional[str]) -> List[Dict[str, Any]]:
    """Load steps from a file (YAML/JSON) or a simple delimited string.

    Accepts:
      - path to .yaml/.yml/.json file with either a list or {steps: [...]} mapping
      - comma/semicolon/newline separated string of step titles
    Returns a list of step dicts: {id, title}
    """
    if not spec:
        return []
    pth = Path(spec)
    steps: List[Dict[str, Any]] = []
    if pth.exists():
        if pth.suffix.lower() in {".yaml", ".yml"}:
            if yaml is None:
                logger.error("PyYAML is required to read YAML steps files. Install pyyaml.")
                sys.exit(2)
            with pth.open("r", encoding="utf-8") as f:
                data = yaml.safe_load(f) or []
        else:
            with pth.open("r", encoding="utf-8") as f:
                data = json.load(f)
        items = data.get("steps") if isinstance(data, dict) else data
        if not isinstance(items, list):
            logger.error("Unrecognized steps file format: %s", pth)
            sys.exit(2)
        for i, it in enumerate(items, 1):
            if isinstance(it, dict):
                title = it.get("title") or it.get("name") or it.get("task") or f"Step {i}"
                sid = it.get("id") or f"step_{i}"
                steps.append({"id": sid, "title": str(title)})
            else:
                steps.append({"id": f"step_{i}", "title": str(it)})
        return steps

    # parse delimited string
    parts = [s.strip() for s in re.split(r"[;\n,]+", spec) if s.strip()]
    for i, t in enumerate(parts, 1):
        steps.append({"id": f"step_{i}", "title": t})
    return steps


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="MaiFarm multi-agent orchestrator (tmux)")

    # Core
    p.add_argument("--session", help="tmux session name (auto if omitted)")
    p.add_argument("--farm-id", help="Farm identifier (defaults to session)")
    p.add_argument("--num-agents", type=int, default=2, help="Number of agents to launch (>=1)")
    p.add_argument(
        "--provider",
        choices=["claude", "openai", "mock"],
        default=os.environ.get("AI_PROVIDER", "mock"),
        help="Agent provider",
    )

    # Prompt
    p.add_argument("--prompt", help="Inline prompt text")
    p.add_argument("--prompt-file", type=Path, help="Prompt file (.yaml/.yml or .txt)")

    # Paths
    p.add_argument(
        "--workspace-dir",
        type=Path,
        default=Path.cwd() / "var" / "maibarn" / "workspaces" / "active",
        help="Workspace base dir",
    )
    p.add_argument(
        "--coordination-dir",
        type=Path,
        default=Path.cwd() / "var" / "maibarn" / "coordination",
        help="Coordination dir for shared metadata",
    )

    # Behavior
    p.add_argument("--stagger", type=int, default=0, help="Seconds to wait between launching panes")
    p.add_argument("--max-runtime", type=int, help="Max runtime in seconds before shutdown")
    p.add_argument("--reuse-session", action="store_true", help="Reuse existing tmux session if present")
    p.add_argument("--no-kill-on-exit", action="store_true", help="Leave tmux session running on exit")
    p.add_argument("--context-files", nargs="+", type=Path, help="Extra context files to copy/mount (not used yet)")
    p.add_argument("--harvest-id", help="Harvest identifier for output collection")

    # Steps & collaboration
    p.add_argument("--steps", help="Path to steps file (.yaml/.yml/.json) or a delimited string of steps")
    p.add_argument("--bundle-steps", dest="bundle_steps", type=int, help="Static assignment bundle size per agent (non-collaborative)")
    p.add_argument("--collaborative", action="store_true", help="Enable collaborative step-claiming via coordination files")

    p.add_argument("--debug", action="store_true", help="Enable debug logging")
    p.add_argument("--fast-launch", action="store_true", help="Enable fast launch mode (skip checks, minimal delays)")

    ns = p.parse_args(argv)
    if ns.debug:
        logger.setLevel(logging.DEBUG)

    # Normalize and validate
    if ns.num_agents < 1:
        logger.warning("num-agents < 1; forcing to 1")
        ns.num_agents = 1

    return ns


def main(argv: Optional[List[str]] = None) -> None:
    args = parse_args(argv)
    
    # Check for API key but don't exit - use mock if not available
    provider = args.provider or os.environ.get("AI_PROVIDER", "claude")
    use_mock = False
    
    if provider == "claude":
        api_key = os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("CLAUDE_API_KEY") or ""
        claude_cli = check_binary("claude", "CLAUDE_BIN")
        
        if not api_key or len(api_key) < 30 or api_key.startswith("test-"):
            logger.warning("No valid ANTHROPIC_API_KEY found - will use mock agents")
            logger.info("Mock agents will provide realistic simulated output")
            use_mock = True
        elif not claude_cli:
            logger.warning("Claude CLI not found - will use mock agents")
            logger.info("Install Claude CLI or mock agents will be used")
            use_mock = True
        else:
            logger.info(f"Valid Claude API key found (length: {len(api_key)})")
            
    elif provider == "openai":
        api_key = os.environ.get("OPENAI_API_KEY") or ""
        if not api_key or len(api_key) < 30 or api_key.startswith("test-"):
            logger.warning("No valid OPENAI_API_KEY found - will use mock agents")
            use_mock = True
        else:
            logger.info(f"Valid OpenAI API key found (length: {len(api_key)})")

    # Prepare prompt, names, and agent configs from YAML
    prompt_text, names_from_yaml, agent_configs = load_prompt_and_names(args.prompt, args.prompt_file)
    if not prompt_text:
        logger.warning("No prompt provided; using a generic prompt.")
        prompt_text = "Help with development tasks."

    # Load steps (optional)
    steps_list = load_steps_spec(args.steps)

    # Derive core identifiers
    session = args.session or f"farm-{uuid.uuid4().hex[:8]}"
    farm_id = args.farm_id or session

    cfg = OrchestratorConfig(
        session_name=session,
        farm_id=farm_id,
        workspace_dir=(args.workspace_dir / farm_id).resolve(),
        coordination_dir=args.coordination_dir.resolve(),
        num_agents=args.num_agents,
        provider=args.provider,
        prompt=prompt_text,
        agent_names=names_from_yaml or [f"Agent {i+1}" for i in range(args.num_agents)],
        agent_configs=agent_configs or [],  # Pass agent configurations from YAML
        context_files=list(args.context_files or []),
        harvest_id=args.harvest_id,
        steps=steps_list,
        bundle_size=args.bundle_steps,
        collaborative=bool(args.collaborative),
        max_runtime=args.max_runtime,
        stagger_seconds=0 if args.fast_launch else args.stagger,  # No stagger in fast-launch mode
        reuse_session=args.reuse_session,
        kill_on_exit=not args.no_kill_on_exit,
    )

    # Warn if YAML had fewer names than agents
    if names_from_yaml and len(names_from_yaml) != args.num_agents:
        logger.info(
            "Agent name count (%d) != num-agents (%d); remaining panes will use generic names.",
            len(names_from_yaml), args.num_agents
        )

    orchestrator = AgentOrchestrator(cfg)
    logger.info(
        "Farm ID: %s | Session: %s | Provider: %s | Agents: %d | Harvest: %s",
        cfg.farm_id, cfg.session_name, cfg.provider, cfg.num_agents, cfg.harvest_id or "-",
    )
    orchestrator.run()


if __name__ == "__main__":
    main()
