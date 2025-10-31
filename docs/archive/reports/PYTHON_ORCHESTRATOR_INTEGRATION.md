# Python Orchestrator Integration Guide

This document explains the integration between the Node.js API and the new high-quality Python FastAPI orchestrator.

## Architecture Overview

The system now consists of two coordinated servers:

1. **Python FastAPI Orchestrator** (Port 8000)
   - XenoSync file coordination with merge strategies
   - AgentSupervisor for tracking active agents
   - TmuxBridge for terminal output capture
   - WebSocket hub for real-time events

2. **Node.js API Server** (Port 4567)
   - Existing frontend API and database
   - Proxies agent operations to Python orchestrator
   - Bridges WebSocket events from Python to frontend clients

## System Components

### Python Orchestrator (apps/orchestrator/)

**Key Services:**
- `xenosync/xenosync.py` - File coordination with atomic writes, CAS storage, advisory locks
- `xenosync/merge.py` - 3-way text merge, JSON merge, binary last-writer-wins
- `agents/supervisor.py` - Tracks active agents, phases, token usage, idle detection
- `agents/manager.py` - Agent lifecycle management integrated with supervisor
- `tmux/bridge.py` - Terminal output cleaning, rate limiting, WebSocket streaming
- `ws/hub.py` - WebSocket event hub with backpressure handling

**API Endpoints:**
- `POST /agents/run` - Start agent with streaming deltas
- `POST /agents/cancel/{run_id}` - Cancel running agent
- `GET /agents/runs/{run_id}` - Get agent status
- `GET /monitor/active` - List all active agents
- `GET /xenosync/debug` - XenoSync lock/file state
- `GET /healthz` - Health check
- `GET /docs` - FastAPI interactive docs

**WebSocket Events:**
- `harvest_event` - Generic event with session/agent/pane context
- `term_line` - Terminal output line
- `agent_event` - Agent phase change, content delta
- `status` - Agent status update

### Node.js Integration Layer (apps/api/src/)

**Proxy Service:**
- `services/pythonOrchestratorProxy.ts` - HTTP client to Python orchestrator
  - `runAgent()` - Start agent via Python
  - `cancelRun()` - Cancel agent run
  - `getActiveAgents()` - Get active agents from Python
  - `getRunStatus()` - Get run status
  - Auto-checks availability, reconnects on failure

**WebSocket Bridge:**
- `services/pythonWebSocketBridge.ts` - Socket.io client to Python WebSocket
  - Connects to Python orchestrator's Socket.io server
  - Forwards events from Python to Node.js WebSocket rooms
  - Handles: `harvest_event`, `term_line`, `agent_event`, `status`
  - Auto-reconnection with exponential backoff

**API Routes:**
- `routes/orchestratorProxy.ts` - Express routes exposing Python orchestrator
  - `GET /api/python-orchestrator/status` - Check orchestrator availability
  - `GET /api/python-orchestrator/active` - Get active agents
  - `POST /api/python-orchestrator/run` - Run agent
  - `POST /api/python-orchestrator/cancel/:runId` - Cancel run
  - `GET /api/python-orchestrator/runs/:runId` - Get run status

**Test Routes:**
- `routes/testPythonOrchestrator.ts` - Test endpoints for integration
  - `POST /api/test/python-farm` - Create test farm via Python orchestrator
  - `GET /api/test/python-status` - Check integration status

## Starting the Integrated System

### Option 1: Integrated Startup Script (Recommended)

```bash
./scripts/start-integrated-system.sh
```

This script:
1. Checks Python 3 and Node.js are installed
2. Kills any conflicting processes on ports 8000 and 3000
3. Starts Python orchestrator on port 8000
4. Waits for Python orchestrator to be ready (health check)
5. Starts Node.js API and Vite frontend
6. Creates PID files for cleanup

Logs:
- Python: `run/python-orchestrator.log`
- Node.js: `run/nodejs-api.log`

To stop:
```bash
./scripts/stop-integrated-system.sh
```

### Option 2: Manual Startup

**Terminal 1 - Python Orchestrator:**
```bash
cd apps/orchestrator
./start_orchestrator.sh
```

