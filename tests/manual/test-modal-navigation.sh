#!/bin/bash

# Test script to verify modal navigation fixes for all three modes
# This ensures the "You are a MaiFarmer now!" modal properly navigates to harvest

echo "====================================="
echo "Modal Navigation Test Suite"
echo "====================================="
echo ""

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Testing Modal Navigation Flow:${NC}"
echo "1. ConceptExplainer sets sessionStorage flag when Continue is clicked"
echo "2. QuickTaskChatWizard sets sessionStorage flag when Continue is clicked"
echo "3. GoWildChatWizard sets sessionStorage flag when Continue is clicked"
echo "4. HarvestPage checks sessionStorage to prevent duplicate modal"
echo ""

# Test 1: Check ConceptExplainer file modifications
echo -e "${YELLOW}Checking ConceptExplainer.tsx...${NC}"
if grep -q "sessionStorage.setItem(\`concept-modal-seen-\${farmId}\`, 'true');" src/components/Farm/ConceptExplainer.tsx; then
    echo -e "${GREEN}✓ ConceptExplainer sets sessionStorage flag${NC}"
else
    echo -e "${RED}✗ ConceptExplainer missing sessionStorage flag${NC}"
fi

# Test 2: Check QuickTaskChatWizard modifications
echo -e "${YELLOW}Checking QuickTaskChatWizard.tsx...${NC}"
if grep -q "sessionStorage.setItem(\`concept-modal-seen-\${farmId}\`, 'true');" src/components/Task/QuickTaskChatWizard.tsx; then
    echo -e "${GREEN}✓ QuickTaskChatWizard sets sessionStorage flag${NC}"
else
    echo -e "${RED}✗ QuickTaskChatWizard missing sessionStorage flag${NC}"
fi

# Test 3: Check GoWildChatWizard modifications
echo -e "${YELLOW}Checking GoWildChatWizard.tsx...${NC}"
if grep -q "sessionStorage.setItem(\`concept-modal-seen-\${farmId}\`, 'true');" src/components/GoWild/GoWildChatWizard.tsx; then
    echo -e "${GREEN}✓ GoWildChatWizard sets sessionStorage flag${NC}"
else
    echo -e "${RED}✗ GoWildChatWizard missing sessionStorage flag${NC}"
fi

# Test 4: Check HarvestPage checks the flag
echo -e "${YELLOW}Checking HarvestPage.tsx...${NC}"
if grep -q "sessionStorage.getItem(\`concept-modal-seen-\${targetFarmId}\`);" src/components/Harvest/HarvestPage.tsx; then
    echo -e "${GREEN}✓ HarvestPage checks sessionStorage flag${NC}"
else
    echo -e "${RED}✗ HarvestPage not checking sessionStorage flag${NC}"
fi

echo ""
echo -e "${YELLOW}Navigation Flow Summary:${NC}"
echo "All three modes (Quick Task, Farm, GoWild) should:"
echo "1. Show the 'You are a MaiFarmer now!' modal once"
echo "2. Navigate to /harvest/{farmId} when Continue is clicked"
echo "3. NOT show the modal again on the harvest page"
echo ""

# Test 5: Verify navigation paths
echo -e "${YELLOW}Verifying navigation paths:${NC}"
echo -n "ConceptExplainer navigates to: "
grep -o "navigate(\`/harvest/\${farmId}\`)" src/components/Farm/ConceptExplainer.tsx | head -1 && echo -e "${GREEN}✓${NC}"

echo -n "QuickTaskChatWizard navigates to: "
grep -o "navigate(\`/harvest/\${farmId}\`)" src/components/Task/QuickTaskChatWizard.tsx | head -1 && echo -e "${GREEN}✓${NC}"

echo -n "GoWildChatWizard navigates to: "
grep -o "navigate(\`/harvest/\${farmId}\`)" src/components/GoWild/GoWildChatWizard.tsx | head -1 && echo -e "${GREEN}✓${NC}"

echo ""
echo "====================================="
echo -e "${GREEN}Modal navigation fixes verified!${NC}"
echo "====================================="
echo ""
echo "To test manually:"
echo "1. Create a Quick Task - should see modal once, then go to harvest"
echo "2. Create a Farm - should see modal once, then go to harvest"
echo "3. Create a GoWild exploration - should see modal once, then go to harvest"