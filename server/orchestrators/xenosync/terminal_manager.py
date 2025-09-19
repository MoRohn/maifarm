"""
Terminal Manager - Platform-specific terminal opening for tmux session monitoring
"""

import subprocess
import platform
import shutil
import logging
import os
import json
import time
from typing import Optional, Dict, List, Any
from pathlib import Path

from .exceptions import TerminalError

logger = logging.getLogger(__name__)


class TerminalManager:
    """Manages opening terminal windows for tmux session monitoring"""
    
    def __init__(self):
        self.platform = platform.system().lower()
        self.detected_terminals = self._detect_available_terminals()
    
    def _detect_available_terminals(self) -> Dict[str, bool]:
        """Detect which terminal applications are available"""
        terminals = {}
        
        if self.platform == 'darwin':  # macOS
            # Check for common macOS terminals
            apps_to_check = [
                '/Applications/Utilities/Terminal.app',
                '/Applications/iTerm.app',
                '/Applications/Alacritty.app',
                '/Applications/Kitty.app'
            ]
            
            for app_path in apps_to_check:
                app_name = Path(app_path).stem.lower()
                terminals[app_name] = Path(app_path).exists()
            
            # Also check if terminal commands are available
            terminals['terminal'] = terminals.get('terminal', False) or shutil.which('osascript') is not None
            
        elif self.platform == 'linux':
            # Check for common Linux terminal commands
            linux_terminals = [
                'gnome-terminal', 'konsole', 'xfce4-terminal', 'mate-terminal',
                'lxterminal', 'terminator', 'xterm', 'urxvt', 'alacritty', 'kitty'
            ]
            
            for term in linux_terminals:
                terminals[term] = shutil.which(term) is not None
        
        elif self.platform == 'windows':
            # Check for Windows terminals
            terminals['cmd'] = True  # Always available
            terminals['wt'] = shutil.which('wt') is not None  # Windows Terminal
            terminals['powershell'] = shutil.which('powershell') is not None
        
        logger.debug(f"Detected terminals: {terminals}")
        return terminals
    
    def get_preferred_terminal(self, preference: Optional[str] = None) -> Optional[str]:
        """Get the preferred terminal application"""
        if preference and preference.lower() in self.detected_terminals:
            if self.detected_terminals[preference.lower()]:
                return preference.lower()
            else:
                logger.warning(f"Preferred terminal '{preference}' not available")
        
        # Auto-detect best available terminal
        if self.platform == 'darwin':
            # Preference order for macOS
            for term in ['iterm', 'terminal', 'alacritty', 'kitty']:
                if self.detected_terminals.get(term, False):
                    return term
        
        elif self.platform == 'linux':
            # Preference order for Linux
            for term in ['gnome-terminal', 'konsole', 'alacritty', 'kitty', 'xfce4-terminal', 'xterm']:
                if self.detected_terminals.get(term, False):
                    return term
        
        elif self.platform == 'windows':
            # Preference order for Windows
            for term in ['wt', 'powershell', 'cmd']:
                if self.detected_terminals.get(term, False):
                    return term
        
        return None
    
    def open_tmux_session(self, session_name: str, window_name: Optional[str] = None, 
                         preferred_terminal: Optional[str] = None) -> bool:
        """Open a new terminal window attached to the specified tmux session"""
        terminal = self.get_preferred_terminal(preferred_terminal)
        
        if not terminal:
            logger.error("No suitable terminal application found")
            return False
        
        # Check if we're already in a tmux session (avoid nested tmux)
        if os.environ.get('TMUX'):
            logger.info("Already in tmux session, skipping terminal opening")
            return True
        
        try:
            return self._open_terminal_for_platform(terminal, session_name, window_name)
        except Exception as e:
            logger.error(f"Failed to open terminal: {e}")
            return False
    
    def _open_terminal_for_platform(self, terminal: str, session_name: str, window_name: Optional[str]) -> bool:
        """Open terminal based on detected platform and terminal type"""
        # Platform-specific command construction
        if self.platform == 'darwin':
            # macOS: Simple attach since we only have one window
            tmux_command = f"tmux attach -t {session_name}"
            return self._open_macos_terminal(terminal, tmux_command)
        elif self.platform == 'linux':
            # Linux: Simple attach since we only have one window
            tmux_command = f"tmux attach -t {session_name}"
            return self._open_linux_terminal(terminal, tmux_command)
        elif self.platform == 'windows':
            # Windows: Simple attach since we only have one window
            tmux_command = f"tmux attach -t {session_name}"
            return self._open_windows_terminal(terminal, tmux_command)
        else:
            logger.error(f"Unsupported platform: {self.platform}")
            return False
    
    def _open_macos_terminal(self, terminal: str, tmux_command: str) -> bool:
        """Open terminal on macOS"""
        if terminal == 'iterm':
            # iTerm2
            applescript = f'''
            tell application "iTerm"
                create window with default profile command "{tmux_command}"
                activate
            end tell
            '''
        elif terminal in ['terminal', 'Terminal']:
            # Terminal.app
            applescript = f'''
            tell application "Terminal"
                do script "{tmux_command}"
                activate
            end tell
            '''
        elif terminal in ['alacritty', 'kitty']:
            # Modern terminals - launch with command
            cmd = [terminal, '-e', 'sh', '-c', tmux_command]
            result = subprocess.run(cmd, capture_output=True, text=True)
            return result.returncode == 0
        else:
            logger.error(f"Unknown macOS terminal: {terminal}")
            return False
        
        # Execute AppleScript
        cmd = ['osascript', '-e', applescript]
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            logger.info(f"Successfully opened {terminal} with tmux session")
            return True
        else:
            logger.error(f"Failed to open {terminal}: {result.stderr}")
            return False
    
    def _open_linux_terminal(self, terminal: str, tmux_command: str) -> bool:
        """Open terminal on Linux"""
        cmd = None
        
        if terminal == 'gnome-terminal':
            cmd = ['gnome-terminal', '--', 'sh', '-c', f'{tmux_command}; exec bash']
        elif terminal == 'konsole':
            cmd = ['konsole', '-e', 'sh', '-c', f'{tmux_command}; exec bash']
        elif terminal in ['xfce4-terminal', 'mate-terminal']:
            cmd = [terminal, '-e', f'sh -c "{tmux_command}; exec bash"']
        elif terminal in ['alacritty', 'kitty']:
            cmd = [terminal, '-e', 'sh', '-c', f'{tmux_command}; exec bash']
        elif terminal in ['xterm', 'urxvt']:
            cmd = [terminal, '-e', 'sh', '-c', f'{tmux_command}; exec bash']
        elif terminal == 'terminator':
            cmd = ['terminator', '-x', 'sh', '-c', f'{tmux_command}; exec bash']
        else:
            # Generic fallback
            cmd = [terminal, '-e', f'sh -c "{tmux_command}; exec bash"']
        
        if cmd:
            # Run in background
            result = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            logger.info(f"Successfully launched {terminal} with tmux session")
            return True
        
        logger.error(f"Unknown Linux terminal: {terminal}")
        return False
    
    def _open_windows_terminal(self, terminal: str, tmux_command: str) -> bool:
        """Open terminal on Windows (WSL/Cygwin environment assumed for tmux)"""
        cmd = None
        
        if terminal == 'wt':  # Windows Terminal
            cmd = ['wt', 'wsl', '-e', 'bash', '-c', tmux_command]
        elif terminal == 'powershell':
            cmd = ['powershell', '-Command', f'wsl bash -c "{tmux_command}"']
        elif terminal == 'cmd':
            cmd = ['cmd', '/c', f'wsl bash -c "{tmux_command}"']
        
        if cmd:
            result = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            logger.info(f"Successfully launched {terminal} with tmux session")
            return True
        
        logger.error(f"Unknown Windows terminal: {terminal}")
        return False
    
    def print_manual_instructions(self, session_name: str, window_name: Optional[str] = None):
        """Print manual instructions for attaching to tmux session"""
        print(f"\n📺 Manual tmux attachment:")
        print(f"   tmux attach -t {session_name}")
        print()
    
    def get_terminal_info(self) -> Dict:
        """Get information about terminal detection and capabilities"""
        return {
            'platform': self.platform,
            'detected_terminals': self.detected_terminals,
            'preferred_terminal': self.get_preferred_terminal(),
            'can_open_terminal': len([t for t in self.detected_terminals.values() if t]) > 0,
            'in_tmux': bool(os.environ.get('TMUX'))
        }


