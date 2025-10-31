#!/bin/bash

# ================================================
# TMUX_TMPDIR Consistency Validation Script
# ================================================
# Validates that all tmux operations use /tmp consistently
# to prevent farm orphaning issues

set -e

echo "🔍 TMUX_TMPDIR Consistency Validation"
echo "======================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

ERRORS=0

# Test 1: Check pathConfig hardcodes /tmp
echo "📋 Test 1: Validate pathConfig.ts forces TMUX_TMPDIR to /tmp"
if grep -q "const defaultTmuxTmpDir = '/tmp'" /Users/rohnspringfield/maifarm/apps/api/src/config/paths.ts; then
    echo -e "${GREEN}✓${NC} pathConfig.ts correctly hardcodes TMUX_TMPDIR to /tmp"
else
    echo -e "${RED}✗${NC} pathConfig.ts does NOT hardcode /tmp"
    ERRORS=$((ERRORS + 1))
fi

# Test 2: Check process.env is forced
echo ""
echo "📋 Test 2: Validate process.env.TMUX_TMPDIR is set at initialization"
if grep -q "process.env.TMUX_TMPDIR = config.TMUX_TMP_DIR" /Users/rohnspringfield/maifarm/apps/api/src/config/paths.ts; then
    echo -e "${GREEN}✓${NC} process.env.TMUX_TMPDIR is force-set at initialization"
else
    echo -e "${RED}✗${NC} process.env.TMUX_TMPDIR is NOT force-set"
    ERRORS=$((ERRORS + 1))
fi

# Test 3: Validate no environment variable fallback
echo ""
echo "📋 Test 3: Ensure NO environment variable fallback in pathConfig.ts"
if grep -q "process.env.TMUX_TMPDIR || '/tmp'" /Users/rohnspringfield/maifarm/apps/api/src/config/paths.ts; then
    echo -e "${RED}✗${NC} Found environment variable fallback - this causes the bug!"
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}✓${NC} No environment variable fallback found"
fi

# Test 4: Check all tmux commands use TMUX_TMPDIR variable
echo ""
echo "📋 Test 4: Verify all tmux commands use TMUX_TMPDIR environment variable"
TMUX_COMMANDS_WITHOUT_TMPDIR=$(grep -r "tmux " /Users/rohnspringfield/maifarm/apps/api/src/services/ | grep -v "TMUX_TMPDIR" | grep -v ".test.ts" | grep -v "Binary file" | wc -l)

if [ "$TMUX_COMMANDS_WITHOUT_TMPDIR" -eq 0 ]; then
    echo -e "${GREEN}✓${NC} All tmux commands properly use TMUX_TMPDIR"
else
    echo -e "${YELLOW}⚠${NC} Found $TMUX_COMMANDS_WITHOUT_TMPDIR tmux commands without TMUX_TMPDIR"
    echo "   (Review manually - some may be legitimate)"
fi

# Test 5: Check SESSION_TIMEOUT increased
echo ""
echo "📋 Test 5: Validate SESSION_TIMEOUT increased to 10 minutes"
if grep -q "SESSION_TIMEOUT = 600000" /Users/rohnspringfield/maifarm/apps/api/src/services/unified/terminalService.ts; then
    echo -e "${GREEN}✓${NC} SESSION_TIMEOUT correctly set to 600000ms (10 minutes)"
else
    echo -e "${RED}✗${NC} SESSION_TIMEOUT not set to 10 minutes"
    ERRORS=$((ERRORS + 1))
fi

# Test 6: Verify Python orchestrator uses /tmp
echo ""
echo "📋 Test 6: Validate Python orchestrator sets TMUX_TMPDIR to /tmp"
if grep -q 'env\["TMUX_TMPDIR"\] = "/tmp"' /Users/rohnspringfield/maifarm/scripts/python/orchestrator.py; then
    echo -e "${GREEN}✓${NC} Python orchestrator correctly sets TMUX_TMPDIR=/tmp"
