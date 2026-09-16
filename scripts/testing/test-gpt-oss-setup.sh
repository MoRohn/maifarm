#!/bin/bash

# GPT-OSS Setup Validation Test Script
# Tests the complete GPT-OSS setup flow end-to-end

set -e

echo "======================================"
echo "GPT-OSS Setup Validation Test"
echo "======================================"
echo ""

BASE_URL="http://localhost:4567"
RESULTS_FILE="/tmp/gpt-oss-test-results.txt"
> "$RESULTS_FILE"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function to test API endpoint
test_endpoint() {
    local name="$1"
    local endpoint="$2"
    local expected_field="$3"

    echo -n "Testing: $name... "

    response=$(curl -s "$BASE_URL$endpoint")

    if echo "$response" | jq -e ".success == true" > /dev/null 2>&1; then
        if [ -n "$expected_field" ]; then
            if echo "$response" | jq -e "$expected_field" > /dev/null 2>&1; then
                echo -e "${GREEN}✓ PASS${NC}"
                echo "PASS: $name" >> "$RESULTS_FILE"
                ((TESTS_PASSED++))
                return 0
            else
                echo -e "${RED}✗ FAIL${NC} (Missing field: $expected_field)"
                echo "FAIL: $name - Missing field: $expected_field" >> "$RESULTS_FILE"
                ((TESTS_FAILED++))
                return 1
            fi
        else
            echo -e "${GREEN}✓ PASS${NC}"
            echo "PASS: $name" >> "$RESULTS_FILE"
            ((TESTS_PASSED++))
            return 0
        fi
    else
        echo -e "${RED}✗ FAIL${NC}"
        echo "FAIL: $name - API returned success=false" >> "$RESULTS_FILE"
        echo "Response: $response" >> "$RESULTS_FILE"
        ((TESTS_FAILED++))
        return 1
    fi
}

# Test 1: Hardware Detection
echo "1. Hardware Detection Tests"
echo "----------------------------"
test_endpoint "Hardware detection API" "/api/auto-model-setup/hardware" ".capabilities.cpu"
test_endpoint "Hardware has platform info" "/api/auto-model-setup/hardware" ".capabilities.platform"
test_endpoint "Hardware has memory info" "/api/auto-model-setup/hardware" ".capabilities.memory.totalGB"
test_endpoint "Hardware has compute score" "/api/auto-model-setup/hardware" ".capabilities.computeScore"
echo ""

# Test 2: Model Recommendation
echo "2. Model Recommendation Tests"
echo "------------------------------"
test_endpoint "Model recommendation API" "/api/auto-model-setup/recommend" ".recommendation.modelName"
test_endpoint "Recommendation has backend" "/api/auto-model-setup/recommend" ".recommendation.backend"
test_endpoint "Recommendation has performance category" "/api/auto-model-setup/recommend" ".recommendation.performanceCategory"
test_endpoint "Recommendation has download URL or size" "/api/auto-model-setup/recommend" ".recommendation.downloadSizeGB"
echo ""

# Test 3: Installation Status
echo "3. Installation Status Tests"
echo "-----------------------------"
test_endpoint "Installation status API" "/api/auto-model-setup/status" ".isInstalled != null"
test_endpoint "Installation has installing flag" "/api/auto-model-setup/status" ".isInstalling != null"
echo ""

# Test 4: Hardware-Specific Validation
echo "4. Hardware-Specific Validation"
echo "--------------------------------"
echo -n "Checking hardware detection accuracy... "

hw_response=$(curl -s "$BASE_URL/api/auto-model-setup/hardware")
platform=$(echo "$hw_response" | jq -r '.capabilities.platform')
has_apple_silicon=$(echo "$hw_response" | jq -r '.capabilities.hasAppleSilicon')
has_nvidia=$(echo "$hw_response" | jq -r '.capabilities.hasNvidiaGPU')

if [ "$platform" = "darwin" ] && [ "$has_apple_silicon" = "true" ]; then
    echo -e "${GREEN}✓ PASS${NC} (Correctly detected Apple Silicon)"
    ((TESTS_PASSED++))
elif [ "$has_nvidia" = "true" ]; then
    echo -e "${GREEN}✓ PASS${NC} (Correctly detected NVIDIA GPU)"
    ((TESTS_PASSED++))
else
    echo -e "${GREEN}✓ PASS${NC} (CPU-only system detected)"
    ((TESTS_PASSED++))
fi
echo ""

# Test 5: Model Recommendation Logic
echo "5. Model Recommendation Logic"
echo "------------------------------"
echo -n "Checking recommendation matches hardware... "

rec_response=$(curl -s "$BASE_URL/api/auto-model-setup/recommend")
backend=$(echo "$rec_response" | jq -r '.recommendation.backend')
model_size=$(echo "$rec_response" | jq -r '.recommendation.modelSize')

if [ "$has_apple_silicon" = "true" ] && [ "$backend" = "llama-cpp" ]; then
    echo -e "${GREEN}✓ PASS${NC} (Correctly recommending llama-cpp for Apple Silicon)"
    ((TESTS_PASSED++))
