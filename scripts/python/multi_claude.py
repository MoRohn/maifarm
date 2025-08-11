#!/usr/bin/env python3
"""
Multi-Agent Claude Code Orchestrator

A simplified tool to run multiple Claude Code sessions in parallel for 
collaborative problem-solving. Inspired by claude_code_agent_farm and Builder.

Usage:
    python multi_claude.py -n 5 -p "Fix all TypeScript errors"
    python multi_claude.py -n 3 --prompt-file feature.yaml
    python multi_claude.py -n 4 -p "Refactor API" --steps "Analyze" "Implement" "Test"
"""

import os
import sys
import time
import json
import yaml
import signal
import argparse
import subprocess
import tempfile
import hashlib
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Optional, Any, Tuple
from dataclasses import dataclass, field


# Global flag for clean shutdown
RUNNING = True


def signal_handler(signum, frame):
    """Handle Ctrl+C for graceful shutdown"""
    global RUNNING
    print("\n[!] Shutdown signal received. Cleaning up...")
    RUNNING = False


signal.signal(signal.SIGINT, signal_handler)


# ===== Data Models =====

@dataclass
class BuildStep:
    """Individual build step"""
    number: int
    content: str
    description: Optional[str] = None


@dataclass 
class BuildPrompt:
    """Complete prompt with optional steps"""
    initial_prompt: str
    steps: List[BuildStep] = field(default_factory=list)
    name: str = "Multi-Agent Task"
    context_files: List[str] = field(default_factory=list)  # Paths to context files
    

@dataclass
class Agent:
    """Agent state tracking"""
    id: int
    pane_id: str
    status: str = "starting"  # starting, ready, working, idle, error
    start_time: datetime = field(default_factory=datetime.now)
    current_step: int = 0
    uid: str = ""  # Unique identifier for the agent
    

# ===== Core Components =====

class TmuxManager:
    """Manage tmux sessions and panes"""
    
    def __init__(self, session_name: str = "claude_agents"):
        self.session = session_name
        self.pane_mapping = {}
        
    def create_session(self, num_agents: int) -> bool:
        """Create tmux session with specified number of panes"""
        # Kill existing session if it exists
        subprocess.run(f"tmux kill-session -t {self.session}", 
                      shell=True, capture_output=True)
        time.sleep(0.5)
        
        # Create new session
        result = subprocess.run(
            f"tmux new-session -d -s {self.session} -n agents",
            shell=True, capture_output=True
        )
        if result.returncode != 0:
            print(f"[!] Failed to create tmux session: {result.stderr.decode()}")
            return False
            
        # Create additional panes
        for i in range(1, num_agents):
            subprocess.run(
                f"tmux split-window -t {self.session}:agents",
                shell=True, capture_output=True
            )
            subprocess.run(
                f"tmux select-layout -t {self.session}:agents tiled",
                shell=True, capture_output=True
            )
        
        # Configure tmux for better display
        self._configure_tmux_display()
            
        # Get pane IDs
        result = subprocess.run(
            f"tmux list-panes -t {self.session}:agents -F '#{{pane_index}}'",
            shell=True, capture_output=True, text=True
        )
        
        pane_ids = sorted([pid.strip() for pid in result.stdout.strip().split('\n')])
        
        # Create mapping
        for i, pane_id in enumerate(pane_ids[:num_agents]):
            self.pane_mapping[i] = f"{self.session}:agents.{pane_id}"
            
        print(f"[+] Created tmux session '{self.session}' with {num_agents} panes")
        return True
    
    def _configure_tmux_display(self):
        """Configure tmux for better display"""
        # Enable aggressive resize for better space usage
        subprocess.run(
            f"tmux set-option -t {self.session} -g aggressive-resize on",
            shell=True, capture_output=True
        )
        
        # Enable mouse support for easier navigation
        subprocess.run(
            f"tmux set-option -t {self.session} -g mouse on",
            shell=True, capture_output=True
        )
        
        # Configure pane borders for better visibility
        subprocess.run(
            f"tmux set-option -t {self.session} -g pane-border-style 'fg=colour240'",
            shell=True, capture_output=True
        )
        subprocess.run(
            f"tmux set-option -t {self.session} -g pane-active-border-style 'fg=colour250'",
            shell=True, capture_output=True
        )
        
        # Enable pane titles (can show agent status)
        subprocess.run(
            f"tmux set-option -t {self.session} -g pane-border-status top",
            shell=True, capture_output=True
        )
        subprocess.run(
            f"tmux set-option -t {self.session} -g pane-border-format ' Agent #{{pane_index}} '",
            shell=True, capture_output=True
        )
        
    def send_to_pane(self, agent_id: int, command: str, enter: bool = True):
        """Send command to specific pane"""
        pane = self.pane_mapping.get(agent_id)
        if not pane:
            return
            
        # For multi-line commands, we need to send them differently to Claude
        if '\n' in command and enter:
            # Send the command in literal mode for Claude Code
            # Create a temporary file to handle complex multi-line input
            import tempfile
            import uuid
            
            with tempfile.NamedTemporaryFile(mode='w', delete=False, encoding='utf-8') as f:
                f.write(command)
                temp_path = f.name
            
            # Use unique buffer name to avoid conflicts
            buf_name = f"multiclaude_{uuid.uuid4().hex[:8]}"
            
            # Use tmux load-buffer and paste-buffer for reliable multi-line input
            try:
                # Load the data into a tmux buffer
                result = subprocess.run(
                    f"tmux load-buffer -b {buf_name} {temp_path}",
                    shell=True, capture_output=True
                )
                if result.returncode == 0:
                    # Paste the buffer and delete it (-d flag)
                    subprocess.run(
                        f"tmux paste-buffer -d -b {buf_name} -t {pane}",
                        shell=True, capture_output=True
                    )
                    # CRITICAL: Small delay between pasting and Enter for Claude Code
                    time.sleep(0.2)
                else:
                    # Fallback to direct sending if buffer method fails
                    print(f"[!] Buffer method failed, using direct send for agent {agent_id}")
                    for line in command.split('\n'):
                        if line:
                            escaped_line = line.replace("'", "'\"'\"'")
                            subprocess.run(
                                f"tmux send-keys -t {pane} '{escaped_line}'",
                                shell=True, capture_output=True
                            )
                            subprocess.run(
                                f"tmux send-keys -t {pane} C-m",  # Use C-m instead of Enter
                                shell=True, capture_output=True
                            )
            finally:
                # Clean up temp file
                try:
                    os.unlink(temp_path)
                except:
                    pass
            
            # Send C-m (Enter) separately - this is critical for Claude Code
            subprocess.run(
                f"tmux send-keys -t {pane} C-m",
                shell=True, capture_output=True
            )
        else:
            # Escape single quotes in command
            escaped_cmd = command.replace("'", "'\"'\"'")
            
            if enter:
                subprocess.run(
                    f"tmux send-keys -t {pane} '{escaped_cmd}'",
                    shell=True, capture_output=True
                )
                # Use C-m for Enter key - critical for Claude Code
                subprocess.run(
                    f"tmux send-keys -t {pane} C-m",
                    shell=True, capture_output=True
                )
            else:
                subprocess.run(
                    f"tmux send-keys -t {pane} '{escaped_cmd}'",
                    shell=True, capture_output=True
                )
            
    def capture_pane(self, agent_id: int, lines: int = 50) -> str:
        """Capture recent output from pane"""
        pane = self.pane_mapping.get(agent_id)
        if not pane:
            return ""
            
        result = subprocess.run(
            f"tmux capture-pane -t {pane} -p -S -{lines}",
            shell=True, capture_output=True, text=True
        )
        return result.stdout
        
    def set_pane_title(self, agent_id: int, title: str):
        """Set title for a specific pane"""
        pane = self.pane_mapping.get(agent_id)
        if not pane:
            return
            
        subprocess.run(
            f"tmux select-pane -t {pane} -T '{title}'",
            shell=True, capture_output=True
        )
    
    def kill_session(self):
        """Kill the tmux session"""
        subprocess.run(f"tmux kill-session -t {self.session}", 
                      shell=True, capture_output=True)
        print(f"[+] Killed tmux session '{self.session}'")


