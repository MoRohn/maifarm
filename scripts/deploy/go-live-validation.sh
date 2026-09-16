#!/bin/bash

# MaiFarm Go-Live Validation Script v1.0
# Comprehensive test suite for production readiness

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# API base URL
API_URL="http://localhost:4567/api"
DASHBOARD_URL="http://localhost:3000"

# Function to print test results
print_test() {
    local test_name=$1
    local status=$2
    ((TESTS_TOTAL++))

    if [ "$status" = "PASS" ]; then
        echo -e "${GREEN}✅${NC} $test_name"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}❌${NC} $test_name"
        ((TESTS_FAILED++))
    fi
}

# Function to test endpoint
test_endpoint() {
    local endpoint=$1
    local expected_status=${2:-200}
    local test_name=${3:-"GET $endpoint"}

    response=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL$endpoint" || echo "000")

    if [ "$response" = "$expected_status" ]; then
        print_test "$test_name" "PASS"
        return 0
    else
        print_test "$test_name (got $response, expected $expected_status)" "FAIL"
        return 1
    fi
}

# Function to check if service is running
check_service() {
    local port=$1
    local service=$2

    if nc -z localhost "$port" 2>/dev/null; then
        print_test "$service running on port $port" "PASS"
        return 0
    else
        print_test "$service running on port $port" "FAIL"
        return 1
    fi
}

# Function to test database connectivity
test_database() {
    if PGPASSWORD=maifarm123 psql -U maifarm -d maifarm_dev -c "SELECT 1" > /dev/null 2>&1; then
        print_test "Database connectivity" "PASS"

        # Test critical tables
        tables=("farms" "agents" "harvests" "users" "api_keys" "tasks" "barn_items" "seeds")
        for table in "${tables[@]}"; do
            if PGPASSWORD=maifarm123 psql -U maifarm -d maifarm_dev -c "SELECT COUNT(*) FROM $table" > /dev/null 2>&1; then
                print_test "Table exists: $table" "PASS"
            else
                print_test "Table exists: $table" "FAIL"
            fi
        done
    else
        print_test "Database connectivity" "FAIL"
    fi
}

# Function to test WebSocket connectivity
test_websocket() {
    # Create a simple WebSocket test using node
    cat > /tmp/ws-test.js << 'EOF'
const io = require('socket.io-client');
const socket = io('http://localhost:4567', {
    transports: ['websocket'],
    reconnection: false,
    timeout: 5000
});

let connected = false;

socket.on('connect', () => {
    console.log('CONNECTED');
    connected = true;
    socket.disconnect();
    process.exit(0);
});

socket.on('connect_error', (error) => {
    console.log('FAILED');
    process.exit(1);
});

setTimeout(() => {
    if (!connected) {
        console.log('TIMEOUT');
        process.exit(1);
    }
}, 5000);
EOF

    if node /tmp/ws-test.js 2>/dev/null | grep -q "CONNECTED"; then
        print_test "WebSocket connectivity" "PASS"
    else
        print_test "WebSocket connectivity" "FAIL"
    fi
}

# Function to test farm creation flow
test_farm_creation() {
    # Create a test farm
    response=$(curl -s -X POST "$API_URL/farms" \
        -H "Content-Type: application/json" \
        -d '{"name":"Test Farm","agentCount":2,"mode":"standard","timeout":300}' \
        2>/dev/null || echo '{"error":"failed"}')

    if echo "$response" | grep -q '"farmId"'; then
        print_test "Farm creation" "PASS"

        # Extract farm ID for cleanup
        FARM_ID=$(echo "$response" | grep -o '"farmId":"[^"]*"' | cut -d'"' -f4)

        # Test farm status endpoint
        if test_endpoint "/farms/$FARM_ID" 200 "Farm status retrieval"; then
            # Cleanup - terminate farm
            curl -s -X POST "$API_URL/farms/$FARM_ID/terminate" > /dev/null 2>&1
        fi
    else
        print_test "Farm creation" "FAIL"
    fi
}

