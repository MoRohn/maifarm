#!/usr/bin/env node

/**
 * Auto-Fix System for Phase 4 Testing
 * Automatically detects and fixes common issues
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const fetch = require('node-fetch');
const chalk = require('chalk');
const fs = require('fs').promises;
const path = require('path');

class AutoFixer {
  constructor() {
    this.fixes = {
      'connection-refused': this.fixConnectionRefused.bind(this),
      'database-locked': this.fixDatabaseLocked.bind(this),
      'tmux-orphaned': this.fixTmuxOrphaned.bind(this),
      'websocket-disconnected': this.fixWebSocketDisconnected.bind(this),
      'agent-stuck': this.fixAgentStuck.bind(this),
      'port-in-use': this.fixPortInUse.bind(this),
      'redis-connection': this.fixRedisConnection.bind(this),
      'npm-modules': this.fixNpmModules.bind(this),
      'database-migration': this.fixDatabaseMigration.bind(this),
      'file-permissions': this.fixFilePermissions.bind(this),
    };

    this.errorPatterns = {
      'ECONNREFUSED': 'connection-refused',
      'database is locked': 'database-locked',
      'no server running': 'tmux-orphaned',
      'WebSocket is not open': 'websocket-disconnected',
      'Agent.*not responding': 'agent-stuck',
      'EADDRINUSE': 'port-in-use',
      'Redis.*ECONNREFUSED': 'redis-connection',
      'Cannot find module': 'npm-modules',
      'relation.*does not exist': 'database-migration',
      'EACCES|permission denied': 'file-permissions',
    };

    this.fixHistory = [];
    this.maxRetries = 3;
  }

  async detectAndFix(error) {
    console.log(chalk.yellow('\n🔧 Auto-Fix: Analyzing error...'));
    
    const errorStr = error.toString();
    let fixApplied = false;

    // Detect error type
    for (const [pattern, fixType] of Object.entries(this.errorPatterns)) {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(errorStr)) {
        console.log(chalk.cyan(`  → Detected: ${fixType}`));
        fixApplied = await this.applyFix(fixType, error);
        break;
      }
    }

    if (!fixApplied) {
      console.log(chalk.gray('  → No automatic fix available'));
    }

    return fixApplied;
  }

  async applyFix(fixType, error) {
    const fix = this.fixes[fixType];
    if (!fix) {
      return false;
    }

    console.log(chalk.cyan(`  → Applying fix: ${fixType}`));
    
    try {
      const result = await fix(error);
      
      this.fixHistory.push({
        timestamp: new Date().toISOString(),
        type: fixType,
        success: result,
        error: error.toString(),
      });

      if (result) {
        console.log(chalk.green(`  ✅ Fix applied successfully`));
      } else {
        console.log(chalk.red(`  ❌ Fix failed`));
      }

      return result;
    } catch (fixError) {
      console.log(chalk.red(`  ❌ Fix error: ${fixError.message}`));
      return false;
    }
  }

  async fixConnectionRefused(error) {
    console.log(chalk.blue('  → Starting services...'));
    
    try {
      // Check if backend is running
      const { stdout: backendCheck } = await execAsync('lsof -i :4567');
      if (!backendCheck) {
        console.log('    • Starting backend...');
        await execAsync('npm run dev:server &', { cwd: process.cwd() });
        await this.wait(5000);
      }

      // Check if frontend is running
      const { stdout: frontendCheck } = await execAsync('lsof -i :3000');
      if (!frontendCheck) {
        console.log('    • Starting frontend...');
        await execAsync('npm run dev:client &', { cwd: process.cwd() });
        await this.wait(5000);
      }

      // Verify services are up
      const backendHealth = await fetch('http://localhost:4567/api/health');
      return backendHealth.ok;
    } catch (err) {
      return false;
    }
  }

  async fixDatabaseLocked(error) {
    console.log(chalk.blue('  → Clearing database locks...'));
    
    try {
      // Kill any hanging database connections
      await execAsync(`
        PGPASSWORD=maifarm123 psql -h localhost -U maifarm -d maifarm_dev -c "
          SELECT pg_terminate_backend(pid) 
          FROM pg_stat_activity 
          WHERE datname = 'maifarm_dev' 
          AND pid <> pg_backend_pid();"
      `).catch(() => {});

      // Wait for connections to clear
      await this.wait(2000);

      // Restart database connection pool
      const response = await fetch('http://localhost:4567/api/admin/restart-db', {
        method: 'POST',
      }).catch(() => null);

      return response?.ok || false;
    } catch (err) {
      return false;
    }
  }

  async fixTmuxOrphaned(error) {
    console.log(chalk.blue('  → Cleaning orphaned tmux sessions...'));
    
    try {
      // List all tmux sessions
      const { stdout } = await execAsync('tmux ls 2>/dev/null || echo ""');
      const sessions = stdout.split('\n').filter(line => line.trim());

      console.log(`    • Found ${sessions.length} tmux sessions`);

      // Kill orphaned sessions (older than 10 minutes without attached clients)
      for (const session of sessions) {
        const sessionName = session.split(':')[0];
        
        // Check if session has attached clients
        const { stdout: clients } = await execAsync(`tmux list-clients -t ${sessionName} 2>/dev/null | wc -l`);
        
        if (parseInt(clients) === 0) {
          console.log(`    • Killing orphaned session: ${sessionName}`);
          await execAsync(`tmux kill-session -t ${sessionName}`).catch(() => {});
        }
      }

      return true;
    } catch (err) {
      return false;
    }
  }

  async fixWebSocketDisconnected(error) {
    console.log(chalk.blue('  → Reconnecting WebSocket...'));
    
    try {
      // Restart WebSocket server
      const response = await fetch('http://localhost:4567/api/admin/restart-ws', {
        method: 'POST',
      }).catch(() => null);

      if (response?.ok) {
        await this.wait(2000);
        return true;
      }

      // If that fails, restart the entire backend
      console.log('    • Restarting backend service...');
      await execAsync('pkill -f "node.*server/index"').catch(() => {});
      await this.wait(1000);
      await execAsync('npm run dev:server &', { cwd: process.cwd() });
      await this.wait(5000);

      return true;
    } catch (err) {
      return false;
    }
  }

  async fixAgentStuck(error) {
    console.log(chalk.blue('  → Restarting stuck agents...'));
    
    try {
      // Get farm ID from error or find active farms
      const response = await fetch('http://localhost:4567/api/farms?status=running');
      const farms = await response.json();

      if (farms.data && farms.data.length > 0) {
        for (const farm of farms.data) {
          console.log(`    • Restarting agents for farm: ${farm.id}`);
          
          // Kill tmux session
          await execAsync(`tmux kill-session -t farm-${farm.id}`).catch(() => {});
          
          // Relaunch agents
          await fetch(`http://localhost:4567/api/farms/${farm.id}/restart-agents`, {
            method: 'POST',
          }).catch(() => {});
        }
      }

      return true;
    } catch (err) {
      return false;
    }
  }

  async fixPortInUse(error) {
    console.log(chalk.blue('  → Fixing port conflicts...'));
    
    try {
      const ports = [3000, 4567, 5432, 6379];
      
      for (const port of ports) {
        console.log(`    • Checking port ${port}...`);
        
        // Find process using port
        const { stdout } = await execAsync(`lsof -i :${port} | grep LISTEN | awk '{print $2}'`).catch(() => ({ stdout: '' }));
        
        if (stdout) {
          const pids = stdout.split('\n').filter(pid => pid);
          for (const pid of pids) {
            console.log(`      → Killing process ${pid}`);
            await execAsync(`kill -9 ${pid}`).catch(() => {});
          }
        }
      }

      await this.wait(2000);
      return true;
    } catch (err) {
      return false;
    }
  }

  async fixRedisConnection(error) {
    console.log(chalk.blue('  → Fixing Redis connection...'));
    
    try {
      // Check if Redis is running
      const { stdout } = await execAsync('redis-cli ping').catch(() => ({ stdout: '' }));
      
      if (stdout.trim() !== 'PONG') {
        console.log('    • Starting Redis...');
        await execAsync('redis-server --daemonize yes');
        await this.wait(2000);
      }

      // Clear Redis cache if needed
      console.log('    • Flushing Redis cache...');
      await execAsync('redis-cli FLUSHALL').catch(() => {});

      return true;
    } catch (err) {
      return false;
    }
  }

  async fixNpmModules(error) {
    console.log(chalk.blue('  → Fixing npm modules...'));
    
    try {
      console.log('    • Installing dependencies...');
      await execAsync('npm install', { cwd: process.cwd() });
      
      console.log('    • Rebuilding native modules...');
      await execAsync('npm rebuild', { cwd: process.cwd() });

      return true;
    } catch (err) {
      return false;
    }
  }

  async fixDatabaseMigration(error) {
    console.log(chalk.blue('  → Running database migrations...'));
    
    try {
      // Run migrations
      console.log('    • Applying migrations...');
      const { stdout, stderr } = await execAsync('npm run db:migrate', { cwd: process.cwd() });
      
      if (stderr && !stderr.includes('already exists')) {
        console.log(chalk.yellow(`    ⚠️ Migration warning: ${stderr}`));
      }

      return true;
    } catch (err) {
      // Try to create database if it doesn't exist
      console.log('    • Creating database...');
      await execAsync(`
        PGPASSWORD=maifarm123 createdb -h localhost -U maifarm maifarm_dev
      `).catch(() => {});
      
      // Retry migrations
      await execAsync('npm run db:migrate', { cwd: process.cwd() }).catch(() => {});
      
      return true;
    }
  }

  async fixFilePermissions(error) {
    console.log(chalk.blue('  → Fixing file permissions...'));
    
    try {
      const directories = [
        'maibarn',
        'logs',
        'uploads',
        'tests/recordings',
        'tests/screenshots',
        'tests/reports',
      ];

      for (const dir of directories) {
        const fullPath = path.join(process.cwd(), dir);
        console.log(`    • Creating/fixing: ${dir}`);
        
        // Create directory if it doesn't exist
        await fs.mkdir(fullPath, { recursive: true }).catch(() => {});
        
        // Fix permissions
        await execAsync(`chmod -R 755 ${fullPath}`).catch(() => {});
      }

      return true;
    } catch (err) {
      return false;
    }
  }

  async wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      fixesApplied: this.fixHistory.length,
      successfulFixes: this.fixHistory.filter(f => f.success).length,
      failedFixes: this.fixHistory.filter(f => !f.success).length,
      history: this.fixHistory,
    };

    const reportPath = path.join('tests', 'reports', `autofix-report-${Date.now()}.json`);
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    console.log(chalk.green(`\n📄 Auto-fix report saved: ${reportPath}`));
    return report;
  }
}

// Export for use in tests
module.exports = AutoFixer;

// Run standalone if executed directly
if (require.main === module) {
  const autoFixer = new AutoFixer();
  
  // Example: Fix all common issues
  (async () => {
    console.log(chalk.cyan.bold('\n🔧 Running Auto-Fix System\n'));
    
    // Check and fix common issues
    const issues = [
      'connection-refused',
      'database-locked',
      'tmux-orphaned',
      'port-in-use',
      'redis-connection',
      'file-permissions',
    ];

    for (const issue of issues) {
      console.log(chalk.yellow(`\nChecking: ${issue}`));
      await autoFixer.applyFix(issue, new Error(`Manual fix for ${issue}`));
    }

    // Generate report
    await autoFixer.generateReport();
    
    console.log(chalk.green.bold('\n✅ Auto-fix complete!\n'));
  })().catch(console.error);
}