#!/bin/bash
# Start the integrated system: Python orchestrator + Node.js API

set -e

echo "==================================="
echo "MaiFarm Integrated System Startup"
echo "==================================="
echo

# Set working directory
cd "$(dirname "$0")/../.."
MAIFARM_ROOT="$(pwd)"

echo "Working directory: $MAIFARM_ROOT"
echo

# Check dependencies
echo "Checking dependencies..."

if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found"
    exit 1
fi

echo "✓ Python 3 found: $(python3 --version)"
echo "✓ Node.js found: $(node --version)"
echo

# Set environment variables
export TMUX_TMPDIR=/tmp
export LANG=C.UTF-8
export LC_ALL=C.UTF-8
export PYTHONUTF8=1
export PYTHON_ORCHESTRATOR_URL="http://127.0.0.1:8000"
export PYTHON_ORCHESTRATOR_WS_URL="http://127.0.0.1:8000"
export NODE_ENV="${NODE_ENV:-development}"

# Check if ports are available
echo "Checking ports..."

if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "⚠️  Port 8000 (Python orchestrator) is already in use"
    echo "   Killing existing process..."
    lsof -ti:8000 | xargs kill -9 2>/dev/null || true
    sleep 1
fi

if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "⚠️  Port 3000 (Vite frontend) is already in use"
fi

echo "✓ Ports available"
echo

# Create log directory
mkdir -p "$MAIFARM_ROOT/run"
LOG_DIR="$MAIFARM_ROOT/run"

echo "Logs will be written to: $LOG_DIR"
echo

# Start Python orchestrator
echo "Starting Python FastAPI orchestrator on port 8000..."
cd "$MAIFARM_ROOT/apps/orchestrator"

python3 -m uvicorn main:app \
    --host 127.0.0.1 \
    --port 8000 \
    --log-level info \
    > "$LOG_DIR/python-orchestrator.log" 2>&1 &

PYTHON_PID=$!
echo "✓ Python orchestrator started (PID: $PYTHON_PID)"

# Wait for Python orchestrator to be ready
echo "Waiting for Python orchestrator to start..."
for i in {1..30}; do
    if curl -s http://127.0.0.1:8000/healthz > /dev/null 2>&1; then
        echo "✓ Python orchestrator is ready"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ Python orchestrator failed to start in 30 seconds"
        echo "Check logs: tail $LOG_DIR/python-orchestrator.log"
        kill $PYTHON_PID 2>/dev/null || true
        exit 1
    fi
    sleep 1
    echo -n "."
done
echo

# Start Node.js API
echo "Starting Node.js API and Vite frontend..."
cd "$MAIFARM_ROOT"

npm run start > "$LOG_DIR/nodejs-api.log" 2>&1 &
NODEJS_PID=$!
echo "✓ Node.js API started (PID: $NODEJS_PID)"

# Create PID file for cleanup
echo "$PYTHON_PID" > "$LOG_DIR/python.pid"
echo "$NODEJS_PID" > "$LOG_DIR/nodejs.pid"

echo
echo "==================================="
echo "✓ System started successfully"
echo "==================================="
echo
echo "Services:"
echo "  - Python Orchestrator:  http://127.0.0.1:8000"
echo "  - Python Orchestrator:  http://127.0.0.1:8000/docs (API docs)"
echo "  - Node.js API:          http://localhost:3000 (proxied)"
echo "  - Frontend:             http://localhost:3000"
echo
echo "Logs:"
echo "  - Python:  tail -f $LOG_DIR/python-orchestrator.log"
echo "  - Node.js: tail -f $LOG_DIR/nodejs-api.log"
echo
echo "To stop all services:"
echo "  ./scripts/stop-integrated-system.sh"
echo
echo "Press Ctrl+C to stop (or run stop script)"
echo

# Wait for processes
wait
