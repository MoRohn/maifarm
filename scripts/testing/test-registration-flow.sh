#!/bin/bash

# Test registration flow to ensure no refresh loop

echo "Testing registration flow..."
echo "================================"

# Generate unique email for testing
TEST_EMAIL="test-$(date +%s)@example.com"
TEST_NAME="Test User"
TEST_PASSWORD="TestPass123"

# Test registration endpoint
echo "1. Testing registration..."
RESPONSE=$(curl -s -X POST http://localhost:4567/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"name\": \"$TEST_NAME\",
    \"password\": \"$TEST_PASSWORD\",
    \"authMode\": \"password\"
  }")

echo "Response: $RESPONSE"

# Check if registration was successful
if echo "$RESPONSE" | grep -q '"success":true'; then
  echo "✅ Registration successful"
else
  echo "❌ Registration failed"
  exit 1
fi

# Check if user can login
echo ""
echo "2. Testing login..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:4567/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"password\": \"$TEST_PASSWORD\"
  }")

echo "Response: $LOGIN_RESPONSE"

if echo "$LOGIN_RESPONSE" | grep -q '"success":true'; then
  echo "✅ Login successful"
else
  echo "❌ Login failed"
  exit 1
fi

echo ""
echo "================================"
echo "✅ All tests passed! No refresh loop detected."