#!/usr/bin/env node

/**
 * Live Monitoring System for Phase 4 Testing
 * Monitors all services and provides real-time feedback
 */

const WebSocket = require('ws');
const chalk = require('chalk');
const fetch = require('node-fetch');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class LiveMonitor {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.metrics = {
      startTime: Date.now(),
      farms: 0,
      agents: 0,
      harvests: 0,
      errors: 0,
      warnings: 0,
      wsMessages: 0,
      apiCalls: 0,
    };
    this.logs = [];
    this.errorPatterns = [
      /error/i,
      /failed/i,
      /exception/i,
      /rejected/i,
      /timeout/i,
    ];
    this.warningPatterns = [
      /warning/i,
      /deprecated/i,
      /slow/i,
    ];
    this.successPatterns = [
      /success/i,
      /completed/i,
      /connected/i,
      /active/i,
    ];
  }

  async start() {
    console.clear();
    console.log(chalk.cyan.bold('\n╔════════════════════════════════════════════╗'));
    console.log(chalk.cyan.bold('║     MaiFarm Live Monitoring Dashboard      ║'));
    console.log(chalk.cyan.bold('╚════════════════════════════════════════════╝\n'));

    // Start monitoring components
    await this.checkServices();
    this.connectWebSocket();
    this.startMetricsCollection();
    this.startLogTailing();
    this.startDashboard();

    // Handle graceful shutdown
    process.on('SIGINT', () => this.shutdown());
  }

  async checkServices() {
    console.log(chalk.yellow('🔍 Checking services...\n'));

    const services = [
      { name: 'Backend', url: 'http://localhost:4567/api/health', type: 'api' },
      { name: 'Frontend', url: 'http://localhost:3000', type: 'web' },
      { name: 'PostgreSQL', cmd: 'pg_isready -h localhost -p 5432', type: 'db' },
      { name: 'Redis', cmd: 'redis-cli ping', type: 'cache' },
    ];

    for (const service of services) {
      try {
        if (service.url) {
          const response = await fetch(service.url, { timeout: 5000 });
          if (response.ok) {
            console.log(chalk.green(`  ✅ ${service.name}: Online`));
          } else {
            console.log(chalk.red(`  ❌ ${service.name}: Unhealthy (${response.status})`));
          }
        } else if (service.cmd) {
          await execAsync(service.cmd);
          console.log(chalk.green(`  ✅ ${service.name}: Online`));
        }
      } catch (error) {
        console.log(chalk.red(`  ❌ ${service.name}: Offline`));
        this.metrics.errors++;
      }
    }
    console.log('');
  }

  connectWebSocket() {
    console.log(chalk.yellow('📡 Connecting to WebSocket...\n'));

    this.ws = new WebSocket('ws://localhost:4567');

    this.ws.on('open', () => {
      this.isConnected = true;
      console.log(chalk.green('  ✅ WebSocket connected\n'));
    });

    this.ws.on('message', (data) => {
      this.metrics.wsMessages++;
      const message = JSON.parse(data.toString());
      this.handleWebSocketMessage(message);
    });

    this.ws.on('error', (error) => {
      console.log(chalk.red(`  ❌ WebSocket error: ${error.message}`));
      this.metrics.errors++;
    });

    this.ws.on('close', () => {
      this.isConnected = false;
      console.log(chalk.yellow('  ⚠️ WebSocket disconnected, reconnecting...'));
      setTimeout(() => this.connectWebSocket(), 5000);
    });
  }

  handleWebSocketMessage(message) {
    // Update metrics based on message type
    switch (message.type) {
      case 'farm:created':
        this.metrics.farms++;
        this.log('success', `Farm created: ${message.data.name}`);
        break;
      case 'agent:status':
        if (message.data.status === 'active') {
          this.metrics.agents++;
          this.log('info', `Agent active: ${message.data.name}`);
        }
        break;
      case 'harvest:completed':
        this.metrics.harvests++;
        this.log('success', `Harvest completed: ${message.data.id}`);
        break;
      case 'error':
        this.metrics.errors++;
        this.log('error', `Error: ${message.data.message}`);
        break;
      case 'terminal:output':
        this.log('terminal', message.data.output);
        break;
    }
  }

  async startMetricsCollection() {
    setInterval(async () => {
      try {
        // Collect system metrics
        const { stdout: cpuUsage } = await execAsync("ps aux | grep node | awk '{sum+=$3} END {print sum}'");
        const { stdout: memUsage } = await execAsync("ps aux | grep node | awk '{sum+=$4} END {print sum}'");
        
        // Collect tmux sessions
        const { stdout: tmuxSessions } = await execAsync('tmux ls 2>/dev/null | wc -l');

        // Update dashboard
        this.updateMetrics({
          cpu: parseFloat(cpuUsage) || 0,
          memory: parseFloat(memUsage) || 0,
          tmuxSessions: parseInt(tmuxSessions) || 0,
        });
      } catch (error) {
        // Ignore errors in metrics collection
      }
    }, 2000);
  }

  async startLogTailing() {
    // Tail server logs
    const tailProcess = exec('tail -f logs/application.log 2>/dev/null');
    
    tailProcess.stdout?.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          this.analyzeLine(line);
        }
      });
    });
  }

  analyzeLine(line) {
    // Check for errors
    if (this.errorPatterns.some(pattern => pattern.test(line))) {
      this.metrics.errors++;
      this.log('error', line);
      return;
    }

    // Check for warnings
    if (this.warningPatterns.some(pattern => pattern.test(line))) {
      this.metrics.warnings++;
      this.log('warning', line);
      return;
    }

    // Check for success
    if (this.successPatterns.some(pattern => pattern.test(line))) {
      this.log('success', line);
      return;
    }

    // Regular log
    this.log('info', line);
  }

  log(level, message) {
    const timestamp = new Date().toISOString();
    const entry = { timestamp, level, message };
    this.logs.push(entry);

    // Keep only last 1000 logs
    if (this.logs.length > 1000) {
      this.logs.shift();
    }

    // Display in appropriate color
    const colors = {
      error: chalk.red,
      warning: chalk.yellow,
      success: chalk.green,
      info: chalk.white,
      terminal: chalk.cyan,
    };

    if (level !== 'info') {
      console.log(colors[level] || chalk.white)(`[${timestamp.split('T')[1].split('.')[0]}] ${message.substring(0, 100)}`);
    }
  }

  updateMetrics(systemMetrics) {
    // This would update a dashboard display
    // For now, we'll just track them
    this.metrics.cpu = systemMetrics.cpu;
    this.metrics.memory = systemMetrics.memory;
    this.metrics.tmuxSessions = systemMetrics.tmuxSessions;
  }

  startDashboard() {
    // Update dashboard every second
    setInterval(() => {
      this.displayDashboard();
    }, 1000);
  }

  displayDashboard() {
    const uptime = Math.floor((Date.now() - this.metrics.startTime) / 1000);
    const uptimeStr = `${Math.floor(uptime / 60)}m ${uptime % 60}s`;

    // Move cursor to home and clear screen (but keep log history)
    process.stdout.write('\x1B[H');

    console.log(chalk.cyan.bold('\n╔════════════════════════════════════════════╗'));
    console.log(chalk.cyan.bold('║     MaiFarm Live Monitoring Dashboard      ║'));
    console.log(chalk.cyan.bold('╚════════════════════════════════════════════╝\n'));

    // Status line
    console.log(chalk.white('📊 Status: ') + 
      (this.isConnected ? chalk.green('Connected') : chalk.red('Disconnected')) +
      chalk.white(` | Uptime: ${uptimeStr}`));

    // Metrics
    console.log(chalk.white('\n📈 Metrics:'));
    console.log(chalk.white(`  • Farms: ${this.metrics.farms}`));
    console.log(chalk.white(`  • Agents: ${this.metrics.agents}`));
    console.log(chalk.white(`  • Harvests: ${this.metrics.harvests}`));
    console.log(chalk.white(`  • WS Messages: ${this.metrics.wsMessages}`));
    
    // Health
    console.log(chalk.white('\n🏥 Health:'));
    console.log(chalk.white(`  • Errors: `) + 
      (this.metrics.errors > 0 ? chalk.red(this.metrics.errors) : chalk.green('0')));
    console.log(chalk.white(`  • Warnings: `) + 
      (this.metrics.warnings > 0 ? chalk.yellow(this.metrics.warnings) : chalk.green('0')));

    // System
    if (this.metrics.cpu !== undefined) {
      console.log(chalk.white('\n💻 System:'));
      console.log(chalk.white(`  • CPU: ${this.metrics.cpu.toFixed(1)}%`));
      console.log(chalk.white(`  • Memory: ${this.metrics.memory.toFixed(1)}%`));
      console.log(chalk.white(`  • Tmux Sessions: ${this.metrics.tmuxSessions}`));
    }

    console.log(chalk.white('\n📜 Recent Activity:'));
    console.log(chalk.gray('─'.repeat(48)));
  }

  async shutdown() {
    console.log(chalk.yellow('\n\n👋 Shutting down monitor...'));
    
    if (this.ws) {
      this.ws.close();
    }

    // Generate final report
    const report = {
      timestamp: new Date().toISOString(),
      duration: Date.now() - this.metrics.startTime,
      metrics: this.metrics,
      errorCount: this.metrics.errors,
      warningCount: this.metrics.warnings,
      lastLogs: this.logs.slice(-50),
    };

    const fs = require('fs').promises;
    const reportPath = `tests/reports/monitor-report-${Date.now()}.json`;
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(chalk.green(`\n📄 Report saved: ${reportPath}`));

    process.exit(0);
  }
}

// Start the monitor
const monitor = new LiveMonitor();
monitor.start().catch(console.error);