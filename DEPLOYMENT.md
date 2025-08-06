# MaiFarm Deployment Guide

## Overview

MaiFarm is a full-stack TypeScript application for orchestrating multiple Claude Code AI agents. This guide covers building and deploying MaiFarm across different environments.

## Quick Start

### Local Development
```bash
# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env.development

# Start development servers (frontend + backend)
npm run dev

# Alternative: Use the startup script
./scripts/startup.sh
```

### Docker Development
```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f maifarm

# Stop services
docker-compose down
```

## Build Process

### Development Build
```bash
# Run linting
npm run lint

# Type checking
npm run typecheck

# Run tests
npm test

# Build for development
npm run build:dev
```

### Production Build
```bash
# Full production build
npm run build

# Build with type checking
npm run build:check

# Build Docker image
docker build -f Dockerfile.production -t maifarm:latest .
```

## Deployment Environments

### Development Environment

**Stack:**
- Frontend: Vite dev server (port 3000)
- Backend: Express + TypeScript (port 4567)
- Database: PostgreSQL 16
- Cache: Redis 7
- Monitoring: Prometheus + Grafana

**Configuration:**
```yaml
# docker-compose.yml
services:
  maifarm:
    ports:
      - "3000:3000"  # Frontend
      - "4567:4567"  # Backend API
      - "8080:8080"  # WebSocket
    environment:
      - NODE_ENV=development
      - BYPASS_AUTH=true
```

### Staging Environment

**Deployment Method:** Kubernetes with Blue-Green deployment

```bash
# Deploy to staging
./scripts/deploy.sh staging latest blue-green

# Check deployment status
kubectl get pods -n maifarm-staging

# View logs
kubectl logs -f deployment/maifarm -n maifarm-staging
```

### Production Environment

**Deployment Methods:**
1. **Blue-Green:** Zero-downtime deployment with instant rollback
2. **Canary:** Gradual rollout with monitoring
3. **Rolling:** Progressive update of instances

```bash
# Blue-Green deployment
./scripts/deploy.sh production v1.2.3 blue-green

# Canary deployment (10% traffic initially)
./scripts/deploy.sh production v1.2.3 canary

# Rolling update
./scripts/deploy.sh production v1.2.3 rolling
```

## Docker Configuration

### Development Dockerfile
```dockerfile
# Dockerfile.dev
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["npm", "run", "dev"]
```

### Production Dockerfile
Key features:
- Multi-stage build for optimization
- Security scanning with Trivy
- Non-root user execution
- Health checks included

```bash
# Build production image
docker build -f Dockerfile.production -t maifarm:prod .

# Run production container
docker run -d \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e DATABASE_URL=postgresql://... \
  maifarm:prod
```

## Environment Configuration

### Required Environment Variables
```env
# Application
NODE_ENV=production
PORT=3000

# Database
DB_HOST=postgres
DB_PORT=5432
DB_NAME=maifarm
DB_USER=maifarm
DB_PASSWORD=secure_password

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=redis_password

# Authentication
JWT_SECRET=your-secret-key
BYPASS_AUTH=false

# AI Providers
AI_PROVIDER=claude
CLAUDE_API_KEY=your-api-key
```

## CI/CD Pipeline

### GitHub Actions Workflow
```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Build and test
        run: |
          npm ci
          npm run lint
          npm test
          npm run build
      - name: Build Docker image
        run: docker build -t maifarm:${{ github.sha }} .
      - name: Deploy
        run: ./scripts/deploy.sh production ${{ github.sha }}
```

## Monitoring and Health Checks

### Application Health Endpoint
```bash
# Check health
curl http://localhost:4567/api/health

# Response
{
  "status": "healthy",
  "version": "1.2.3",
  "uptime": 3600,
  "services": {
    "database": "connected",
    "redis": "connected",
    "websocket": "active"
  }
}
```

### Prometheus Metrics
- Active farms: `maifarm_active_farms`
- Agent success rate: `maifarm_agent_success_rate`
- WebSocket connections: `maifarm_websocket_connections`
- API response time: `maifarm_api_duration_seconds`

## Troubleshooting

### Common Issues

1. **Port conflicts**
   ```bash
   # Kill existing processes
   pkill -f "tsx.*server/index.ts"
   pkill -f "vite"
   ```

2. **Database connection issues**
   ```bash
   # Check PostgreSQL status
   docker-compose ps postgres
   docker-compose logs postgres
   ```

3. **Build failures**
   ```bash
   # Clean and rebuild
   rm -rf node_modules dist
   npm install
   npm run build
   ```

### Rollback Procedures

```bash
# Quick rollback to previous version
./scripts/rollback.sh production

# Manual rollback
kubectl rollout undo deployment/maifarm -n maifarm-production
```

## Security Best Practices

1. **Build-time Security**
   - Vulnerability scanning with Trivy
   - Dependency auditing: `npm audit`
   - Secret scanning in CI/CD

2. **Runtime Security**
   - Non-root user execution
   - TLS/SSL for all connections
   - Rate limiting enabled
   - JWT token rotation

3. **Infrastructure Security**
   - Network policies in Kubernetes
   - Encrypted secrets management
   - Regular security updates

## Performance Optimization

1. **Docker Image Optimization**
   - Multi-stage builds
   - Layer caching
   - Minimal base images (Alpine)

2. **Application Performance**
   - Connection pooling for databases
   - Redis caching strategy
   - WebSocket connection management

3. **Scaling Configuration**
   - Horizontal pod autoscaling
   - Database connection limits
   - Memory and CPU limits

## Disaster Recovery

### Backup Strategy
```bash
# Database backup
pg_dump -h localhost -U maifarm -d maifarm > backup.sql

# Restore database
psql -h localhost -U maifarm -d maifarm < backup.sql
```

### Emergency Procedures
```bash
# Full disaster recovery
./scripts/disaster-recovery.sh

# Service restoration priority:
# 1. Database
# 2. Redis
# 3. Application
# 4. Monitoring
```

## Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Kubernetes Deployment Guide](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
- [MaiFarm Architecture](./ARCHITECTURE.md)
- [API Documentation](./API.md)