**Terminal 2 - Node.js API:**
```bash
NODE_ENV=development npm run dev:server
```

**Terminal 3 - Frontend:**
```bash
npm run dev:client
```

## Testing the Integration

### 1. Check System Status

```bash
# Check Python orchestrator health
curl http://127.0.0.1:8000/healthz

# Check Node.js integration status
curl http://localhost:4567/api/test/python-status
```

Expected response:
```json
{
  "success": true,
  "data": {
    "orchestratorAvailable": true,
    "orchestratorUrl": "http://127.0.0.1:8000",
    "websocketConnected": true,
    "websocketUrl": "http://127.0.0.1:8000",
    "activeAgents": 0,
    "agents": []
  }
}
```

### 2. View FastAPI Documentation

Open in browser:
```
http://127.0.0.1:8000/docs
```

Interactive Swagger UI shows all Python orchestrator endpoints with request/response schemas.

### 3. Create Test Farm

```bash
curl -X POST http://localhost:4567/api/test/python-farm \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Write a simple Python script that prints hello world",
    "agentCount": 2
  }'
```

Expected response:
```json
{
  "success": true,
  "data": {
    "farmId": "test-farm-1234567890",
    "sessionId": "test-abcd1234",
    "agents": [
      {
        "agentId": "agent-0",
        "runId": "uuid-here",
        "status": "queued"
      },
      {
        "agentId": "agent-1",
        "runId": "uuid-here",
        "status": "queued"
      }
    ],
    "orchestratorUrl": "http://127.0.0.1:8000",
    "websocketConnected": true,
    "instructions": {
      "viewActiveAgents": "GET /api/python-orchestrator/active",
      "viewFastAPIDocs": "http://127.0.0.1:8000/docs",
      "monitorInFrontend": "Join WebSocket room 'farm-test-abcd1234' to see terminal output"
    }
  }
}
```

### 4. Monitor Active Agents

```bash
# Via Node.js proxy
curl http://localhost:4567/api/python-orchestrator/active

# Direct to Python orchestrator
curl http://127.0.0.1:8000/monitor/active
```

Expected response:
```json
{
  "success": true,
  "active_agents": [
    {
      "run_id": "uuid-here",
      "agent_id": "agent-0",
      "session_id": "test-abcd1234",
      "phase": "running",
      "pane_id": "farm-test-abcd1234:agents.0",
      "tokens_in": 1500,
      "tokens_out": 250,
      "started_at": "2025-10-05T12:00:00Z",
      "last_delta_ts": "2025-10-05T12:00:05Z",
      "idle_seconds": 2.5
    }
  ],
  "count": 2
}
```

### 5. View Terminal Output in Frontend

In the MaiFarm dashboard:

1. WebSocket will auto-connect to Node.js server
2. Node.js WebSocket bridge forwards Python events
3. Terminal output appears in real-time
4. Join room: `farm-<sessionId>` to receive events

WebSocket events received:
- `terminal:output` - Terminal output from agents
- `agent:event` - Agent phase changes, content deltas
- `agent:status` - Agent status updates

### 6. Check XenoSync State

```bash
curl http://127.0.0.1:8000/xenosync/debug
```

Expected response:
```json
{
  "locks_held": 0,
  "active_files": [],
  "cas_objects": 15,
  "debug_info": {
    "locks": {},
    "file_claims": {}
  }
}
```

## WebSocket Flow

```
Frontend Client
    ↓ (socket.io)
Node.js API Server (port 4567)
    ↑ (WebSocket bridge forwards events)
Python Orchestrator (port 8000)
    ↑ (WebSocket hub emits events)
TmuxBridge / AgentSupervisor
    ↑ (terminal output / agent lifecycle)
Claude Code Agents in tmux
```

**Event Flow:**
1. Python TmuxBridge captures terminal output from tmux panes
2. Python WebSocket hub emits `term_line` events to subscribed clients
3. Node.js pythonWebSocketBridge receives events as Socket.io client
4. Node.js forwards events to room `farm-<sessionId>`
5. Frontend clients in that room receive terminal output

