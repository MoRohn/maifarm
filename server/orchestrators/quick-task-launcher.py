#!/usr/bin/env python3
"""
Quick Task Launcher - Lightweight launcher for simple Claude tasks
Optimized for fast startup and minimal overhead
"""

import sys
import os
import subprocess
import argparse
import time
import shlex
import logging
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - [QuickTask] - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def ensure_tmux_server():
    """Ensure tmux server is running with proper environment"""
    env = os.environ.copy()
    env['TMUX_TMPDIR'] = '/tmp'
    
    try:
        # Start tmux server if not running
        subprocess.run(['tmux', 'start-server'], env=env, capture_output=True)
        logger.debug("Tmux server ensured")
        return True
    except Exception as e:
        logger.error(f"Failed to ensure tmux server: {e}")
        return False

def launch_agent_in_pane(session_name, pane_index, prompt, workspace):
    """Launch Claude in a specific tmux pane using two-stage launch"""
    
    env = os.environ.copy()
    env['TMUX_TMPDIR'] = '/tmp'
    
    try:
        # Stage 1: Change to workspace directory
        cd_cmd = ['tmux', 'send-keys', '-t', f'{session_name}:agents.{pane_index}', f'cd {workspace}', 'Enter']
        result = subprocess.run(cd_cmd, env=env, capture_output=True, text=True)
        if result.returncode != 0:
            logger.error(f"Failed to change directory: {result.stderr}")
            return False
        time.sleep(0.2)
        
        # Stage 2: Launch Claude WITHOUT the -p flag (critical fix)
        # This avoids the quote> prompt hanging issue
        claude_cmd = ['tmux', 'send-keys', '-t', f'{session_name}:agents.{pane_index}', 
                      'claude --dangerously-skip-permissions', 'Enter']
        result = subprocess.run(claude_cmd, env=env, capture_output=True, text=True)
        if result.returncode != 0:
            logger.error(f"Failed to launch Claude: {result.stderr}")
            return False
        
        # Stage 3: Wait for Claude to fully initialize
        logger.info(f"Waiting for Claude to initialize in pane {pane_index}...")
        time.sleep(4)  # Critical delay - Claude needs time to start
        
        # Stage 4: Send the prompt as a separate input
        # Don't use shlex.quote here - send the prompt directly
        prompt_cmd = ['tmux', 'send-keys', '-t', f'{session_name}:agents.{pane_index}', 
                      prompt, 'Enter']
        result = subprocess.run(prompt_cmd, env=env, capture_output=True, text=True)
        if result.returncode != 0:
            logger.error(f"Failed to send prompt: {result.stderr}")
            return False
        
        logger.info(f"✓ Successfully launched agent {pane_index + 1} in pane {pane_index}")
        return True
        
    except Exception as e:
        logger.error(f"✗ Failed to launch agent {pane_index + 1}: {e}")
        return False

def verify_session_exists(session_name):
    """Verify that the tmux session exists and is ready"""
    env = os.environ.copy()
    env['TMUX_TMPDIR'] = '/tmp'
    
    try:
        # Check if session exists
        result = subprocess.run(
            ['tmux', 'has-session', '-t', session_name],
            env=env,
            capture_output=True
        )
        
        if result.returncode != 0:
            logger.error(f"Session {session_name} does not exist")
            return False
        
        # Check pane count
        result = subprocess.run(
            ['tmux', 'list-panes', '-t', f'{session_name}:agents', '-F', '#{pane_index}'],
            env=env,
            capture_output=True,
            text=True
        )
        
        if result.returncode == 0:
            panes = result.stdout.strip().split('\n')
            pane_count = len([p for p in panes if p])
            logger.info(f"Session {session_name} has {pane_count} panes ready")
            return pane_count > 0
        else:
            logger.error(f"Could not list panes for session {session_name}")
            return False
            
    except Exception as e:
        logger.error(f"Failed to verify session: {e}")
        return False

def set_pane_titles(session_name, agent_count):
    """Set titles for each pane for better identification"""
    env = os.environ.copy()
    env['TMUX_TMPDIR'] = '/tmp'
    
    for i in range(agent_count):
        title = f"Agent {i + 1}"
        tmux_cmd = [
            'tmux',
            'select-pane',
            '-t', f'{session_name}:agents.{i}',
            '-T', title
        ]
        
        try:
            subprocess.run(tmux_cmd, env=env, capture_output=True)
            logger.debug(f"Set pane {i} title to '{title}'")
        except Exception as e:
            logger.warning(f"Failed to set pane title: {e}")

def main():
    parser = argparse.ArgumentParser(description='Quick Task Launcher for MaiFarm')
    parser.add_argument('--session', required=True, help='Tmux session name')
    parser.add_argument('--agents', type=int, required=True, help='Number of agents')
    parser.add_argument('--prompt', required=True, help='Task prompt')
    parser.add_argument('--workspace', required=True, help='Workspace directory')
    parser.add_argument('--timeout', type=int, default=300000, help='Timeout in milliseconds')
    parser.add_argument('--debug', action='store_true', help='Enable debug logging')
    
    args = parser.parse_args()
    
    if args.debug:
        logger.setLevel(logging.DEBUG)
    
    # Log launch parameters
    logger.info(f"🚀 Quick Task Launch Started")
    logger.info(f"  Session: {args.session}")
    logger.info(f"  Agents: {args.agents}")
    logger.info(f"  Workspace: {args.workspace}")
    logger.info(f"  Timeout: {args.timeout}ms")
    
    # Ensure tmux server is running
    if not ensure_tmux_server():
        logger.error("Failed to ensure tmux server")
        return 1
    
    # Verify session exists
    if not verify_session_exists(args.session):
        logger.error(f"Session {args.session} not ready")
        return 1
    
    # Set pane titles for identification
    set_pane_titles(args.session, args.agents)
    
    # Launch each agent in its pane
    launch_start = time.time()
    success_count = 0
    
    for i in range(args.agents):
        if launch_agent_in_pane(args.session, i, args.prompt, args.workspace):
            success_count += 1
            # Small delay between launches to avoid overwhelming
            if i < args.agents - 1:
                time.sleep(0.5)
        else:
            logger.error(f"Failed to launch agent {i + 1}")
    
    launch_duration = time.time() - launch_start
    
    # Report results
    if success_count == args.agents:
        logger.info(f"✅ All {args.agents} agents launched successfully in {launch_duration:.2f}s")
        
        # Create a marker file to indicate successful launch
        marker_path = Path(args.workspace) / '.agents' / 'launch-complete'
        try:
            marker_path.parent.mkdir(parents=True, exist_ok=True)
            marker_path.write_text(f"Launched {args.agents} agents at {time.time()}")
            logger.debug(f"Created launch marker at {marker_path}")
        except Exception as e:
            logger.warning(f"Failed to create launch marker: {e}")
        
        return 0
    else:
        logger.error(f"❌ Only {success_count}/{args.agents} agents launched successfully")
        return 1

if __name__ == '__main__':
    sys.exit(main())