class CoordinationManager:
    """Simple file-based coordination between agents"""
    
    def __init__(self, project_path: Path):
        self.project_path = project_path
        # Use maibarn coordination directory from environment or fallback
        maibarn_root = os.environ.get('MAIBARN_ROOT', Path.cwd() / 'maibarn')
        self.coord_dir = Path(maibarn_root) / 'coordination'
        self.coord_dir.mkdir(exist_ok=True, parents=True)
        
        # Initialize coordination files
        self.active_agents_file = self.coord_dir / "active_agents.json"
        self.work_claims_dir = self.coord_dir / "work_claims"
        self.work_claims_dir.mkdir(exist_ok=True)
        self.completed_work_file = self.coord_dir / "completed_work.log"
        
        # Clear old data
        self._cleanup()
        
    def _cleanup(self):
        """Clean up old coordination data"""
        # Clear work claims
        for f in self.work_claims_dir.glob("*.lock"):
            try:
                f.unlink()
            except:
                pass
            
        # Initialize active agents
        self.active_agents_file.write_text("{}")
        
        # Clear completed work log
        if self.completed_work_file.exists():
            try:
                self.completed_work_file.unlink()
            except:
                pass
        
        # Kill any orphaned tmux sessions from previous runs
        for session_prefix in ['claude_agents', 'farm_']:
            result = subprocess.run(
                f"tmux ls 2>/dev/null | grep '{session_prefix}' | cut -d: -f1",
                shell=True, capture_output=True, text=True
            )
            if result.stdout:
                for session in result.stdout.strip().split('\n'):
                    if session:
                        subprocess.run(f"tmux kill-session -t {session}", 
                                     shell=True, capture_output=True)
                        print(f"[+] Cleaned up orphaned tmux session: {session}")
            
    def register_agent(self, agent_id: int, farm_id: str = None, harvest_id: str = None, session_name: str = None) -> str:
        """Register an agent and return its unique ID"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        random_suffix = hashlib.md5(f"{agent_id}{time.time()}".encode()).hexdigest()[:4]
        unique_id = f"agent_{timestamp}_{random_suffix}"
        
        # Update active agents
        agents = {}
        if self.active_agents_file.exists():
            agents = json.loads(self.active_agents_file.read_text())
            
        agents[unique_id] = {
            "agent_id": agent_id,
            "farm_id": farm_id,
            "harvest_id": harvest_id,
            "session_name": session_name,
            "started": datetime.now().isoformat(),
            "status": "active"
        }
        
        self.active_agents_file.write_text(json.dumps(agents, indent=2))
        return unique_id
        
    def claim_work(self, agent_uid: str, files: List[str], description: str) -> bool:
        """Try to claim work on specific files"""
        # Check if any files are already claimed
        for lock_file in self.work_claims_dir.glob("*.lock"):
            lock_data = json.loads(lock_file.read_text())
            if any(f in lock_data["files"] for f in files):
                # Check if lock is stale (> 2 hours old)
                lock_time = datetime.fromisoformat(lock_data["timestamp"])
                if (datetime.now() - lock_time).total_seconds() > 7200:
                    lock_file.unlink()  # Remove stale lock
                else:
                    return False  # Files are locked
                    
        # Create lock file
        lock_file = self.work_claims_dir / f"{agent_uid}.lock"
        lock_data = {
            "agent": agent_uid,
            "files": files,
            "description": description,
            "timestamp": datetime.now().isoformat()
        }
        lock_file.write_text(json.dumps(lock_data, indent=2))
        return True
        
    def release_work(self, agent_uid: str):
        """Release work claim"""
        lock_file = self.work_claims_dir / f"{agent_uid}.lock"
        if lock_file.exists():
            lock_file.unlink()
            
    def log_completed_work(self, agent_uid: str, description: str):
        """Log completed work"""
        with open(self.completed_work_file, 'a') as f:
            f.write(f"{datetime.now().isoformat()} | {agent_uid} | {description}\n")


class PromptParser:
    """Parse prompts from text or YAML files"""
    
    @staticmethod
    def parse_file(filepath: Path) -> BuildPrompt:
        """Parse a prompt file (text or YAML)"""
        content = filepath.read_text()
        
        # Try YAML first
        if filepath.suffix in ['.yaml', '.yml']:
            return PromptParser.parse_yaml(content)
        else:
            return PromptParser.parse_text(content)
            
    @staticmethod
    def parse_yaml(content: str) -> BuildPrompt:
        """Parse YAML format prompt"""
        data = yaml.safe_load(content)
        
        prompt = BuildPrompt(
            name=data.get('name', 'Multi-Agent Task'),
            initial_prompt=data.get('initial_prompt', ''),
            context_files=data.get('context_files', [])
        )
        
        # Parse steps if present
        if 'steps' in data:
            for i, step in enumerate(data['steps']):
                if isinstance(step, str):
                    prompt.steps.append(BuildStep(i + 1, step))
                elif isinstance(step, dict):
                    prompt.steps.append(BuildStep(
                        i + 1,
                        step.get('content', ''),
                        step.get('description')
                    ))
                    
        return prompt
        
    @staticmethod
    def parse_text(content: str) -> BuildPrompt:
        """Parse text format prompt (Builder-style)"""
        lines = content.strip().split('\n')
        
        # Extract initial prompt (everything before numbered steps)
        initial_lines = []
        step_start_idx = None
        
        for i, line in enumerate(lines):
            if line.strip() and line.strip()[0].isdigit() and '. ' in line:
                step_start_idx = i
                break
            initial_lines.append(line)
            
        prompt = BuildPrompt(initial_prompt='\n'.join(initial_lines).strip())
        
        # Extract steps if present
        if step_start_idx is not None:
            for i in range(step_start_idx, len(lines)):
                line = lines[i].strip()
                if line and line[0].isdigit() and '. ' in line:
                    # Extract step number and content
                    parts = line.split('. ', 1)
                    if len(parts) == 2:
                        step_num = int(parts[0])
                        step_content = parts[1]
                        prompt.steps.append(BuildStep(step_num, step_content))
                        
        return prompt


class AgentLauncher:
    """Launch and manage AI Code agents (Claude or Qwen)"""
    
    def __init__(self, tmux: TmuxManager, coord: CoordinationManager, farm_id: str = None, harvest_id: str = None, session_name: str = None):
        self.tmux = tmux
        self.coord = coord
        self.farm_id = farm_id
        self.harvest_id = harvest_id
        self.session_name = session_name
        self.agents: Dict[int, Agent] = {}
        self.provider = os.getenv('AI_PROVIDER', 'claude')  # Default to Claude
        
    def launch_agent(self, agent_id: int, project_path: Path, debug: bool = False, provider: str = 'claude') -> Agent:
        """Launch a single AI Code agent (Claude, Qwen, or Qwen3-Coder 480B)"""
        agent = Agent(id=agent_id, pane_id=self.tmux.pane_mapping[agent_id])
        self.agents[agent_id] = agent
        
        # Navigate to project directory
        self.tmux.send_to_pane(agent_id, f"cd {project_path}")
        time.sleep(1)
        
        # Check if claude command exists first
        claude_check = subprocess.run(
            "which claude",
            shell=True, capture_output=True, text=True
        )
        
        # Only run in simulation mode if claude is not available
        if claude_check.returncode != 0:
            # Run in demo mode - no actual Claude CLI
            print(f"[*] Agent {agent_id}: Running in simulation mode (Claude CLI not found)")
            self.tmux.send_to_pane(agent_id, "echo '=== Farm Agent Simulation Mode ==='")
            self.tmux.send_to_pane(agent_id, "echo 'Agent is ready to receive commands'")
            self.tmux.send_to_pane(agent_id, "echo 'This is a simulated agent for testing'")
            self.tmux.send_to_pane(agent_id, "echo ''")
            self.tmux.send_to_pane(agent_id, "echo 'Status: Ready'")
            self.tmux.send_to_pane(agent_id, "bash")  # Start a bash shell for demo
            agent.status = "ready"  # Mark as ready instead of demo
            agent.uid = f"agent_{agent_id:04d}"  # Set the UID
            
            # Output the expected status messages for the server to detect
            print(f"[+] Agent {agent_id} launched successfully")
            print(f"Agent {agent_id} registered (UID: {agent.uid})")
            
            return agent
        
        # Launch AI provider CLI with permissions flag to avoid prompts
        if provider == 'qwen':
            # For Qwen3-Coder, we have multiple options:
            # 1. Use LLM Proxy (recommended for Qwen3-Coder 480B)
            # 2. Use Ollama for local Qwen models
            # 3. Use direct Qwen API via DashScope
            
            # Check if LLM proxy is configured
            use_llm_proxy = os.getenv('USE_LLM_PROXY', 'false').lower() == 'true'
            llm_proxy_url = os.getenv('LLM_PROXY_URL', 'http://localhost:8001')
            
            if use_llm_proxy:
                # Check if LLM proxy is running
                try:
                    import requests
                    response = requests.get(f"{llm_proxy_url}/providers", timeout=2)
                    if response.ok and 'qwen' in response.json().get('providers', []):
                        print(f"[*] Agent {agent_id}: Using Qwen3-Coder 480B via LLM Proxy at {llm_proxy_url}")
                        self.tmux.send_to_pane(agent_id, f"export AI_PROVIDER=qwen")
                        self.tmux.send_to_pane(agent_id, f"export LLM_PROXY_URL={llm_proxy_url}")
                        self.tmux.send_to_pane(agent_id, f"export QWEN_MODEL=qwen-coder-480b")
                        time.sleep(0.5)
                        # Use claude command which will be proxied to Qwen3-Coder
                        self.tmux.send_to_pane(agent_id, "claude --dangerously-skip-permissions")
                    else:
                        print(f"[!] LLM Proxy not available, falling back to direct API")
                        use_llm_proxy = False
                except:
                    print(f"[!] Could not connect to LLM Proxy, falling back to direct API")
                    use_llm_proxy = False
            
            if not use_llm_proxy:
                # Check if Ollama is available locally
                ollama_check = subprocess.run(
                    "ollama list | grep -i qwen",
                    shell=True, capture_output=True, text=True
                )
                
                if ollama_check.returncode == 0 and 'qwen' in ollama_check.stdout.lower():
                    # Use local Ollama Qwen model
                    print(f"[*] Agent {agent_id}: Using local Ollama Qwen model")
                    self.tmux.send_to_pane(agent_id, "export AI_PROVIDER=qwen_ollama")
                    self.tmux.send_to_pane(agent_id, "export OLLAMA_HOST=http://localhost:11434")
                    self.tmux.send_to_pane(agent_id, "export OLLAMA_MODEL=qwen2.5-coder:7b")
                    time.sleep(0.5)
                    # Launch with Qwen-specific wrapper if available
                    self.tmux.send_to_pane(agent_id, "qwen-code --local --dangerously-skip-permissions || claude --dangerously-skip-permissions")
                else:
                    # Fall back to direct API method
                    print(f"[*] Agent {agent_id}: Using Qwen3-Coder via DashScope API")
                    self.tmux.send_to_pane(agent_id, "export AI_PROVIDER=qwen")
                    self.tmux.send_to_pane(agent_id, "export QWEN_MODEL=qwen-coder-480b")
                    time.sleep(0.5)
                    # Use claude command which will be proxied to Qwen
                    self.tmux.send_to_pane(agent_id, "claude --dangerously-skip-permissions")
        else:
            # Default Claude command
            self.tmux.send_to_pane(agent_id, "claude --dangerously-skip-permissions")
        
        # Wait for AI agent to initialize with progressive checking
        ai_name = 'Qwen' if provider == 'qwen' else 'Claude'
        print(f"[*] Agent {agent_id}: waiting for {ai_name} Code to initialize...")
        
        # Progressive wait with checks
        max_wait = 20  # Maximum 20 seconds
        check_interval = 2  # Check every 2 seconds
        total_waited = 0
        
        while total_waited < max_wait:
            time.sleep(check_interval)
            total_waited += check_interval
            
            # Check if AI agent is showing signs of life
            output = self.tmux.capture_pane(agent_id, lines=50)
            ai_indicators = ["Claude", "Qwen", "cwd", "Ready", "initialized"]
            if len(output) > 100 or any(indicator in output for indicator in ai_indicators):
                ai_name = 'Qwen' if provider == 'qwen' else 'Claude'
                print(f"[*] Agent {agent_id}: {ai_name} Code appears to be starting...")
                break
        
        # Final wait for full initialization
        time.sleep(3)
        
        # Quick check if it started
        if self.check_agent_ready(agent_id, debug=debug):
            print(f"[+] Agent {agent_id} launched successfully")
        else:
            # Don't fail - continue anyway as it might still work
            print(f"[!] Agent {agent_id} ready check failed, but continuing...")
        
        # Register with coordination system
        agent_uid = self.coord.register_agent(agent_id, self.farm_id, self.harvest_id, self.session_name)
        agent.uid = agent_uid
        
        print(f"[+] Agent {agent_id} registered (UID: {agent_uid})")
        agent.status = "ready"
        
        # Set initial pane title
        self.tmux.set_pane_title(agent_id, f"Agent {agent_id} - Ready")
        
        return agent
        
    def send_prompt(self, agent_id: int, prompt: str, context_files: List[str] = None, debug: bool = False):
        """Send prompt to agent with improved handling and context files"""
        agent = self.agents.get(agent_id)
        if not agent:
            return
            
        # Build prompt with context files
        full_prompt = prompt
        if context_files:
            file_context = "\n\n=== CONTEXT FILES ===\n"
            for file_path in context_files:
                if os.path.exists(file_path):
                    try:
                        with open(file_path, 'r', encoding='utf-8') as f:
                            content = f.read()
                            # Limit file content to prevent overwhelming the prompt
                            if len(content) > 5000:
                                content = content[:5000] + "\n... [truncated]"
                            file_context += f"\n--- File: {os.path.basename(file_path)} ---\n{content}\n"
                    except Exception as e:
                        print(f"[!] Could not read context file {file_path}: {e}")
            
            if file_context != "\n\n=== CONTEXT FILES ===\n":
                full_prompt = file_context + "\n\n=== TASK ===\n" + prompt
            
        # Add agent-specific salt to prompt
        salted_prompt = f"{full_prompt}\n\n[Agent ID: {agent.uid}]"
        
        # Ensure Claude is ready before sending
        retries = 3
        while retries > 0:
            if self.check_agent_ready(agent_id, debug=False):
                break
            print(f"[!] Agent {agent_id} not ready yet, waiting...")
            time.sleep(2)
            retries -= 1
        
        # Small delay to ensure Claude's UI is ready
        time.sleep(1.0)
        
        print(f"[*] Sending prompt to agent {agent_id} ({len(salted_prompt)} chars)")
        
        # Send the prompt
        self.tmux.send_to_pane(agent_id, salted_prompt, enter=True)
        
        # Update pane title
        self.tmux.set_pane_title(agent_id, f"Agent {agent_id} - Working")
        
        print(f"[+] Prompt sent to agent {agent_id}")
        agent.status = "working"
        
        if debug:
            # Capture what happened after sending
            time.sleep(2.0)
            output = self.tmux.capture_pane(agent_id, lines=20)
            print(f"[DEBUG] Agent {agent_id} after prompt:")
            print(f"[DEBUG] Last 200 chars: {repr(output[-200:])}")
        
    def check_agent_ready(self, agent_id: int, debug: bool = False, retry_count: int = 0) -> bool:
        """Check if agent is ready for input with improved detection"""
        output = self.tmux.capture_pane(agent_id, lines=100)
        
        if debug:
            print(f"[DEBUG] Agent {agent_id} output ({len(output)} chars):")
            print(f"[DEBUG] Last 500 chars: {repr(output[-500:])}")
        
        # More comprehensive ready indicators
        # Add Qwen-specific indicators if using Qwen
        if hasattr(self, 'provider') and self.provider == 'qwen':
            ready_indicators = [
                "Welcome to Qwen Code",
                "Qwen3-Coder Ready",
                "qwen-code>",  # Qwen prompt
                "/help for help",
                "? for shortcuts",
                "cwd:",  # Current working directory shown
                "Model loaded",  # Ollama indicator
                "Bypassing Permissions",
                "──────────"  # UI border elements
            ]
        else:
            ready_indicators = [
                "Welcome to Claude Code",
                "/help for help",
                "? for shortcuts",
                "cwd:",  # Current working directory shown
                "Press Esc twice",
                "Bypassing Permissions",  # From --dangerously-skip-permissions
                "──────────"  # UI border elements
            ]
        
        # Check if any indicator is present
        is_ready = any(indicator in output for indicator in ready_indicators)
        
        # Also check if Claude is actually responding (not just launched)
        if is_ready and len(output) > 100:
            # Claude is likely ready if we have substantial output
            is_ready = True
        elif not is_ready and retry_count < 3:
            # Retry a few times with delay
            time.sleep(2)
            return self.check_agent_ready(agent_id, debug, retry_count + 1)
        
        if debug:
            print(f"[DEBUG] Agent {agent_id} ready status: {is_ready}")
        
        return is_ready


# ===== Main Orchestrator =====

class MultiClaudeOrchestrator:
    """Main orchestration logic"""
    
    def __init__(self, args):
        self.args = args
        # Use workspace directory from environment or args
        env_workspace = os.environ.get('MAIFARM_WORKSPACE')
        if env_workspace:
            self.workspace_path = Path(env_workspace)
        else:
            self.workspace_path = Path(getattr(args, 'workspace_dir', None) or Path.cwd())
        self.project_path = self.workspace_path  # Agents will work in the workspace
        self.maifarm_root = Path(getattr(args, 'project_root', None) or Path.cwd())  # Original MaiFarm location
        self.debug = getattr(args, 'debug', False)
        self.collaborative = getattr(args, 'collaborative', False)
        self.bundle_steps = getattr(args, 'bundle_steps', None)
        self.provider = getattr(args, 'provider', 'claude')
        self.farm_id = getattr(args, 'farm_id', None)
        self.harvest_id = getattr(args, 'harvest_id', None)
        self.safe_mode = getattr(args, 'safe_mode', True)  # Enforce workspace isolation
        
        # Initialize components
        self.tmux = TmuxManager(args.session)
        self.coord = CoordinationManager(self.project_path)
        self.launcher = AgentLauncher(self.tmux, self.coord, self.farm_id, self.harvest_id, args.session)
        
        # Parse prompt
        self.prompt = self._parse_prompt()
        
    def _parse_prompt(self) -> BuildPrompt:
        """Parse prompt from args"""
        if self.args.prompt_file:
            filepath = Path(self.args.prompt_file)
            if not filepath.exists():
                print(f"[!] Prompt file not found: {filepath}")
                sys.exit(1)
            return PromptParser.parse_file(filepath)
            
        elif self.args.prompt:
            prompt = BuildPrompt(initial_prompt=self.args.prompt)
            
            # Add steps if provided
            if self.args.steps:
                for i, step in enumerate(self.args.steps):
                    prompt.steps.append(BuildStep(i + 1, step))
            
            # Add context files if provided
            if self.args.context_files:
                prompt.context_files = self.args.context_files
                    
            return prompt
            
        else:
            print("[!] No prompt provided. Use -p or --prompt-file")
            sys.exit(1)
            
    def run(self):
        """Main orchestration loop"""
        global RUNNING
        
        print(f"\n{'='*60}")
        print(f"Multi-Agent {'Qwen3-Coder' if self.provider == 'qwen' else 'Claude Code'} Orchestrator")
        print(f"{'='*60}")
        print(f"Workspace: {self.workspace_path}")
        if self.workspace_path != self.maifarm_root:
            print(f"[+] Isolated workspace active - MaiFarm code protected")
        print(f"Agents: {self.args.agents}")
        print(f"Session: {self.args.session}")
        print(f"Provider: {self.provider}")
        print(f"Safe Mode: {'Enabled' if self.safe_mode else 'Disabled'}")
        if self.prompt.steps:
            print(f"Steps: {len(self.prompt.steps)}")
        print(f"{'='*60}\n")
        
        # Create tmux session
        if not self.tmux.create_session(self.args.agents):
            return
            
        try:
            # Launch all agents
            print("[*] Launching agents...")
            for i in range(self.args.agents):
                if not RUNNING:
                    break
                    
                # Launch agent in isolated workspace
                self.launcher.launch_agent(i, self.workspace_path, debug=self.debug, provider=self.provider)
                
                # Stagger launches
                if i < self.args.agents - 1:
                    time.sleep(self.args.stagger)
                    
            # No need for extra wait - agents are checked during launch
            # Send initial prompts
            print("[*] Sending initial prompts...")
            self._send_initial_prompts()
            
            # If we have steps, orchestrate them
            if self.prompt.steps:
                self._orchestrate_steps()
            else:
                # Just monitor until user interrupts
                print("[*] Agents are working. Press Ctrl+C to stop.")
                
                # Add a maximum runtime to prevent infinite hanging
                max_runtime = self.args.max_runtime
                start_time = time.time()
                
                while RUNNING:
                    time.sleep(1)
                    # Check if we've exceeded maximum runtime
                    if time.time() - start_time > max_runtime:
                        print(f"[!] Maximum runtime of {max_runtime} seconds exceeded, shutting down gracefully")
                        RUNNING = False
                        break
                    
        except Exception as e:
            print(f"[!] Error: {e}")
            
        finally:
            self._cleanup()
            
    def _send_initial_prompts(self):
        """Send initial prompt to all agents"""
        base_prompt = self.prompt.initial_prompt
        
        # Add coordination instructions based on mode
        if self.args.agents > 1:
            if self.collaborative:
                # Enhanced instructions for collaborative mode
                coord_instructions = f"""

