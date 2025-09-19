#!/bin/bash

# Database State Checker for MaiFarm
# This script analyzes the current database state and migration status

set -e

# Configuration
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-maifarm_dev}"
DB_USER="${DB_USER:-maifarm}"
DB_PASSWORD="${DB_PASSWORD:-maifarm123}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "====================================="
echo "MaiFarm Database State Analyzer"
echo "====================================="
echo ""
echo -e "${BLUE}Database:${NC} $DB_NAME@$DB_HOST:$DB_PORT"
echo -e "${BLUE}User:${NC} $DB_USER"
echo ""

# Function to run SQL query
run_query() {
    PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -tAc "$1" 2>/dev/null || echo "0"
}

# Check connection
echo -e "${YELLOW}Checking connection...${NC}"
if PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "\q" 2>/dev/null; then
    echo -e "${GREEN}✓ Connected successfully${NC}"
else
    echo -e "${RED}✗ Cannot connect to database${NC}"
    exit 1
fi

echo ""
echo "====================================="
echo "Table Analysis"
echo "====================================="

# Check migration 001_core tables
echo ""
echo -e "${BLUE}Migration: 001_core${NC}"
echo "----------------------------------------"
found=0
missing=0
for table in users farms agents tasks sessions settings tmux_sessions farm_lifecycle_events; do
    result=$(run_query "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '$table');")
    if [[ "$result" == "t" ]]; then
        echo -e "  ${GREEN}✓${NC} $table"
        ((found++))
    else
        echo -e "  ${RED}✗${NC} $table (missing)"
        ((missing++))
    fi
done
echo -e "${YELLOW}  Status: $found found, $missing missing${NC}"

# Check migration 002_monitoring tables
echo ""
echo -e "${BLUE}Migration: 002_monitoring${NC}"
echo "----------------------------------------"
found=0
missing=0
for table in metrics logs health_checks agent_health_checks token_usage alerts alert_rules thinking_metrics thinking_preferences thinking_recommendations provider_metrics audit_logs; do
    result=$(run_query "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '$table');")
    if [[ "$result" == "t" ]]; then
        echo -e "  ${GREEN}✓${NC} $table"
        ((found++))
    else
        echo -e "  ${RED}✗${NC} $table (missing)"
        ((missing++))
    fi
done
echo -e "${YELLOW}  Status: $found found, $missing missing${NC}"

# Check migration 003_harvest tables
echo ""
echo -e "${BLUE}Migration: 003_harvest${NC}"
echo "----------------------------------------"
found=0
missing=0
for table in seeds harvests harvest_yield harvest_manifests barn_items barn_sync_log quick_tasks gowild_sessions gowild_discoveries gowild_checkpoints task_checkpoints workspace_pool; do
    result=$(run_query "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '$table');")
    if [[ "$result" == "t" ]]; then
        echo -e "  ${GREEN}✓${NC} $table"
        ((found++))
    else
        echo -e "  ${RED}✗${NC} $table (missing)"
        ((missing++))
    fi
done
echo -e "${YELLOW}  Status: $found found, $missing missing${NC}"

# Check migration 004_security tables
echo ""
echo -e "${BLUE}Migration: 004_security${NC}"
echo "----------------------------------------"
found=0
missing=0
for table in api_keys security_audits vulnerabilities access_tokens permission_grants rate_limits encryption_keys security_audit_trail; do
    result=$(run_query "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '$table');")
    if [[ "$result" == "t" ]]; then
        echo -e "  ${GREEN}✓${NC} $table"
        ((found++))
    else
        echo -e "  ${RED}✗${NC} $table (missing)"
        ((missing++))
    fi
done
echo -e "${YELLOW}  Status: $found found, $missing missing${NC}"

# Check migration 005_cluster tables
echo ""
echo -e "${BLUE}Migration: 005_cluster${NC}"
echo "----------------------------------------"
found=0
missing=0
for table in cluster_nodes load_balancer_rules provider_pool cross_provider_messages provider_bridges resource_pools failover_policies cluster_events agent_metrics; do
    result=$(run_query "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '$table');")
    if [[ "$result" == "t" ]]; then
        echo -e "  ${GREEN}✓${NC} $table"
        ((found++))
    else
        echo -e "  ${RED}✗${NC} $table (missing)"
        ((missing++))
    fi
done
echo -e "${YELLOW}  Status: $found found, $missing missing${NC}"

echo ""
echo "====================================="
echo "Database Statistics"
echo "====================================="

# Total tables
TOTAL_TABLES=$(run_query "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")
echo -e "${BLUE}Total tables:${NC} $TOTAL_TABLES"

# Database size
DB_SIZE=$(run_query "SELECT pg_database_size('$DB_NAME');")
DB_SIZE_MB=$((DB_SIZE / 1024 / 1024))
echo -e "${BLUE}Database size:${NC} ${DB_SIZE_MB}MB"

# Check for active connections
ACTIVE_CONNECTIONS=$(run_query "SELECT COUNT(*) FROM pg_stat_activity WHERE datname = '$DB_NAME';")
echo -e "${BLUE}Active connections:${NC} $ACTIVE_CONNECTIONS"

echo ""
echo "====================================="
echo "Data Summary"
echo "====================================="

# Check key table counts
echo ""
echo "Record counts:"

for table in "users" "farms" "agents" "tasks" "harvests" "api_keys"; do
    exists=$(run_query "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '$table');")
    if [[ "$exists" == "t" ]]; then
        count=$(run_query "SELECT COUNT(*) FROM $table;")
        printf "  %-20s %s\n" "$table:" "$count"
    fi
done

echo ""
echo "====================================="
echo "Constraint Analysis"
echo "====================================="

# Check agent status constraint
echo ""
echo "Checking agent status constraint..."
AGENT_CONSTRAINT=$(run_query "SELECT con.conname FROM pg_constraint con INNER JOIN pg_class rel ON rel.oid = con.conrelid WHERE rel.relname = 'agents' AND con.conname LIKE '%status%';")
if [[ -n "$AGENT_CONSTRAINT" ]]; then
    echo -e "${GREEN}✓ Agent status constraint found:${NC} $AGENT_CONSTRAINT"
    
    # Get constraint definition
    CONSTRAINT_DEF=$(PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -tAc "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = '$AGENT_CONSTRAINT';" 2>/dev/null)
    echo "  Definition: $CONSTRAINT_DEF"
else
    echo -e "${RED}✗ No agent status constraint found${NC}"
fi

echo ""
echo "====================================="
echo "Recommendations"
echo "====================================="

if [[ "$TOTAL_TABLES" -eq 0 ]]; then
    echo -e "${GREEN}Fresh database detected.${NC}"
    echo "Run: ./apply-migrations.sh to set up the database"
elif [[ "$TOTAL_TABLES" -lt 50 ]]; then
    echo -e "${YELLOW}Partial database detected.${NC}"
    echo "Some migrations may be missing."
    echo "Run: ./apply-migrations.sh and choose option 2 (apply missing migrations)"
else
    echo -e "${GREEN}Database appears complete.${NC}"
    echo "All major tables seem to be present."
fi

echo ""
echo "To apply migrations: ./apply-migrations.sh"
echo "To rollback all: psql -U $DB_USER -d $DB_NAME -f rollback-migrations.sql"
echo ""