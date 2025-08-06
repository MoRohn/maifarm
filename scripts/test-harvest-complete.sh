#!/bin/bash

echo "🧪 Testing Complete Harvest Workflow"
echo "====================================="
echo ""

# 1. Create a farm
echo "1️⃣ Creating a test farm..."
FARM_RESPONSE=$(curl -s -X POST http://localhost:4567/api/farms \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Harvest Test Farm",
    "description": "Testing complete harvest workflow",
    "agents": [{"name": "harvest-agent", "skills": ["analysis", "optimization"]}]
  }')

FARM_ID=$(echo $FARM_RESPONSE | jq -r '.data.id')
echo "✅ Farm created: $FARM_ID"
echo ""

# 2. Start a harvest
echo "2️⃣ Starting harvest..."
HARVEST_RESPONSE=$(curl -s -X POST "http://localhost:4567/api/harvest/farms/$FARM_ID/harvest" \
  -H "Content-Type: application/json" \
  -d '{"farmName": "Harvest Test Farm"}')

HARVEST_ID=$(echo $HARVEST_RESPONSE | jq -r '.id')
echo "✅ Harvest started: $HARVEST_ID"
echo ""

# 3. Wait for processing
echo "3️⃣ Waiting for harvest to process..."
sleep 3

# 4. Get harvest details
echo "4️⃣ Getting harvest details..."
HARVEST_DETAILS=$(curl -s "http://localhost:4567/api/harvest")
echo "Harvest count: $(echo $HARVEST_DETAILS | jq '. | length')"
echo ""

# 5. Get specific harvest
echo "5️⃣ Getting specific harvest..."
SPECIFIC_HARVEST=$(curl -s "http://localhost:4567/api/harvest/$HARVEST_ID")
if [ "$SPECIFIC_HARVEST" != "" ]; then
  echo "✅ Harvest found"
  echo "Status: $(echo $SPECIFIC_HARVEST | jq -r '.status')"
  echo "Results: $(echo $SPECIFIC_HARVEST | jq '.results | length')"
  echo "Insights: $(echo $SPECIFIC_HARVEST | jq '.insights | length')"
  echo "Quality Score: $(echo $SPECIFIC_HARVEST | jq '.quality.overallScore')"
else
  echo "❌ Harvest not found"
fi
echo ""

# 6. Test export formats
echo "6️⃣ Testing export formats..."
for FORMAT in json markdown; do
  echo "   Testing $FORMAT export..."
  EXPORT_RESPONSE=$(curl -s -X POST "http://localhost:4567/api/harvest/$HARVEST_ID/export" \
    -H "Content-Type: application/json" \
    -d "{\"format\": \"$FORMAT\"}" \
    -o "harvest-export.$FORMAT" \
    -w "%{http_code}")
  
  if [ "$EXPORT_RESPONSE" = "200" ]; then
    echo "   ✅ $FORMAT export successful ($(stat -f%z "harvest-export.$FORMAT" 2>/dev/null || stat -c%s "harvest-export.$FORMAT" 2>/dev/null) bytes)"
  else
    echo "   ❌ $FORMAT export failed (HTTP $EXPORT_RESPONSE)"
  fi
done
echo ""

# 7. Test filtering
echo "7️⃣ Testing harvest filtering..."
FILTERED=$(curl -s "http://localhost:4567/api/harvest?farmId=$FARM_ID")
echo "Filtered by farmId: $(echo $FILTERED | jq '. | length') harvests"
echo ""

# 8. Test summaries endpoint
echo "8️⃣ Testing summaries endpoint..."
SUMMARIES=$(curl -s "http://localhost:4567/api/harvest/summaries")
if [ "$SUMMARIES" != "" ]; then
  echo "✅ Summaries endpoint working"
else
  echo "❌ Summaries endpoint not responding"
fi
echo ""

# 9. Complete the harvest
echo "9️⃣ Completing harvest..."
COMPLETE_RESPONSE=$(curl -s -X POST "http://localhost:4567/api/harvest/$HARVEST_ID/complete" \
  -H "Content-Type: application/json" \
  -w "\n%{http_code}")

HTTP_CODE=$(echo "$COMPLETE_RESPONSE" | tail -n1)
if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ Harvest completed successfully"
else
  echo "❌ Failed to complete harvest (HTTP $HTTP_CODE)"
fi
echo ""

echo "✨ Harvest workflow test complete!"
echo ""

# Cleanup
rm -f harvest-export.json harvest-export.markdown 2>/dev/null