#!/usr/bin/env python3
"""
Improved Multi-Agent Claude Code Orchestrator
Focused on reliability and proper process management
"""

import os
import sys
import time
import json
import signal
import argparse
import subprocess
import asyncio
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Optional
from dataclasses import dataclass, field

# Global flag for clean shutdown
RUNNING = True

def signal_handler(signum, frame):
    """Handle Ctrl+C for graceful shutdown"""
    global RUNNING
    print("\n[!] Shutdown signal received. Cleaning up...")
    RUNNING = False

signal.signal(signal.SIGINT, signal_handler)


@dataclass
class Agent:
    """Agent state tracking"""
    id: int
    pane_id: str
    status: str = "starting"
    start_time: datetime = field(default_factory=datetime.now)
    ready: bool = False


class SimpleTmuxManager:
    """Simplified tmux manager focused on reliability"""
    
    def __init__(self, session_name: str = "claude_agents"):
        self.session = session_name
        self.cleanup_existing()
        
    def cleanup_existing(self):
        """Clean up any existing session"""
        subprocess.run(f"tmux kill-session -t {self.session} 2>/dev/null", 
                      shell=True, capture_output=True)
        time.sleep(0.5)
        
    def create_session(self, num_agents: int) -> bool:
        """Create tmux session with specified number of panes"""
        try:
            # Create new session
            cmd = f"tmux new-session -d -s {self.session} -n agents"
            result = subprocess.run(cmd, shell=True, capture_output=True)
            if result.returncode != 0:
                print(f"[!] Failed to create tmux session")
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
            
            print(f"[+] Created tmux session '{self.session}' with {num_agents} panes")
            return True
            
        except Exception as e:
            print(f"[!] Error creating tmux session: {e}")
            return False
    
    def send_command(self, pane_index: int, command: str):
        """Send command to specific pane"""
        target = f"{self.session}:agents.{pane_index}"
        
        # For multi-line commands, write to temp file and use tmux load-buffer
        if '\n' in command and len(command) > 100:
            import tempfile
            with tempfile.NamedTemporaryFile(mode='w', delete=False) as f:
                f.write(command)
                temp_path = f.name
            
            try:
                # Load and paste buffer
                subprocess.run(f"tmux load-buffer {temp_path}", shell=True)
                subprocess.run(f"tmux paste-buffer -t {target}", shell=True)
                time.sleep(0.1)
                subprocess.run(f"tmux send-keys -t {target} Enter", shell=True)
            finally:
                os.unlink(temp_path)
        else:
            # Simple command
            escaped = command.replace("'", "'\"'\"'")
            subprocess.run(f"tmux send-keys -t {target} '{escaped}'", shell=True)
            subprocess.run(f"tmux send-keys -t {target} Enter", shell=True)
    
    def capture_output(self, pane_index: int, lines: int = 50) -> str:
        """Capture output from pane"""
        target = f"{self.session}:agents.{pane_index}"
        result = subprocess.run(
            f"tmux capture-pane -t {target} -p -S -{lines}",
            shell=True, capture_output=True, text=True
        )
        return result.stdout
    
    def kill_session(self):
        """Kill the tmux session"""
        subprocess.run(f"tmux kill-session -t {self.session}", 
                      shell=True, capture_output=True)


