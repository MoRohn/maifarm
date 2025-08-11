#!/bin/bash

# Harvest Terminal Test Runner with Error Capture
# This script runs all tests and captures errors for analysis

echo "========================================="
echo "Harvest Terminal Test Suite Runner"
echo "========================================="
echo ""

# Create results directory
mkdir -p tests/harvest-terminal/results

# Function to run tests and capture output
run_test_suite() {
    local test_name=$1
    local test_path=$2
    local output_file="tests/harvest-terminal/results/${test_name}.log"
    
    echo "Running ${test_name}..."
    echo "Output: ${output_file}"
    
    # Run the test and capture output
    npm test -- "${test_path}" --verbose --no-coverage 2>&1 | tee "${output_file}"
    
    # Check exit code
    if [ ${PIPESTATUS[0]} -eq 0 ]; then
        echo "✅ ${test_name} PASSED"
    else
        echo "❌ ${test_name} FAILED"
        # Extract error summary
        echo ""
        echo "Error Summary:"
        grep -A 5 "FAIL\|Error:\|TypeError:\|ReferenceError:" "${output_file}" | head -20
    fi
    echo ""
    echo "-----------------------------------------"
    echo ""
}

# Check if test files exist
echo "Checking test files..."
if [ ! -f "tests/harvest-terminal/unit/HarvestTerminalPro.test.tsx" ]; then
    echo "❌ Unit test file not found"
else
    echo "✅ Unit test file found"
fi

if [ ! -f "tests/harvest-terminal/integration/cloudflare-tunnel.test.ts" ]; then
    echo "❌ Integration test file not found"
else
    echo "✅ Integration test file found"
fi

if [ ! -f "tests/harvest-terminal/e2e/harvest-terminal-workflow.spec.ts" ]; then
    echo "❌ E2E test file not found"
else
    echo "✅ E2E test file found"
fi

echo ""
echo "========================================="
echo "Starting Test Execution"
echo "========================================="
echo ""

# Run Unit Tests
run_test_suite "unit-tests" "tests/harvest-terminal/unit/HarvestTerminalPro.test.tsx"

# Run Integration Tests
run_test_suite "integration-tests" "tests/harvest-terminal/integration/cloudflare-tunnel.test.ts"

# Run E2E Tests (requires different runner)
echo "Running E2E Tests..."
if command -v playwright &> /dev/null; then
    npx playwright test tests/harvest-terminal/e2e/harvest-terminal-workflow.spec.ts --reporter=list 2>&1 | tee "tests/harvest-terminal/results/e2e-tests.log"
else
    echo "⚠️  Playwright not installed. Skipping E2E tests."
    echo "Run: npm install -D @playwright/test"
fi

echo ""
echo "========================================="
echo "Test Summary"
echo "========================================="
echo ""

# Generate summary
echo "Test Results Summary:" > tests/harvest-terminal/results/summary.txt
echo "" >> tests/harvest-terminal/results/summary.txt

for log_file in tests/harvest-terminal/results/*.log; do
    if [ -f "$log_file" ]; then
        test_name=$(basename "$log_file" .log)
        echo "## ${test_name}" >> tests/harvest-terminal/results/summary.txt
        
        # Count pass/fail
        passes=$(grep -c "✓\|PASS" "$log_file" || echo "0")
        failures=$(grep -c "✗\|FAIL\|Error:" "$log_file" || echo "0")
        
        echo "Passed: ${passes}" >> tests/harvest-terminal/results/summary.txt
        echo "Failed: ${failures}" >> tests/harvest-terminal/results/summary.txt
        echo "" >> tests/harvest-terminal/results/summary.txt
        
        # Extract errors
        if [ $failures -gt 0 ]; then
            echo "Errors:" >> tests/harvest-terminal/results/summary.txt
            grep -A 2 "Error:\|TypeError:\|ReferenceError:" "$log_file" | head -10 >> tests/harvest-terminal/results/summary.txt
            echo "" >> tests/harvest-terminal/results/summary.txt
        fi
    fi
done

echo "Summary saved to: tests/harvest-terminal/results/summary.txt"
cat tests/harvest-terminal/results/summary.txt

echo ""
echo "========================================="
echo "Next Steps:"
echo "========================================="
echo "1. Review error logs in tests/harvest-terminal/results/"
echo "2. Fix critical bugs first (WebSocket, Theme system)"
echo "3. Re-run tests with: ./tests/harvest-terminal/run-tests.sh"
echo ""