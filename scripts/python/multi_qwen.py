#!/usr/bin/env python3
"""
Multi-Agent Qwen3-Coder Orchestrator

Enhanced launcher for Qwen3-Coder agents with support for:
- Local Ollama models
- Qwen API via DashScope
- LLM Proxy for unified interface

Usage:
    python multi_qwen.py -n 5 -p "Fix all TypeScript errors"
    python multi_qwen.py -n 3 --prompt-file feature.yaml --local
    python multi_qwen.py -n 4 -p "Refactor API" --proxy
"""

import os
import sys
import time
import json
import subprocess
import requests
from pathlib import Path
from typing import List, Dict, Optional, Any
from dataclasses import dataclass
import argparse

# Import the base multi_claude.py components
sys.path.append(str(Path(__file__).parent))
from multi_claude import (
    TmuxManager, CoordinationManager, AgentLauncher,
    BuildPrompt, BuildStep, Agent, parse_prompt_file
)


@dataclass
class QwenConfig:
    """Configuration for Qwen provider"""
    use_local: bool = False
    use_proxy: bool = False
    use_api: bool = False
    model_name: str = "qwen2.5-coder:7b"
    api_key: Optional[str] = None
    proxy_url: str = "http://localhost:8001"
    

class QwenAgentLauncher(AgentLauncher):
    """Enhanced launcher specifically for Qwen agents"""
    
    def __init__(self, tmux: TmuxManager, coord: CoordinationManager, 
                 config: QwenConfig, farm_id: str = None, harvest_id: str = None, 
                 session_name: str = None):
        super().__init__(tmux, coord, farm_id, harvest_id, session_name)
        self.config = config
        self.provider = 'qwen'
        
    def check_ollama_model(self, model_name: str) -> bool:
        """Check if a specific Ollama model is available"""
        try:
            result = subprocess.run(
                f"ollama list | grep -i {model_name.split(':')[0]}",
                shell=True, capture_output=True, text=True
            )
            return result.returncode == 0 and model_name.split(':')[0].lower() in result.stdout.lower()
        except:
            return False
    
    def check_proxy_health(self) -> bool:
        """Check if LLM proxy is running and healthy"""
        try:
            response = requests.get(f"{self.config.proxy_url}/providers", timeout=2)
            if response.ok:
                data = response.json()
                return 'qwen' in data.get('providers', [])
        except:
            pass
        return False
    
    def launch_agent(self, agent_id: int, project_path: Path, debug: bool = False) -> Agent:
        """Launch a Qwen agent with appropriate configuration"""
        agent = Agent(id=agent_id, pane_id=self.tmux.pane_mapping[agent_id])
        self.agents[agent_id] = agent
        
        # Navigate to project directory
        self.tmux.send_to_pane(agent_id, f"cd {project_path}")
        time.sleep(1)
        
        # Set environment variables based on configuration
        if self.config.use_local:
            # Check if local model exists
            if not self.check_ollama_model(self.config.model_name):
                print(f"[!] Agent {agent_id}: Local model {self.config.model_name} not found")
                print(f"    Please run: ollama pull {self.config.model_name}")
                self.tmux.send_to_pane(agent_id, f"echo 'Please install: ollama pull {self.config.model_name}'")
                agent.status = "error"
                return agent
            
            print(f"[*] Agent {agent_id}: Using local Ollama model {self.config.model_name}")
            self.tmux.send_to_pane(agent_id, "export AI_PROVIDER=ollama")
            self.tmux.send_to_pane(agent_id, f"export OLLAMA_MODEL={self.config.model_name}")
            self.tmux.send_to_pane(agent_id, "export OLLAMA_BASE_URL=http://localhost:11434")
            
        elif self.config.use_proxy:
            # Check proxy health
            if not self.check_proxy_health():
                print(f"[!] Agent {agent_id}: LLM Proxy not available at {self.config.proxy_url}")
                print(f"    Please start the proxy: python llm_proxy.py --proxy")
                self.tmux.send_to_pane(agent_id, "echo 'Please start LLM proxy server'")
                agent.status = "error"
                return agent
            
            print(f"[*] Agent {agent_id}: Using Qwen via LLM Proxy")
            self.tmux.send_to_pane(agent_id, "export AI_PROVIDER=qwen")
            self.tmux.send_to_pane(agent_id, "export USE_LLM_PROXY=true")
            self.tmux.send_to_pane(agent_id, f"export LLM_PROXY_URL={self.config.proxy_url}")
            
        else:
            # Direct API access
            if not self.config.api_key:
                self.config.api_key = os.getenv('QWEN_API_KEY') or os.getenv('DASHSCOPE_API_KEY')
            
            if not self.config.api_key:
                print(f"[!] Agent {agent_id}: No Qwen API key found")
                print(f"    Please set QWEN_API_KEY or DASHSCOPE_API_KEY environment variable")
                self.tmux.send_to_pane(agent_id, "echo 'Please set QWEN_API_KEY environment variable'")
                agent.status = "error"
                return agent
            
            print(f"[*] Agent {agent_id}: Using Qwen API directly")
            self.tmux.send_to_pane(agent_id, "export AI_PROVIDER=qwen")
            self.tmux.send_to_pane(agent_id, f"export QWEN_API_KEY={self.config.api_key}")
            self.tmux.send_to_pane(agent_id, "export QWEN_MODEL=qwen-coder-480b")
        
        time.sleep(0.5)
        
        # Check if we have claude command (we'll use it as a wrapper)
        claude_check = subprocess.run(
            "which claude",
            shell=True, capture_output=True, text=True
        )
        
        if claude_check.returncode != 0:
            # Claude not installed - show instructions
            print(f"[!] Agent {agent_id}: Claude Code CLI not found (required as wrapper)")
            self.tmux.send_to_pane(agent_id, "echo '=== Claude Code CLI Not Installed ==='")
            self.tmux.send_to_pane(agent_id, "echo 'Even for Qwen, we use Claude Code CLI as the interface'")
            self.tmux.send_to_pane(agent_id, "echo 'Install from: https://claude.ai/code'")
            self.tmux.send_to_pane(agent_id, "bash")  # Start a bash shell
            agent.status = "demo"
            return agent
        
        # Launch Claude CLI which will use our proxy/environment to connect to Qwen
        self.tmux.send_to_pane(agent_id, "claude --dangerously-skip-permissions")
        
        # Wait for initialization
        print(f"[*] Agent {agent_id}: Waiting for Qwen3-Coder to initialize...")
        
        max_wait = 20
        check_interval = 2
        total_waited = 0
        
        while total_waited < max_wait:
            time.sleep(check_interval)
            total_waited += check_interval
            
            output = self.tmux.capture_pane(agent_id, lines=50)
            indicators = ["cwd", "Ready", "initialized", "Qwen", "Agent"]
            if len(output) > 100 or any(indicator in output for indicator in indicators):
                print(f"[*] Agent {agent_id}: Qwen3-Coder appears to be starting...")
                break
        
        time.sleep(3)
        
        # Register with coordination system
        agent_uid = self.coord.register_agent(agent_id, self.farm_id, self.harvest_id, self.session_name)
        agent.uid = agent_uid
        
        print(f"[+] Agent {agent_id} registered (UID: {agent_uid})")
        agent.status = "ready"
        
        # Set pane title
        self.tmux.set_pane_title(agent_id, f"Qwen Agent {agent_id}")
        
        return agent


