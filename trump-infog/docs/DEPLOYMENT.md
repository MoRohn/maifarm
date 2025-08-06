# Trump Infog Deployment Guide

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development](#local-development)
3. [Docker Deployment](#docker-deployment)
4. [Kubernetes Deployment](#kubernetes-deployment)
5. [Cloud Deployment](#cloud-deployment)
6. [Production Deployment](#production-deployment)
7. [Monitoring & Maintenance](#monitoring--maintenance)
8. [Troubleshooting](#troubleshooting)

## Prerequisites

### System Requirements

- **Node.js**: 18.0 or higher
- **PostgreSQL**: 14.0 or higher
- **Redis**: 6.0 or higher
- **Docker**: 20.10 or higher (for containerized deployment)
- **Kubernetes**: 1.24 or higher (for K8s deployment)

### Required Tools

```bash
# Check versions
node --version      # Should be >= 18.0
npm --version       # Should be >= 9.0
docker --version    # Should be >= 20.10
kubectl version     # Should be >= 1.24
```

## Local Development

### 1. Clone Repository

```bash
git clone https://github.com/yourusername/trump-infog.git
cd trump-infog
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env.development
```

Edit `.env.development`:
```env
# Application
NODE_ENV=development
PORT=4567
CLIENT_URL=http://localhost:3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=trump_infog_dev
DB_USER=postgres
DB_PASSWORD=your_password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Authentication
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=7d

# AI Services
AI_PROVIDER=claude
ANTHROPIC_API_KEY=your-anthropic-key

# Storage
S3_BUCKET=trump-infog-dev
S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
```

### 4. Setup Database

```bash
# Create database
createdb trump_infog_dev

# Run migrations
npm run db:migrate

# Seed sample data (optional)
npm run db:seed
```

### 5. Start Development Server

```bash
# Start all services
npm run dev

# Or start individually
npm run dev:server  # Backend only
npm run dev:client  # Frontend only
```

## Docker Deployment

### 1. Build Images

```bash
# Build all images
docker-compose build

# Or build individually
docker build -t trump-infog:latest .
docker build -f Dockerfile.nginx -t trump-infog-nginx:latest .
```

### 2. Configure Docker Environment

Create `.env.docker`:
```env
# Application
NODE_ENV=production
PORT=4567

# Database
DB_HOST=postgres
DB_PORT=5432
DB_NAME=trump_infog
DB_USER=postgres
DB_PASSWORD=secure_password

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# Add other required variables...
```

### 3. Start Services

```bash
# Start all services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

### 4. Docker Compose Configuration

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "4567:4567"
    environment:
      - NODE_ENV=production
    depends_on:
      - postgres
      - redis
    volumes:
      - ./uploads:/app/uploads

  postgres:
    image: postgres:14-alpine
    environment:
      POSTGRES_DB: trump_infog
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: secure_password
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:6-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data

  nginx:
    build:
      context: .
      dockerfile: Dockerfile.nginx
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - app
    volumes:
      - ./nginx/ssl:/etc/nginx/ssl

volumes:
  postgres_data:
  redis_data:
```

## Kubernetes Deployment

### 1. Create Namespace

```bash
kubectl create namespace trump-infog
```

### 2. Configure Secrets

```bash
# Create secret for environment variables
kubectl create secret generic trump-infog-secrets \
  --from-literal=db-password=secure_password \
  --from-literal=jwt-secret=your-jwt-secret \
  --from-literal=ai-api-key=your-api-key \
  -n trump-infog
```

### 3. Deploy Database

```yaml
# postgres-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: postgres
  namespace: trump-infog
spec:
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgres
        image: postgres:14-alpine
        env:
        - name: POSTGRES_DB
          value: trump_infog
        - name: POSTGRES_USER
          value: postgres
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: trump-infog-secrets
              key: db-password
        ports:
        - containerPort: 5432
        volumeMounts:
        - name: postgres-storage
          mountPath: /var/lib/postgresql/data
      volumes:
      - name: postgres-storage
        persistentVolumeClaim:
          claimName: postgres-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: postgres
  namespace: trump-infog
spec:
  ports:
  - port: 5432
  selector:
    app: postgres
```

### 4. Deploy Application

```yaml
# app-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: trump-infog-api
  namespace: trump-infog
spec:
  replicas: 3
  selector:
    matchLabels:
      app: trump-infog-api
  template:
    metadata:
      labels:
        app: trump-infog-api
    spec:
      containers:
      - name: api
        image: trumpinfog/api:latest
        ports:
        - containerPort: 4567
        env:
        - name: NODE_ENV
          value: production
        - name: DB_HOST
          value: postgres
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: trump-infog-secrets
              key: db-password
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: trump-infog-secrets
              key: jwt-secret
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
---
apiVersion: v1
kind: Service
metadata:
  name: trump-infog-api
  namespace: trump-infog
spec:
  ports:
  - port: 80
    targetPort: 4567
  selector:
    app: trump-infog-api
```

### 5. Deploy Ingress

```yaml
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: trump-infog-ingress
  namespace: trump-infog
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
  - hosts:
    - api.trumpinfog.com
    secretName: trump-infog-tls
  rules:
  - host: api.trumpinfog.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: trump-infog-api
            port:
              number: 80
```

### 6. Apply Configurations

```bash
kubectl apply -f k8s/
```

## Cloud Deployment

### AWS Deployment

#### 1. Prerequisites

```bash
# Install AWS CLI
aws configure

# Install eksctl
curl --silent --location "https://github.com/weaveworks/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz" | tar xz -C /tmp
sudo mv /tmp/eksctl /usr/local/bin
```

#### 2. Create EKS Cluster

```bash
eksctl create cluster \
  --name trump-infog-cluster \
  --region us-east-1 \
  --node-type t3.medium \
  --nodes 3
```

#### 3. Deploy to EKS

```bash
# Update kubeconfig
aws eks update-kubeconfig --name trump-infog-cluster --region us-east-1

# Deploy application
kubectl apply -f k8s/
```

### Google Cloud Platform

#### 1. Create GKE Cluster

```bash
gcloud container clusters create trump-infog-cluster \
  --zone us-central1-a \
  --num-nodes 3 \
  --machine-type n1-standard-2
```

#### 2. Deploy to GKE

```bash
# Get credentials
gcloud container clusters get-credentials trump-infog-cluster --zone us-central1-a

# Deploy
kubectl apply -f k8s/
```

### Azure Deployment

#### 1. Create AKS Cluster

```bash
az aks create \
  --resource-group trump-infog-rg \
  --name trump-infog-cluster \
  --node-count 3 \
  --node-vm-size Standard_D2s_v3
```

#### 2. Deploy to AKS

```bash
# Get credentials
az aks get-credentials --resource-group trump-infog-rg --name trump-infog-cluster

# Deploy
kubectl apply -f k8s/
```

## Production Deployment

### 1. Pre-deployment Checklist

- [ ] All tests passing
- [ ] Security scan completed
- [ ] Performance benchmarks met
- [ ] Database backups configured
- [ ] Monitoring alerts set up
- [ ] SSL certificates configured
- [ ] Environment variables reviewed
- [ ] Resource limits defined

### 2. Database Migration

```bash
# Backup existing database
pg_dump -h prod-db-host -U postgres trump_infog > backup_$(date +%Y%m%d).sql

# Run migrations
NODE_ENV=production npm run db:migrate
```

### 3. Blue-Green Deployment

```bash
# Deploy to green environment
kubectl set image deployment/trump-infog-api \
  api=trumpinfog/api:v2.0.0 \
  -n trump-infog-green

# Test green environment
curl https://green.trumpinfog.com/health

# Switch traffic to green
kubectl patch service trump-infog-api \
  -p '{"spec":{"selector":{"version":"green"}}}' \
  -n trump-infog
```

### 4. Rollback Procedure

```bash
# Quick rollback
kubectl rollout undo deployment/trump-infog-api -n trump-infog

# Rollback to specific revision
kubectl rollout undo deployment/trump-infog-api --to-revision=2 -n trump-infog
```

## Monitoring & Maintenance

### 1. Health Checks

```bash
# API health
curl https://api.trumpinfog.com/health

# Database connectivity
curl https://api.trumpinfog.com/health/db

# Redis connectivity
curl https://api.trumpinfog.com/health/redis
```

### 2. Prometheus Metrics

```yaml
# prometheus-config.yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'trump-infog'
    static_configs:
      - targets: ['trump-infog-api:4567']
```

### 3. Grafana Dashboards

Import the following dashboards:
- `dashboards/api-metrics.json`
- `dashboards/database-metrics.json`
- `dashboards/agent-performance.json`

### 4. Log Aggregation

```bash
# View logs
kubectl logs -f deployment/trump-infog-api -n trump-infog

# Stream to ELK
kubectl logs -f deployment/trump-infog-api -n trump-infog | \
  logstash -f logstash.conf
```

### 5. Backup Strategy

```bash
# Automated daily backups
0 2 * * * /scripts/backup-database.sh
0 3 * * * /scripts/backup-uploads.sh

# Manual backup
npm run backup:create
```

## Troubleshooting

### Common Issues

#### 1. Database Connection Failed

```bash
# Check database status
kubectl get pods -n trump-infog | grep postgres

# View database logs
kubectl logs -f postgres-pod-name -n trump-infog

# Test connection
kubectl exec -it api-pod-name -n trump-infog -- \
  psql -h postgres -U postgres -d trump_infog
```

#### 2. Redis Connection Issues

```bash
# Check Redis status
kubectl get pods -n trump-infog | grep redis

# Test Redis connection
kubectl exec -it api-pod-name -n trump-infog -- \
  redis-cli -h redis ping
```

#### 3. API Not Responding

```bash
# Check pod status
kubectl get pods -n trump-infog

# Describe pod for events
kubectl describe pod api-pod-name -n trump-infog

# Check resource usage
kubectl top pods -n trump-infog
```

#### 4. Export Generation Failing

```bash
# Check job status
kubectl get jobs -n trump-infog

# View job logs
kubectl logs job/export-job-name -n trump-infog

# Increase resource limits if needed
kubectl edit deployment trump-infog-api -n trump-infog
```

### Performance Tuning

#### 1. Database Optimization

```sql
-- Add indexes
CREATE INDEX idx_infographics_status ON infographics(status);
CREATE INDEX idx_infographics_created_at ON infographics(created_at);

-- Analyze tables
ANALYZE infographics;
ANALYZE visualizations;
```

#### 2. Application Optimization

```javascript
// Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=4096"

// Enable clustering
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;

if (cluster.isMaster) {
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
} else {
  startServer();
}
```

### Disaster Recovery

#### 1. Backup Recovery

```bash
# Restore database
psql -h prod-db-host -U postgres trump_infog < backup_20250120.sql

# Restore files
aws s3 sync s3://trump-infog-backups/uploads/ ./uploads/
```

#### 2. Full System Recovery

```bash
# Deploy from backup
./scripts/disaster-recovery.sh --backup-date 20250120
```

---

For additional support, contact the DevOps team at devops@trumpinfog.com