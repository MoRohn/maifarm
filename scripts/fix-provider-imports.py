#!/usr/bin/env python3
import os
import re
import glob

def fix_provider_imports(filepath):
    """Fix AI provider imports to use unified aiProviderService."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except UnicodeDecodeError:
        return False

    original_content = content

    # Check if this file imports openaiService, ollamaService, etc. from aiProviderService
    if 'from \'../services/unified/aiProviderService' in content:
        # Check what's being imported
        imports_match = re.search(r"import\s+\{([^}]+)\}\s+from\s+'[^']*unified/aiProviderService[^']*';", content)
        if imports_match:
            imports = [i.strip() for i in imports_match.group(1).split(',')]

            # If it's importing specific services, create facades
            if any(service in imports for service in ['openaiService', 'ollamaService', 'ollamaModelDetector',
                                                       'claudeCodeManager', 'claudeCodeCoordinator',
                                                       'dynamicProviderRouter', 'mixedProviderOrchestrator']):
                # Replace with aiProviderService import and create facades
                facade_code = ["import { aiProviderService } from '../services/unified/aiProviderService';", ""]

                # Create facades for each imported service
                for service in imports:
                    if service == 'openaiService':
                        facade_code.append("""// Create openaiService facade
const openaiService = {
  getConfig: () => aiProviderService.getProviderConfig('openai'),
  validateConnection: () => aiProviderService.validateProvider('openai'),
  testAPI: () => aiProviderService.testProvider('openai'),
  isConfigured: () => !!aiProviderService.getProviderConfig('openai')?.apiKey
};""")
                    elif service == 'ollamaService':
                        facade_code.append("""// Create ollamaService facade
const ollamaService = {
  getConfig: () => aiProviderService.getProviderConfig('ollama'),
  validateConnection: () => aiProviderService.validateProvider('ollama'),
  testAPI: () => aiProviderService.testProvider('ollama'),
  isConfigured: () => !!aiProviderService.getProviderConfig('ollama')?.baseUrl
};""")
                    elif service == 'ollamaModelDetector':
                        facade_code.append("""// Create ollamaModelDetector facade
const ollamaModelDetector = {
  detectInstalledModels: () => aiProviderService.getProviderModels('ollama'),
  checkModelStatus: (model: string) => aiProviderService.checkProviderModel('ollama', model)
};""")
                    elif service == 'claudeCodeManager':
                        facade_code.append("""// Create claudeCodeManager facade
const claudeCodeManager = {
  createFarm: async (config: any) => aiProviderService.createFarmWithProvider('claude', config),
  launchAgents: async (farmId: string, config: any) => aiProviderService.launchAgentsForFarm(farmId, config)
};""")
                    elif service == 'claudeCodeCoordinator':
                        facade_code.append("""// Create claudeCodeCoordinator facade
const claudeCodeCoordinator = {
  coordinateAgents: async (farmId: string) => aiProviderService.coordinateFarmAgents(farmId),
  getAgentStatus: (farmId: string, agentId: string) => aiProviderService.getAgentStatus(farmId, agentId)
};""")
                    elif service == 'dynamicProviderRouter':
                        facade_code.append("""// Create dynamicProviderRouter facade
const dynamicProviderRouter = {
  route: (request: any) => aiProviderService.routeRequest(request),
  getOptimalProvider: () => aiProviderService.getOptimalProvider()
};""")
                    elif service == 'mixedProviderOrchestrator':
                        facade_code.append("""// Create mixedProviderOrchestrator facade
const mixedProviderOrchestrator = {
  orchestrate: (config: any) => aiProviderService.orchestrateMultiProvider(config),
  distributeLoad: (tasks: any[]) => aiProviderService.distributeTasksAcrossProviders(tasks)
};""")
                    # Keep other imports as-is if they're types or interfaces
                    elif service.startswith('type ') or service.startswith('interface '):
                        continue

                # Replace the import statement with facades
                replacement = '\n'.join(facade_code)
                content = re.sub(r"import\s+\{[^}]+\}\s+from\s+'[^']*unified/aiProviderService[^']*';",
                                replacement, content, count=1)

    if content != original_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Fixed imports in {filepath}")
        return True

    return False

def main():
    """Fix all provider imports in the server directory."""
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
        if fix_provider_imports(filepath):
            fixed_count += 1

    print(f"\nFixed provider imports in {fixed_count} files")

if __name__ == '__main__':
    main()