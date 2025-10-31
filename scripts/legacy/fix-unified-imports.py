#!/usr/bin/env python3
import os
import re
import glob

# Define mappings for unified services
UNIFIED_SERVICE_MAPPINGS = {
    # Harvest services
    'harvestService': '../services/unified/harvestService',
    'harvestFileCollector': '../services/unified/harvestService',

    # Barn services
    'barnService': '../services/unified/barnService',
    'barnCatalogService': '../services/unified/barnService',

    # GoWild services
    'goWildManager': '../services/goWildManager',
    'goWildManagerV2': '../services/goWildManagerV2',

    # Coordination services
    'coordinationService': '../services/coordinationService',

    # These need to be created or stubbed
    'workflowService': None,
    'agentHealthMonitor': None,
    'pipelineOrchestrator': None,
    'seedService': None,
}

def fix_imports_in_file(filepath):
    """Fix imports in a single TypeScript file to use unified services."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except UnicodeDecodeError:
        # Skip binary files
        return False

    original_content = content

    # Remove any duplicate stub declarations
    content = re.sub(r'//\s*const\s+(\w+):\s*any\s*=\s*{};\s*//\s*Stub\n', '', content)

    # Fix imports from unified/farmService that should come from unified services
    for service, new_path in UNIFIED_SERVICE_MAPPINGS.items():
        # Pattern to match import { serviceName } from '../services/unified/farmService';
        pattern = rf"import\s+\{{\s*{service}\s*\}}\s+from\s+'[^']*unified/farmService';"

        if new_path:
            # Replace with correct unified service import
            replacement = f"import {{ {service} }} from '{new_path}';"
        else:
            # Create a minimal stub for now
            replacement = f"const {service}: any = {{}}; // TODO: Implement unified service"

        content = re.sub(pattern, replacement, content)

    # Also fix imports from non-unified paths to unified paths for harvest and barn
    content = re.sub(r"import\s+\{\s*harvestService\s*\}\s+from\s+'../services/harvestService';",
                    "import { harvestService } from '../services/unified/harvestService';", content)
    content = re.sub(r"import\s+\{\s*barnService\s*\}\s+from\s+'../services/barnService';",
                    "import { barnService } from '../services/unified/barnService';", content)
    content = re.sub(r"import\s+\{\s*barnCatalogService\s*\}\s+from\s+'../services/barnCatalogService';",
                    "import { barnCatalogService } from '../services/unified/barnService';", content)
    content = re.sub(r"import\s+\{\s*harvestFileCollector\s*\}\s+from\s+'../services/harvestFileCollector';",
                    "import { harvestFileCollector } from '../services/unified/harvestService';", content)

    if content != original_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Fixed imports in {filepath}")
        return True

    return False

def main():
    """Fix all imports in the server directory to use unified services."""
    server_dir = '/Users/rohnspringfield/maifarm/server'

    # Find all TypeScript files
    ts_files = glob.glob(f"{server_dir}/**/*.ts", recursive=True)

    # Exclude backup, node_modules, and orchestrator directories
    ts_files = [f for f in ts_files if
                'node_modules' not in f and
                'backup' not in f and
                'orchestrators' not in f and
                'xsync-sessions' not in f]

    fixed_count = 0
    for filepath in ts_files:
        if fix_imports_in_file(filepath):
            fixed_count += 1

    print(f"\nFixed imports in {fixed_count} files to use unified services")

if __name__ == '__main__':
    main()