# Function to check TypeScript compilation
test_typescript() {
    if npm run typecheck > /dev/null 2>&1; then
        print_test "TypeScript compilation" "PASS"
    else
        print_test "TypeScript compilation" "FAIL"
    fi
}

# Function to test build process
test_build() {
    if npm run build > /dev/null 2>&1; then
        print_test "Production build" "PASS"
    else
        print_test "Production build" "FAIL"
    fi
}

# Function to test environment variables
test_environment() {
    required_vars=("PORT" "NODE_ENV" "DB_NAME" "DB_USER" "DB_PASSWORD" "AI_PROVIDER")

    for var in "${required_vars[@]}"; do
        if [ -n "${!var}" ]; then
            print_test "Environment variable: $var" "PASS"
        else
            print_test "Environment variable: $var" "FAIL"
        fi
    done
}

# Function to test security headers
test_security() {
    headers=$(curl -s -I "$API_URL/health" 2>/dev/null)

    # Check for security headers
    security_headers=("X-Content-Type-Options" "X-Frame-Options" "X-XSS-Protection")

    for header in "${security_headers[@]}"; do
        if echo "$headers" | grep -q "$header"; then
            print_test "Security header: $header" "PASS"
        else
            print_test "Security header: $header" "FAIL"
        fi
    done
}

# Function to test rate limiting
test_rate_limiting() {
    # Make multiple rapid requests
    for i in {1..5}; do
        curl -s "$API_URL/farms" > /dev/null 2>&1
    done

    # The 6th request should be rate limited
    response=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/farms" 2>/dev/null)

    if [ "$response" = "429" ]; then
        print_test "Rate limiting active" "PASS"
    else
        print_test "Rate limiting active" "FAIL"
    fi
}

# Main test execution
echo "================================================"
echo -e "${BLUE}🚀 MaiFarm Go-Live Validation Suite${NC}"
echo "================================================"
echo ""

echo -e "${YELLOW}📡 Testing Services...${NC}"
check_service 3000 "Frontend (Vite)"
check_service 4567 "Backend API"
check_service 5432 "PostgreSQL"
echo ""

echo -e "${YELLOW}🗄️ Testing Database...${NC}"
test_database
echo ""

echo -e "${YELLOW}🌐 Testing API Endpoints...${NC}"
test_endpoint "/health" 200 "Health check"
test_endpoint "/websocket-health" 200 "WebSocket health"
test_endpoint "/farms" 200 "Farms listing"
test_endpoint "/agents" 200 "Agents listing"
test_endpoint "/harvests" 200 "Harvests listing"
test_endpoint "/barn" 200 "Barn items"
test_endpoint "/seeds" 200 "Seeds listing"
test_endpoint "/metrics" 200 "Metrics endpoint"
echo ""

echo -e "${YELLOW}🔌 Testing WebSocket...${NC}"
test_websocket
echo ""

echo -e "${YELLOW}🏭 Testing Core Features...${NC}"
test_farm_creation
echo ""

echo -e "${YELLOW}🔒 Testing Security...${NC}"
test_security
test_rate_limiting
echo ""

echo -e "${YELLOW}🏗️ Testing Build Process...${NC}"
test_typescript
test_build
echo ""

echo -e "${YELLOW}🌍 Testing Environment...${NC}"
test_environment
echo ""

# Calculate percentage
PERCENTAGE=$(echo "scale=1; $TESTS_PASSED * 100 / $TESTS_TOTAL" | bc)

# Final report
echo "================================================"
echo -e "${BLUE}📊 TEST RESULTS SUMMARY${NC}"
echo "================================================"
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo -e "Total Tests: $TESTS_TOTAL"
echo -e "Success Rate: ${YELLOW}${PERCENTAGE}%${NC}"
echo ""

# Determine go-live status
if (( $(echo "$PERCENTAGE >= 95" | bc -l) )); then
    echo -e "${GREEN}✅ APPLICATION IS GO-LIVE READY!${NC}"
    exit 0
else
    echo -e "${RED}❌ APPLICATION NEEDS FIXES (${PERCENTAGE}% < 95%)${NC}"
    exit 1
fi