#!/bin/bash

MAIFARM_ROOT="${MAIFARM_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
export MAIFARM_ROOT

# test-passwordless-flow.sh
# Comprehensive manual testing script for passwordless registration and email verification

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_BASE="${API_BASE:-http://localhost:4567/api}"
TEST_EMAIL="test-$(date +%s)@passwordless.test"
SERVER_PID=""
PASS_COUNT=0
FAIL_COUNT=0

# Utility functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓ PASS]${NC} $1"
    ((PASS_COUNT++))
}

log_error() {
    echo -e "${RED}[✗ FAIL]${NC} $1"
    ((FAIL_COUNT++))
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Cleanup function
cleanup() {
    log_info "Cleaning up..."

    # Kill server if we started it
    if [ ! -z "$SERVER_PID" ]; then
        log_info "Stopping test server (PID: $SERVER_PID)"
        kill $SERVER_PID 2>/dev/null || true
        wait $SERVER_PID 2>/dev/null || true
    fi

    # Clean up test users from database
    if command -v psql &> /dev/null; then
        log_info "Cleaning up test users from database"
        PGPASSWORD=maifarm123 psql -U maifarm -d maifarm_dev -c \
            "DELETE FROM users WHERE email LIKE '%@passwordless.test'" 2>/dev/null || true
    fi

    log_info "Cleanup complete"
}

# Set trap to cleanup on exit
trap cleanup EXIT INT TERM

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check if curl is available
    if ! command -v curl &> /dev/null; then
        log_error "curl is required but not installed"
        exit 1
    fi

    # Check if jq is available
    if ! command -v jq &> /dev/null; then
        log_warn "jq is not installed - JSON output will be raw"
        JQ_CMD="cat"
    else
        JQ_CMD="jq"
    fi

    # Check if server is running
    if curl -s -f "$API_BASE/health" > /dev/null 2>&1; then
        log_success "Server is already running at $API_BASE"
    else
        log_warn "Server not running, attempting to start..."
        start_server
    fi
}

start_server() {
    log_info "Starting MaiFarm server..."
    cd ${MAIFARM_ROOT}
    PORT=4567 NODE_ENV=development npm run start > /tmp/maifarm-test-server.log 2>&1 &
    SERVER_PID=$!

    log_info "Waiting for server to start (PID: $SERVER_PID)..."
    for i in {1..30}; do
        if curl -s -f "$API_BASE/health" > /dev/null 2>&1; then
            log_success "Server started successfully"
            return 0
        fi
        echo -n "."
        sleep 1
    done

    log_error "Server failed to start within 30 seconds"
    cat /tmp/maifarm-test-server.log
    exit 1
}

# Test functions
test_passwordless_registration() {
    log_info "Test 1: Passwordless user registration"

    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/auth/register" \
        -H "Content-Type: application/json" \
        -d '{
            "email": "'"$TEST_EMAIL"'",
            "name": "Passwordless Test User",
            "authMode": "passwordless"
        }')

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    if [ "$HTTP_CODE" == "201" ]; then
        if echo "$BODY" | $JQ_CMD -e '.success' > /dev/null 2>&1; then
            if echo "$BODY" | $JQ_CMD -e '.requiresVerification' | grep -q true; then
                log_success "Passwordless registration successful (requires verification)"

                # Extract user ID and verification message
                USER_ID=$(echo "$BODY" | $JQ_CMD -r '.user.id')
                MESSAGE=$(echo "$BODY" | $JQ_CMD -r '.message')
                log_info "User ID: $USER_ID"
                log_info "Message: $MESSAGE"
            else
                log_error "Registration succeeded but requiresVerification is not true"
            fi
        else
            log_error "Registration response missing 'success' field"
        fi
    else
        log_error "Expected HTTP 201, got $HTTP_CODE"
        echo "$BODY" | $JQ_CMD '.' 2>/dev/null || echo "$BODY"
    fi
}