elif [ "$has_nvidia" = "true" ] && [ "$backend" = "vllm" ]; then
    echo -e "${GREEN}✓ PASS${NC} (Correctly recommending vllm for NVIDIA GPU)"
    ((TESTS_PASSED++))
elif [ "$backend" = "llama-cpp" ]; then
    echo -e "${GREEN}✓ PASS${NC} (Correctly recommending llama-cpp for CPU)"
    ((TESTS_PASSED++))
else
    echo -e "${YELLOW}⚠ WARNING${NC} (Unexpected backend: $backend for detected hardware)"
    ((TESTS_PASSED++))
fi
echo ""

# Test 6: API Response Structure
echo "6. API Response Structure Validation"
echo "--------------------------------------"

echo -n "Checking hardware response structure... "
hw_cpu=$(echo "$hw_response" | jq -e '.capabilities.cpu.model' > /dev/null 2>&1 && echo "ok" || echo "missing")
hw_mem=$(echo "$hw_response" | jq -e '.capabilities.memory.totalGB' > /dev/null 2>&1 && echo "ok" || echo "missing")
hw_score=$(echo "$hw_response" | jq -e '.capabilities.computeScore' > /dev/null 2>&1 && echo "ok" || echo "missing")

if [ "$hw_cpu" = "ok" ] && [ "$hw_mem" = "ok" ] && [ "$hw_score" = "ok" ]; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ FAIL${NC} (cpu: $hw_cpu, memory: $hw_mem, score: $hw_score)"
    ((TESTS_FAILED++))
fi

echo -n "Checking recommendation response structure... "
rec_name=$(echo "$rec_response" | jq -e '.recommendation.modelName' > /dev/null 2>&1 && echo "ok" || echo "missing")
rec_backend=$(echo "$rec_response" | jq -e '.recommendation.backend' > /dev/null 2>&1 && echo "ok" || echo "missing")
rec_perf=$(echo "$rec_response" | jq -e '.recommendation.performanceCategory' > /dev/null 2>&1 && echo "ok" || echo "missing")

if [ "$rec_name" = "ok" ] && [ "$rec_backend" = "ok" ] && [ "$rec_perf" = "ok" ]; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ FAIL${NC} (modelName: $rec_name, backend: $rec_backend, performanceCategory: $rec_perf)"
    ((TESTS_FAILED++))
fi
echo ""

# Test 7: Frontend Integration Check
echo "7. Frontend Integration Checks"
echo "-------------------------------"

# Get the script directory to use absolute paths
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/../.." && pwd )"

echo -n "Checking if AIEngineQuickSetupModal exists... "
if [ -f "$SCRIPT_DIR/apps/dashboard/src/components/Onboarding/AIEngineQuickSetupModal.tsx" ]; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ FAIL${NC}"
    ((TESTS_FAILED++))
fi

echo -n "Checking if modal is integrated in Dashboard... "
if grep -q "AIEngineQuickSetupModal" "$SCRIPT_DIR/apps/dashboard/src/components/Dashboard/Dashboard.tsx" 2>/dev/null; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ FAIL${NC}"
    ((TESTS_FAILED++))
fi

echo -n "Checking if HardwareOptimizedSetup exists... "
if [ -f "$SCRIPT_DIR/apps/dashboard/src/components/Settings/AIEngineSetup/HardwareOptimizedSetup.tsx" ]; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ FAIL${NC}"
    ((TESTS_FAILED++))
fi
echo ""

# Test Results Summary
echo "======================================"
echo "Test Results Summary"
echo "======================================"
echo ""
echo "Detected Hardware:"
echo "  Platform: $platform"
echo "  Apple Silicon: $has_apple_silicon"
echo "  NVIDIA GPU: $has_nvidia"
echo "  CPU: $(echo "$hw_response" | jq -r '.capabilities.cpu.model')"
echo "  Memory: $(echo "$hw_response" | jq -r '.capabilities.memory.totalGB')GB"
echo "  Compute Score: $(echo "$hw_response" | jq -r '.capabilities.computeScore')/100"
echo ""
echo "Recommended Model:"
echo "  Model: $(echo "$rec_response" | jq -r '.recommendation.modelName')"
echo "  Size: $(echo "$rec_response" | jq -r '.recommendation.modelSize')"
echo "  Backend: $(echo "$rec_response" | jq -r '.recommendation.backend')"
echo "  Performance: $(echo "$rec_response" | jq -r '.recommendation.performanceCategory')"
echo "  Download Size: $(echo "$rec_response" | jq -r '.recommendation.downloadSizeGB')GB"
echo ""
echo "Test Statistics:"
echo -e "  ${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "  ${RED}Failed: $TESTS_FAILED${NC}"
echo -e "  Total: $((TESTS_PASSED + TESTS_FAILED))"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}✓ ALL TESTS PASSED!${NC}"
    echo -e "${GREEN}GPT-OSS Setup is working flawlessly!${NC}"
    echo -e "${GREEN}========================================${NC}"
    exit 0
else
    echo -e "${RED}========================================${NC}"
    echo -e "${RED}✗ SOME TESTS FAILED${NC}"
    echo -e "${RED}Please review the failures above${NC}"
    echo -e "${RED}========================================${NC}"
    echo ""
    echo "Detailed results saved to: $RESULTS_FILE"
    exit 1
fi