class SimpleOrchestrator:
    """Simplified orchestrator for Claude agents"""
    
    def __init__(self, num_agents: int, prompt: str, session_name: str = "claude_agents"):
        self.num_agents = num_agents
        self.prompt = prompt
        self.tmux = SimpleTmuxManager(session_name)
        self.agents: List[Agent] = []
        self.coord_dir = Path("/tmp/claude_coordination")
        self.coord_dir.mkdir(exist_ok=True)
        
    def setup_coordination(self):
        """Set up coordination files"""
        # Clean old data
        active_file = self.coord_dir / "active_agents.json"
        active_file.write_text("{}")
        
        # Clean work claims
        work_claims = self.coord_dir / "work_claims"
        work_claims.mkdir(exist_ok=True)
        for f in work_claims.glob("*.lock"):
            f.unlink()
    
    def launch_agents(self) -> bool:
        """Launch Claude Code agents"""
        print(f"[*] Launching {self.num_agents} agents...")
        
        # Create tmux session
        if not self.tmux.create_session(self.num_agents):
            return False
        
        # Launch Claude in each pane
        for i in range(self.num_agents):
            agent = Agent(id=i, pane_id=f"{i}")
            self.agents.append(agent)
            
            print(f"[*] Starting Claude Code in pane {i}...")
            self.tmux.send_command(i, "claude --dangerously-skip-permissions")
            
            # Stagger launches
            if i < self.num_agents - 1:
                time.sleep(3)
        
        # Wait for all agents to initialize
        print("[*] Waiting for agents to initialize...")
        time.sleep(15)
        
        # Check if agents are ready
        all_ready = True
        for agent in self.agents:
            output = self.tmux.capture_output(agent.id, lines=100)
            if "cwd:" in output or "Bypassing Permissions" in output:
                agent.ready = True
                agent.status = "ready"
                print(f"[+] Agent {agent.id} is ready")
            else:
                all_ready = False
                print(f"[!] Agent {agent.id} may not be ready")
        
        return all_ready
    
    def send_prompts(self):
        """Send prompts to all agents"""
        print("[*] Sending prompts to agents...")
        
        for agent in self.agents:
            if agent.ready:
                # Add coordination instructions if multiple agents
                full_prompt = self.prompt
                if self.num_agents > 1:
                    full_prompt += f"\n\n[You are Agent {agent.id} of {self.num_agents} working in parallel]"
                
                print(f"[*] Sending prompt to agent {agent.id}...")
                self.tmux.send_command(agent.id, full_prompt)
                agent.status = "working"
                
                # Small delay between prompts
                time.sleep(1)
    
    def monitor_agents(self, duration: int = 60):
        """Monitor agents for a specified duration"""
        print(f"[*] Monitoring agents for {duration} seconds...")
        print("[*] Press Ctrl+C to stop")
        
        start_time = time.time()
        while RUNNING and (time.time() - start_time) < duration:
            time.sleep(5)
            
            # Periodically check agent status
            for agent in self.agents:
                output = self.tmux.capture_output(agent.id, lines=10)
                # Could parse output to determine if agent is still working
                
        print("[*] Monitoring complete")
    
    def cleanup(self):
        """Clean up resources"""
        print("[*] Cleaning up...")
        
        # Send exit command to all agents
        for agent in self.agents:
            try:
                self.tmux.send_command(agent.id, "/exit")
            except:
                pass
        
        time.sleep(2)
        
        # Kill tmux session
        self.tmux.kill_session()
        print("[+] Cleanup complete")
    
    def run(self):
        """Main execution flow"""
        try:
            # Setup
            self.setup_coordination()
            
            # Launch agents
            if not self.launch_agents():
                print("[!] Some agents failed to launch properly")
                # Continue anyway
            
            # Send prompts
            self.send_prompts()
            
            # Monitor
            self.monitor_agents(duration=300)  # 5 minutes max
            
        except Exception as e:
            print(f"[!] Error: {e}")
        finally:
            self.cleanup()


def main():
    parser = argparse.ArgumentParser(
        description="Simplified Multi-Agent Claude Code Orchestrator"
    )
    
    parser.add_argument('-n', '--agents', type=int, required=True,
                       help='Number of agents to run')
    parser.add_argument('-p', '--prompt', type=str, required=True,
                       help='Prompt to send to agents')
    parser.add_argument('-s', '--session', type=str, default='claude_agents',
                       help='tmux session name')
    parser.add_argument('--duration', type=int, default=60,
                       help='Monitor duration in seconds')
    
    args = parser.parse_args()
    
    if args.agents < 1 or args.agents > 10:
        parser.error("Number of agents must be between 1 and 10")
    
    # Run orchestrator
    orchestrator = SimpleOrchestrator(
        num_agents=args.agents,
        prompt=args.prompt,
        session_name=args.session
    )
    orchestrator.run()


if __name__ == "__main__":
    main()