test_duplicate_email() {
    log_info "Test 2: Duplicate email registration (should fail with EMAIL_EXISTS)"

    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/auth/register" \
        -H "Content-Type: application/json" \
        -d '{
            "email": "'"$TEST_EMAIL"'",
            "name": "Duplicate User",
            "authMode": "passwordless"
        }')

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    if [ "$HTTP_CODE" == "409" ]; then
        ERROR_CODE=$(echo "$BODY" | $JQ_CMD -r '.code')
        if [ "$ERROR_CODE" == "EMAIL_EXISTS" ]; then
            log_success "Duplicate email correctly rejected with EMAIL_EXISTS code"
        else
            log_error "Expected error code EMAIL_EXISTS, got: $ERROR_CODE"
        fi
    else
        log_error "Expected HTTP 409, got $HTTP_CODE"
    fi
}

test_login_before_verification() {
    log_info "Test 3: Login before email verification (should fail with EMAIL_NOT_VERIFIED)"

    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/auth/login" \
        -H "Content-Type: application/json" \
        -d '{
            "email": "'"$TEST_EMAIL"'"
        }')

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    if [ "$HTTP_CODE" == "403" ]; then
        ERROR_CODE=$(echo "$BODY" | $JQ_CMD -r '.code')
        if [ "$ERROR_CODE" == "EMAIL_NOT_VERIFIED" ]; then
            log_success "Login correctly blocked with EMAIL_NOT_VERIFIED code"
        else
            log_error "Expected error code EMAIL_NOT_VERIFIED, got: $ERROR_CODE"
        fi
    else
        log_error "Expected HTTP 403, got $HTTP_CODE"
        echo "$BODY" | $JQ_CMD '.' 2>/dev/null || echo "$BODY"
    fi
}

test_get_verification_token() {
    log_info "Test 4: Retrieving verification token from database"

    if command -v psql &> /dev/null; then
        VERIFICATION_TOKEN=$(PGPASSWORD=maifarm123 psql -U maifarm -d maifarm_dev -t -c \
            "SELECT email_verification_token FROM users WHERE email = '$TEST_EMAIL'" 2>/dev/null | tr -d ' ')

        if [ ! -z "$VERIFICATION_TOKEN" ] && [ "$VERIFICATION_TOKEN" != "" ]; then
            log_success "Retrieved verification token: ${VERIFICATION_TOKEN:0:20}..."
            echo "$VERIFICATION_TOKEN" > /tmp/verification_token.txt
        else
            log_error "No verification token found in database"
        fi
    else
        log_warn "psql not available, skipping database check"
    fi
}

test_email_verification() {
    log_info "Test 5: Email verification with valid token"

    if [ ! -f /tmp/verification_token.txt ]; then
        log_warn "Skipping verification test - no token available"
        return
    fi

    VERIFICATION_TOKEN=$(cat /tmp/verification_token.txt)

    RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_BASE/auth/verify/$VERIFICATION_TOKEN")

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    if [ "$HTTP_CODE" == "200" ]; then
        if echo "$BODY" | $JQ_CMD -e '.success' | grep -q true; then
            log_success "Email verification successful"
        else
            log_error "Verification response missing 'success: true'"
        fi
    else
        log_error "Expected HTTP 200, got $HTTP_CODE"
        echo "$BODY" | $JQ_CMD '.' 2>/dev/null || echo "$BODY"
    fi
}

test_login_after_verification() {
    log_info "Test 6: Login after successful email verification"

    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/auth/login" \
        -H "Content-Type: application/json" \
        -d '{
            "email": "'"$TEST_EMAIL"'"
        }')

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    if [ "$HTTP_CODE" == "200" ]; then
        if echo "$BODY" | $JQ_CMD -e '.success' | grep -q true; then
            if echo "$BODY" | $JQ_CMD -e '.accessToken' > /dev/null 2>&1; then
                log_success "Login successful with JWT tokens"
            else
                log_error "Login succeeded but no access token"
            fi
        else
            log_error "Login response missing 'success: true'"
        fi
    else
        log_error "Expected HTTP 200, got $HTTP_CODE"
        echo "$BODY" | $JQ_CMD '.' 2>/dev/null || echo "$BODY"
    fi
}

