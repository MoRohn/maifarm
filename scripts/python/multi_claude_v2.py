#!/usr/bin/env python3
"""
Multi-Agent Claude Code Orchestrator V2
Enhanced with Redis-based coordination to eliminate race conditions

Usage:
    python multi_claude_v2.py -n 5 -p "Fix all TypeScript errors"
    python multi_claude_v2.py -n 3 --prompt-file feature.yaml
    python multi_claude_v2.py -n 4 -p "Refactor API" --steps "Analyze" "Implement" "Test"
    python multi_claude_v2.py -n 2 --farm-id my-farm-123 --redis-host localhost
"""

import os
import sys
import time
import json
import yaml
import signal
import argparse
import subprocess
import uuid
import threading
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Dict, Optional, Any, Tuple
from dataclasses import dataclass, field

# Import our Redis coordination client
from redis_coordination_client import RedisCoordinationClient

# Global flag for clean shutdown
RUNNING = True
COORDINATION_CLIENT: Optional[RedisCoordinationClient] = None

def signal_handler(signum, frame):
    """Handle Ctrl+C for graceful shutdown"""
    global RUNNING, COORDINATION_CLIENT
    print("\n[!] Shutdown signal received. Cleaning up...")
    RUNNING = False
    
    if COORDINATION_CLIENT:
        try:
            COORDINATION_CLIENT.close()
        except Exception as e:
            print(f"[!] Error closing coordination client: {e}")

signal.signal(signal.SIGINT, signal_handler)

# ===== Data Models =====

@dataclass
class AgentConfig:
    """Configuration for individual agent"""
    id: str
    farm_id: str
    index: int
    tmux_pane: str
    prompt: str
    working_directory: str
    provider: str = 'claude'
    model: Optional[str] = None
    status: str = 'starting'
    last_heartbeat: Optional[datetime] = None

@dataclass
class FarmConfig:
    """Configuration for entire farm"""
    id: str
    name: str
    description: str
    agent_count: int
    agents: List[AgentConfig] = field(default_factory=list)
    status: str = 'launching'
    session_name: Optional[str] = None
    start_time: Optional[datetime] = None
    timeout: int = 300  # 5 minutes default
    
