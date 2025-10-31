#!/usr/bin/env python3
"""
Test script to diagnose orchestrator.py issues
"""

import subprocess
import time
import os
import sys
import json
from pathlib import Path

def test_claude_available():
    """Test if Claude Code is available"""
    result = subprocess.run(['which', 'claude'], capture_output=True, text=True)
    if result.returncode == 0:
        print(f"✓ Claude Code found at: {result.stdout.strip()}")
        return True
    else:
        print("✗ Claude Code not found in PATH")
        return False

def test_tmux_available():
    """Test if tmux is available"""
    result = subprocess.run(['which', 'tmux'], capture_output=True, text=True)
    if result.returncode == 0:
        print(f"✓ tmux found at: {result.stdout.strip()}")
        return True
    else:
        print("✗ tmux not found")
        return False

def test_tmux_sessions():
    """Check for existing tmux sessions"""
    result = subprocess.run(['tmux', 'ls'], capture_output=True, text=True)
    if result.returncode == 0:
        print(f"✓ Existing tmux sessions:\n{result.stdout}")
        return result.stdout
    else:
        print("✓ No existing tmux sessions")
        return None

def test_coordination_directory():
    """Test coordination directory setup"""
    coord_dir = Path('/tmp/claude_coordination')
    if coord_dir.exists():
        print(f"✓ Coordination directory exists: {coord_dir}")
        # Check contents
        active_agents = coord_dir / 'active_agents.json'
        if active_agents.exists():
            try:
                with open(active_agents, 'r') as f:
                    data = json.load(f)
                    print(f"  Active agents file contains: {data}")
            except:
                print("  Active agents file exists but couldn't be read")
    else:
        print(f"✗ Coordination directory does not exist: {coord_dir}")
        # Create it
        coord_dir.mkdir(parents=True, exist_ok=True)
        print(f"  Created coordination directory: {coord_dir}")
        
    # Ensure work_claims directory exists
    work_claims = coord_dir / 'work_claims'
    work_claims.mkdir(exist_ok=True)
    print(f"  Work claims directory: {work_claims}")
    
    return coord_dir

def test_claude_launch():
    """Test launching Claude Code directly"""
    print("\n=== Testing Claude Code Launch ===")
    
    # Kill any existing sessions first
    subprocess.run(['tmux', 'kill-session', '-t', 'test_claude'], 
                  capture_output=True)
    
    # Create a simple tmux session
    result = subprocess.run(
        ['tmux', 'new-session', '-d', '-s', 'test_claude'],
        capture_output=True
    )
    
    if result.returncode != 0:
        print("✗ Failed to create tmux session")
        return False
    
    print("✓ Created tmux session 'test_claude'")
    
    # Send claude command to the session
    result = subprocess.run(
        ['tmux', 'send-keys', '-t', 'test_claude', 
         'claude --dangerously-skip-permissions', 'C-m'],
        capture_output=True
    )
    
    if result.returncode != 0:
        print("✗ Failed to send command to tmux")
        return False
    
    print("✓ Sent Claude Code command to tmux")
    
    # Wait for Claude to initialize
    print("  Waiting for Claude Code to initialize...")
    time.sleep(5)
    
    # Capture pane output
    result = subprocess.run(
        ['tmux', 'capture-pane', '-t', 'test_claude', '-p'],
        capture_output=True, text=True
    )
    
    if result.returncode == 0:
        output = result.stdout
        print(f"  Captured output ({len(output)} chars):")
        print("  " + "\n  ".join(output.split('\n')[-10:]))  # Last 10 lines
        
        # Check for Claude indicators
        if any(indicator in output for indicator in 
               ['Welcome to Claude Code', '/help', 'cwd:', 'Press Esc']):
            print("✓ Claude Code appears to be running")
            return True
        else:
            print("✗ Claude Code doesn't seem to be running properly")
            return False
    else:
        print("✗ Failed to capture tmux pane")
        return False

def test_orchestrator_import():
    """Test if orchestrator.py can be imported"""
    print("\n=== Testing orchestrator.py Import ===")
    try:
        sys.path.insert(0, os.getcwd())
        import orchestrator  # type: ignore  # noqa: F401
        print("✓ orchestrator.py imported successfully")
        return True
    except Exception as e:
        print(f"✗ Failed to import orchestrator.py: {e}")
        return False


def test_xenosync_import():
    """Ensure the XenoSync CLI script can be imported"""
    print("\n=== Testing xenosync_cli.py Import ===")
    scripts_path = Path(__file__).resolve().parent.parent / "scripts" / "python"
    try:
        sys.path.insert(0, str(scripts_path))
        import xenosync_cli  # type: ignore  # noqa: F401
        print("✓ xenosync_cli.py imported successfully")
        return True
    except Exception as e:
        print(f"✗ Failed to import xenosync_cli.py: {e}")
        return False

def diagnose_hanging_issue():
    """Diagnose why orchestrator.py might be hanging"""
    print("\n=== Diagnosing Potential Hanging Issues ===")
    
    # Check if there are any zombie Claude processes
    result = subprocess.run(['ps', 'aux'], capture_output=True, text=True)
    claude_processes = [line for line in result.stdout.split('\n') 
                       if 'claude' in line.lower()]
    
    if claude_processes:
        print(f"Found {len(claude_processes)} Claude-related processes:")
        for proc in claude_processes[:5]:  # Show first 5
            print(f"  {proc[:120]}...")
    else:
        print("No Claude-related processes found")
    
    # Check system resources
    result = subprocess.run(['uptime'], capture_output=True, text=True)
    print(f"\nSystem load: {result.stdout.strip()}")
    
    # Check if port 4567 is in use (backend)
    result = subprocess.run(['lsof', '-i', ':4567'], 
                          capture_output=True, text=True)
    if result.stdout:
        print("\nPort 4567 (backend) is in use:")
        print(result.stdout[:500])
    else:
        print("\nPort 4567 (backend) is not in use")

def cleanup_tmux_sessions():
    """Clean up test tmux sessions"""
    print("\n=== Cleaning Up ===")
    sessions_to_kill = ['test_claude', 'claude_agents']
    
    for session in sessions_to_kill:
        result = subprocess.run(
            ['tmux', 'kill-session', '-t', session],
            capture_output=True
        )
        if result.returncode == 0:
            print(f"✓ Killed tmux session: {session}")
        else:
            print(f"  No session to kill: {session}")

def main():
    print("=" * 60)
    print("XenoSync Diagnostic Test")
    print("=" * 60)
    
    # Run all tests
    claude_ok = test_claude_available()
    tmux_ok = test_tmux_available()
    
    if not claude_ok or not tmux_ok:
        print("\n✗ Missing required dependencies")
        return 1
    
    test_tmux_sessions()
    test_coordination_directory()
    
    # Try launching Claude in tmux
    claude_running = test_claude_launch()
    
    if claude_running:
        print("\n✓ Claude Code can be launched successfully in tmux")
    else:
        print("\n✗ Issue with launching Claude Code in tmux")
    
    # Test importing orchestrator + xenosync helpers
    test_orchestrator_import()
    test_xenosync_import()
    
    # Diagnose hanging issues
    diagnose_hanging_issue()
    
    # Cleanup
    cleanup_tmux_sessions()
    
    print("\n" + "=" * 60)
    print("Diagnostic Complete")
    print("=" * 60)
    
    return 0 if claude_running else 1

if __name__ == "__main__":
    sys.exit(main())