test_resend_verification() {
    log_info "Test 7: Resend verification email"

    # Create a new unverified user
    NEW_EMAIL="test-resend-$(date +%s)@passwordless.test"

    curl -s -X POST "$API_BASE/auth/register" \
        -H "Content-Type: application/json" \
        -d '{
            "email": "'"$NEW_EMAIL"'",
            "name": "Resend Test User",
            "authMode": "passwordless"
        }' > /dev/null

    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/auth/send-verification" \
        -H "Content-Type: application/json" \
        -d '{
            "email": "'"$NEW_EMAIL"'"
        }')

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    if [ "$HTTP_CODE" == "200" ]; then
        if echo "$BODY" | $JQ_CMD -e '.success' | grep -q true; then
            log_success "Verification email resent successfully"
        else
            log_error "Resend succeeded but missing 'success: true'"
        fi
    else
        log_error "Expected HTTP 200, got $HTTP_CODE"
    fi
}

test_password_mode_registration() {
    log_info "Test 8: Password-based registration (control test)"

    PASSWORD_EMAIL="test-password-$(date +%s)@passwordless.test"

    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/auth/register" \
        -H "Content-Type: application/json" \
        -d '{
            "email": "'"$PASSWORD_EMAIL"'",
            "name": "Password Test User",
            "password": "SecurePassword123",
            "authMode": "password"
        }')

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    if [ "$HTTP_CODE" == "201" ]; then
        if echo "$BODY" | $JQ_CMD -e '.requiresVerification' | grep -q false; then
            log_success "Password registration successful (no verification required)"
        else
            log_error "Password mode incorrectly requires verification"
        fi
    else
        log_error "Expected HTTP 201, got $HTTP_CODE"
    fi
}

test_invalid_email_validation() {
    log_info "Test 9: Invalid email format validation"

    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/auth/register" \
        -H "Content-Type: application/json" \
        -d '{
            "email": "not-an-email",
            "name": "Invalid Email User",
            "authMode": "passwordless"
        }')

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    if [ "$HTTP_CODE" == "400" ]; then
        ERROR_CODE=$(echo "$BODY" | $JQ_CMD -r '.code')
        if [ "$ERROR_CODE" == "VALIDATION_ERROR" ]; then
            log_success "Invalid email correctly rejected with VALIDATION_ERROR"
        else
            log_error "Expected VALIDATION_ERROR code, got: $ERROR_CODE"
        fi
    else
        log_error "Expected HTTP 400, got $HTTP_CODE"
    fi
}

test_invalid_verification_token() {
    log_info "Test 10: Invalid verification token"

    RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_BASE/auth/verify/invalid-token-12345")

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

    if [ "$HTTP_CODE" == "400" ]; then
        log_success "Invalid token correctly rejected"
    else
        log_error "Expected HTTP 400, got $HTTP_CODE"
    fi
}

# Main execution
main() {
    echo ""
    echo "========================================="
    echo "  Passwordless Registration Test Suite  "
    echo "========================================="
    echo ""
    echo "API Base: $API_BASE"
    echo "Test Email: $TEST_EMAIL"
    echo ""

    check_prerequisites

    echo ""
    log_info "Starting test execution..."
    echo ""

    # Run all tests in sequence
    test_passwordless_registration
    test_duplicate_email
    test_login_before_verification
    test_get_verification_token
    test_email_verification
    test_login_after_verification
    test_resend_verification
    test_password_mode_registration
    test_invalid_email_validation
    test_invalid_verification_token

    # Print summary
    echo ""
    echo "========================================="
    echo "            Test Summary                 "
    echo "========================================="
    echo -e "${GREEN}Passed:${NC} $PASS_COUNT"
    echo -e "${RED}Failed:${NC} $FAIL_COUNT"
    echo "Total:  $((PASS_COUNT + FAIL_COUNT))"
    echo ""

    if [ $FAIL_COUNT -eq 0 ]; then
        echo -e "${GREEN}✓ All tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}✗ Some tests failed${NC}"
        exit 1
    fi
}

# Run main function
main
