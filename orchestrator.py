#!/usr/bin/env python3
"""
MaiFarm Orchestrator - Multi-Agent AI Orchestration System
Manages multiple Claude/Qwen AI agents working collaboratively on tasks.
"""

import argparse
import asyncio
import json
import logging
import os
import signal
import subprocess
import sys
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any
import shutil
import yaml

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

class AgentOrchestrator:
    """Orchestrates multiple AI agents using tmux sessions."""
    
    def __init__(self, args):
        self.args = args
        self.session_name = args.session or f"farm-{uuid.uuid4().hex[:8]}"
        self.farm_id = args.farm_id or self.session_name
        self.harvest_id = args.harvest_id
        self.workspace_dir = Path(args.workspace_dir) if args.workspace_dir else Path.cwd() / "maibarn" / "workspaces" / "active" / self.farm_id
        self.coordination_dir = Path("maibarn/coordination")
        self.agents = []
        self.agent_names = []  # Store agent names from YAML
        self.start_time = datetime.now()
        self.shutdown_requested = False
        
        # Extract agent names from YAML if provided
        if args.prompt_file and args.prompt_file.endswith('.yaml'):
            try:
                with open(args.prompt_file, 'r') as f:
                    config = yaml.safe_load(f)
                    if config and 'agents' in config and isinstance(config['agents'], list):
                        self.agent_names = [agent.get('name', f'Agent {i+1}') for i, agent in enumerate(config['agents'])]
                        logger.info(f"Extracted agent names from YAML: {self.agent_names}")
            except Exception as e:
                logger.warning(f"Could not extract agent names from YAML: {e}")
        
        # Fall back to generic names if none extracted
        if not self.agent_names:
            self.agent_names = [f'Agent {i+1}' for i in range(args.num_agents)]
        
        # Ensure directories exist
        self.workspace_dir.mkdir(parents=True, exist_ok=True)
        self.coordination_dir.mkdir(parents=True, exist_ok=True)
        
        # Set up signal handlers for graceful shutdown
        signal.signal(signal.SIGINT, self._handle_shutdown)
        signal.signal(signal.SIGTERM, self._handle_shutdown)
    
    def _handle_shutdown(self, signum, frame):
        """Handle shutdown signals gracefully."""
        logger.info(f"Received signal {signum}, initiating graceful shutdown...")
        self.shutdown_requested = True
        self.graceful_shutdown()
    
    def create_tmux_session(self) -> bool:
        """Create a new tmux session with multiple panes for agents."""
        logger.info(f"[TMUX] Attempting to create session: {self.session_name}")
        
        try:
            # Kill existing session if it exists
            logger.debug(f"[TMUX] Checking for existing session: {self.session_name}")
            kill_result = subprocess.run(
                ["tmux", "kill-session", "-t", self.session_name],
                capture_output=True,
                text=True
            )
            if kill_result.returncode == 0:
                logger.info(f"[TMUX] Killed existing session: {self.session_name}")
            else:
                logger.debug(f"[TMUX] No existing session to kill")
            time.sleep(0.5)
        except Exception as e:
            logger.debug(f"[TMUX] No existing session to kill: {e}")
        
        try:
            # Create new session with first window
            logger.info(f"[TMUX] Creating new session: {self.session_name} with {self.args.num_agents} agents")
            result = subprocess.run(
                ["tmux", "new-session", "-d", "-s", self.session_name, "-n", "agents"],
                capture_output=True,
                text=True
            )
            
            if result.returncode != 0:
                logger.error(f"[TMUX] Failed to create session: {result.stderr}")
                return False
            
            logger.info(f"[TMUX] Session created successfully: {self.session_name}")
            
            # Create additional panes for multiple agents
            for i in range(1, self.args.num_agents):
                logger.debug(f"[TMUX] Creating pane {i + 1}/{self.args.num_agents}")
                result = subprocess.run(
                    ["tmux", "split-window", "-t", f"{self.session_name}:agents", "-h"],
                    capture_output=True,
                    text=True
                )
                if result.returncode != 0:
                    logger.warning(f"[TMUX] Failed to create pane {i}: {result.stderr}")
                else:
                    logger.debug(f"[TMUX] Pane {i + 1} created successfully")
            
            # Balance panes for even layout
            logger.debug(f"[TMUX] Balancing pane layout")
            balance_result = subprocess.run(
                ["tmux", "select-layout", "-t", f"{self.session_name}:agents", "tiled"],
                capture_output=True,
                text=True
            )
            if balance_result.returncode == 0:
                logger.debug(f"[TMUX] Layout balanced successfully")
            
            logger.info(f"[TMUX] ✓ Created session '{self.session_name}' with {self.args.num_agents} panes")
            return True
            
        except Exception as e:
            logger.error(f"Error creating tmux session: {e}")
            return False
    
    def prepare_agent_prompt(self, agent_id: int) -> str:
        """Prepare the prompt for a specific agent."""
        base_prompt = self.args.prompt or "Help with development tasks"
        
        if self.args.prompt_file:
            try:
                with open(self.args.prompt_file, 'r') as f:
                    if self.args.prompt_file.endswith('.yaml'):
                        config = yaml.safe_load(f)
                        base_prompt = config.get('initial_prompt', base_prompt)
                    else:
                        base_prompt = f.read().strip()
            except Exception as e:
                logger.warning(f"Could not read prompt file: {e}")
        
        # Add agent-specific context with proper name
        agent_name = self.agent_names[agent_id] if agent_id < len(self.agent_names) else f'Agent {agent_id + 1}'
        agent_prompt = f"""
You are {agent_name} (Agent {agent_id + 1} of {self.args.num_agents}) working on farm {self.farm_id}.

Workspace: {self.workspace_dir}
Coordination: {self.coordination_dir}

{base_prompt}

Save all generated files to: {self.workspace_dir}/

Coordinate with other agents via files in: {self.coordination_dir}/

When ready, respond with 'Agent {agent_id + 1} ready' and begin working.
"""
        
        # Add steps if provided
        if self.args.steps:
            agent_prompt += "\n\nSteps to complete:\n"
            for i, step in enumerate(self.args.steps, 1):
                agent_prompt += f"{i}. {step}\n"
        
        # Add collaborative instructions
        if self.args.collaborative:
            agent_prompt += """
            
Work collaboratively with other agents:
- Check {self.coordination_dir}/active_agents.json for other agents
- Claim work in {self.coordination_dir}/work_claims.json
- Update progress regularly
- Avoid duplicating work
"""
        
        return agent_prompt
    
    def launch_agent(self, agent_id: int) -> bool:
        """Launch a single agent in its tmux pane."""
        try:
            pane_target = f"{self.session_name}:agents.{agent_id}"
            prompt = self.prepare_agent_prompt(agent_id)
            
            # Determine which AI provider to use
            provider = self.args.provider or os.environ.get('AI_PROVIDER', 'claude')
            
            if provider == 'claude':
                # Check if Claude CLI is available
                claude_available = shutil.which('claude')
                
                if claude_available:
                    logger.info(f"Launching Claude agent {agent_id + 1} with bypassPermissions mode")
                    
                    # Change to workspace directory first
                    subprocess.run(
                        ["tmux", "send-keys", "-t", pane_target, f"cd {self.workspace_dir}", "Enter"],
                        capture_output=True,
                        text=True
                    )
                    time.sleep(0.2)
                    
                    # Use Claude with bypassPermissions to avoid interactive prompts
                    # Also provide the prompt directly on the command line
                    escaped_prompt = prompt.replace('"', '\\"').replace('$', '\\$').replace('\n', ' ')
                    cmd = f'claude --permission-mode bypassPermissions "{escaped_prompt}"'
                    
                    subprocess.run(
                        ["tmux", "send-keys", "-t", pane_target, cmd, "Enter"],
                        capture_output=True,
                        text=True
                    )
                    
                    logger.info(f"Claude agent {agent_id + 1} launched in pane {pane_target}")
                else:
                    # Fallback to mock agent for development
                    logger.warning(f"Claude CLI not found, automatically falling back to mock agent for agent {agent_id + 1}")
                    self.launch_mock_agent(agent_id, pane_target, prompt)
                    
            elif provider == 'qwen':
                # Use Qwen via API or proxy
                logger.info(f"Launching Qwen agent {agent_id + 1}")
                self.launch_qwen_agent(agent_id, pane_target, prompt)
                
            else:
                logger.warning(f"Unknown provider {provider}, using mock agent")
                self.launch_mock_agent(agent_id, pane_target, prompt)
            
            # Add stagger delay between launches only if explicitly requested
            if self.args.stagger > 0 and agent_id < self.args.num_agents - 1:
                logger.debug(f"[AGENTS] Waiting {self.args.stagger}s before launching next agent")
                time.sleep(self.args.stagger)
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to launch agent {agent_id + 1}: {e}")
            return False
    
    def launch_mock_agent(self, agent_id: int, pane_target: str, prompt: str):
        """Launch a mock agent for development/testing."""
        logger.info(f"Launching mock agent {agent_id + 1} in pane {pane_target}")
        
        # Clear the pane first
        subprocess.run(
            ["tmux", "send-keys", "-t", pane_target, "clear", "Enter"],
            capture_output=True,
            text=True
        )
        
        # Create a simple mock agent script that produces visible output
        mock_commands = [
            f"echo '=== Mock Agent {agent_id + 1} Starting ==='",
            f"echo 'Farm ID: {self.farm_id}'",
            f"echo 'Workspace: {self.workspace_dir}'",
            f"echo 'Session: {self.session_name}'",
            f"echo ''",
            f"echo 'Agent {agent_id + 1} ready'",
            f"echo ''",
            f"echo 'Beginning work simulation...'",
            f"echo ''",
        ]
        
        # Send initial commands
        for cmd in mock_commands:
            subprocess.run(
                ["tmux", "send-keys", "-t", pane_target, cmd, "Enter"],
                capture_output=True,
                text=True
            )
            time.sleep(0.1)  # Small delay between commands
        
        # Create a loop that simulates work
        work_loop = f"""
for i in {{1..20}}; do
    echo "[Agent {agent_id + 1}] Task $$i: Processing..."
    echo "  - Analyzing requirements"
    echo "  - Generating solution"
    echo "  - Validating output"
    echo "[Agent {agent_id + 1}] Task $$i: Complete ✓"
    echo ""
    sleep 3
done
echo "[Agent {agent_id + 1}] All tasks completed successfully!"
"""
        
        # Send the work loop as a single command
        subprocess.run(
            ["tmux", "send-keys", "-t", pane_target, work_loop, "Enter"],
            capture_output=True,
            text=True
        )
        
        logger.info(f"Mock agent {agent_id + 1} launched successfully")
    
    def launch_qwen_agent(self, agent_id: int, pane_target: str, prompt: str):
        """Launch a Qwen agent via API."""
        # This would integrate with the Qwen API or LLM proxy
        # For now, use mock implementation
        logger.info(f"Qwen agent {agent_id + 1} would be launched here")
        self.launch_mock_agent(agent_id, pane_target, prompt)
    
    def monitor_agents(self):
        """Monitor agent status and coordination."""
        logger.info("Monitoring agents...")
        
        # Update active agents file
        active_agents = []
        for i in range(self.args.num_agents):
            agent_name = self.agent_names[i] if i < len(self.agent_names) else f'Agent {i + 1}'
            active_agents.append({
                "id": f"agent_{i}",
                "name": agent_name,
                "farm_id": self.farm_id,
                "status": "active",
                "started_at": self.start_time.isoformat(),
                "pane": f"{self.session_name}:agents.{i}"
            })
        
        active_agents_file = self.coordination_dir / "active_agents.json"
        active_agents_file.write_text(json.dumps(active_agents, indent=2))
        
        # Monitor for max runtime
        if self.args.max_runtime:
            start = time.time()
            while not self.shutdown_requested:
                elapsed = time.time() - start
                if elapsed >= self.args.max_runtime:
                    logger.info(f"Max runtime of {self.args.max_runtime}s reached")
                    self.graceful_shutdown()
                    break
                time.sleep(5)
        else:
            # Run indefinitely until interrupted
            while not self.shutdown_requested:
                time.sleep(5)
    
    def collect_outputs(self) -> Dict[str, Any]:
        """Collect outputs from all agents."""
        logger.info("Collecting agent outputs...")
        
        outputs = {
            "farm_id": self.farm_id,
            "harvest_id": self.harvest_id,
            "session_name": self.session_name,
            "agents": self.args.num_agents,
            "start_time": self.start_time.isoformat(),
            "end_time": datetime.now().isoformat(),
            "workspace": str(self.workspace_dir),
            "files": []
        }
        
        # Collect files from workspace
        if self.workspace_dir.exists():
            for file_path in self.workspace_dir.rglob("*"):
                if file_path.is_file():
                    rel_path = file_path.relative_to(self.workspace_dir)
                    outputs["files"].append({
                        "path": str(rel_path),
                        "size": file_path.stat().st_size,
                        "modified": datetime.fromtimestamp(file_path.stat().st_mtime).isoformat()
                    })
        
        # Save harvest metadata
        if self.harvest_id:
            harvest_dir = Path("maibarn/harvests/active") / self.harvest_id
            harvest_dir.mkdir(parents=True, exist_ok=True)
            
            metadata_file = harvest_dir / "metadata.json"
            metadata_file.write_text(json.dumps(outputs, indent=2))
            logger.info(f"Saved harvest metadata to {metadata_file}")
        
        return outputs
    
    def graceful_shutdown(self):
        """Perform graceful shutdown with output collection."""
        logger.info("Initiating graceful shutdown...")
        
        # Collect outputs
        outputs = self.collect_outputs()
        logger.info(f"Collected {len(outputs['files'])} files from workspace")
        
        # Update agent status
        active_agents_file = self.coordination_dir / "active_agents.json"
        if active_agents_file.exists():
            agents = json.loads(active_agents_file.read_text())
            for agent in agents:
                if agent["farm_id"] == self.farm_id:
                    agent["status"] = "completed"
            active_agents_file.write_text(json.dumps(agents, indent=2))
        
        # Kill tmux session if requested
        if not self.args.no_kill_on_exit:
            try:
                subprocess.run(
                    ["tmux", "kill-session", "-t", self.session_name],
                    capture_output=True,
                    text=True
                )
                logger.info(f"Killed tmux session: {self.session_name}")
            except:
                pass
        
        logger.info("Graceful shutdown completed")
        sys.exit(0)
    
    def run(self):
        """Main orchestration loop."""
        logger.info("=" * 60)
        logger.info(f"MaiFarm Orchestrator Starting")
        logger.info("=" * 60)
        logger.info(f"Farm ID: {self.farm_id}")
        logger.info(f"Session: {self.session_name}")
        logger.info(f"Agents: {self.args.num_agents}")
        
        # Check provider availability
        provider = self.args.provider or os.environ.get('AI_PROVIDER', 'claude')
        if provider == 'claude' and not shutil.which('claude'):
            logger.warning(f"⚠️  Claude CLI not found - will use mock agents for testing")
            logger.info(f"Provider: claude (fallback to mock)")
        else:
            logger.info(f"Provider: {provider}")
            
        logger.info(f"Workspace: {self.workspace_dir}")
        logger.info(f"Coordination: {self.coordination_dir}")
        if self.harvest_id:
            logger.info(f"Harvest ID: {self.harvest_id}")
        logger.info("=" * 60)
        
        # Create tmux session
        if not self.create_tmux_session():
            logger.error("[FATAL] Failed to create tmux session - exiting")
            sys.exit(1)
        
        # Slight delay to ensure tmux session is fully ready
        time.sleep(1)
        
        # Launch agents
        logger.info(f"[AGENTS] Launching {self.args.num_agents} agents...")
        successful_launches = 0
        for i in range(self.args.num_agents):
            if self.launch_agent(i):
                successful_launches += 1
                logger.info(f"[AGENTS] ✓ Agent {i + 1}/{self.args.num_agents} launched")
            else:
                logger.error(f"[AGENTS] ✗ Failed to launch agent {i + 1}")
        
        if successful_launches == 0:
            logger.error("[FATAL] No agents launched successfully - exiting")
            sys.exit(1)
        
        logger.info(f"[AGENTS] Successfully launched {successful_launches}/{self.args.num_agents} agents")
        
        # Monitor agents
        try:
            logger.info("[MONITOR] Starting agent monitoring...")
            self.monitor_agents()
        except KeyboardInterrupt:
            logger.info("[SHUTDOWN] Interrupted by user - initiating graceful shutdown")
            self.graceful_shutdown()
        except Exception as e:
            logger.error(f"[ERROR] Error during monitoring: {e}")
            self.graceful_shutdown()