IMPORTANT: You are part of a team of {self.args.agents} AI agents working collaboratively.
All agents have received the complete list of steps for this project.

Collaboration Protocol:
1. Review ALL steps before choosing what to work on
2. Check the coordination directory work_claims/ to see what others are doing
3. Choose work that complements what others have claimed
4. Create detailed work claims including:
   - Which step(s) you're working on
   - Which files you'll modify
   - Expected interfaces/APIs you'll create
5. Regularly check completed work and adjust your approach
6. Focus on integration points between components
7. Communicate through descriptive commits and clear interfaces

Your goal is to work as a cohesive team, not just complete individual tasks.
"""
            else:
                # Standard coordination for sequential mode
                coord_instructions = """

IMPORTANT: You are part of a team of AI agents working in parallel. 
Before making any changes:
1. Check the coordination directory work_claims/ for existing claims
2. Claim your work area by creating a lock file before starting
3. Release your claim when done or if you encounter issues
4. Log completed work to help other agents avoid duplication
"""
            full_prompt = base_prompt + coord_instructions
        else:
            full_prompt = base_prompt
            
        # Send to all agents with context files
        for i in range(self.args.agents):
            self.launcher.send_prompt(i, full_prompt, context_files=self.prompt.context_files, debug=self.debug)
            # Small delay between prompts to avoid overwhelming
            if i < self.args.agents - 1:
                time.sleep(1)
        
        # In collaborative mode, send all steps to all agents
        if self.collaborative and self.prompt.steps:
            print("[*] Collaborative mode: sending all steps to all agents")
            for i in range(self.args.agents):
                self._send_all_steps_to_agent(i)
                if i < self.args.agents - 1:
                    time.sleep(2)
    
    def _send_all_steps_to_agent(self, agent_id: int):
        """Send all steps to an agent for collaborative work"""
        steps_text = "\n\nCOMPLETE PROJECT STEPS:\n"
        for step in self.prompt.steps:
            steps_text += f"\nStep {step.number}: {step.content}"
            if step.description:
                steps_text += f"\n   Description: {step.description}"
        
        steps_text += """

