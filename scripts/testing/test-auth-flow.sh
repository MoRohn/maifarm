#!/bin/bash

# Test Authentication Flow for MaiFarm
# This script tests the complete registration and login flow

API_URL="http://localhost:4567"
TEST_EMAIL="test$(date +%s)@example.com"
TEST_NAME="Test User"
TEST_PASSWORD="TestPassword123!"

echo "==================================="
echo "MaiFarm Authentication Flow Test"
echo "==================================="
echo ""
echo "Test Email: $TEST_EMAIL"
echo ""

# Step 1: Test Registration (Password Mode)
echo "1. Testing Registration (Password Mode)..."
REGISTER_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"name\": \"$TEST_NAME\",
    \"password\": \"$TEST_PASSWORD\",
    \"authMode\": \"password\"
  }")

echo "Registration Response:"
echo "$REGISTER_RESPONSE" | jq '.'
echo ""

# Check if registration was successful
if echo "$REGISTER_RESPONSE" | jq -e '.success == true' > /dev/null; then
  echo "✅ Registration successful!"

  # Extract tokens if available
  ACCESS_TOKEN=$(echo "$REGISTER_RESPONSE" | jq -r '.accessToken // .tokens.accessToken // empty')
  if [ -n "$ACCESS_TOKEN" ]; then
    echo "✅ Access token received"
  fi
else
  echo "❌ Registration failed!"
  ERROR_CODE=$(echo "$REGISTER_RESPONSE" | jq -r '.code // empty')
  ERROR_MSG=$(echo "$REGISTER_RESPONSE" | jq -r '.error // .message // empty')
  echo "Error Code: $ERROR_CODE"
  echo "Error Message: $ERROR_MSG"
fi
echo ""

# Step 2: Test Login
echo "2. Testing Login..."
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"password\": \"$TEST_PASSWORD\"
  }")

echo "Login Response:"
echo "$LOGIN_RESPONSE" | jq '.'
echo ""

# Check if login was successful
if echo "$LOGIN_RESPONSE" | jq -e '.success == true' > /dev/null; then
  echo "✅ Login successful!"

  # Extract user info
  USER_ID=$(echo "$LOGIN_RESPONSE" | jq -r '.user.id // empty')
  USER_EMAIL=$(echo "$LOGIN_RESPONSE" | jq -r '.user.email // empty')
  ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.accessToken // .tokens.accessToken // empty')

  if [ -n "$USER_ID" ] && [ -n "$ACCESS_TOKEN" ]; then
    echo "✅ User authenticated successfully"
    echo "   User ID: $USER_ID"
    echo "   Email: $USER_EMAIL"
  fi
else
  echo "❌ Login failed!"
  ERROR_CODE=$(echo "$LOGIN_RESPONSE" | jq -r '.code // empty')
  ERROR_MSG=$(echo "$LOGIN_RESPONSE" | jq -r '.error // .message // empty')
  echo "Error Code: $ERROR_CODE"
  echo "Error Message: $ERROR_MSG"
fi
echo ""

# Step 3: Test Passwordless Registration
echo "3. Testing Passwordless Registration..."
PASSWORDLESS_EMAIL="passwordless$(date +%s)@example.com"
PASSWORDLESS_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$PASSWORDLESS_EMAIL\",
    \"name\": \"Passwordless User\",
    \"authMode\": \"passwordless\"
  }")

echo "Passwordless Registration Response:"
echo "$PASSWORDLESS_RESPONSE" | jq '.'
echo ""

if echo "$PASSWORDLESS_RESPONSE" | jq -e '.success == true' > /dev/null; then
  echo "✅ Passwordless registration successful!"

  REQUIRES_VERIFICATION=$(echo "$PASSWORDLESS_RESPONSE" | jq -r '.requiresVerification // false')
  if [ "$REQUIRES_VERIFICATION" = "true" ]; then
    echo "✅ Email verification required (as expected for passwordless)"
  fi
else
  echo "❌ Passwordless registration failed!"
fi
echo ""

# Step 4: Test Invalid Login (Wrong Password)
echo "4. Testing Invalid Login (Wrong Password)..."
INVALID_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"password\": \"WrongPassword123\"
  }")

echo "Invalid Login Response:"
echo "$INVALID_RESPONSE" | jq '.'
echo ""

if echo "$INVALID_RESPONSE" | jq -e '.success == false' > /dev/null; then
  echo "✅ Invalid login correctly rejected"
  ERROR_CODE=$(echo "$INVALID_RESPONSE" | jq -r '.code // empty')
  echo "   Error Code: $ERROR_CODE"
else
  echo "❌ Invalid login was not rejected!"
fi
echo ""

# Step 5: Test Duplicate Registration
echo "5. Testing Duplicate Registration..."
DUPLICATE_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"name\": \"$TEST_NAME\",
    \"password\": \"$TEST_PASSWORD\",
    \"authMode\": \"password\"
  }")

echo "Duplicate Registration Response:"
echo "$DUPLICATE_RESPONSE" | jq '.'
echo ""

if echo "$DUPLICATE_RESPONSE" | jq -e '.code == "EMAIL_EXISTS"' > /dev/null; then
  echo "✅ Duplicate email correctly rejected with EMAIL_EXISTS code"
else
  echo "❌ Duplicate email handling incorrect!"
fi
echo ""

echo "==================================="
echo "Authentication Flow Test Complete"
echo "==================================="
echo ""
echo "Summary:"
echo "- Registration: $(echo "$REGISTER_RESPONSE" | jq -e '.success == true' > /dev/null && echo "✅ PASS" || echo "❌ FAIL")"
echo "- Login: $(echo "$LOGIN_RESPONSE" | jq -e '.success == true' > /dev/null && echo "✅ PASS" || echo "❌ FAIL")"
echo "- Passwordless: $(echo "$PASSWORDLESS_RESPONSE" | jq -e '.success == true' > /dev/null && echo "✅ PASS" || echo "❌ FAIL")"
echo "- Invalid Login: $(echo "$INVALID_RESPONSE" | jq -e '.success == false' > /dev/null && echo "✅ PASS" || echo "❌ FAIL")"
echo "- Duplicate Check: $(echo "$DUPLICATE_RESPONSE" | jq -e '.code == "EMAIL_EXISTS"' > /dev/null && echo "✅ PASS" || echo "❌ FAIL")"