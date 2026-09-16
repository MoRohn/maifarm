#!/bin/bash

# Test CLI Theme System with User Profiles
# Tests theme persistence and API integration

echo "🎨 Testing MaiFarm CLI Theme System"
echo "=================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function
test_command() {
  local description="$1"
  local command="$2"
  local expected_pattern="$3"

  echo -n "Testing: $description... "

  if eval "$command" | grep -q "$expected_pattern"; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗ FAIL${NC}"
    ((TESTS_FAILED++))
  fi
}

# Test 1: List themes
echo "Test 1: List all themes"
test_command "Theme list command" \
  "node cli/dist/index.js theme list 2>&1" \
  "MaiFarm Themes"

# Test 2: Set theme to matrix
echo ""
echo "Test 2: Set theme to matrix"
test_command "Set matrix theme" \
  "node cli/dist/index.js theme set matrix 2>&1" \
  "Matrix theme activated"

# Test 3: Verify theme was saved locally
echo ""
echo "Test 3: Check local theme persistence"
test_command "Local config saved" \
  "cat ~/.maifarm/cli-theme.json" \
  "matrix"

# Test 4: Show current theme
echo ""
echo "Test 4: Show current theme"
test_command "Current theme command" \
  "node cli/dist/index.js theme current 2>&1" \
  "Currently using Matrix"

# Test 5: Change to cyberpunk theme
echo ""
echo "Test 5: Change to cyberpunk theme"
test_command "Set cyberpunk theme" \
  "node cli/dist/index.js theme set cyberpunk 2>&1" \
  "Cyberpunk 2077 theme activated"

# Test 6: Preview theme without changing
echo ""
echo "Test 6: Preview dracula theme"
test_command "Preview theme" \
  "node cli/dist/index.js theme preview dracula 2>&1" \
  "Dracula"

# Test 7: Reset to default
echo ""
echo "Test 7: Reset to default theme"
test_command "Reset theme" \
  "node cli/dist/index.js theme reset 2>&1" \
  "Forest Walk"

# Test 8: Agent messaging with themes
echo ""
echo "Test 8: Test agent message formatting"
cat > /tmp/test-agent-messaging.js << 'EOF'
const { getAgentMessenger } = await import('./cli/dist/utils/agentMessaging.js');

const messenger = getAgentMessenger('cyberpunk');

const agent = {
  id: 0,
  name: 'Bessie the Cow',
  status: 'active'
};

messenger.agentStarted(agent);
messenger.agentThinking(agent, 'Analyzing code structure...');
messenger.agentExecuting(agent, 'Running optimization pass');
messenger.agentCompleted(agent, 'Task completed successfully!');
EOF

test_command "Agent messaging" \
  "node --input-type=module /tmp/test-agent-messaging.js 2>&1" \
  "Bessie the Cow"

# API Integration Tests (if backend is running)
echo ""
echo "Test 9: API Integration (if backend running)"

if curl -s http://localhost:4567/api/health > /dev/null 2>&1; then
  echo -e "${GREEN}Backend is running${NC}"

  # Test setting theme via API
  echo -n "  - Setting theme via API... "
  RESPONSE=$(curl -s -X POST http://localhost:4567/api/user-preferences/cliTheme \
    -H "x-bypass-auth: cli-access" \
    -H "Content-Type: application/json" \
    -d '{"value":"quantum"}')

  if echo "$RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗ FAIL${NC}"
    ((TESTS_FAILED++))
  fi

  # Test getting theme from API
  echo -n "  - Getting theme from API... "
  RESPONSE=$(curl -s http://localhost:4567/api/user-preferences/cliTheme \
    -H "x-bypass-auth: cli-access")

  if echo "$RESPONSE" | grep -q '"value":"quantum"'; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗ FAIL${NC}"
    ((TESTS_FAILED++))
  fi
else
  echo -e "${YELLOW}Backend not running, skipping API tests${NC}"
fi

# Summary
echo ""
echo "=================================="
echo "Test Summary:"
echo "=================================="
echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}✗ Some tests failed${NC}"
  exit 1
fi
