const path = require('path');

module.exports = {
  apps: [
    {
      name: 'maifarm-api',
      script: 'npx',
      args: 'tsx apps/api/src/index.ts',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 4567,
        BYPASS_AUTH: true
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 4567,
        BYPASS_AUTH: false
      },
      error_file: path.join(__dirname, 'logs', 'pm2-error.log'),
      out_file: path.join(__dirname, 'logs', 'pm2-out.log'),
      log_file: path.join(__dirname, 'logs', 'pm2-combined.log'),
      time: true,
      merge_logs: true,
      // Restart settings
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      // Kill timeout
      kill_timeout: 5000,
      // Wait for ready
      listen_timeout: 10000,
      // Cluster mode settings (disabled for development)
      exec_mode: 'fork'
    }
  ]
};
