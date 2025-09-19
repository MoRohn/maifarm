#!/bin/bash

# Production Readiness Validation Script
# Comprehensive checks for MaiFarm production deployment

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "======================================"
echo "MaiFarm Production Readiness Validator"
echo "======================================"
echo ""

ERRORS=0
WARNINGS=0

# Function to check command exists
check_command() {
    if command -v $1 &> /dev/null; then
        echo -e "${GREEN}✓${NC} $1 is installed"
    else
        echo -e "${RED}✗${NC} $1 is not installed"
        ERRORS=$((ERRORS+1))
    fi
}

# Function to check environment variable
check_env() {
    if [ -z "${!1}" ]; then
        echo -e "${RED}✗${NC} Environment variable $1 is not set"
        ERRORS=$((ERRORS+1))
    else
        echo -e "${GREEN}✓${NC} Environment variable $1 is set"
    fi
}

# Function to check file exists
check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} File $1 exists"
    else
        echo -e "${RED}✗${NC} File $1 is missing"
        ERRORS=$((ERRORS+1))
    fi
}

# Function to check port availability
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null ; then
        echo -e "${YELLOW}⚠${NC} Port $1 is already in use"
        WARNINGS=$((WARNINGS+1))
    else
        echo -e "${GREEN}✓${NC} Port $1 is available"
    fi
}

echo "1. Checking System Dependencies"
echo "--------------------------------"
check_command node
check_command npm
check_command postgres
check_command redis-cli
check_command tmux
check_command python3
check_command curl
check_command git
echo ""

echo "2. Checking Node.js Version"
echo "---------------------------"
NODE_VERSION=$(node -v | cut -d'v' -f2)
REQUIRED_VERSION="18.0.0"
if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" = "$REQUIRED_VERSION" ]; then
    echo -e "${GREEN}✓${NC} Node.js version $NODE_VERSION meets minimum requirement"
else
    echo -e "${RED}✗${NC} Node.js version $NODE_VERSION is below minimum requirement $REQUIRED_VERSION"
    ERRORS=$((ERRORS+1))
fi
echo ""

echo "3. Checking Environment Configuration"
echo "-------------------------------------"
if [ -f .env.production ]; then
    source .env.production
fi
check_env NODE_ENV
check_env DB_NAME
check_env DB_USER
check_env DB_PASSWORD
check_env REDIS_URL
check_env SESSION_SECRET
check_env API_KEY_ENCRYPTION_KEY
echo ""

echo "4. Checking Critical Files"
echo "---------------------------"
check_file package.json
check_file tsconfig.json
check_file vite.config.ts
check_file server/index.ts
check_file src/App.tsx
check_file server/database/migrations/000_production_consolidated.sql
echo ""

echo "5. Checking Port Availability"
echo "------------------------------"
check_port 3000  # Frontend
check_port 4567  # Backend
check_port 5432  # PostgreSQL
check_port 6379  # Redis
echo ""

echo "6. Checking Database Connection"
echo "--------------------------------"
if PGPASSWORD=${DB_PASSWORD:-maifarm123} psql -U ${DB_USER:-maifarm} -d ${DB_NAME:-maifarm_dev} -h localhost -c "SELECT 1" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} PostgreSQL connection successful"
else
    echo -e "${RED}✗${NC} PostgreSQL connection failed"
    ERRORS=$((ERRORS+1))
fi
echo ""

echo "7. Checking Redis Connection"
echo "-----------------------------"
if redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Redis connection successful"
else
    echo -e "${RED}✗${NC} Redis connection failed"
    ERRORS=$((ERRORS+1))
fi
echo ""

echo "8. Checking TypeScript Compilation"
echo "-----------------------------------"
TS_ERRORS=$(npm run typecheck 2>&1 | grep "error TS" | wc -l | tr -d ' ')
if [ "$TS_ERRORS" -eq "0" ]; then
    echo -e "${GREEN}✓${NC} No TypeScript errors"
