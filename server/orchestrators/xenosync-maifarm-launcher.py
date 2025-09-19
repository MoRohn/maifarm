#!/usr/bin/env python3
"""
XenoSync MaiFarm Launcher - Enhanced for Harvest Terminal Integration
This launcher ensures proper tmux session creation with separate panes for each agent,
compatible with MaiFarm's Harvest Terminal streaming system.
"""

import sys
import os
import json
import yaml
import asyncio
import argparse
import subprocess
import logging
import requests
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any

# Add parent directory to path so we can import xenosync as a package
sys.path.insert(0, str(Path(__file__).parent))

# Import XenoSync components as a package
from xenosync.config import Config
from xenosync.file_session_manager import SessionManager
from xenosync.prompt_manager import PromptManager
from xenosync.orchestrator import XenosyncOrchestrator
from xenosync.tmux_manager import TmuxManager

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def notify_maifarm_agents_launching(farm_id: str, session_name: str, num_agents: int, window_target: str = 'agents'):
    """
    Notify MaiFarm that XenoSync agents are launching so terminal streaming can start immediately.
    """
    try:
        # Send notification to MaiFarm API
        maifarm_url = 'http://localhost:4567/api/xenosync/agents-launching'
        payload = {
            'farmId': farm_id,
            'sessionId': session_name,
            'numAgents': num_agents,
            'windowTarget': window_target,
            'timestamp': datetime.now().isoformat()
        }
        
        response = requests.post(
            maifarm_url,
            json=payload,
            headers={'Content-Type': 'application/json'},
            timeout=5
        )
        
        if response.status_code == 200:
            logger.info(f"Successfully notified MaiFarm about {num_agents} agents launching for farm {farm_id}")
            return True
        else:
            logger.warning(f"MaiFarm notification returned status {response.status_code}: {response.text}")
            return False
            
    except requests.exceptions.RequestException as e:
        logger.warning(f"Failed to notify MaiFarm (will continue anyway): {e}")
        return False
    except Exception as e:
        logger.error(f"Unexpected error notifying MaiFarm: {e}")
        return False

def create_maifarm_tmux_session(session_name: str, num_agents: int, farm_id: str) -> bool:
    """
    Create a tmux session that's compatible with MaiFarm's Harvest Terminal.
    Uses the same naming convention as MaiFarm: farm-{farmId}
    Enhanced with better error handling and recovery.
    """
    max_retries = 3
    retry_delay = 1  # seconds
    
    for attempt in range(max_retries):
        try:
            # Use MaiFarm's naming convention
            tmux_session_name = f"farm-{farm_id[:8]}"
            
            # Set consistent tmux environment - CRITICAL for session visibility
            env = os.environ.copy()
            env['TMUX_TMPDIR'] = '/tmp'  # Ensure consistent tmux socket directory
            
            # Ensure tmux server is running first
            # This creates a temporary session to start the server if needed
            start_server_cmd = ['tmux', 'start-server']
            subprocess.run(start_server_cmd, capture_output=True, env=env)
            logger.info(f"Ensured tmux server is running with TMUX_TMPDIR=/tmp")
            
            # Check if session already exists
            check_cmd = ['tmux', 'has-session', '-t', tmux_session_name]
            result = subprocess.run(check_cmd, capture_output=True, env=env)
            
            if result.returncode == 0:
                logger.info(f"Tmux session {tmux_session_name} already exists")
                return True
            
            # Create new session with first agent pane
            create_cmd = ['tmux', 'new-session', '-d', '-s', tmux_session_name, '-n', 'agents']
            subprocess.run(create_cmd, check=True, env=env)
            logger.info(f"Created tmux session: {tmux_session_name}")
            
            # Create additional panes for remaining agents
            for i in range(1, num_agents):
                split_cmd = ['tmux', 'split-window', '-t', f'{tmux_session_name}:agents']
                subprocess.run(split_cmd, check=True, env=env)
                
                # Apply tiled layout for even distribution
                layout_cmd = ['tmux', 'select-layout', '-t', f'{tmux_session_name}:agents', 'tiled']
                subprocess.run(layout_cmd, check=True, env=env)
            
            # Configure tmux for better display
            tmux_configs = [
                ['tmux', 'set-option', '-t', tmux_session_name, '-g', 'pane-border-status', 'top'],
                ['tmux', 'set-option', '-t', tmux_session_name, '-g', 'pane-border-style', 'fg=colour240'],
                ['tmux', 'set-option', '-t', tmux_session_name, '-g', 'pane-active-border-style', 'fg=colour250'],
                ['tmux', 'set-option', '-t', tmux_session_name, '-g', 'mouse', 'on'],
            ]
            
            for cmd in tmux_configs:
                subprocess.run(cmd, capture_output=True, env=env)
            
            # Set pane titles for each agent
            for i in range(num_agents):
                title_cmd = ['tmux', 'select-pane', '-t', f'{tmux_session_name}:agents.{i}', '-T', f'Agent {i+1}']
                subprocess.run(title_cmd, capture_output=True, env=env)
            
            logger.info(f"Configured {num_agents} panes in session {tmux_session_name}")
            return True
            
        except subprocess.CalledProcessError as e:
            logger.error(f"Failed to create tmux session on attempt {attempt + 1}/{max_retries}: {e}")
            if attempt < max_retries - 1:
                logger.info(f"Retrying in {retry_delay} seconds...")
                import time
                time.sleep(retry_delay)
                
                # Clean up failed session if it partially exists
                try:
                    cleanup_cmd = ['tmux', 'kill-session', '-t', tmux_session_name]
                    subprocess.run(cleanup_cmd, capture_output=True, env=env)
                except:
                    pass  # Ignore cleanup errors
            else:
                return False
        except Exception as e:
            logger.error(f"Unexpected error creating tmux session on attempt {attempt + 1}: {e}")
            if attempt < max_retries - 1:
                import time
                time.sleep(retry_delay)
            else:
                return False
    
    return False  # Should not reach here

