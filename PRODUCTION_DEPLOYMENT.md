# MaiFarm Production Deployment Guide

## Table of Contents
1. [System Requirements](#system-requirements)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Environment Configuration](#environment-configuration)
4. [Database Setup](#database-setup)
5. [Redis Configuration](#redis-configuration)
6. [Application Deployment](#application-deployment)
7. [Performance Optimization](#performance-optimization)
8. [Monitoring & Logging](#monitoring--logging)
9. [Security Hardening](#security-hardening)
10. [Troubleshooting](#troubleshooting)

---

## System Requirements

### Minimum Hardware Requirements
- **CPU**: 8 cores (16 recommended)
- **RAM**: 16GB (32GB recommended)
- **Storage**: 100GB SSD (500GB recommended)
- **Network**: 1Gbps connection

### Software Requirements
- **Node.js**: v20.x LTS
- **PostgreSQL**: 15.x
- **Redis**: 7.x
- **Tmux**: 3.x
- **Claude CLI**: Latest version
- **PM2**: Latest version (for process management)
- **Nginx**: Latest stable (for reverse proxy)

### Operating System
- **Ubuntu 22.04 LTS** (recommended)
- **macOS 13+** (supported)
- **RHEL/CentOS 8+** (supported)

---

## Pre-Deployment Checklist

### 1. System Health Checks
```bash
# Check system resources
free -h
df -h
nproc
ulimit -n  # Should be at least 65535

# Update file descriptor limits
echo "* soft nofile 65535" >> /etc/security/limits.conf
echo "* hard nofile 65535" >> /etc/security/limits.conf
```

### 2. Install Dependencies
```bash
# Install system packages
sudo apt update
sudo apt install -y \
  build-essential \
  git \
  tmux \
  postgresql-15 \
  redis-server \
  nginx \
  certbot \
  python3-certbot-nginx

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Install Claude CLI
npm install -g @anthropic-ai/claude-cli
```

### 3. Create Application User
```bash
# Create dedicated user
sudo useradd -m -s /bin/bash maifarm
sudo usermod -aG sudo maifarm

# Switch to maifarm user
sudo su - maifarm
```

---

## Environment Configuration

### 1. Production Environment Variables
Create `.env.production`:

```bash
# Application
NODE_ENV=production
PORT=4567
API_URL=https://api.yourdomain.com
CLIENT_URL=https://app.yourdomain.com

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=maifarm_prod
DB_USER=maifarm_prod
DB_PASSWORD=<secure_password>
DB_POOL_SIZE=20
DB_POOL_IDLE_TIMEOUT=10000

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=<secure_password>
REDIS_DB=0
REDIS_POOL_SIZE=10

# Security
JWT_SECRET=<generate_with_openssl_rand_-base64_32>
API_KEY_ENCRYPTION_KEY=<generate_with_openssl_rand_-base64_32>
SESSION_SECRET=<generate_with_openssl_rand_-base64_32>
CORS_ORIGIN=https://app.yourdomain.com

# AI Providers
ANTHROPIC_API_KEY=<your_api_key>
OPENAI_API_KEY=<your_api_key>
AI_PROVIDER=claude
CLAUDE_MODEL=claude-3-sonnet-20240229
OPENAI_MODEL=gpt-4-turbo-preview

# Monitoring
ENABLE_METRICS=true
METRICS_PORT=9090
LOG_LEVEL=info
SENTRY_DSN=<your_sentry_dsn>

# Performance
MAX_CONCURRENT_FARMS=10
MAX_AGENTS_PER_FARM=5
HARVEST_TIMEOUT=3600000
GRACEFUL_SHUTDOWN_TIMEOUT=30000
MEMORY_LIMIT_MB=8192

# Feature Flags
ENABLE_XENOSYNC=true
ENABLE_GOWILD=true
ENABLE_MULTI_CLAUDE=true
ENABLE_CLUSTERING=true
```

### 2. Generate Secrets
```bash
# Generate secure secrets
openssl rand -base64 32  # For JWT_SECRET
openssl rand -base64 32  # For API_KEY_ENCRYPTION_KEY
openssl rand -base64 32  # For SESSION_SECRET
```

---

## Database Setup

### 1. PostgreSQL Configuration
Edit `/etc/postgresql/15/main/postgresql.conf`:

```conf
# Connection Settings
max_connections = 200
superuser_reserved_connections = 3

# Memory Settings
shared_buffers = 4GB
effective_cache_size = 12GB
maintenance_work_mem = 1GB
work_mem = 20MB

# Checkpoint Settings
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1

# Logging
log_min_duration_statement = 1000
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '
log_checkpoints = on
log_connections = on
log_disconnections = on
log_lock_waits = on
log_temp_files = 0
```

### 2. Create Production Database
```sql
-- Connect as postgres superuser
sudo -u postgres psql

-- Create database and user
CREATE USER maifarm_prod WITH PASSWORD '<secure_password>';
CREATE DATABASE maifarm_prod OWNER maifarm_prod;
GRANT ALL PRIVILEGES ON DATABASE maifarm_prod TO maifarm_prod;

-- Enable extensions
\c maifarm_prod
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
```

### 3. Run Migrations
```bash
cd /opt/maifarm
NODE_ENV=production npm run migrate:up
```

### 4. Database Backup Strategy
Create `/opt/maifarm/scripts/backup-db.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/var/backups/maifarm"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_NAME="maifarm_prod"

mkdir -p $BACKUP_DIR

# Create backup
pg_dump -U maifarm_prod -h localhost $DB_NAME | gzip > $BACKUP_DIR/db_backup_$TIMESTAMP.sql.gz

# Keep only last 7 days
find $BACKUP_DIR -name "*.sql.gz" -mtime +7 -delete

# Upload to S3 (optional)
# aws s3 cp $BACKUP_DIR/db_backup_$TIMESTAMP.sql.gz s3://your-bucket/backups/
```

Add to crontab:
```bash
0 2 * * * /opt/maifarm/scripts/backup-db.sh
```

---

## Redis Configuration

### 1. Redis Configuration
Edit `/etc/redis/redis.conf`:

```conf
# Network
bind 127.0.0.1
protected-mode yes
port 6379

# Security
requirepass <secure_password>

# Persistence
save 900 1
save 300 10
save 60 10000
stop-writes-on-bgsave-error yes
rdbcompression yes
dbfilename dump.rdb
dir /var/lib/redis

# Memory Management
maxmemory 2gb
maxmemory-policy allkeys-lru

# Performance
tcp-keepalive 300
timeout 0
tcp-backlog 511

# Logging
loglevel notice
logfile /var/log/redis/redis-server.log
```

### 2. Redis Sentinel (for HA)
Create `/etc/redis/sentinel.conf`:

```conf
port 26379
bind 127.0.0.1
sentinel monitor mymaster 127.0.0.1 6379 2
sentinel down-after-milliseconds mymaster 5000
sentinel parallel-syncs mymaster 1
sentinel failover-timeout mymaster 10000
sentinel auth-pass mymaster <secure_password>
```

---

## Application Deployment

### 1. Clone and Build Application
```bash
# Clone repository
cd /opt
git clone https://github.com/your-org/maifarm.git
cd maifarm

# Install dependencies
npm ci --production

# Build application
npm run build

# Set permissions
chown -R maifarm:maifarm /opt/maifarm
chmod 755 /opt/maifarm
```

### 2. PM2 Configuration
Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'maifarm',
    script: './dist/server/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    autorestart: true,
    watch: false,
    max_memory_restart: '8G',
    env: {
      NODE_ENV: 'production',
      PORT: 4567
    },
    error_file: '/var/log/maifarm/error.log',
    out_file: '/var/log/maifarm/out.log',
    log_file: '/var/log/maifarm/combined.log',
    time: true,
    kill_timeout: 30000,
    wait_ready: true,
    listen_timeout: 10000
  }]
};
```

### 3. Start Application
```bash
# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 startup script
pm2 startup systemd -u maifarm --hp /home/maifarm

# Monitor
pm2 monit
```

### 4. Nginx Configuration
Create `/etc/nginx/sites-available/maifarm`:

```nginx
upstream maifarm_backend {
    least_conn;
    server localhost:4567;
    keepalive 64;
}

server {
    listen 80;
    server_name api.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req zone=api burst=20 nodelay;

    location / {
        proxy_pass http://maifarm_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # WebSocket support
    location /socket.io/ {
        proxy_pass http://maifarm_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static files
    location /static {
        alias /opt/maifarm/public;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/maifarm /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## Performance Optimization

### 1. Node.js Optimization
```bash
# Set Node.js options
export NODE_OPTIONS="--max-old-space-size=8192 --max-semi-space-size=256"

# Enable V8 optimizations
export NODE_ENV=production
export NODE_CLUSTER_SCHED_POLICY=rr  # Round-robin for clustering
```

### 2. System Tuning
Create `/etc/sysctl.d/99-maifarm.conf`:

```conf
# Network optimizations
net.core.somaxconn = 65535
net.core.netdev_max_backlog = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.tcp_fin_timeout = 30
net.ipv4.tcp_keepalive_time = 300
net.ipv4.tcp_tw_reuse = 1
net.ipv4.ip_local_port_range = 10000 65000

# Memory optimizations
vm.swappiness = 10
vm.dirty_ratio = 15
vm.dirty_background_ratio = 5

# File system
fs.file-max = 2097152
fs.inotify.max_user_watches = 524288
```

Apply settings:
```bash
sudo sysctl -p /etc/sysctl.d/99-maifarm.conf
```

### 3. Database Connection Pooling
Ensure connection pool settings in code:

```typescript
// server/database/connection.ts
const pool = new Pool({
  max: 20,                    // Maximum connections
  idleTimeoutMillis: 30000,   // Close idle connections after 30s
  connectionTimeoutMillis: 2000, // Connection timeout
  statement_timeout: 10000,    // Statement timeout
});
```

### 4. Redis Connection Pooling
Configure Redis clients properly:

```typescript
// server/services/redisClientManager.ts
const connectionConfig = {
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
    connectTimeout: 5000,
  },
  commandsQueueMaxLength: 100,
  disableOfflineQueue: false,
};
```

---

## Monitoring & Logging

### 1. Application Monitoring
```bash
# PM2 monitoring
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 100M
pm2 set pm2-logrotate:retain 7

# Prometheus metrics endpoint
curl http://localhost:9090/metrics
```

### 2. System Monitoring
Install monitoring stack:

```bash
# Install Prometheus
wget https://github.com/prometheus/prometheus/releases/download/v2.45.0/prometheus-2.45.0.linux-amd64.tar.gz
tar xvf prometheus-2.45.0.linux-amd64.tar.gz
sudo mv prometheus-2.45.0.linux-amd64 /opt/prometheus

# Install Grafana
sudo apt-get install -y software-properties-common
sudo add-apt-repository "deb https://packages.grafana.com/oss/deb stable main"
sudo apt-get update
sudo apt-get install grafana
```

### 3. Log Aggregation
Configure centralized logging:

```bash
# Install Filebeat
curl -L -O https://artifacts.elastic.co/downloads/beats/filebeat/filebeat-8.10.0-amd64.deb
sudo dpkg -i filebeat-8.10.0-amd64.deb

# Configure Filebeat
cat > /etc/filebeat/filebeat.yml <<EOF
filebeat.inputs:
- type: log
  enabled: true
  paths:
    - /var/log/maifarm/*.log
    - /var/log/nginx/*.log
    - /var/log/postgresql/*.log

output.elasticsearch:
  hosts: ["localhost:9200"]
EOF

# Start Filebeat
sudo systemctl enable filebeat
sudo systemctl start filebeat
```

### 4. Health Checks
Create health check endpoint monitor:

```bash
# Create health check script
cat > /opt/maifarm/scripts/health-check.sh <<'EOF'
#!/bin/bash
response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4567/api/health)
if [ $response -eq 200 ]; then
    echo "Health check passed"
else
    echo "Health check failed with status: $response"
    # Send alert
    curl -X POST https://hooks.slack.com/services/YOUR/WEBHOOK/URL \
        -H 'Content-Type: application/json' \
        -d '{"text":"MaiFarm health check failed!"}'
fi
EOF

# Add to crontab
*/5 * * * * /opt/maifarm/scripts/health-check.sh
```

---

## Security Hardening

### 1. Firewall Configuration
```bash
# Install and configure UFW
sudo apt install ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

### 2. SSL/TLS Configuration
```bash
# Install Let's Encrypt certificate
sudo certbot --nginx -d api.yourdomain.com

# Auto-renewal
echo "0 0 * * * root certbot renew --quiet" > /etc/cron.d/certbot
```

### 3. Security Headers
Add to Nginx configuration:

```nginx
# Security headers
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

### 4. API Rate Limiting
Configure rate limiting in application:

```typescript
// server/middleware/rateLimit.ts
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP',
  standardHeaders: true,
  legacyHeaders: false,
});
```

### 5. Database Security
```sql
-- Revoke unnecessary privileges
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON DATABASE maifarm_prod FROM PUBLIC;

-- Create read-only user for reporting
CREATE USER maifarm_readonly WITH PASSWORD '<secure_password>';
GRANT CONNECT ON DATABASE maifarm_prod TO maifarm_readonly;
GRANT USAGE ON SCHEMA public TO maifarm_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO maifarm_readonly;
```

---

## Troubleshooting

### Common Issues and Solutions

#### 1. High Memory Usage
```bash
# Check memory usage
pm2 status
pm2 monit

# Restart with memory limit
pm2 restart maifarm --max-memory-restart 8G

# Enable heap snapshots
node --heapsnapshot-signal=SIGUSR2 dist/server/index.js
```

#### 2. Database Connection Errors
```bash
# Check connection count
sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity;"

# Kill idle connections
sudo -u postgres psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND state_change < NOW() - INTERVAL '10 minutes';"

# Increase connection limit
sudo -u postgres psql -c "ALTER SYSTEM SET max_connections = 300;"
sudo systemctl restart postgresql
```

#### 3. Redis Connection Issues
```bash
# Check Redis status
redis-cli ping

# Monitor Redis
redis-cli monitor

# Clear Redis cache (careful!)
redis-cli FLUSHDB

# Check memory usage
redis-cli INFO memory
```

#### 4. WebSocket Connection Drops
```bash
# Check Nginx error logs
tail -f /var/log/nginx/error.log

# Increase timeouts in Nginx
proxy_read_timeout 3600s;
proxy_send_timeout 3600s;
proxy_connect_timeout 3600s;
```

#### 5. Tmux Session Issues
```bash
# List all tmux sessions
TMUX_TMPDIR=/tmp tmux list-sessions

# Kill orphaned sessions
TMUX_TMPDIR=/tmp tmux kill-server

# Check tmux permissions
ls -la /tmp/tmux-*
```

### Debug Mode
Enable debug logging temporarily:

```bash
# Set debug environment
export DEBUG=*
export LOG_LEVEL=debug

# Run with verbose logging
pm2 restart maifarm --update-env
```

### Performance Profiling
```bash
# CPU profiling
node --prof dist/server/index.js
node --prof-process isolate-*.log > profile.txt

# Memory profiling
node --expose-gc --trace-gc dist/server/index.js

# V8 options
node --trace-opt --trace-deopt dist/server/index.js
```

---

## Maintenance Procedures

### 1. Rolling Updates
```bash
# Pull latest code
cd /opt/maifarm
git pull origin main

# Install dependencies
npm ci --production

# Build application
npm run build

# Reload PM2 with zero downtime
pm2 reload maifarm
```

### 2. Database Maintenance
```bash
# Vacuum and analyze
sudo -u postgres psql -d maifarm_prod -c "VACUUM ANALYZE;"

# Reindex
sudo -u postgres psql -d maifarm_prod -c "REINDEX DATABASE maifarm_prod;"

# Check table sizes
sudo -u postgres psql -d maifarm_prod -c "SELECT schemaname,tablename,pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size FROM pg_tables ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC LIMIT 10;"
```

### 3. Log Rotation
Configure logrotate in `/etc/logrotate.d/maifarm`:

```
/var/log/maifarm/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0640 maifarm maifarm
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
```

---

## Disaster Recovery

### 1. Backup Strategy
- **Database**: Daily automated backups with 7-day retention
- **Application**: Git repository with tagged releases
- **Configuration**: Encrypted backups of environment files
- **User Data**: S3 sync for uploaded files

### 2. Recovery Procedures
```bash
# Restore database from backup
gunzip < /var/backups/maifarm/db_backup_TIMESTAMP.sql.gz | sudo -u postgres psql maifarm_prod

# Restore application
cd /opt
git clone https://github.com/your-org/maifarm.git maifarm_new
cd maifarm_new
git checkout v1.2.3  # Specific version
npm ci --production
npm run build

# Switch to new version
pm2 stop maifarm
mv /opt/maifarm /opt/maifarm_old
mv /opt/maifarm_new /opt/maifarm
pm2 start ecosystem.config.js
```

### 3. Monitoring Alerts
Configure alerts for:
- CPU usage > 80%
- Memory usage > 90%
- Disk usage > 85%
- Database connections > 80% of max
- Response time > 2s
- Error rate > 1%
- Failed health checks

---

## Support and Resources

- **Documentation**: https://docs.maifarm.ai
- **Status Page**: https://status.maifarm.ai
- **Support Email**: support@maifarm.ai
- **Emergency Contact**: +1-XXX-XXX-XXXX

## Version Information
- **Document Version**: 1.0.0
- **Last Updated**: 2024-01-18
- **MaiFarm Version**: 2.0.0