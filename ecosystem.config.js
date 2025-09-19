/**
 * PM2 Ecosystem Configuration
 * Production process management for MaiFarm
 */

module.exports = {
  apps: [
    {
      // Main application
      name: 'maifarm-server',
      script: './dist/server/index.js',
      instances: process.env.PM2_INSTANCES || 'max',
      exec_mode: 'cluster',
      
      // Environment variables
      env: {
        NODE_ENV: 'development',
        PORT: 4567
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 4567
      },
      
      // Process management
      wait_ready: true,
      listen_timeout: 10000,
      kill_timeout: 5000,
      max_restarts: 10,
      min_uptime: '10s',
      
      // Memory management
      max_memory_restart: '2G',
      
      // Logging
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_file: './logs/pm2-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Monitoring
      instance_var: 'INSTANCE_ID',
      
      // Auto-restart on file changes (dev only)
      watch: false,
      ignore_watch: [
        'node_modules',
        'logs',
        'maibarn',
        '.git',
        '*.log'
      ],
      
      // Graceful shutdown
      shutdown_with_message: true,
      
      // Node.js arguments
      node_args: '--max-old-space-size=4096 --expose-gc',
      
      // Interpreter arguments
      interpreter_args: '',
      
      // Application arguments
      args: '',
      
      // Cron restart
      cron_restart: '0 3 * * *', // Daily restart at 3 AM
      
      // Auto restart
      autorestart: true,
      
      // Vizion
      vizion: true,
      
      // Post-deploy actions
      post_update: ['npm install', 'npm run build'],
      
      // Environment specific configurations
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 4567,
        instances: 2
      }
    },
    
    {
      // Worker process for background jobs
      name: 'maifarm-worker',
      script: './dist/server/worker.js',
      instances: 1,
      exec_mode: 'fork',
      
      env: {
        NODE_ENV: 'development',
        WORKER_TYPE: 'background'
      },
      env_production: {
        NODE_ENV: 'production',
        WORKER_TYPE: 'background'
      },
      
      max_memory_restart: '1G',
      error_file: './logs/worker-error.log',
      out_file: './logs/worker-out.log',
      log_file: './logs/worker-combined.log',
      time: true,
      
      // Don't restart worker on failure (let main app handle)
      autorestart: false,
      max_restarts: 5
    },
    
    {
      // Monitoring service
      name: 'maifarm-monitor',
      script: './dist/server/monitor.js',
      instances: 1,
      exec_mode: 'fork',
      
      env: {
        NODE_ENV: 'development',
        MONITOR_INTERVAL: 30000
      },
      env_production: {
        NODE_ENV: 'production',
        MONITOR_INTERVAL: 30000
      },
      
      max_memory_restart: '512M',
      error_file: './logs/monitor-error.log',
      out_file: './logs/monitor-out.log',
      time: true,
      
      // Always keep monitoring running
      autorestart: true,
      max_restarts: -1
    }
  ],
  
  // Deployment configuration
  deploy: {
    production: {
      user: 'deploy',
      host: ['production-server-1', 'production-server-2'],
      ref: 'origin/main',
      repo: 'git@github.com:yourusername/maifarm.git',
      path: '/var/www/maifarm',
      'pre-deploy': 'git pull',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': 'echo "Setting up production server..."',
      'ssh_options': 'StrictHostKeyChecking=no',
      env: {
        NODE_ENV: 'production'
      }
    },
    
    staging: {
      user: 'deploy',
      host: 'staging-server',
      ref: 'origin/develop',
      repo: 'git@github.com:yourusername/maifarm.git',
      path: '/var/www/maifarm-staging',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env staging',
      env: {
        NODE_ENV: 'staging'
      }
    }
  }
};

// PM2 cluster mode hooks
if (process.env.NODE_ENV === 'production') {
  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('SIGINT signal received: closing HTTP server');
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    process.exit(0);
  });
  
  // Send ready signal to PM2
  if (process.send) {
    process.send('ready');
  }
}

// Health check for PM2
if (process.env.PM2_HEALTH_CHECK) {
  require('http').createServer((req, res) => {
    res.writeHead(200);
    res.end('ok');
  }).listen(process.env.PM2_HEALTH_CHECK_PORT || 9615);
}