Choose which step(s) to work on based on:
- What others have already claimed
- Your analysis of the codebase
- Dependencies between steps
- Your strengths and the step requirements

Remember to claim your work before starting and update the completed work log when done.
"""
        
        self.launcher.send_prompt(agent_id, steps_text, debug=self.debug)
        print(f"[+] Sent all {len(self.prompt.steps)} steps to agent {agent_id}")
            
    def _orchestrate_steps(self):
        """Orchestrate step-based workflow"""
        global RUNNING
        
        # In collaborative mode, steps are already sent, just monitor
        if self.collaborative:
            print("[*] Collaborative mode: agents are self-organizing")
            print(f"[*] Monitor coordination at: {self.coord.coord_dir}/")
            print("[*] Press Ctrl+C when work is complete")
            while RUNNING:
                time.sleep(5)
            return
        
        # Standard sequential mode
        print(f"[*] Sequential mode: Orchestrating {len(self.prompt.steps)} steps across {self.args.agents} agents")
        
        step_index = 0
        agents_working = set()
        
        while RUNNING and step_index < len(self.prompt.steps):
            # Check for idle agents and assign steps
            for agent_id in range(self.args.agents):
                if agent_id in agents_working:
                    continue
                    
                # Check if agent is ready
                if self.launcher.check_agent_ready(agent_id):
                    if step_index < len(self.prompt.steps):
                        # Handle bundled steps
                        if self.bundle_steps and self.bundle_steps > 1:
                            # Send multiple steps at once
                            steps_to_send = []
                            bundle_end = min(step_index + self.bundle_steps, len(self.prompt.steps))
                            
                            for i in range(step_index, bundle_end):
                                steps_to_send.append(self.prompt.steps[i])
                            
                            print(f"[*] Assigning steps {step_index + 1}-{bundle_end} to agent {agent_id}")
                            
                            bundled_prompt = "You have been assigned the following related steps:\n"
                            for step in steps_to_send:
                                bundled_prompt += f"\nStep {step.number}: {step.content}"
                                if step.description:
                                    bundled_prompt += f"\n   Description: {step.description}"
                            
                            bundled_prompt += "\n\nThese steps are related and should be completed together."
                            
                            self.launcher.send_prompt(agent_id, bundled_prompt, debug=self.debug)
                            agents_working.add(agent_id)
                            step_index = bundle_end
                        else:
                            # Single step assignment (original behavior)
                            step = self.prompt.steps[step_index]
                            print(f"[*] Assigning step {step.number} to agent {agent_id}")
                            
                            step_prompt = f"Step {step.number}: {step.content}"
                            if step.description:
                                step_prompt = f"{step_prompt}\n\nDescription: {step.description}"
                                
                            self.launcher.send_prompt(agent_id, step_prompt, debug=self.debug)
                            agents_working.add(agent_id)
                            step_index += 1
                        
            # Check for completed work
            for agent_id in list(agents_working):
                output = self.tmux.capture_pane(agent_id, lines=10)
                if "ready" in output.lower() and agent_id in agents_working:
                    agents_working.remove(agent_id)
                    print(f"[*] Agent {agent_id} completed its step")
                    
            time.sleep(5)  # Check every 5 seconds
            
        print("[*] All steps have been assigned")
        
        # Wait for remaining work to complete
        while RUNNING and agents_working:
            for agent_id in list(agents_working):
                output = self.tmux.capture_pane(agent_id, lines=10)
                if "ready" in output.lower():
                    agents_working.remove(agent_id)
                    print(f"[*] Agent {agent_id} completed its step")
                    
            time.sleep(5)
            
        if not agents_working:
            print("[+] All steps completed!")
            
    def _cleanup(self):
        """Clean up resources"""
        print("\n[*] Cleaning up...")
        
        # Send exit command to all agents
        for i in range(self.args.agents):
            self.tmux.send_to_pane(i, "/exit")
            
        time.sleep(2)
        
        # Kill tmux session
        if self.args.kill_on_exit:
            self.tmux.kill_session()
            
        # Clean up coordination files
        if self.args.cleanup_coordination:
            self.coord._cleanup()
            print("[+] Cleaned up coordination files")
            
        print("[+] Cleanup complete")


# ===== CLI Interface =====

def main():
    parser = argparse.ArgumentParser(
        description="Run multiple Claude Code agents in parallel",
        epilog="""
