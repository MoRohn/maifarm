#!/usr/bin/env python3
"""
XenoSync Launcher for MaiFarm Integration
This script provides a simple interface to launch XenoSync with Claude CLI
"""

import sys
import os
import json
import yaml
import asyncio
import argparse
from pathlib import Path

# Add parent directory to path so we can import xenosync as a package
sys.path.insert(0, str(Path(__file__).parent))

# Import XenoSync components as a package
from xenosync.config import Config
from xenosync.file_session_manager import SessionManager
from xenosync.prompt_manager import PromptManager
from xenosync.orchestrator import XenosyncOrchestrator

async def launch_xenosync(args):
    """Launch XenoSync with the provided configuration"""
    
    # Create config
    config = Config()
    
    # Override with command line args
    if args.config:
        with open(args.config) as f:
            # Config files are YAML format
            config_data = yaml.safe_load(f)
            if config_data:
                for key, value in config_data.items():
                    config.set(key, value)
    
    config.set('num_agents', args.agents)
    config.set('execution_mode', args.mode)
    config.set('use_tmux', True)
    config.set('claude_command', 'claude')
    config.set('claude_args', ['--dangerously-skip-permissions'])
    
    # Set session directory
    sessions_dir = Path(args.sessions_dir or 'xsync-sessions')
    sessions_dir.mkdir(exist_ok=True)
    config.set('sessions_dir', str(sessions_dir))
    
    # Initialize managers
    session_manager = SessionManager(config)
    prompt_manager = PromptManager(config)
    
    # Create orchestrator
    orchestrator = XenosyncOrchestrator(config, session_manager, prompt_manager)
    
    # Load prompt
    prompt = prompt_manager.load_prompt(args.prompt)
    
    # Create session
    session = session_manager.create_session(prompt)
    
    print(f"Starting XenoSync session: {session.id}")
    print(f"Mode: {args.mode}")
    print(f"Agents: {args.agents}")
    print(f"Prompt: {prompt.name}")
    
    # Run orchestration
    try:
        await orchestrator.run(session, prompt)
        print("XenoSync session completed successfully")
        return 0
    except KeyboardInterrupt:
        print("\nSession interrupted by user")
        return 1
    except Exception as e:
        print(f"Error during orchestration: {e}")
        return 1

def main():
    parser = argparse.ArgumentParser(description='Launch XenoSync for MaiFarm')
    parser.add_argument('prompt', help='Path to prompt YAML file')
    parser.add_argument('--agents', type=int, default=2, help='Number of agents')
    parser.add_argument('--mode', choices=['parallel', 'collaborative'], 
                        default='parallel', help='Execution mode')
    parser.add_argument('--config', help='Path to config JSON file')
    parser.add_argument('--sessions-dir', help='Sessions directory')
    parser.add_argument('--session-id', help='Session ID to use')
    parser.add_argument('--debug', action='store_true', help='Enable debug logging')
    
    args = parser.parse_args()
    
    # Validate agent count
    if args.agents < 2:
        print("Error: XenoSync requires at least 2 agents")
        return 1
    
    # Run async main
    return asyncio.run(launch_xenosync(args))

if __name__ == '__main__':
    sys.exit(main())