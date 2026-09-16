#!/bin/bash

# Test sign-in flow

echo "Testing Sign-In Flow"
echo "===================="

# First, create a test user
EMAIL="signin-test-$(date +%s)@example.com"
PASSWORD="TestPass123"

echo "1. Creating test user: $EMAIL"

# Register the user
REGISTER_RESPONSE=$(curl -s -X POST http://localhost:4567/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$EMAIL\",
    \"name\": \"Sign In Test\",
    \"password\": \"$PASSWORD\",
    \"authMode\": \"password\"
  }")

if echo "$REGISTER_RESPONSE" | grep -q '"success":true'; then
  echo "✅ User created successfully"
else
  echo "❌ Failed to create user"
  echo "Response: $REGISTER_RESPONSE"
  exit 1
fi

echo ""
echo "2. Testing sign-in with the created user"

# Try to login
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:4567/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$EMAIL\",
    \"password\": \"$PASSWORD\"
  }")

if echo "$LOGIN_RESPONSE" | grep -q '"success":true'; then
  echo "✅ Sign-in successful!"
  echo "Response preview: $(echo "$LOGIN_RESPONSE" | head -c 200)..."
else
  echo "❌ Sign-in failed"
  echo "Response: $LOGIN_RESPONSE"
  exit 1
fi

echo ""
echo "3. Testing sign-in with wrong password"

# Try to login with wrong password
BAD_LOGIN_RESPONSE=$(curl -s -X POST http://localhost:4567/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$EMAIL\",
    \"password\": \"WrongPassword\"
  }")

if echo "$BAD_LOGIN_RESPONSE" | grep -q '"success":false'; then
  echo "✅ Correctly rejected invalid password"
  ERROR_CODE=$(echo "$BAD_LOGIN_RESPONSE" | grep -o '"code":"[^"]*' | cut -d'"' -f4)
  echo "   Error code: $ERROR_CODE"
else
  echo "⚠️  Expected login to fail with wrong password"
fi

echo ""
echo "===================="
echo "✅ Sign-in tests completed"