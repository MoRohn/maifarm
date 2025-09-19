#!/usr/bin/env python3
import os
import re
import glob

def fix_terminal_imports(filepath):
    """Fix terminal service imports to use unified terminalService."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except UnicodeDecodeError:
        return False

    original_content = content

    # Fix imports from unified/terminalService
    if '../services/unified/terminalService' in content:
        # Find all imports from terminalService
        imports_pattern = r"import\s+\{([^}]+)\}\s+from\s+'../services/unified/terminalService';"

        matches = list(re.finditer(imports_pattern, content))

        for match in reversed(matches):
            imports = [i.strip() for i in match.group(1).split(',')]

            # Build replacement
            replacement_lines = ["import { terminalService } from '../services/unified/terminalService';", ""]

            for imp in imports:
                if imp == 'terminalService':
                    continue  # Already imported
                elif imp == 'sessionCache':
                    replacement_lines.append("// Create sessionCache facade")
                    replacement_lines.append("const sessionCache = {")
                    replacement_lines.append("  get: (key: string) => terminalService.getFromCache(key),")
                    replacement_lines.append("  set: (key: string, value: any) => terminalService.setInCache(key, value),")
                    replacement_lines.append("  clear: () => terminalService.clearCache()")
                    replacement_lines.append("};")
                elif imp == 'terminalStreamService':
                    replacement_lines.append("// Alias for compatibility")
                    replacement_lines.append("const terminalStreamService = terminalService;")
                elif imp == 'tmuxSessionResolver':
                    replacement_lines.append("// Create tmuxSessionResolver facade")
                    replacement_lines.append("const tmuxSessionResolver = {")
                    replacement_lines.append("  resolveSession: (farmId: string) => terminalService.getTerminalSession(farmId),")
                    replacement_lines.append("  getSessionName: (farmId: string) => terminalService.getSessionName(farmId)")
                    replacement_lines.append("};")
                elif imp == 'terminalOutputWatcher':
                    replacement_lines.append("// Create terminalOutputWatcher facade")
                    replacement_lines.append("const terminalOutputWatcher = {")
                    replacement_lines.append("  watch: (sessionName: string) => terminalService.watchTerminal(sessionName),")
                    replacement_lines.append("  stopWatching: (sessionName: string) => terminalService.stopWatchingTerminal(sessionName)")
                    replacement_lines.append("};")
                else:
                    # Generic facade
                    replacement_lines.append(f"// Stub for {imp}")
                    replacement_lines.append(f"const {imp}: any = {{}};")

            # Replace the import
            replacement = '\n'.join(replacement_lines)
            content = content[:match.start()] + replacement + content[match.end():]

    if content != original_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Fixed terminal imports in {filepath}")
        return True

    return False

def main():
    """Fix all terminal imports in the server directory."""
    server_dir = '/Users/rohnspringfield/maifarm/server'

    # Find all TypeScript files
    ts_files = glob.glob(f"{server_dir}/**/*.ts", recursive=True)

    # Exclude directories we shouldn't touch
    ts_files = [f for f in ts_files if
                'node_modules' not in f and
                'backup' not in f and
                'orchestrators' not in f and
                'xsync-sessions' not in f]

    fixed_count = 0
    for filepath in ts_files:
        if fix_terminal_imports(filepath):
            fixed_count += 1

    print(f"\nFixed terminal imports in {fixed_count} files")

if __name__ == '__main__':
    main()