class MultiClaudeFarmV2:
    """Enhanced multi-agent orchestrator with Redis coordination"""
    
    def __init__(self, 
                 redis_host: str = 'localhost', 
                 redis_port: int = 6379,
                 debug: bool = False):
        """Initialize farm orchestrator"""
        self.debug = debug
        self.farms: Dict[str, FarmConfig] = {}
        
        # Initialize Redis coordination
        try:
            self.coordination_client = RedisCoordinationClient(
                redis_host=redis_host,
                redis_port=redis_port
            )
            global COORDINATION_CLIENT
            COORDINATION_CLIENT = self.coordination_client
            print(f"[✓] Connected to Redis at {redis_host}:{redis_port}")
        except Exception as e:
            print(f"[!] Failed to connect to Redis: {e}")
            print("[!] Falling back to legacy mode (not recommended)")
            self.coordination_client = None
        
        # Heartbeat monitoring
        self.heartbeat_thread = None
        self.start_heartbeat_monitor()
    
    def create_farm(self,
                   farm_id: str,
                   prompt: str,
                   agent_count: int = 3,
                   name: Optional[str] = None,
                   description: Optional[str] = None,
                   steps: Optional[List[str]] = None,
                   working_directory: str = '.',
                   provider: str = 'claude',
                   model: Optional[str] = None,
                   timeout: int = 300) -> bool:
        """Create and launch a new agent farm"""
        
        if not name:
            name = f"Farm {farm_id[:8]}"
        
        if not description:
            description = f"Multi-agent farm with {agent_count} Claude agents"
        
        print(f"[*] Creating farm {farm_id} with {agent_count} agents...")
        
        # Check if farm already exists in Redis
        if self.coordination_client and self.coordination_client.farm_exists(farm_id):
            print(f"[!] Farm {farm_id} already exists in Redis")
            return False
        
        # Create farm configuration
        farm_config = FarmConfig(
            id=farm_id,
            name=name,
            description=description,
            agent_count=agent_count,
            timeout=timeout,
            start_time=datetime.now(timezone.utc)
        )
        
        # Generate unique session name to prevent conflicts
        timestamp = int(time.time())
        farm_config.session_name = f"maifarm_{farm_id[:8]}_{timestamp}"
        
        # Prepare full prompt with steps
        full_prompt = self._build_full_prompt(prompt, steps, agent_count)
        
        # Create tmux session
        if not self._create_tmux_session(farm_config.session_name, agent_count):
            print(f"[!] Failed to create tmux session for farm {farm_id}")
            return False
        
        # Create agent configurations
        for i in range(agent_count):
            agent_id = f"{farm_id}-agent-{i}"
            agent_config = AgentConfig(
                id=agent_id,
                farm_id=farm_id,
                index=i,
                tmux_pane=f"{farm_config.session_name}:agents.{i}",
                prompt=self._customize_agent_prompt(full_prompt, i, agent_count),
                working_directory=working_directory,
                provider=provider,
                model=model,
                status='starting',
                last_heartbeat=datetime.now(timezone.utc)
            )
            farm_config.agents.append(agent_config)
        
        # Store farm configuration
        self.farms[farm_id] = farm_config
        
        # Create farm request for Node.js service (if Redis available)
        if self.coordination_client:
            try:
                farm_request = self.coordination_client.create_farm_request(farm_id, {
                    'name': name,
                    'description': description,
                    'prompt': full_prompt,
                    'agent_count': agent_count,
                    'provider': provider,
                    'model': model,
                    'working_directory': working_directory,
                    'timeout': timeout * 1000,  # Convert to milliseconds
                    'steps': steps or [],
                    'collaborative': True,
                    'debug': self.debug
                })
                
                print(f"[*] Farm request created for {farm_id}")
            except Exception as e:
                print(f"[!] Warning: Could not create Redis farm request: {e}")
        
        # Initialize agents
        if not self._initialize_agents(farm_config):
            print(f"[!] Failed to initialize agents for farm {farm_id}")
            self._cleanup_farm(farm_id)
            return False
        
        # Update farm status
        farm_config.status = 'running'
        print(f"[✓] Farm {farm_id} launched successfully with {agent_count} agents")
        
        return True
    
    def _create_tmux_session(self, session_name: str, agent_count: int) -> bool:
        """Create tmux session with proper layout"""
        try:
            # Check if session already exists
            result = subprocess.run(['tmux', 'has-session', '-t', session_name], 
                                 capture_output=True, text=True)
            if result.returncode == 0:
                print(f"[!] Tmux session {session_name} already exists, killing it...")
                subprocess.run(['tmux', 'kill-session', '-t', session_name], 
                             capture_output=True)
            
            # Create new session
            subprocess.run(['tmux', 'new-session', '-d', '-s', session_name, '-n', 'agents'], 
                          check=True)
            
            # Configure session
            config_commands = [
                ['set-option', '-t', session_name, '-g', 'mouse', 'on'],
                ['set-option', '-t', session_name, '-g', 'pane-border-status', 'top'],
                ['set-option', '-t', session_name, '-g', 'pane-border-format', ' Agent #{pane_index} ']
            ]
            
            for cmd in config_commands:
                subprocess.run(['tmux'] + cmd, capture_output=True)
            
            # Create additional panes
            for i in range(1, agent_count):
                subprocess.run(['tmux', 'split-window', '-t', f'{session_name}:agents'], 
                             capture_output=True)
                # Apply tiled layout after each split
                subprocess.run(['tmux', 'select-layout', '-t', f'{session_name}:agents', 'tiled'], 
                             capture_output=True)
            
            print(f"[✓] Created tmux session {session_name} with {agent_count} panes")
            return True
            
        except subprocess.CalledProcessError as e:
            print(f"[!] Failed to create tmux session: {e}")
            return False
    
    def _initialize_agents(self, farm_config: FarmConfig) -> bool:
        """Initialize all agents in the farm"""
        print(f"[*] Initializing {len(farm_config.agents)} agents...")
        
        for agent in farm_config.agents:
            try:
                # Start Claude CLI in the pane
                claude_cmd = self._build_claude_command(agent)
                self._send_to_pane(farm_config.session_name, agent.index, claude_cmd)
                
                # Wait for startup
                time.sleep(2)
                
                # Send initial prompt
                prompt_cmd = f'echo "{self._escape_prompt(agent.prompt)}"'
                self._send_to_pane(farm_config.session_name, agent.index, prompt_cmd)
                
                # Update agent status
                agent.status = 'ready'
                agent.last_heartbeat = datetime.now(timezone.utc)
                
                # Update Redis if available
                if self.coordination_client:
                    self.coordination_client.update_agent_status(
                        agent.id, 'ready', 'Initialized with prompt'
                    )
                
                print(f"[✓] Agent {agent.index} initialized")
                
            except Exception as e:
                print(f"[!] Failed to initialize agent {agent.index}: {e}")
                agent.status = 'error'
                
                if self.coordination_client:
                    self.coordination_client.update_agent_status(
                        agent.id, 'error', f'Initialization failed: {str(e)}'
                    )
        
        # Check if enough agents started successfully
        ready_agents = sum(1 for agent in farm_config.agents if agent.status == 'ready')
        if ready_agents == 0:
            print("[!] No agents started successfully")
            return False
        elif ready_agents < len(farm_config.agents):
            print(f"[!] Only {ready_agents}/{len(farm_config.agents)} agents started")
        
        return True
    
    def _build_claude_command(self, agent: AgentConfig) -> str:
        """Build Claude CLI command for agent"""
        cmd_parts = ['cd', f'"{agent.working_directory}"', '&&', 'claude']
        
        if agent.provider == 'qwen':
            cmd_parts.extend(['--provider', 'qwen'])
        
        if agent.model:
            cmd_parts.extend(['--model', agent.model])
        
        return ' '.join(cmd_parts)
    
    def _send_to_pane(self, session_name: str, pane_index: int, command: str):
        """Send command to specific tmux pane"""
        pane_target = f"{session_name}:agents.{pane_index}"
        subprocess.run(['tmux', 'send-keys', '-t', pane_target, command, 'C-m'], 
                      capture_output=True)
    
    def _build_full_prompt(self, prompt: str, steps: Optional[List[str]], agent_count: int) -> str:
        """Build complete prompt with context"""
        full_prompt = prompt
        
        if agent_count > 1:
            full_prompt = f"[Multi-Agent Farm] {full_prompt}"
            full_prompt += f"\n\nYou are working with {agent_count - 1} other agents on this task."
            full_prompt += "\nCoordinate your efforts and avoid duplicating work."
        
        if steps:
            full_prompt += "\n\n## Steps to follow:\n"
            for i, step in enumerate(steps, 1):
                full_prompt += f"{i}. {step}\n"
        
        return full_prompt
    
    def _customize_agent_prompt(self, base_prompt: str, agent_index: int, total_agents: int) -> str:
        """Customize prompt for specific agent"""
        if total_agents == 1:
            return base_prompt
        
        agent_prompt = f"[Agent {agent_index + 1}/{total_agents}] {base_prompt}"
        
        # Add agent-specific focus
        if agent_index == 0:
            agent_prompt += "\n\nAs the lead agent, focus on coordination and high-level planning."
        elif agent_index == total_agents - 1:
            agent_prompt += "\n\nAs the final agent, focus on testing, validation, and cleanup."
        else:
            agent_prompt += f"\n\nAs agent {agent_index + 1}, focus on implementation and specific tasks."
        
        return agent_prompt
    
    def _escape_prompt(self, prompt: str) -> str:
        """Escape prompt for shell command"""
        return prompt.replace('"', '\\"').replace('\n', '\\n').replace('$', '\\$')
    
    def monitor_farm(self, farm_id: str, duration: int = 300) -> Dict[str, Any]:
        """Monitor farm execution"""
        if farm_id not in self.farms:
            return {'error': f'Farm {farm_id} not found'}
        
        farm = self.farms[farm_id]
        start_time = time.time()
        
        print(f"[*] Monitoring farm {farm_id} for {duration} seconds...")
        print(f"[*] Session: {farm.session_name}")
        print(f"[*] Use 'tmux attach -t {farm.session_name}' to view agents")
        
        try:
            while RUNNING and (time.time() - start_time) < duration:
                # Update heartbeats and check agent health
                self._update_agent_heartbeats(farm)
                
                # Get health status
                if self.coordination_client:
                    health = self.coordination_client.monitor_farm_health(farm_id)
                    if self.debug:
                        print(f"[DEBUG] Farm health: {health}")
                    
                    # Check if farm should be stopped due to failures
                    if health['failed'] > 0 and health['healthy'] == 0:
                        print(f"[!] All agents failed in farm {farm_id}")
                        break
                
                time.sleep(10)  # Check every 10 seconds
            
            if not RUNNING:
                print("[*] Monitoring interrupted by shutdown signal")
            else:
                print(f"[*] Monitoring completed for farm {farm_id}")
            
            return self._get_farm_summary(farm)
            
        except KeyboardInterrupt:
            print("[*] Monitoring interrupted")
            return self._get_farm_summary(farm)
    
    def _update_agent_heartbeats(self, farm: FarmConfig):
        """Update agent heartbeats"""
        for agent in farm.agents:
            if agent.status in ['ready', 'working', 'idle']:
                agent.last_heartbeat = datetime.now(timezone.utc)
                
                if self.coordination_client:
                    self.coordination_client.update_agent_heartbeat(agent.id, {
                        'pane': agent.tmux_pane,
                        'status': agent.status
                    })
    
    def _get_farm_summary(self, farm: FarmConfig) -> Dict[str, Any]:
        """Get summary of farm execution"""
        agent_statuses = {}
        for agent in farm.agents:
            status = agent.status
            agent_statuses[status] = agent_statuses.get(status, 0) + 1
        
        duration = None
        if farm.start_time:
            duration = (datetime.now(timezone.utc) - farm.start_time).total_seconds()
        
        return {
            'farm_id': farm.id,
            'name': farm.name,
            'agent_count': farm.agent_count,
            'session_name': farm.session_name,
            'status': farm.status,
            'duration': duration,
            'agent_statuses': agent_statuses,
            'start_time': farm.start_time.isoformat() if farm.start_time else None
        }
    
    def stop_farm(self, farm_id: str, force: bool = False) -> bool:
        """Stop and clean up farm"""
        if farm_id not in self.farms:
            print(f"[!] Farm {farm_id} not found")
            return False
        
        farm = self.farms[farm_id]
        print(f"[*] Stopping farm {farm_id}...")
        
        # Update farm status
        farm.status = 'stopping'
        
        # Update agent statuses
        for agent in farm.agents:
            agent.status = 'stopped'
            if self.coordination_client:
                self.coordination_client.update_agent_status(agent.id, 'stopped')
        
        # Kill tmux session
        if farm.session_name:
            try:
                if not force:
                    # Send exit commands to all panes
                    for i in range(farm.agent_count):
                        self._send_to_pane(farm.session_name, i, '/exit')
                    time.sleep(3)  # Wait for graceful exit
                
                subprocess.run(['tmux', 'kill-session', '-t', farm.session_name], 
                             capture_output=True)
                print(f"[✓] Killed tmux session {farm.session_name}")
            except Exception as e:
                print(f"[!] Error killing tmux session: {e}")
        
        # Clean up Redis state
        if self.coordination_client:
            self.coordination_client.cleanup_farm_state(farm_id)
        
        # Update final status
        farm.status = 'stopped'
        
        print(f"[✓] Farm {farm_id} stopped")
        return True
    
    def _cleanup_farm(self, farm_id: str):
        """Clean up failed farm"""
        if farm_id in self.farms:
            farm = self.farms[farm_id]
            if farm.session_name:
                subprocess.run(['tmux', 'kill-session', '-t', farm.session_name], 
                             capture_output=True)
            
            if self.coordination_client:
                self.coordination_client.cleanup_farm_state(farm_id)
            
            del self.farms[farm_id]
    
    def start_heartbeat_monitor(self):
        """Start background heartbeat monitoring"""
        def heartbeat_worker():
            while RUNNING:
                try:
                    for farm_id, farm in self.farms.items():
                        if farm.status == 'running':
                            self._update_agent_heartbeats(farm)
                    time.sleep(30)  # Update every 30 seconds
                except Exception as e:
                    if self.debug:
                        print(f"[DEBUG] Heartbeat error: {e}")
                    time.sleep(5)
        
        self.heartbeat_thread = threading.Thread(target=heartbeat_worker, daemon=True)
        self.heartbeat_thread.start()
    
    def cleanup_all(self):
        """Clean up all farms"""
        print("[*] Cleaning up all farms...")
        for farm_id in list(self.farms.keys()):
            self.stop_farm(farm_id, force=True)
        
        if self.coordination_client:
            self.coordination_client.close()