def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="MaiFarm Orchestrator - Multi-Agent AI Orchestration System"
    )
    
    # Required arguments
    parser.add_argument("-n", "--num-agents", type=int, required=True,
                       help="Number of agents to launch")
    
    # Prompt arguments
    parser.add_argument("-p", "--prompt", type=str,
                       help="Base prompt for agents")
    parser.add_argument("--prompt-file", type=str,
                       help="File containing prompt (YAML or text)")
    
    # Session arguments
    parser.add_argument("-s", "--session", type=str,
                       help="Tmux session name")
    parser.add_argument("--farm-id", type=str,
                       help="Farm identifier")
    parser.add_argument("--harvest-id", type=str,
                       help="Harvest identifier for output collection")
    
    # Workspace arguments
    parser.add_argument("--workspace-dir", type=str,
                       help="Workspace directory for agents")
    
    # Collaboration arguments
    parser.add_argument("--steps", nargs="+",
                       help="Steps for agents to complete")
    parser.add_argument("--collaborative", action="store_true",
                       help="Enable collaborative mode")
    parser.add_argument("--bundle-steps", type=int,
                       help="Bundle steps for agents")
    
    # Provider arguments
    parser.add_argument("--provider", choices=["claude", "qwen", "ollama", "mock"],
                       help="AI provider to use")
    
    # Timing arguments
    parser.add_argument("--stagger", type=int, default=0,
                       help="Delay between agent launches (seconds, default 0 for parallel launch)")
    parser.add_argument("--max-runtime", type=int,
                       help="Maximum runtime in seconds")
    
    # Control arguments
    parser.add_argument("--no-kill-on-exit", action="store_true",
                       help="Don't kill tmux session on exit")
    parser.add_argument("--debug", action="store_true",
                       help="Enable debug logging")
    
    # Context arguments
    parser.add_argument("--context-files", nargs="+",
                       help="Context files to provide to agents")
    
    args = parser.parse_args()
    
    # Set debug logging if requested
    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)
    
    # Validate arguments
    if not args.prompt and not args.prompt_file:
        logger.warning("No prompt provided, using default")
        args.prompt = "Help with development tasks"
    
    # Run orchestrator
    orchestrator = AgentOrchestrator(args)
    orchestrator.run()

if __name__ == "__main__":
    main()