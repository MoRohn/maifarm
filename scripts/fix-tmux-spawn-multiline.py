#!/usr/bin/env python3
"""Fix multi-line tmux spawn calls to use consistent environment"""

import re

def fix_multiline_tmux_spawn(content):
    """Update all multi-line spawn('tmux', [...]) calls to include env: TMUX_ENV"""
    
    # Pattern to match multi-line spawn('tmux', [ ... ])
    # This handles cases where arguments span multiple lines
    pattern = r"(spawn\('tmux',\s*\[\s*\n(?:[^\]]*\n)*[^\]]*\]\s*\))"
    
    def replacer(match):
        spawn_call = match.group(1)
        # Remove the closing parenthesis
        spawn_call = spawn_call.rstrip(')')
        # Add the env parameter and closing parenthesis
        return spawn_call + ', {\n          env: TMUX_ENV\n        })'
    
    # Replace all occurrences
    fixed = re.sub(pattern, replacer, content, flags=re.MULTILINE)
    
    return fixed

if __name__ == "__main__":
    file_path = "/Users/rohnspringfield/maifarm/server/services/OrchestratorService.ts"
    
    with open(file_path, 'r') as f:
        content = f.read()
    
    # Check if there are any multi-line spawn calls that need fixing
    multiline_pattern = r"spawn\('tmux',\s*\[\s*\n"
    if re.search(multiline_pattern, content):
        fixed_content = fix_multiline_tmux_spawn(content)
        
        with open(file_path, 'w') as f:
            f.write(fixed_content)
        
        print(f"Fixed multi-line tmux spawn calls in {file_path}")
    else:
        print("No multi-line tmux spawn calls found to fix")