def load_prompt_file(file_path: str) -> Dict[str, Any]:
    """Load prompt configuration from YAML file"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            if file_path.endswith('.yaml') or file_path.endswith('.yml'):
                return yaml.safe_load(f)
            else:
                return {'prompt': f.read().strip()}
    except Exception as e:
        print(f"[!] Error loading prompt file: {e}")
        sys.exit(1)

def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(
        description="Multi-Agent Claude Code Orchestrator V2 with Redis coordination"
    )
    parser.add_argument('-n', '--num-agents', type=int, default=3, 
                       help='Number of Claude agents (default: 3)')
    parser.add_argument('-p', '--prompt', type=str,
                       help='Main prompt for agents')
    parser.add_argument('--prompt-file', type=str,
                       help='YAML file containing prompt configuration')
    parser.add_argument('--steps', nargs='*',
                       help='List of steps for agents to follow')
    parser.add_argument('--farm-id', type=str,
                       help='Custom farm ID (default: auto-generated)')
    parser.add_argument('--name', type=str,
                       help='Human-readable farm name')
    parser.add_argument('--description', type=str,
                       help='Farm description')
    parser.add_argument('--working-dir', type=str, default='.',
                       help='Working directory for agents (default: current)')
    parser.add_argument('--provider', choices=['claude', 'qwen'], default='claude',
                       help='AI provider to use (default: claude)')
    parser.add_argument('--model', type=str,
                       help='Specific model to use')
    parser.add_argument('--timeout', type=int, default=300,
                       help='Farm timeout in seconds (default: 300)')
    parser.add_argument('--redis-host', type=str, default='localhost',
                       help='Redis host (default: localhost)')
    parser.add_argument('--redis-port', type=int, default=6379,
                       help='Redis port (default: 6379)')
    parser.add_argument('--debug', action='store_true',
                       help='Enable debug output')
    parser.add_argument('--monitor-only', action='store_true',
                       help='Only monitor existing farm (requires --farm-id)')
    
    args = parser.parse_args()
    
    # Validate arguments
    if not args.monitor_only and not args.prompt and not args.prompt_file:
        print("[!] Error: Either --prompt or --prompt-file is required")
        sys.exit(1)
    
    if args.monitor_only and not args.farm_id:
        print("[!] Error: --farm-id is required when using --monitor-only")
        sys.exit(1)
    
    # Load prompt configuration
    prompt_config = {}
    if args.prompt_file:
        prompt_config = load_prompt_file(args.prompt_file)
        prompt = prompt_config.get('prompt', '')
        steps = prompt_config.get('steps', args.steps or [])
    else:
        prompt = args.prompt or ''
        steps = args.steps or []
    
    # Generate farm ID if not provided
    farm_id = args.farm_id
    if not farm_id:
        farm_id = f"farm-{uuid.uuid4().hex[:12]}"
    
    # Initialize orchestrator
    orchestrator = MultiClaudeFarmV2(
        redis_host=args.redis_host,
        redis_port=args.redis_port,
        debug=args.debug
    )
    
    try:
        if args.monitor_only:
            # Monitor existing farm
            print(f"[*] Monitoring existing farm: {farm_id}")
            result = orchestrator.monitor_farm(farm_id, args.timeout)
            print(f"[*] Monitoring result: {json.dumps(result, indent=2)}")
        else:
            # Create and run new farm
            success = orchestrator.create_farm(
                farm_id=farm_id,
                prompt=prompt,
                agent_count=args.num_agents,
                name=args.name,
                description=args.description,
                steps=steps,
                working_directory=args.working_dir,
                provider=args.provider,
                model=args.model,
                timeout=args.timeout
            )
            
            if success:
                # Monitor farm execution
                result = orchestrator.monitor_farm(farm_id, args.timeout)
                print(f"[*] Farm execution completed:")
                print(json.dumps(result, indent=2))
            else:
                print(f"[!] Failed to create farm {farm_id}")
                sys.exit(1)
    
    except KeyboardInterrupt:
        print("\n[*] Interrupted by user")
    
    finally:
        orchestrator.cleanup_all()
        print("[*] Cleanup completed")

if __name__ == '__main__':
    main()