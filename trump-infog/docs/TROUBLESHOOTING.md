# Trump Infog Troubleshooting Guide

This guide helps you resolve common issues with Trump Infog. If you can't find a solution here, please contact support at support@trumpinfog.com.

## Table of Contents

1. [Installation Issues](#installation-issues)
2. [Development Environment](#development-environment)
3. [Runtime Errors](#runtime-errors)
4. [Performance Issues](#performance-issues)
5. [API Problems](#api-problems)
6. [Database Issues](#database-issues)
7. [WebSocket Connection](#websocket-connection)
8. [Export Problems](#export-problems)
9. [Multi-Agent Issues](#multi-agent-issues)
10. [Production Deployment](#production-deployment)

## Installation Issues

### npm install fails

**Problem**: Dependencies fail to install

**Solutions**:

1. Clear npm cache:
```bash
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

2. Check Node version:
```bash
node --version  # Should be >= 18.0.0
```

3. Use npm instead of yarn:
```bash
npm install --legacy-peer-deps
```

4. Check for proxy issues:
```bash
npm config set registry https://registry.npmjs.org/
```

### TypeScript errors during install

**Problem**: TypeScript compilation errors

**Solution**:
```bash
# Install TypeScript globally
npm install -g typescript@latest

# Clean and reinstall
rm -rf node_modules dist
npm install
npm run build
```

## Development Environment

### Port already in use

**Problem**: Error "Port 4567 is already in use"

**Solutions**:

1. Find and kill the process:
```bash
# Find process
lsof -i :4567

# Kill process
kill -9 <PID>
```

2. Change port in .env:
```env
PORT=4568
```

### Database connection refused

**Problem**: Cannot connect to PostgreSQL

**Solutions**:

1. Check PostgreSQL is running:
```bash
# macOS
brew services list | grep postgresql

# Linux
systemctl status postgresql

# Docker
docker ps | grep postgres
```

2. Verify credentials in .env:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=trump_infog_dev
DB_USER=postgres
DB_PASSWORD=yourpassword
```

3. Test connection:
```bash
psql -h localhost -U postgres -d trump_infog_dev
```

### Redis connection failed

**Problem**: Redis server not available

**Solutions**:

1. Start Redis:
```bash
# macOS
brew services start redis

# Linux
sudo systemctl start redis

# Docker
docker run -d -p 6379:6379 redis:alpine
```

2. Test Redis:
```bash
redis-cli ping
# Should return: PONG
```

## Runtime Errors

### Module not found

**Problem**: Cannot find module '@/components/...'

**Solutions**:

1. Check tsconfig.json paths:
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@components/*": ["./src/components/*"]
    }
  }
}
```

2. Restart development server:
```bash
npm run dev
```

### React hooks errors

**Problem**: "Invalid hook call" or "Hooks can only be called inside function components"

**Solutions**:

1. Check for duplicate React versions:
```bash
npm ls react
```

2. Ensure hooks are at top level:
```typescript
// Wrong
if (condition) {
  const [state, setState] = useState();
}

// Correct
const [state, setState] = useState();
if (condition) {
  // use state
}
```

## Performance Issues

### Slow infographic generation

**Problem**: Generation takes >30 seconds

**Solutions**:

1. Check API rate limits:
```typescript
// Increase timeout
const response = await fetch(url, {
  timeout: 60000 // 60 seconds
});
```

2. Optimize data queries:
```sql
-- Add indexes
CREATE INDEX idx_articles_date ON articles(published_date);
CREATE INDEX idx_articles_source ON articles(source);
```

3. Enable caching:
```typescript
// Redis caching
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);
```

### High memory usage

**Problem**: Node.js heap out of memory

**Solutions**:

1. Increase memory limit:
```bash
NODE_OPTIONS="--max-old-space-size=4096" npm run dev
```

2. Optimize large data processing:
```typescript
// Use streams for large files
const stream = fs.createReadStream(largefile);
stream.on('data', (chunk) => {
  // Process chunk
});
```

## API Problems

### Authentication failures

**Problem**: 401 Unauthorized errors

**Solutions**:

1. Check JWT token:
```typescript
// Verify token is included
const headers = {
  'Authorization': `Bearer ${token}`
};
```

2. Refresh expired token:
```typescript
if (isTokenExpired(token)) {
  token = await refreshToken();
}
```

### CORS errors

**Problem**: Cross-origin request blocked

**Solutions**:

1. Update CORS configuration:
```typescript
// server/middleware/cors.ts
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));
```

2. Check API URL:
```typescript
// Ensure correct protocol
const API_URL = process.env.NODE_ENV === 'production' 
  ? 'https://api.trumpinfog.com'
  : 'http://localhost:4567';
```

## Database Issues

### Migration failures

**Problem**: Database migrations won't run

**Solutions**:

1. Reset migrations:
```bash
# Rollback all
npm run db:migrate:undo:all

# Run fresh
npm run db:migrate
```

2. Check migration files:
```bash
ls server/database/migrations/
```

3. Manual migration:
```sql
-- Connect to database
psql -U postgres -d trump_infog_dev

-- Run migration manually
\i server/database/migrations/001_initial_schema.sql
```

### Query timeouts

**Problem**: Database queries timing out

**Solutions**:

1. Optimize queries:
```sql
EXPLAIN ANALYZE SELECT * FROM large_table;
```

2. Add connection pooling:
```typescript
const pool = new Pool({
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

## WebSocket Connection

### Connection drops frequently

**Problem**: WebSocket disconnects repeatedly

**Solutions**:

1. Implement reconnection logic:
```typescript
socket.on('disconnect', () => {
  setTimeout(() => {
    socket.connect();
  }, 1000);
});
```

2. Check firewall/proxy settings:
```nginx
# nginx.conf
location /socket.io/ {
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
}
```

### Events not received

**Problem**: WebSocket events not firing

**Solutions**:

1. Verify event names:
```typescript
// Client
socket.on('infographic:updated', handler);

// Server
io.emit('infographic:updated', data);
```

2. Check namespaces:
```typescript
// Ensure same namespace
const socket = io('/infographics');
```

## Export Problems

### PDF generation fails

**Problem**: Cannot export to PDF

**Solutions**:

1. Install required dependencies:
```bash
npm install puppeteer
```

2. Increase timeout:
```typescript
await page.pdf({
  timeout: 60000,
  format: 'A4',
  printBackground: true
});
```

### Large file exports timeout

**Problem**: Export fails for complex infographics

**Solutions**:

1. Use job queue:
```typescript
// Queue export job
const job = await exportQueue.add('export-pdf', {
  infographicId,
  format: 'pdf'
});
```

2. Stream response:
```typescript
res.setHeader('Content-Type', 'application/pdf');
pdfStream.pipe(res);
```

## Multi-Agent Issues

### Agent coordination failures

**Problem**: Agents not communicating

**Solutions**:

1. Check coordination directory:
```bash
ls -la /tmp/claude_coordination/trump_infog/
```

2. Verify file permissions:
```bash
chmod 777 /tmp/claude_coordination/trump_infog/
```

3. Monitor agent status:
```typescript
// Check agent health
const status = await checkAgentHealth(agentId);
console.log(`Agent ${agentId}: ${status}`);
```

### Pipeline stalls

**Problem**: Processing pipeline gets stuck

**Solutions**:

1. Check for deadlocks:
```bash
# View agent logs
tail -f /tmp/claude_coordination/trump_infog/agent_*.log
```

2. Reset pipeline state:
```bash
rm /tmp/claude_coordination/trump_infog/shared_state.json
npm run agents:restart
```

## Production Deployment

### Docker build failures

**Problem**: Docker image won't build

**Solutions**:

1. Clear Docker cache:
```bash
docker system prune -a
docker build --no-cache -t trump-infog .
```

2. Check Dockerfile syntax:
```dockerfile
# Ensure correct base image
FROM node:18-alpine
```

### Kubernetes pod crashes

**Problem**: Pods in CrashLoopBackOff

**Solutions**:

1. Check pod logs:
```bash
kubectl logs -f pod-name -n trump-infog
kubectl describe pod pod-name -n trump-infog
```

2. Verify resource limits:
```yaml
resources:
  requests:
    memory: "512Mi"
    cpu: "500m"
  limits:
    memory: "1Gi"
    cpu: "1000m"
```

### SSL certificate issues

**Problem**: HTTPS not working

**Solutions**:

1. Check certificate:
```bash
openssl s_client -connect api.trumpinfog.com:443
```

2. Update cert-manager:
```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.8.0/cert-manager.yaml
```

## Common Error Messages

### "Cannot read property of undefined"

**Cause**: Accessing nested properties that don't exist

**Solution**:
```typescript
// Use optional chaining
const value = data?.nested?.property ?? defaultValue;
```

### "Maximum call stack exceeded"

**Cause**: Infinite recursion or circular dependencies

**Solution**:
```typescript
// Add recursion limit
function recursive(data, depth = 0) {
  if (depth > 100) return;
  // ... rest of function
}
```

### "ECONNREFUSED"

**Cause**: Service not running or wrong port

**Solution**:
1. Check service is running
2. Verify correct host/port in config
3. Check firewall rules

## Getting Additional Help

If these solutions don't resolve your issue:

1. **Search existing issues**: [GitHub Issues](https://github.com/trump-infog/trump-infog/issues)
2. **Ask the community**: [Discord Server](https://discord.gg/trumpinfog)
3. **Contact support**: support@trumpinfog.com
4. **Emergency hotline**: For critical production issues, call +1-555-INFOG-911

When reporting issues, include:
- Error messages
- Steps to reproduce
- Environment details
- Relevant logs

---

Remember: Most issues have simple solutions. Stay calm and debug systematically! 🐛🔧