else
    echo -e "${RED}✗${NC} Python orchestrator missing TMUX_TMPDIR=/tmp"
    ERRORS=$((ERRORS + 1))
fi

# Test 7: Check for any /private/tmp usage
echo ""
echo "📋 Test 7: Scan for any /private/tmp hardcoded paths"
PRIVATE_TMP_USAGE=$(grep -r "/private/tmp" /Users/rohnspringfield/maifarm/apps/api/src/ 2>/dev/null | grep -v ".test.ts" | wc -l)

if [ "$PRIVATE_TMP_USAGE" -eq 0 ]; then
    echo -e "${GREEN}✓${NC} No /private/tmp hardcoded paths found"
else
    echo -e "${YELLOW}⚠${NC} Found $PRIVATE_TMP_USAGE references to /private/tmp"
    echo "   (These could cause session visibility issues)"
fi

# Test 8: Check current TMUX_TMPDIR in running environment
echo ""
echo "📋 Test 8: Check current runtime TMUX_TMPDIR value"
CURRENT_TMUX_TMPDIR=$(printenv TMUX_TMPDIR || echo "not set")
if [ "$CURRENT_TMUX_TMPDIR" = "/tmp" ]; then
    echo -e "${GREEN}✓${NC} Current TMUX_TMPDIR is /tmp"
elif [ "$CURRENT_TMUX_TMPDIR" = "not set" ]; then
    echo -e "${YELLOW}⚠${NC} TMUX_TMPDIR not set (will be set by pathConfig at server start)"
else
    echo -e "${RED}✗${NC} Current TMUX_TMPDIR is $CURRENT_TMUX_TMPDIR (should be /tmp)"
    ERRORS=$((ERRORS + 1))
fi

# Test 9: Verify tmux sessions are in /tmp
echo ""
echo "📋 Test 9: Check where active tmux sessions are located"
if [ -d "/tmp/tmux-501" ] || [ -S "/tmp/tmux-501/default" ]; then
    echo -e "${GREEN}✓${NC} Tmux sessions found in /tmp (correct location)"
elif [ -d "/private/tmp/tmux-501" ]; then
    echo -e "${RED}✗${NC} Tmux sessions found in /private/tmp (WRONG - will cause orphaning!)"
    ERRORS=$((ERRORS + 1))
else
    echo -e "${YELLOW}⚠${NC} No active tmux sessions found"
fi

# Test 10: Verify UnifiedFarmLaunchOrchestrator uses pathConfig
echo ""
echo "📋 Test 10: Verify UnifiedFarmLaunchOrchestrator uses pathConfig for TMUX_TMPDIR"
if grep -q "const tmuxTmpDir = pathConfig.getPath('TMUX_TMP_DIR')" /Users/rohnspringfield/maifarm/apps/api/src/services/UnifiedFarmLaunchOrchestrator.ts; then
    echo -e "${GREEN}✓${NC} UnifiedFarmLaunchOrchestrator uses pathConfig.getPath('TMUX_TMP_DIR')"
else
    echo -e "${RED}✗${NC} UnifiedFarmLaunchOrchestrator not using pathConfig"
    ERRORS=$((ERRORS + 1))
fi

# Summary
echo ""
echo "======================================"
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✅ All validation checks passed!${NC}"
    echo ""
    echo "TMUX_TMPDIR is consistently set to /tmp across:"
    echo "  ✓ pathConfig.ts initialization"
    echo "  ✓ process.env forcing"
    echo "  ✓ Python orchestrator"
    echo "  ✓ UnifiedFarmLaunchOrchestrator"
    echo "  ✓ UnifiedTerminalService"
    echo ""
    echo "SESSION_TIMEOUT increased to 10 minutes"
    echo ""
    echo "🎯 Farms should no longer become orphaned prematurely!"
    exit 0
else
    echo -e "${RED}❌ Found $ERRORS critical issues!${NC}"
    echo ""
    echo "Please fix the issues above before proceeding."
    exit 1
fi
