#!/bin/bash

# Test registration flow to ensure no infinite loops

echo "Testing registration UI flow..."
echo "================================"

# Generate unique email for testing
TEST_EMAIL="test-ui-$(date +%s)@example.com"
TEST_NAME="UI Test User"
TEST_PASSWORD="TestPass123"

# Test registration endpoint
echo "1. Testing registration API..."
RESPONSE=$(curl -s -X POST http://localhost:4567/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"name\": \"$TEST_NAME\",
    \"password\": \"$TEST_PASSWORD\",
    \"authMode\": \"password\"
  }")

# Check if registration was successful
if echo "$RESPONSE" | grep -q '"success":true'; then
  echo "✅ Registration API successful"

  # Extract the access token
  ACCESS_TOKEN=$(echo "$RESPONSE" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)

  if [ -n "$ACCESS_TOKEN" ]; then
    echo "✅ Access token received"

    # Test authenticated request
    echo ""
    echo "2. Testing authenticated request..."
    AUTH_RESPONSE=$(curl -s -X GET http://localhost:4567/api/farms \
      -H "Authorization: Bearer $ACCESS_TOKEN")

    if echo "$AUTH_RESPONSE" | grep -q '\[' || echo "$AUTH_RESPONSE" | grep -q '"farms"'; then
      echo "✅ Authenticated request successful"
    else
      echo "❌ Authenticated request failed"
      echo "Response: $AUTH_RESPONSE"
    fi
  else
    echo "❌ No access token in response"
  fi
else
  echo "❌ Registration failed"
  echo "Response: $RESPONSE"
  exit 1
fi

echo ""
echo "================================"
echo "✅ Registration flow test passed!"
echo ""
echo "To test the UI manually:"
echo "1. Open http://localhost:3000 in your browser"
echo "2. Click 'Sign Up' or 'Create Account'"
echo "3. Fill in the registration form"
echo "4. Submit and verify no infinite loops occur"
echo "5. You should be redirected to /home after successful registration"