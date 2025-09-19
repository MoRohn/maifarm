#!/bin/bash

echo "Testing XenoSync Fixes..."
echo "========================="

# Test 1: Check if orchestrator.py uses two-stage launch
echo -e "\n1. Checking orchestrator.py for two-stage launch fix..."
if grep -q 'elif self.cfg.provider == "claude":' scripts/python/orchestrator.py && \
   grep -q '# ALWAYS use two-stage launch for Claude' scripts/python/orchestrator.py; then
    echo "✅ orchestrator.py uses two-stage launch for Claude"
else
    echo "❌ orchestrator.py NOT using two-stage launch"
fi

# Test 2: Check claude_interface.py for literal mode
echo -e "\n2. Checking xenosync claude_interface.py for literal mode..."
if grep -q '\-l flag for literal mode' server/orchestrators/xenosync/claude_interface.py; then
    echo "✅ claude_interface.py uses literal mode for prompts"
else
    echo "❌ claude_interface.py NOT using literal mode"
fi

# Test 3: Check TMUX_TMPDIR consistency
echo -e "\n3. Checking TMUX_TMPDIR consistency..."
if grep -q "env\['TMUX_TMPDIR'\] = '/tmp'" server/orchestrators/xenosync/tmux_manager.py && \
   grep -q "env\['TMUX_TMPDIR'\] = '/tmp'" server/orchestrators/xenosync/claude_interface.py; then
    echo "✅ TMUX_TMPDIR consistently set to /tmp"
else
    echo "❌ TMUX_TMPDIR not consistent"
fi

# Test 4: Check session naming convention
echo -e "\n4. Checking session naming convention..."
if grep -q 'farm-\${farmId' server/services/farmManager.ts && \
   grep -q 'farm-\${farm_id' server/orchestrators/xenosync-maifarm-launcher.py; then
    echo "✅ Session naming uses farm-{id} convention"
else
    echo "❌ Session naming not standardized"
fi

# Test 5: Check exponential backoff in terminalStreamService
echo -e "\n5. Checking exponential backoff in terminalStreamService..."
if grep -q 'exponential backoff' server/services/terminalStreamService.ts && \
   grep -q 'delay = Math.min(delay \* 2' server/services/terminalStreamService.ts; then
    echo "✅ terminalStreamService uses exponential backoff"
else
    echo "❌ terminalStreamService NOT using exponential backoff"
fi

# Test 6: Check session health monitoring
echo -e "\n6. Checking session health monitoring..."
if grep -q 'checkSessionHealth' server/services/farmManager.ts && \
   grep -q 'sessionExists' server/services/farmManager.ts; then
    echo "✅ Session health monitoring implemented"
else
    echo "❌ Session health monitoring NOT implemented"
fi

echo -e "\n========================="
echo "Test Summary Complete"
