#!/bin/bash

MAIFARM_ROOT="${MAIFARM_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
export MAIFARM_ROOT
# Ensure Backend Running Script
# Checks if MaiFarm backend is running and starts it if needed

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

MAIFARM_ROOT="${MAIFARM_ROOT}"
PORT=4567
HEALTH_ENDPOINT="http://localhost:$PORT/api/health"
MAX_WAIT=30  # seconds to wait for backend to start

echo -e "${YELLOW}🔍 Checking MaiFarm Backend...${NC}"

# Function to check if backend is responding
check_backend() {
  curl -sf "$HEALTH_ENDPOINT" > /dev/null 2>&1
  return $?
}

# Function to wait for backend to be ready
wait_for_backend() {
  local waited=0
  while [ $waited -lt $MAX_WAIT ]; do
    if check_backend; then
      return 0
    fi
    sleep 1
    ((waited++))
  done
  return 1
}

# Check if backend is already running
if check_backend; then
  echo -e "${GREEN}✅ Backend is running and healthy${NC}"

  # Get backend info
  BACKEND_INFO=$(curl -s "$HEALTH_ENDPOINT" | jq -r '"\(.status) - Uptime: \(.uptime // "N/A")"' 2>/dev/null || echo "Running")
  echo "   Status: $BACKEND_INFO"

  exit 0
fi

echo -e "${RED}❌ Backend not responding${NC}"

# Check if process exists but not responding
EXISTING_PID=$(lsof -ti :$PORT 2>/dev/null)
if [ -n "$EXISTING_PID" ]; then
  echo -e "${YELLOW}⚠️  Process exists on port $PORT (PID: $EXISTING_PID) but not responding${NC}"
  echo "   Killing stale process..."
  kill -9 $EXISTING_PID 2>/dev/null || true
  sleep 2
fi

# Start backend
echo -e "${YELLOW}🚀 Starting backend...${NC}"

cd "$MAIFARM_ROOT"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
  echo -e "${RED}❌ node_modules not found${NC}"
  echo "   Run: npm install"
  exit 1
fi

# Check if package.json has dev script
if ! grep -q '"dev":' package.json; then
  echo -e "${RED}❌ No dev script found in package.json${NC}"
  exit 1
fi

# Start backend in background
nohup npm run dev > /tmp/maifarm-backend.log 2>&1 &
BACKEND_PID=$!

echo "   Started with PID: $BACKEND_PID"
echo "   Logs: /tmp/maifarm-backend.log"

# Wait for backend to be ready
echo -e "${YELLOW}⏳ Waiting for backend to be ready...${NC}"

if wait_for_backend; then
  echo -e "${GREEN}✅ Backend started successfully!${NC}"
  echo "   Health check: $HEALTH_ENDPOINT"

  # Show initial log output
  echo ""
  echo "Recent logs:"
  tail -5 /tmp/maifarm-backend.log | sed 's/^/   /'

  exit 0
else
  echo -e "${RED}❌ Backend failed to start within ${MAX_WAIT}s${NC}"
  echo ""
  echo "Last 20 lines of logs:"
  tail -20 /tmp/maifarm-backend.log | sed 's/^/   /'

  exit 1
fi
