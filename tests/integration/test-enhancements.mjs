#!/usr/bin/env node

/**
 * Test script for MaiFarm Enhancement Features
 */

import { db } from '../../server/database/connection.js';

console.log('=================================');
console.log('MaiFarm Enhancement Test Suite');
console.log('=================================\n');

async function testEnhancements() {
  const results = {
    passed: [],
    failed: []
  };

  try {
    // Test 1: Check if enhancement tables exist
    console.log('Test 1: Checking enhancement tables...');
    const tables = [
      'agent_health_checks',
      'recovery_actions',
      'task_checkpoints',
      'provider_metrics',
      'provider_performance',
      'routing_decisions',
      'fallback_chains',
      'message_bridges',
      'cross_provider_messages',
      'workspace_pool',
      'cached_resources',
      'harvest_manifests',
      'cleanup_validations',
      'cleanup_rules',
      'sandbox_configs',
      'sandbox_executions',
      'security_policies',
      'policy_violations',
      'security_audit_logs'
    ];

    for (const table of tables) {
      try {
        const result = await db.query(`SELECT COUNT(*) FROM ${table} LIMIT 1`);
        console.log(`  ✓ Table ${table} exists`);
        results.passed.push(`Table ${table}`);
      } catch (error) {
        console.log(`  ✗ Table ${table} missing`);
        results.failed.push(`Table ${table}`);
      }
    }

    // Test 2: Check views
    console.log('\nTest 2: Checking enhancement views...');
    const views = [
      'provider_performance_summary',
      'agent_health_overview'
    ];

    for (const view of views) {
      try {
        const result = await db.query(`SELECT * FROM ${view} LIMIT 1`);
        console.log(`  ✓ View ${view} exists`);
        results.passed.push(`View ${view}`);
      } catch (error) {
        console.log(`  ✗ View ${view} missing`);
        results.failed.push(`View ${view}`);
      }
    }

    // Test 3: Test service imports
    console.log('\nTest 3: Testing service imports...');
    const services = [
      { name: 'AgentHealthMonitor', path: '../../server/services/agentHealthMonitor.js' },
      { name: 'TaskCheckpointService', path: '../../server/services/taskCheckpointService.js' },
      { name: 'ProviderMetricsService', path: '../../server/services/providerMetricsService.js' },
      { name: 'DynamicProviderRouter', path: '../../server/services/dynamicProviderRouter.js' },
      { name: 'UniversalAgentProtocol', path: '../../server/protocols/universalAgentProtocol.js' },
      { name: 'MixedProviderOrchestrator', path: '../../server/services/mixedProviderOrchestrator.js' },
      { name: 'WorkspacePoolManager', path: '../../server/services/workspacePoolManager.js' },
      { name: 'ResourceCacheService', path: '../../server/services/resourceCacheService.js' },
      { name: 'HarvestIntegrityService', path: '../../server/services/harvestIntegrityService.js' },
      { name: 'CleanupValidator', path: '../../server/services/cleanupValidator.js' },
      { name: 'SandboxExecutor', path: '../../server/services/sandboxExecutor.js' },
      { name: 'SecurityPolicyEngine', path: '../../server/services/securityPolicyEngine.js' }
    ];

    for (const service of services) {
      try {
        const module = await import(service.path);
        if (module.default || Object.keys(module).length > 0) {
          console.log(`  ✓ ${service.name} imported successfully`);
          results.passed.push(`Service ${service.name}`);
        } else {
          throw new Error('Empty module');
        }
      } catch (error) {
        console.log(`  ✗ ${service.name} import failed: ${error.message}`);
        results.failed.push(`Service ${service.name}`);
      }
    }

    // Test 4: Test basic functionality
    console.log('\nTest 4: Testing basic functionality...');
    
    // Test agent health monitoring
    try {
      const { agentHealthMonitor } = await import('../../server/services/agentHealthMonitor.js');
      const stats = await agentHealthMonitor.getStatistics();
      console.log(`  ✓ Agent Health Monitor: ${stats.totalAgents} agents monitored`);
      results.passed.push('Agent Health Monitor functionality');
    } catch (error) {
      console.log(`  ✗ Agent Health Monitor failed: ${error.message}`);
      results.failed.push('Agent Health Monitor functionality');
    }

    // Test workspace pool
    try {
      const { workspacePoolManager } = await import('../../server/services/workspacePoolManager.js');
      const stats = workspacePoolManager.getStatistics();
      console.log(`  ✓ Workspace Pool: ${stats.totalWorkspaces} workspaces, ${stats.hitRate.toFixed(1)}% hit rate`);
      results.passed.push('Workspace Pool functionality');
    } catch (error) {
      console.log(`  ✗ Workspace Pool failed: ${error.message}`);
      results.failed.push('Workspace Pool functionality');
    }

    // Test resource cache
    try {
      const { resourceCacheService } = await import('../../server/services/resourceCacheService.js');
      const stats = resourceCacheService.getStatistics();
      console.log(`  ✓ Resource Cache: ${stats.totalItems} items, ${stats.hitRate.toFixed(1)}% hit rate`);
      results.passed.push('Resource Cache functionality');
    } catch (error) {
      console.log(`  ✗ Resource Cache failed: ${error.message}`);
      results.failed.push('Resource Cache functionality');
    }

    // Test security policy engine
    try {
      const { securityPolicyEngine } = await import('../../server/services/securityPolicyEngine.js');
      const policies = securityPolicyEngine.getAllPolicies();
      console.log(`  ✓ Security Policy Engine: ${policies.length} policies loaded`);
      results.passed.push('Security Policy Engine functionality');
    } catch (error) {
      console.log(`  ✗ Security Policy Engine failed: ${error.message}`);
      results.failed.push('Security Policy Engine functionality');
    }

    // Test 5: Integration test
    console.log('\nTest 5: Testing enhancement integration...');
    try {
      const { enhancementIntegration } = await import('../../server/services/enhancementIntegration.js');
      await enhancementIntegration.initialize();
      const healthCheck = await enhancementIntegration.healthCheck();
      
      console.log(`  ✓ Enhancement Integration: ${Object.keys(healthCheck.services).length} services integrated`);
      
      for (const [service, healthy] of Object.entries(healthCheck.services)) {
        if (healthy) {
          console.log(`    ✓ ${service} is healthy`);
        } else {
          console.log(`    ✗ ${service} is unhealthy`);
        }
      }
      
      results.passed.push('Enhancement Integration');
    } catch (error) {
      console.log(`  ✗ Enhancement Integration failed: ${error.message}`);
      results.failed.push('Enhancement Integration');
    }

  } catch (error) {
    console.error('Test suite error:', error);
  }

  // Print summary
  console.log('\n=================================');
  console.log('Test Summary');
  console.log('=================================');
  console.log(`✓ Passed: ${results.passed.length}`);
  console.log(`✗ Failed: ${results.failed.length}`);
  console.log(`Total: ${results.passed.length + results.failed.length}`);
  console.log(`Success Rate: ${((results.passed.length / (results.passed.length + results.failed.length)) * 100).toFixed(1)}%`);

  if (results.failed.length > 0) {
    console.log('\nFailed tests:');
    results.failed.forEach(test => console.log(`  - ${test}`));
  }

  // Close database connection
  await db.end();
  
  process.exit(results.failed.length > 0 ? 1 : 0);
}

// Run tests
testEnhancements().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});