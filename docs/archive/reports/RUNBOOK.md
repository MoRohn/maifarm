# MaiFarm Orchestrator Runbook

## Quick Start

```bash
# Install dependencies
pip install -r requirements.txt

# Start with debug logging
DEBUG=1 uvicorn apps.orchestrator.main:app --host 0.0.0.0 --port 8000

# Check health
curl http://localhost:8000/healthz

# View debug state
curl http://localhost:8000/debug/state | jq
```

## Architecture Overview

MaiFarm orchestrates AI agent workflows with:
- **FastAPI** backend for HTTP/WebSocket APIs
- **Tmux/PTY** for agent terminal isolation
- **XenoSync** for lock-coordinated file operations
- **SQLite/PostgreSQL** for persistence
- **Structured logging** with trace IDs

## Configuration

Environment variables (`.env.development`):

```bash
# Core
ENVIRONMENT=development
LOG_LEVEL=INFO
DEBUG=1  # Enable debug logging to ./run/maifarm-debug.log

# Database
DATABASE_URL=sqlite:///./maifarm.db  # or postgresql://...

# Security
API_KEY=your-secret-key  # Required for POST/PUT/DELETE
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# Claude API
CLAUDE_API_KEY=sk-ant-...
CLAUDE_API_URL=https://api.anthropic.com/v1/messages

# Tmux
TMUX_BIN=/usr/bin/tmux  # Auto-falls back to PTY if not found

# XenoSync
XENOSYNC_LOCK_TIMEOUT=8.0
XENOSYNC_LEASE_SECONDS=30

# Performance
RUNENGINE_WORKER_COUNT=2
WEBSOCKET_MAX_CONNECTIONS=500
SSE_QUEUE_SIZE=256
```

## Operational Commands

### Health Checks

```bash
# Basic health
curl http://localhost:8000/healthz

# Debug state snapshot
curl http://localhost:8000/debug/state | jq '{
  ready: .debug_enabled,
  uptime: .uptime_seconds,
  ws_clients: .connections.websocket,
  queue_depth: .queue.depth,
  tmux_sessions: .tmux.sessions
}'
```

### Monitoring

```bash
# Prometheus metrics
curl http://localhost:8000/metrics

# WebSocket client count
curl -s http://localhost:8000/debug/state | jq '.connections.websocket'

# Queue depth
curl -s http://localhost:8000/debug/state | jq '.queue.depth'

# Recent lifecycle events
curl -s http://localhost:8000/debug/state | jq '.recent_events[-5:]'
```

### Debugging

When `DEBUG=1`:
- All logs go to `./run/maifarm-debug.log`
- Trace IDs correlate requests
- Lifecycle events track: server startup, WS connect/close, queue push/pop, Claude start/end

```bash
# Tail debug log
tail -f run/maifarm-debug.log | jq

# Search for errors
grep -i "error\|exception" run/maifarm-debug.log | tail -40

# Find lifecycle events
grep "lifecycle_event" run/maifarm-debug.log | jq -r '[.timestamp, .event_type, .component] | @tsv'
```

## Common Issues

### WebSocket Drops

**Symptom**: Clients disconnect, `dropped_count` in logs
**Cause**: Slow clients, network issues
**Fix**: Messages dropped after 128 queued + 1s timeout (configurable via `WS_SEND_QUEUE_SIZE`)

### Claude API Timeouts

**Symptom**: `ReadTimeout` errors after 120s
**Cause**: Long-running agent operations
**Fix**: Auto-retries 3x with exponential backoff (1s → 2s → 4s)

### Tmux Not Found

**Symptom**: `tmux_not_found_using_pty_fallback` in logs
**Cause**: Tmux binary not in PATH
**Fix**: Auto-falls back to PTY mode (no action needed)

### Lock Contention

**Symptom**: `xenosync_lock_timeout` errors
**Cause**: Multiple agents accessing same file
**Fix**: Leases auto-renew every 15s (configurable via `XENOSYNC_LEASE_SECONDS`)

### Server Not Ready

**Symptom**: HTTP 503 responses
**Cause**: Startup sequence incomplete
**Fix**: Wait for `server_ready` in logs; readiness gate clears after DB/tmux/queue init

## Performance Tuning

### WebSocket Backpressure

```python
# apps/orchestrator/ws/hub.py
WS_SEND_QUEUE_SIZE = 128  # Increase for slower clients
WS_SEND_TIMEOUT = 1.0     # Increase drop threshold
```

### Worker Concurrency

```bash
# Increase queue workers for higher throughput
RUNENGINE_WORKER_COUNT=4
```

### Claude Timeouts

```python
# apps/orchestrator/agents/runner.py
timeout = httpx.Timeout(
    read=120.0,  # Increase for very long operations
    connect=10.0,
)
```

## Security

### API Key Protection

POST/PUT/DELETE require API key:
```bash
# Via header
curl -H "X-API-Key: your-secret-key" -X POST http://localhost:8000/agents/run

# Via Authorization
curl -H "Authorization: Bearer your-secret-key" -X POST http://localhost:8000/agents/run
```

### CORS Configuration

Strict origin validation:
```bash
ALLOWED_ORIGINS=https://app.example.com,https://dashboard.example.com
```

### Metrics Access

`/metrics` endpoint is public but can be gated:
```python
# Add to SecurityMiddleware for production
if request.url.path == "/metrics" and not is_internal_ip(request.client.host):
    return Response("Forbidden", status_code=403)
```

## Load Testing

```bash
# 100 concurrent clients, 30 req/s, 60s duration
python scripts/load_test.py --clients 100 --rate 30 --seconds 60

# Expected: p95 ≤1.2s, drops ≤0.5%, success ≥99%
```

## Deployment

### Production Checklist

- [ ] Set `ENVIRONMENT=production`
- [ ] Configure `API_KEY` (generate via `openssl rand -hex 32`)
- [ ] Use PostgreSQL for `DATABASE_URL`
- [ ] Set strict `ALLOWED_ORIGINS`
- [ ] Enable HTTPS/TLS termination (nginx/cloudflare)
- [ ] Configure log aggregation for `./run/maifarm-debug.log`
- [ ] Set up Prometheus scraping for `/metrics`
- [ ] Pin dependencies: `pip freeze > requirements-lock.txt`

### Docker (Optional)

```bash
docker build -t maifarm-orchestrator .
docker run -p 8000:8000 --env-file .env.production maifarm-orchestrator
```

## Support

- Debug logs: `./run/maifarm-debug.log` (when `DEBUG=1`)
- State snapshot: `GET /debug/state`
- Health: `GET /healthz`
- Metrics: `GET /metrics`