## Environment Variables

**.env.development:**
```bash
# Python Orchestrator URLs
PYTHON_ORCHESTRATOR_URL=http://127.0.0.1:8000
PYTHON_ORCHESTRATOR_WS_URL=http://127.0.0.1:8000

# Node.js API
PORT=4567
NODE_ENV=development

# Frontend
VITE_API_URL=http://localhost:4567

# Tmux
TMUX_TMPDIR=/tmp
```

## Troubleshooting

### Python orchestrator not available

**Symptoms:** `curl http://127.0.0.1:8000/healthz` fails

**Solutions:**
1. Check if Python orchestrator is running: `lsof -i :8000`
2. View logs: `tail -f run/python-orchestrator.log`
3. Start manually: `cd apps/orchestrator && ./start_orchestrator.sh`
4. Check Python dependencies: `pip install -r apps/orchestrator/requirements.txt`

### WebSocket bridge not connecting

**Symptoms:** `websocketConnected: false` in status endpoint

**Solutions:**
1. Check Python orchestrator is running first
2. Verify Socket.io path matches: `/socket.io` on port 8000
3. Check Node.js logs for connection errors
4. Restart Node.js server to retry connection

### No terminal output

**Symptoms:** Agents running but no output in frontend

**Solutions:**
1. Check WebSocket room joining: Frontend must join `farm-<sessionId>`
2. Verify Python WebSocket bridge is connected
3. Check tmux sessions exist: `TMUX_TMPDIR=/tmp tmux list-sessions`
4. Check terminal log files: `ls -la var/maibarn/terminals/<farm-id>/`
5. Test with `curl http://127.0.0.1:8000/monitor/active` - should show agents

### Agents not showing as active

**Symptoms:** Active agents endpoint returns empty array

**Solutions:**
1. Check AgentSupervisor is running: View `/healthz` endpoint
2. Verify agents were launched via `/agents/run` endpoint
3. Check agent manager wired to supervisor in main.py
4. View logs: Supervisor logs idle agents every 10s

## Code Quality

All Python code follows:
- **Ruff** linting (no f-strings without placeholders)
- **MyPy** strict type checking
- **pytest** for unit and integration tests

Run tests:
```bash
cd apps/orchestrator
python -m pytest tests/
```

Test coverage:
- XenoSync: Lock contention, atomic writes, CAS, merge strategies (13 tests)
- AgentSupervisor: Lifecycle tracking, idle detection (2 integration tests)
- Total: 15 tests passing

## Production Deployment

For production:

1. Use environment-specific settings:
   ```bash
   export MAIFARM_ENV=production
   export MAIFARM_HOST=0.0.0.0
   export MAIFARM_PORT=8000
   ```

2. Use proper process manager:
   ```bash
   # Python orchestrator with PM2
   pm2 start apps/orchestrator/main.py --interpreter python3 --name maifarm-orchestrator

   # Or with systemd service
   sudo systemctl start maifarm-orchestrator
   ```

3. Configure reverse proxy (nginx/caddy) for both servers

4. Enable metrics collection:
   ```bash
   curl http://127.0.0.1:8000/metrics  # Prometheus format
   ```

## Next Steps

1. **Full Integration:** Modify `UnifiedFarmLaunchOrchestrator.ts` to use Python orchestrator instead of old `scripts/python/orchestrator.py`
2. **Database Sync:** Share agent status between Python (supervisor) and Node.js (PostgreSQL)
3. **Authentication:** Add API key validation for Python orchestrator endpoints
4. **Monitoring:** Set up Grafana dashboards for XenoSync and AgentSupervisor metrics
5. **Migration:** Gradually migrate all farm launches to use Python orchestrator

## References

- Python Orchestrator Code: `apps/orchestrator/`
- Node.js Integration: `apps/api/src/services/python*.ts`
- API Routes: `apps/api/src/routes/orchestratorProxy.ts`
- Test Routes: `apps/api/src/routes/testPythonOrchestrator.ts`
- Startup Script: `scripts/start-integrated-system.sh`