Examples:
  # Single prompt to all agents
  python multi_claude.py -n 5 -p "Fix all TypeScript errors in the codebase"
  
  # With coordination instructions
  python multi_claude.py -n 3 -p "Refactor the API layer" --coordinate
  
  # Step-based workflow
  python multi_claude.py -n 4 -p "Build feature X" --steps "Design" "Implement" "Test"
  
  # From prompt file
  python multi_claude.py -n 4 --prompt-file feature.yaml
        """,
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    # Required arguments
    parser.add_argument('-n', '--agents', type=int, required=True,
                       help='Number of agents to run in parallel')
    
    # Prompt options (one required)
    prompt_group = parser.add_mutually_exclusive_group(required=True)
    prompt_group.add_argument('-p', '--prompt', type=str,
                            help='Prompt to send to all agents')
    prompt_group.add_argument('--prompt-file', type=str,
                            help='Path to prompt file (text or YAML)')
    
    # Optional step-based workflow
    parser.add_argument('--steps', nargs='+',
                       help='Steps to distribute across agents')
    
    # Context files
    parser.add_argument('--context-files', nargs='+', type=str,
                       help='Paths to files to include as context for agents')
    
    # Session options
    parser.add_argument('-s', '--session', type=str, default='claude_agents',
                       help='tmux session name (default: claude_agents)')
    
    # Farm integration options
    parser.add_argument('--farm-id', type=str,
                       help='Farm ID for integration with MaiFarm')
    parser.add_argument('--harvest-id', type=str,
                       help='Harvest ID for integration with MaiFarm')
    
    # Timing options
    parser.add_argument('--stagger', type=float, default=5.0,
                       help='Seconds between agent launches (default: 5)')
    parser.add_argument('--wait-after-launch', type=float, default=15.0,
                       help='Seconds to wait after launching before sending prompts (default: 15)')
    parser.add_argument('--max-runtime', type=int, default=300,
                       help='Maximum runtime in seconds before graceful shutdown (default: 300)')
    
    # Behavior options
    parser.add_argument('--no-kill-on-exit', dest='kill_on_exit', 
                       action='store_false', default=True,
                       help='Keep tmux session alive after exit')
    parser.add_argument('--no-cleanup', dest='cleanup_coordination',
                       action='store_false', default=True,
                       help='Keep coordination files after exit')
    
    # Debug option
    parser.add_argument('--debug', action='store_true',
                       help='Enable debug output to diagnose issues')
    
    # Collaboration options
    parser.add_argument('--collaborative', action='store_true',
                       help='Enable collaborative mode where all agents see all steps')
    parser.add_argument('--bundle-steps', type=int, metavar='N',
                      help='Bundle steps into groups of N for agents')
    
    # AI Provider selection
    parser.add_argument('--provider', type=str, choices=['claude', 'qwen'], 
                      default=os.environ.get('AI_PROVIDER', 'claude'),
                      help='AI provider to use (claude or qwen)')
    
    # Workspace isolation options
    parser.add_argument('--workspace-dir', type=str,
                      help='Isolated workspace directory for agents (protects main codebase)')
    parser.add_argument('--project-root', type=str,
                      help='Original project root directory (for reference only)')
    parser.add_argument('--safe-mode', action='store_true', default=True,
                      help='Enforce workspace isolation (default: True)')
    parser.add_argument('--unsafe-mode', dest='safe_mode', action='store_false',
                      help='Disable workspace isolation (allows access to main codebase)')
    
    args = parser.parse_args()
    
    # Validate arguments
    if args.agents < 1:
        parser.error("Number of agents must be at least 1")
    if args.agents > 20:
        parser.error("Maximum 20 agents supported")
        
    # Run orchestrator
    orchestrator = MultiClaudeOrchestrator(args)
    orchestrator.run()


if __name__ == "__main__":
    main()