def main():
    """Main entry point for Multi-Qwen orchestrator"""
    parser = argparse.ArgumentParser(description="Multi-Agent Qwen3-Coder Orchestrator")
    
    # Basic arguments
    parser.add_argument('-n', '--num-agents', type=int, default=3,
                       help='Number of Qwen agents to launch (default: 3)')
    parser.add_argument('-p', '--prompt', type=str,
                       help='Initial prompt for all agents')
    parser.add_argument('--prompt-file', type=str,
                       help='YAML file containing structured prompt')
    parser.add_argument('-s', '--session', type=str, default='qwen_agents',
                       help='Tmux session name (default: qwen_agents)')
    
    # Qwen-specific options
    parser.add_argument('--local', action='store_true',
                       help='Use local Ollama Qwen model')
    parser.add_argument('--proxy', action='store_true',
                       help='Use LLM proxy server')
    parser.add_argument('--api', action='store_true',
                       help='Use Qwen API directly (requires API key)')
    parser.add_argument('--model', type=str, default='qwen2.5-coder:7b',
                       help='Model name for local Ollama (default: qwen2.5-coder:7b)')
    parser.add_argument('--proxy-url', type=str, default='http://localhost:8001',
                       help='LLM proxy server URL')
    
    # Other options
    parser.add_argument('--steps', nargs='+',
                       help='Optional build steps')
    parser.add_argument('--context-files', nargs='+',
                       help='Files to include as context')
    parser.add_argument('--collaborative', action='store_true',
                       help='Enable collaborative mode')
    parser.add_argument('--debug', action='store_true',
                       help='Enable debug output')
    parser.add_argument('--no-kill-on-exit', action='store_true',
                       help='Keep tmux session alive after exit')
    
    args = parser.parse_args()
    
    # Validate arguments
    if not args.prompt and not args.prompt_file:
        print("[!] Error: Either --prompt or --prompt-file is required")
        sys.exit(1)
    
    # Configure Qwen provider
    config = QwenConfig()
    
    # Determine which mode to use (priority: local > proxy > api)
    if args.local:
        config.use_local = True
        config.model_name = args.model
        print(f"[*] Using local Ollama model: {config.model_name}")
    elif args.proxy:
        config.use_proxy = True
        config.proxy_url = args.proxy_url
        print(f"[*] Using LLM proxy at: {config.proxy_url}")
    else:
        # Default to API
        config.use_api = True
        print("[*] Using Qwen API (DashScope)")
    
    # Parse prompt
    if args.prompt_file:
        prompt = parse_prompt_file(args.prompt_file)
        print(f"[*] Loaded prompt from {args.prompt_file}")
    else:
        prompt = BuildPrompt(
            initial_prompt=args.prompt,
            name="Qwen Multi-Agent Task"
        )
        if args.steps:
            for i, step in enumerate(args.steps, 1):
                prompt.steps.append(BuildStep(number=i, content=step))
    
    if args.context_files:
        prompt.context_files = args.context_files
    
    # Initialize components
    tmux = TmuxManager(session_name=args.session)
    coord = CoordinationManager()
    
    # Clean up old sessions
    coord.cleanup_old_sessions()
    
    # Create tmux session
    print(f"[*] Creating tmux session with {args.num_agents} agents...")
    if not tmux.create_session(args.num_agents):
        print("[!] Failed to create tmux session")
        sys.exit(1)
    
    # Create launcher
    launcher = QwenAgentLauncher(tmux, coord, config, session_name=args.session)
    
    # Launch agents
    print(f"[*] Launching {args.num_agents} Qwen3-Coder agents...")
    project_path = Path.cwd()
    
    agents = []
    for i in range(args.num_agents):
        agent = launcher.launch_agent(i, project_path, debug=args.debug)
        if agent.status != "error":
            agents.append(agent)
        time.sleep(2)  # Stagger launches
    
    if not agents:
        print("[!] Failed to launch any agents")
        if not args.no_kill_on_exit:
            tmux.kill_session()
        sys.exit(1)
    
    print(f"[+] Successfully launched {len(agents)} agents")
    
    # Send initial prompt to all agents
    print("[*] Sending initial prompts...")
    for agent in agents:
        if agent.status == "ready":
            launcher.send_prompt(
                agent.id, 
                prompt.initial_prompt,
                context_files=prompt.context_files,
                debug=args.debug
            )
            time.sleep(1)
    
    # Handle steps if provided
    if prompt.steps:
        print(f"[*] Executing {len(prompt.steps)} steps...")
        for step in prompt.steps:
            print(f"[*] Step {step.number}: {step.description or step.content[:50]}...")
            time.sleep(5)  # Wait between steps
            
            for agent in agents:
                if agent.status == "ready":
                    launcher.send_prompt(agent.id, step.content, debug=args.debug)
                    time.sleep(1)
    
    # Attach to tmux session
    print(f"[+] All agents launched!")
    print(f"[*] Attaching to tmux session '{args.session}'...")
    print("[*] Use Ctrl+B then D to detach, Ctrl+B then [ to scroll")
    print("[*] To switch panes: Ctrl+B then arrow keys")
    print("[*] To kill session: tmux kill-session -t " + args.session)
    
    # Give a moment for everything to settle
    time.sleep(2)
    
    # Attach to the session
    subprocess.run(f"tmux attach-session -t {args.session}", shell=True)
    
    # Clean up if not keeping session
    if not args.no_kill_on_exit:
        print("\n[*] Cleaning up...")
        tmux.kill_session()
        print("[+] Session terminated")


if __name__ == "__main__":
    main()