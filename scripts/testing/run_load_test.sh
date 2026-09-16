#!/bin/bash
# Safe load test wrapper for subprocess mode
# For high-load testing, deploy to production and test against running server

CLIENTS=${1:-5}
RATE=${2:-3}
SECONDS=${3:-10}

# Validate parameters for subprocess mode
if [ "$CLIENTS" -gt 10 ] || [ "$RATE" -gt 5 ]; then
    echo "⚠️  WARNING: High load parameters detected!"
    echo "   Requested: --clients $CLIENTS --rate $RATE --seconds $SECONDS"
    echo "   Subprocess mode limit: --clients ≤10 --rate ≤5"
    echo ""
    echo "   For high-load testing, deploy to production and test against running server."
    echo "   Using safe parameters: --clients 10 --rate 5 --seconds $SECONDS"
    echo ""
    CLIENTS=10
    RATE=5
fi

echo "Running load test with safe parameters: --clients $CLIENTS --rate $RATE --seconds $SECONDS"
python3 scripts/testing/load_test.py --clients "$CLIENTS" --rate "$RATE" --seconds "$SECONDS"