class IndividualTerminalManager:
    """Manages individual terminal windows for each agent"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.terminal_manager = TerminalManager()
        self.agent_terminals: Dict[int, Dict[str, Any]] = {}
        self.terminal_processes: Dict[int, subprocess.Popen] = {}
        
    def open_agent_terminal(self, agent_id: int, working_directory: str, 
                           claude_command: str, session_id: str) -> bool:
        """Open an individual terminal window for an agent
        
        Args:
            agent_id: The agent identifier
            working_directory: The working directory for the agent
            claude_command: The claude command to execute
            session_id: The session identifier
            
        Returns:
            bool: True if terminal opened successfully
        """
        terminal = self.terminal_manager.get_preferred_terminal()
        
        if not terminal:
            logger.error(f"No suitable terminal found for agent {agent_id}")
            return False
        
        # Build the command to run in the terminal
        # Set up environment and run claude
        setup_commands = [
            f'cd "{working_directory}"',
            f'echo "Agent {agent_id} - Session: {session_id}"',
            f'echo "Working Directory: {working_directory}"',
            f'echo "Starting Claude..."',
            claude_command
        ]
        
        # Join commands with && for proper execution
        full_command = ' && '.join(setup_commands)
        
        # Store terminal info
        self.agent_terminals[agent_id] = {
            'terminal': terminal,
            'working_directory': working_directory,
            'session_id': session_id,
            'started_at': time.time()
        }
        
        try:
            # Open terminal based on platform
            if self.terminal_manager.platform == 'darwin':
                success = self._open_macos_terminal(agent_id, terminal, full_command)
            elif self.terminal_manager.platform == 'linux':
                success = self._open_linux_terminal(agent_id, terminal, full_command)
            elif self.terminal_manager.platform == 'windows':
                success = self._open_windows_terminal(agent_id, terminal, full_command)
            else:
                logger.error(f"Unsupported platform: {self.terminal_manager.platform}")
                return False
            
            if success:
                logger.info(f"Opened individual terminal for agent {agent_id}")
                return True
            else:
                logger.error(f"Failed to open terminal for agent {agent_id}")
                return False
                
        except Exception as e:
            logger.error(f"Error opening terminal for agent {agent_id}: {e}")
            return False
    
    def _open_macos_terminal(self, agent_id: int, terminal: str, command: str) -> bool:
        """Open terminal on macOS with agent title"""
        title = f"Xenosync Agent {agent_id}"
        
        if terminal == 'iterm':
            # iTerm2 with custom title
            applescript = f'''
            tell application "iTerm"
                set newWindow to (create window with default profile)
                tell current session of newWindow
                    set name to "{title}"
                    write text "{command}"
                end tell
                activate
            end tell
            '''
        elif terminal in ['terminal', 'Terminal']:
            # Terminal.app with title
            applescript = f'''
            tell application "Terminal"
                set newWindow to do script "{command}"
                set custom title of newWindow to "{title}"
                activate
            end tell
            '''
        elif terminal in ['alacritty', 'kitty']:
            # Modern terminals
            if terminal == 'alacritty':
                cmd = ['alacritty', '--title', title, '-e', 'sh', '-c', command]
            else:  # kitty
                cmd = ['kitty', '--title', title, 'sh', '-c', command]
            
            process = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            self.terminal_processes[agent_id] = process
            return True
        else:
            logger.error(f"Unknown macOS terminal: {terminal}")
            return False
        
        # Execute AppleScript
        if 'applescript' in locals():
            cmd = ['osascript', '-e', applescript]
            result = subprocess.run(cmd, capture_output=True, text=True)
            return result.returncode == 0
        
        return False
    
    def _open_linux_terminal(self, agent_id: int, terminal: str, command: str) -> bool:
        """Open terminal on Linux with agent title"""
        title = f"Xenosync Agent {agent_id}"
        
        # Build terminal command based on type
        if terminal == 'gnome-terminal':
            cmd = ['gnome-terminal', '--title', title, '--', 'sh', '-c', command]
        elif terminal == 'konsole':
            cmd = ['konsole', '--title', title, '-e', 'sh', '-c', command]
        elif terminal in ['xfce4-terminal', 'mate-terminal']:
            cmd = [terminal, '--title', title, '-e', f'sh -c "{command}"']
        elif terminal in ['alacritty', 'kitty']:
            if terminal == 'alacritty':
                cmd = ['alacritty', '--title', title, '-e', 'sh', '-c', command]
            else:
                cmd = ['kitty', '--title', title, 'sh', '-c', command]
        elif terminal in ['xterm', 'urxvt']:
            cmd = [terminal, '-title', title, '-e', 'sh', '-c', command]
        elif terminal == 'terminator':
            cmd = ['terminator', '--title', title, '-x', 'sh', '-c', command]
        else:
            # Generic fallback
            cmd = [terminal, '-e', f'sh -c "{command}"']
        
        try:
            process = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            self.terminal_processes[agent_id] = process
            logger.info(f"Launched {terminal} for agent {agent_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to launch terminal for agent {agent_id}: {e}")
            return False
    
    def _open_windows_terminal(self, agent_id: int, terminal: str, command: str) -> bool:
        """Open terminal on Windows with agent title"""
        title = f"Xenosync Agent {agent_id}"
        
        # Windows terminals (assuming WSL for Claude)
        if terminal == 'wt':  # Windows Terminal
            cmd = ['wt', '--title', title, 'wsl', '-e', 'bash', '-c', command]
        elif terminal == 'powershell':
            cmd = ['powershell', '-Command', f'$host.ui.RawUI.WindowTitle = "{title}"; wsl bash -c "{command}"']
        elif terminal == 'cmd':
            cmd = ['cmd', '/c', f'title {title} && wsl bash -c "{command}"']
        else:
            logger.error(f"Unknown Windows terminal: {terminal}")
            return False
        
        try:
            process = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            self.terminal_processes[agent_id] = process
            logger.info(f"Launched {terminal} for agent {agent_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to launch terminal for agent {agent_id}: {e}")
            return False
    
    def close_agent_terminal(self, agent_id: int) -> bool:
        """Close a specific agent's terminal window"""
        if agent_id in self.terminal_processes:
            try:
                process = self.terminal_processes[agent_id]
                process.terminate()
                
                # Give it time to close gracefully
                time.sleep(1)
                
                # Force kill if still running
                if process.poll() is None:
                    process.kill()
                
                del self.terminal_processes[agent_id]
                
                if agent_id in self.agent_terminals:
                    del self.agent_terminals[agent_id]
                
                logger.info(f"Closed terminal for agent {agent_id}")
                return True
                
            except Exception as e:
                logger.error(f"Error closing terminal for agent {agent_id}: {e}")
                return False
        
        return False
    
    def close_all_terminals(self):
        """Close all agent terminal windows"""
        agent_ids = list(self.terminal_processes.keys())
        for agent_id in agent_ids:
            self.close_agent_terminal(agent_id)
        
        logger.info("Closed all agent terminals")
    
    def get_terminal_status(self, agent_id: int) -> Optional[Dict[str, Any]]:
        """Get status information for an agent's terminal"""
        if agent_id in self.agent_terminals:
            info = self.agent_terminals[agent_id].copy()
            
            # Check if process is still running
            if agent_id in self.terminal_processes:
                process = self.terminal_processes[agent_id]
                info['running'] = process.poll() is None
            else:
                info['running'] = False
            
            info['uptime'] = time.time() - info['started_at']
            return info
        
        return None
    
    def get_all_terminal_status(self) -> Dict[int, Dict[str, Any]]:
        """Get status for all agent terminals"""
        status = {}
        for agent_id in self.agent_terminals:
            status[agent_id] = self.get_terminal_status(agent_id)
        return status