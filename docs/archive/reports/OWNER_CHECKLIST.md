# MaiFarm v1.0.0 Owner Checklist

## Pre-Release Verification

### ✅ Code Quality
- [x] All tests passing (`pytest -q`)
- [x] Linting clean (`ruff check .`)
- [x] Type checking passes (`mypy apps/orchestrator/`)
- [x] No TODOs or placeholders in production code
- [x] Dependencies pinned in `requirements.txt`

### ✅ Functionality
- [x] Server startup sequence completes successfully
- [x] Health endpoints responding (`/healthz`, `/health`)
- [x] Debug state endpoint functional (`/debug/state`)
- [x] WebSocket connections stable under load
- [x] Agent execution with retry logic working
- [x] Tmux/PTY fallback mechanism tested
- [x] XenoSync lock leases renewing

### ✅ Security
- [x] API key authentication on write operations
- [x] CORS configured with strict origins
- [x] No secrets in logs or debug output
- [x] Timing-safe comparison for credentials
- [x] Metrics endpoint access controlled

### ✅ Performance
- [x] Load test: 100 clients @ 30 req/s for 60s
  - Success rate: ≥99%
  - p95 latency: ≤1.2s
  - WS drops: ≤0.5%
- [x] Backpressure mechanism preventing memory growth
- [x] Queue depth monitoring in place
- [x] Timeout handling with retries

### ✅ Observability
- [x] Debug logging to `./run/maifarm-debug.log` when `DEBUG=1`
- [x] Trace IDs for request correlation
- [x] Lifecycle events logged at key points
- [x] Prometheus metrics exposed
- [x] Error tracking with context

### ✅ Documentation
- [x] RUNBOOK.md complete with ops procedures
- [x] CHANGELOG.md documenting all changes
- [x] OWNER_CHECKLIST.md (this file)
- [x] README.md updated with latest features
- [x] API documentation current

### ✅ Deployment Ready
- [x] Environment variables documented
- [x] Production configuration example provided
- [x] Database migration strategy defined
- [x] Docker support (optional)
- [x] Rollback procedure documented

## Production Deployment Steps

### 1. Environment Setup
```bash
# Copy and configure production environment
cp .env.example .env.production

# Required variables:
ENVIRONMENT=production
API_KEY=$(openssl rand -hex 32)  # Generate secure key
DATABASE_URL=postgresql://user:pass@host/db  # Production DB
ALLOWED_ORIGINS=https://your-app.com
CLAUDE_API_KEY=sk-ant-...
```

### 2. Dependency Installation
```bash
# Install from pinned requirements
pip install -r requirements.txt

# Verify versions
pip freeze | grep -E "(fastapi|httpx|structlog|portalocker)"
```

### 3. Database Preparation
```bash
# Auto-migration on startup, or manual:
# No manual steps needed - migrations run automatically
```

### 4. Pre-Flight Checks
```bash
# Test configuration
python -c "from apps.orchestrator.settings import load_settings; print(load_settings())"

# Verify database connection
python -c "from apps.orchestrator.db.session import create_session_factory; import asyncio; asyncio.run(create_session_factory('$DATABASE_URL').init_models())"

# Check API key set
test -n "$API_KEY" && echo "API key configured" || echo "WARNING: No API key set"
```

### 5. Service Startup
```bash
# Production mode
uvicorn apps.orchestrator.main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --workers 4 \
  --log-level info

# Or with process manager
pm2 start ecosystem.config.js --env production
```

### 6. Health Verification
```bash
# Wait for readiness
while ! curl -sf http://localhost:8000/healthz; do sleep 1; done

# Check debug state
curl -s http://localhost:8000/debug/state | jq '{ready, uptime_seconds, connections, queue}'

# Verify metrics
curl -s http://localhost:8000/metrics | grep maifarm_
```

### 7. Smoke Tests
```bash
# Test API with key
curl -H "X-API-Key: $API_KEY" \
  -X POST http://localhost:8000/agents/run \
  -H "Content-Type: application/json" \
  -d '{"session_id":"smoke-test","prompt":"Hello"}'

# WebSocket connection
# (Use wscat or browser DevTools)
```

### 8. Load Verification
```bash
# Run load test
python scripts/load_test.py --clients 50 --rate 20 --seconds 30

# Expected results:
# - Success rate ≥99%
# - p95 latency ≤1.2s
# - No dropped messages
```

### 9. Monitoring Setup
```bash
# Prometheus scraping
# Add to prometheus.yml:
scrape_configs:
  - job_name: 'maifarm'
    static_configs:
      - targets: ['localhost:8000']
    metrics_path: '/metrics'

# Log aggregation
# Point to ./run/maifarm-debug.log when DEBUG=1
```

### 10. Rollback Plan
```bash
# If issues arise:
# 1. Stop new service
pm2 stop maifarm

# 2. Start previous version
pm2 start maifarm-backup

# 3. Verify health
curl http://localhost:8000/healthz

# 4. Monitor logs for errors
tail -f run/maifarm-debug.log
```

## Post-Deployment Validation

### Hour 1: Immediate Checks
- [ ] Health endpoint green
- [ ] No startup errors in logs
- [ ] WebSocket clients connecting
- [ ] Agent runs completing successfully
- [ ] No security alerts

### Day 1: Operational Metrics
- [ ] Error rate <0.1%
- [ ] p95 latency <1.2s
- [ ] Memory usage stable
- [ ] No lock timeouts
- [ ] Queue depth normal

### Week 1: Performance Trends
- [ ] No memory leaks detected
- [ ] Response times consistent
- [ ] WebSocket stability >99.9%
- [ ] No unusual error patterns
- [ ] Resource usage within limits

## Rollback Triggers

Immediately rollback if:
- Error rate >5%
- p95 latency >3s
- Memory growth >10% per hour
- Critical security vulnerability
- Data corruption detected

## Support Contacts

- **On-Call**: [Your team contact]
- **Escalation**: [Engineering lead]
- **Security**: [Security team]

## Sign-Off

- [ ] Engineering Lead: _______________ Date: _______
- [ ] DevOps: _______________ Date: _______
- [ ] Security: _______________ Date: _______
- [ ] Product Owner: _______________ Date: _______

## Release Notes (v1.0.0)

**Key Features:**
- Production-grade reliability with retry logic and backpressure
- Comprehensive observability with debug tracing and metrics
- Security hardening with API key auth and strict CORS
- Performance validated at 100 clients @ 30 req/s

**Breaking Changes:**
- None (initial release)

**Migration:**
- New install only, no migration needed

**Known Limitations:**
- Single-node deployment (clustering not yet implemented)
- SQLite recommended for <1000 req/day, PostgreSQL for production scale
