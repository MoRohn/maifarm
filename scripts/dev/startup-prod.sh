#!/bin/bash

# Kill any existing processes
echo "Stopping any existing processes..."
pkill -f "tsx.*apps/api/src/index.ts" || true
pkill -f "vite" || true
sleep 2

# Start the server
echo "Starting MaiFarm server on port 4567..."
NODE_ENV=production BYPASS_AUTH=true PORT=4567 npx tsx apps/api/src/index.ts &
SERVER_PID=$!

# Wait for server to be ready
echo "Waiting for server to start..."
for i in {1..30}; do
  if curl -s http://localhost:4567/api/health > /dev/null 2>&1; then
    echo "Server is ready!"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "Server failed to start in time"
    exit 1
  fi
  sleep 1
done

# Start the client
echo "Starting Vite development server on port 3000..."
npx vite --config apps/dashboard/vite.config.ts &
CLIENT_PID=$!

echo ""
echo "✨ MaiFarm is running!"
echo "   Client: http://localhost:3000"
echo "   Server: http://localhost:4567"
echo ""
echo "Press Ctrl+C to stop both servers"

# Function to handle cleanup
cleanup() {
  echo ""
  echo "Stopping servers..."
  kill $SERVER_PID 2>/dev/null || true
  kill $CLIENT_PID 2>/dev/null || true
  pkill -f "tsx.*apps/api/src/index.ts" || true
  pkill -f "vite" || true
  echo "Servers stopped."
  exit 0
}

# Set up trap to handle Ctrl+C
trap cleanup INT TERM

# Wait for either process to exit
wait $SERVER_PID $CLIENT_PID
