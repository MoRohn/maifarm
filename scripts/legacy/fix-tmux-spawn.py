#!/usr/bin/env python3
"""Fix all tmux spawn calls to use consistent environment"""

import re
import sys

def fix_tmux_spawn(content):
    """Update all spawn('tmux', ...) calls to include env: TMUX_ENV"""
    
    # Pattern to match spawn('tmux', [args])
    pattern = r"spawn\('tmux',\s*\[([^\]]+)\]\)"
    
    def replacer(match):
        args = match.group(1)
        return f"spawn('tmux', [{args}], {{\n        env: TMUX_ENV\n      }})"
    
    # Replace all occurrences
    fixed = re.sub(pattern, replacer, content)
    
    # Also fix cases where it might be split across lines
    pattern2 = r"spawn\('tmux',\s*\[([^\]]+)\]\s*\);"
    fixed = re.sub(pattern2, lambda m: f"spawn('tmux', [{m.group(1)}], {{\n        env: TMUX_ENV\n      }});", fixed)
    
    return fixed

if __name__ == "__main__":
    file_path = "/Users/rohnspringfield/maifarm/server/services/OrchestratorService.ts"
    
    with open(file_path, 'r') as f:
        content = f.read()
    
    fixed_content = fix_tmux_spawn(content)
    
    with open(file_path, 'w') as f:
        f.write(fixed_content)
    
    print(f"Fixed tmux spawn calls in {file_path}")