async def launch_xenosync_with_maifarm(args):
    """Launch XenoSync with MaiFarm-specific configuration"""
    
    # Create config
    config = Config()
    
    # Override with command line args
    if args.config:
        with open(args.config) as f:
            config_data = yaml.safe_load(f)
            if config_data:
                for key, value in config_data.items():
                    config.set(key, value)
    
    # Set MaiFarm-specific configuration
    config.set('num_agents', args.agents)
    config.set('execution_mode', args.mode)
    config.set('use_tmux', True)
    config.set('terminal_mode', 'tmux')  # Use tmux panes mode for Harvest Terminal
    config.set('claude_command', 'claude')
    config.set('claude_args', ['--dangerously-skip-permissions'])
    
    # Set the tmux session name in config to use MaiFarm convention
    farm_id = args.farm_id or args.session_id or 'test-farm'
    config.set('tmux_session_name', f"farm-{farm_id[:8]}")
    
    # Set session directory
    sessions_dir = Path(args.sessions_dir or 'xsync-sessions')
    sessions_dir.mkdir(exist_ok=True)
    config.set('sessions_dir', str(sessions_dir))
    
    # Farm ID is already extracted above for config
    # Remove duplicate: farm_id = args.farm_id or args.session_id or 'test-farm'
    
    # Create MaiFarm-compatible tmux session BEFORE XenoSync starts
    if config.get('use_tmux'):
        logger.info(f"Creating MaiFarm-compatible tmux session for farm {farm_id}")
        session_name = f"farm-{farm_id[:8]}"
        tmux_created = create_maifarm_tmux_session(
            session_name=args.session_id or session_name,
            num_agents=args.agents,
            farm_id=farm_id
        )
        
        if not tmux_created:
            logger.error("Failed to create tmux session")
            return 1
        
        # Notify MaiFarm that agents are about to launch
        notify_maifarm_agents_launching(
            farm_id=farm_id,
            session_name=session_name,
            num_agents=args.agents,
            window_target='agents'
        )
    
    # Initialize managers
    session_manager = SessionManager(config)
    prompt_manager = PromptManager(config)
    
    # Create custom orchestrator that uses our tmux session
    orchestrator = XenosyncOrchestrator(config, session_manager, prompt_manager)
    
    # Prevent XenoSync from cleaning up tmux sessions (needed for MaiFarm terminal streaming)
    orchestrator.preserve_tmux_session = True
    
    # Override the tmux manager with our custom session name
    if orchestrator.tmux_manager:
        # Set the session name to match what we already created
        orchestrator.tmux_manager.session = f"farm-{farm_id[:8]}"
        orchestrator.tmux_manager._initialized = True  # Mark as already initialized
        
        # IMPORTANT: Prevent XenoSync from recreating/killing the session
        # We need to override the create_session method to be a no-op
        orchestrator.tmux_manager.create_session = lambda *args, **kwargs: True
        
        # Set up pane mappings for the existing session
        orchestrator.tmux_manager.pane_mapping = {}
        orchestrator.tmux_manager.window_mapping = {'agents': 0}
        for i in range(args.agents):
            orchestrator.tmux_manager.pane_mapping[i] = f"farm-{farm_id[:8]}:agents.{i}"
    
    # Load prompt
    prompt = prompt_manager.load_prompt(args.prompt)
    
    # Create session with custom ID
    session = session_manager.create_session(prompt)
    if args.session_id:
        session.id = args.session_id
    
    print(f"Starting XenoSync session: {session.id}")
    print(f"Farm ID: {farm_id}")
    print(f"Tmux session: farm-{farm_id[:8]}")
    print(f"Mode: {args.mode}")
    print(f"Agents: {args.agents}")
    print(f"Prompt: {prompt.name}")
    
    # Notify MaiFarm that the tmux session is ready
    if args.notify_ready:
        ready_file = Path(args.notify_ready)
        ready_data = {
            'session_id': session.id,
            'farm_id': farm_id,
            'tmux_session': f"farm-{farm_id[:8]}",
            'num_agents': args.agents,
            'status': 'ready'
        }
        ready_file.write_text(json.dumps(ready_data))
    
    # Run orchestration with proper error handling and cleanup
    try:
        await orchestrator.run(session, prompt)
        print("XenoSync session completed successfully")
        
        # Ensure harvest collection happens
        if args.notify_ready:
            completion_file = Path(args.notify_ready).with_suffix('.complete')
            completion_data = {
                'session_id': session.id,
                'farm_id': farm_id,
                'status': 'completed',
                'timestamp': str(datetime.now())
            }
            completion_file.write_text(json.dumps(completion_data))
        
        return 0
    except KeyboardInterrupt:
        print("\nSession interrupted by user - initiating graceful shutdown")
        
        # Trigger graceful collection before exit
        try:
            if orchestrator.tmux_manager:
                # Send closing prompt to agents
                for i in range(args.agents):
                    orchestrator.tmux_manager.send_to_pane(
                        i, 
                        "Please save your work and prepare to exit.",
                        enter=True
                    )
        except:
            pass  # Best effort
        
        return 1
    except Exception as e:
        logger.error(f"Error during orchestration: {e}", exc_info=True)
        
        # Attempt to clean up session on error
        try:
            tmux_session = f"farm-{farm_id[:8]}"
            cleanup_cmd = ['tmux', 'kill-session', '-t', tmux_session]
            subprocess.run(cleanup_cmd, capture_output=True, env={'TMUX_TMPDIR': '/tmp'})
            logger.info(f"Cleaned up failed session {tmux_session}")
        except:
            pass  # Best effort cleanup
        
        return 1

def main():
    parser = argparse.ArgumentParser(description='Launch XenoSync for MaiFarm with Harvest Terminal support')
    parser.add_argument('prompt', help='Path to prompt YAML file')
    parser.add_argument('--agents', type=int, default=2, help='Number of agents')
    parser.add_argument('--mode', choices=['parallel', 'collaborative'], 
                        default='parallel', help='Execution mode')
    parser.add_argument('--config', help='Path to config JSON/YAML file')
    parser.add_argument('--sessions-dir', help='Sessions directory')
    parser.add_argument('--session-id', help='Session ID to use')
    parser.add_argument('--farm-id', help='MaiFarm farm ID')
    parser.add_argument('--notify-ready', help='Path to write ready notification')
    parser.add_argument('--debug', action='store_true', help='Enable debug logging')
    
    args = parser.parse_args()
    
    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)
    
    # Validate agent count
    if args.agents < 2:
        print("Error: XenoSync requires at least 2 agents")
        return 1
    
    # Run async main
    return asyncio.run(launch_xenosync_with_maifarm(args))

if __name__ == '__main__':
    sys.exit(main())