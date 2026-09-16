#!/bin/bash
set -euo pipefail

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to run this test." >&2
  exit 1
fi

RAW_HOST="${GPT_OSS_HOST:-http://localhost:8000/v1}"
TRIMMED=${RAW_HOST%%/}
if [[ "$TRIMMED" == */v1 ]]; then
  BASE_URL="${TRIMMED%/v1}"
else
  BASE_URL="$TRIMMED"
fi
HEALTH_URL="${BASE_URL}/health"
CHAT_URL="${BASE_URL}/v1/chat/completions"
MODEL_NAME="${GPT_OSS_MODEL:-openai/gpt-oss-20b}"

printf '🔍 Checking GPT-OSS health at %s...\n' "$HEALTH_URL"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" || true)
if [[ "$STATUS" != "200" ]]; then
  echo "❌ GPT-OSS server is not responding (status: $STATUS)." >&2
  echo "   Start it with ~/.maifarm/gpt-oss/launch-server.sh or npm run dev." >&2
  exit 1
fi

echo "✅ GPT-OSS server is running."

echo "🧪 Sending test completion request to $MODEL_NAME ..."
RESPONSE=$(curl -s "$CHAT_URL" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"$MODEL_NAME\",\"messages\":[{\"role\":\"user\",\"content\":\"Hello from MaiFarm setup check!\"}],\"max_tokens\":64}")

if command -v jq >/dev/null 2>&1; then
  echo "$RESPONSE" | jq .
else
  echo "$RESPONSE"
fi

echo "\n✅ GPT-OSS chat completion endpoint responded successfully."