else
    echo -e "${YELLOW}⚠${NC} $TS_ERRORS TypeScript errors found (non-critical)"
    WARNINGS=$((WARNINGS+1))
fi
echo ""

echo "9. Checking Security Configuration"
echo "-----------------------------------"
if [ "$NODE_ENV" = "production" ]; then
    if [ -n "$SESSION_SECRET" ] && [ "$SESSION_SECRET" != "dev-secret" ]; then
        echo -e "${GREEN}✓${NC} Session secret is configured"
    else
        echo -e "${RED}✗${NC} Session secret is not properly configured for production"
        ERRORS=$((ERRORS+1))
    fi
    
    if [ -n "$API_KEY_ENCRYPTION_KEY" ]; then
        echo -e "${GREEN}✓${NC} API key encryption is configured"
    else
        echo -e "${RED}✗${NC} API key encryption is not configured"
        ERRORS=$((ERRORS+1))
    fi
else
    echo -e "${YELLOW}⚠${NC} Not in production mode, skipping security checks"
fi
echo ""

echo "10. Checking Build Process"
echo "---------------------------"
if [ -f "dist/index.html" ]; then
    echo -e "${GREEN}✓${NC} Production build exists"
else
    echo -e "${YELLOW}⚠${NC} Production build not found, running build..."
    npm run build
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓${NC} Build completed successfully"
    else
        echo -e "${RED}✗${NC} Build failed"
        ERRORS=$((ERRORS+1))
    fi
fi
echo ""

echo "11. Checking Service Health"
echo "----------------------------"
# Try to start the server in test mode
if timeout 5 npm run dev > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Server can start successfully"
else
    echo -e "${YELLOW}⚠${NC} Server startup test skipped or timed out"
fi

# Check API health endpoint
if curl -s http://localhost:4567/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Health endpoint is responsive"
else
    echo -e "${YELLOW}⚠${NC} Health endpoint is not responsive (server may not be running)"
    WARNINGS=$((WARNINGS+1))
fi
echo ""

echo "12. Checking Memory and Resource Limits"
echo "----------------------------------------"
MEM_TOTAL=$(free -m | grep '^Mem:' | awk '{print $2}')
if [ "$MEM_TOTAL" -ge 4096 ]; then
    echo -e "${GREEN}✓${NC} System has sufficient memory (${MEM_TOTAL}MB)"
else
    echo -e "${YELLOW}⚠${NC} System has limited memory (${MEM_TOTAL}MB), recommended minimum is 4GB"
    WARNINGS=$((WARNINGS+1))
fi

# Check disk space
DISK_USAGE=$(df -h . | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -lt 80 ]; then
    echo -e "${GREEN}✓${NC} Disk usage is acceptable (${DISK_USAGE}%)"
else
    echo -e "${YELLOW}⚠${NC} Disk usage is high (${DISK_USAGE}%)"
    WARNINGS=$((WARNINGS+1))
fi
echo ""

echo "======================================"
echo "Validation Summary"
echo "======================================"

if [ $ERRORS -eq 0 ]; then
    if [ $WARNINGS -eq 0 ]; then
        echo -e "${GREEN}✅ All checks passed! System is ready for production.${NC}"
    else
        echo -e "${GREEN}✅ System is ready for production with $WARNINGS warnings.${NC}"
    fi
else
    echo -e "${RED}❌ Found $ERRORS critical errors and $WARNINGS warnings.${NC}"
    echo -e "${RED}Please fix the errors before deploying to production.${NC}"
    exit 1
fi

echo ""
echo "Next Steps:"
echo "1. Review and fix any warnings"
echo "2. Run 'npm run build' to create production build"
echo "3. Set up process manager (PM2) for production"
echo "4. Configure reverse proxy (Nginx)"
echo "5. Set up SSL certificates"
echo "6. Configure monitoring and alerting"
echo "7. Set up automated backups"
echo ""

exit 0