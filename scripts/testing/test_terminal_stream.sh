#!/bin/bash
# Test if terminal file watcher is sending output to WebSocket

FARM_ID="d4175b5c-32f7-42e9-81ba-aa5897eb8845"
SESSION_NAME="wild-d4175b5c"

echo "=== Testing Terminal Streaming for Farm $FARM_ID ==="
echo

echo "1. Checking terminal log files exist..."
ls -lh "var/maibarn/terminals/$FARM_ID/" 2>&1

echo
echo "2. Showing recent content from agent-0.log..."
tail -10 "var/maibarn/terminals/$FARM_ID/agent-0.log" 2>&1

echo
echo "3. Appending test message to trigger file watcher..."
echo "[TEST] Manual test message at $(date)" >> "var/maibarn/terminals/$FARM_ID/agent-0.log"

echo
echo "4. Checking if WebSocket server is running..."
ps aux | grep -E "(tsx|node)" | grep "apps/api" | grep -v grep

echo
echo "5. Testing file watcher directly..."
node -e "
const { terminalFileWatcherService } = require('./apps/api/src/services/terminalFileWatcherService');
console.log('Starting file watcher...');
terminalFileWatcherService.watchFarm('$FARM_ID', '$SESSION_NAME').then(() => {
  console.log('Watcher started successfully');
  setTimeout(() => {
    console.log('Watcher has been running for 2 seconds');
    process.exit(0);
  }, 2000);
}).catch(err => {
  console.error('Watcher error:', err);
  process.exit(1);
});
" 2>&1

echo
echo "=== Done ==="
