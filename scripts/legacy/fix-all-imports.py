#!/usr/bin/env python3
import os
import re
import glob

# Define mappings for where services should come from
SERVICE_MAPPINGS = {
    'barnService': '../services/barnService',
    'barnCatalogService': '../services/barnCatalogService',
    'harvestService': '../services/harvestService',
    'harvestFileCollector': '../services/harvestFileCollector',
    'goWildManager': '../services/goWildManager',
    'goWildManagerV2': '../services/goWildManagerV2',
    'coordinationService': '../services/coordinationService',
    'workflowService': None,  # Will be stubbed
    'seedService': None,  # Will be stubbed
    'agentHealthMonitor': None,  # Will be stubbed
    'pipelineOrchestrator': None,  # Will be stubbed
    'terminalOutputWatcher': None,  # Will be stubbed
    'SafetyManager': None,  # Will be stubbed
    'claudeCodeManager': None,  # Will be stubbed
    'farmLauncher': None,  # Will be stubbed
    'orchestratorService': None,  # Will be stubbed
    'launchFarmWithBarnIntegration': None,  # Will be stubbed
}

def fix_imports_in_file(filepath):
    """Fix imports in a single TypeScript file."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except UnicodeDecodeError:
        # Skip binary files
        return False

    original_content = content

    # Fix imports from unified/farmService that should come from elsewhere
    for service, new_path in SERVICE_MAPPINGS.items():
        # Pattern to match import { serviceName } from '../services/unified/farmService';
        pattern = rf"import\s+\{{\s*{service}\s*\}}\s+from\s+'\.\.\/services\/unified\/farmService';"

        if new_path:
            # Replace with correct import
            replacement = f"import {{ {service} }} from '{new_path}';"
        else:
            # Create a stub
            if service == 'terminalOutputWatcher':
                replacement = f"// import {{ {service} }} from '../services/unified/farmService';\nconst {service} = {{ isWatching: () => false, startWatching: async () => {{}} }}; // Stub"
            else:
                replacement = f"// import {{ {service} }} from '../services/unified/farmService';\nconst {service}: any = {{}}; // Stub"

        content = re.sub(pattern, replacement, content)

    # Fix imports that have multiple services on one line
    # e.g., import { barnService, barnCatalogService } from '../services/unified/farmService';
    multi_import_pattern = r"import\s+\{([^}]+)\}\s+from\s+'\.\.\/services\/unified\/farmService';"
    matches = re.finditer(multi_import_pattern, content)

    for match in reversed(list(matches)):  # Process in reverse to maintain positions
        services_str = match.group(1)
        services = [s.strip() for s in services_str.split(',')]

        new_imports = []
        for service in services:
            if service in SERVICE_MAPPINGS:
                if SERVICE_MAPPINGS[service]:
                    new_imports.append(f"import {{ {service} }} from '{SERVICE_MAPPINGS[service]}';")
                else:
                    # Create stub
                    if service == 'terminalOutputWatcher':
                        new_imports.append(f"const {service} = {{ isWatching: () => false, startWatching: async () => {{}} }}; // Stub")
                    else:
                        new_imports.append(f"const {service}: any = {{}}; // Stub")
            else:
                # Keep farmService imports
                if service == 'farmService' or 'as farmManager' in service:
                    new_imports.append(match.group(0))

        if new_imports:
            content = content[:match.start()] + '\n'.join(new_imports) + content[match.end():]

    if content != original_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Fixed imports in {filepath}")
        return True

    return False

def main():
    """Fix all imports in the server directory."""
    server_dir = '/Users/rohnspringfield/maifarm/server'

    # Find all TypeScript files
    ts_files = glob.glob(f"{server_dir}/**/*.ts", recursive=True)

    # Exclude backup and node_modules directories
    ts_files = [f for f in ts_files if 'node_modules' not in f and 'backup' not in f]

    fixed_count = 0
    for filepath in ts_files:
        if fix_imports_in_file(filepath):
            fixed_count += 1

    print(f"\nFixed imports in {fixed_count} files")

if __name__ == '__main__':
    main()