#!/usr/bin/env bash
#
# Database Schema Validation Script
# Comprehensive validation of database schema integrity and completeness
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

DB_USER="${PGUSER:-maifarm}"
DB_NAME="${PGDATABASE:-maifarm_dev}"
DB_PASSWORD="${PGPASSWORD:-maifarm123}"

export PGPASSWORD="$DB_PASSWORD"
PSQL="/opt/homebrew/Cellar/postgresql@15/15.13/bin/psql"

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  Database Schema Validation Report${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Test 1: Check database connection
echo -e "${YELLOW}[1/10]${NC} Testing database connection..."
if $PSQL -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Database connection successful${NC}"
else
  echo -e "${RED}✗ Cannot connect to database${NC}"
  exit 1
fi

# Test 2: Check critical tables exist
echo -e "\n${YELLOW}[2/10]${NC} Checking critical tables..."
CRITICAL_TABLES=("users" "farms" "agents" "harvests" "seeds" "sessions" "schema_migrations")
MISSING_TABLES=()

for table in "${CRITICAL_TABLES[@]}"; do
  if $PSQL -U "$DB_USER" -d "$DB_NAME" -tc "SELECT 1 FROM pg_tables WHERE tablename='$table';" | grep -q 1; then
    echo -e "${GREEN}  ✓ $table${NC}"
  else
    echo -e "${RED}  ✗ $table${NC}"
    MISSING_TABLES+=("$table")
  fi
done

if [ ${#MISSING_TABLES[@]} -gt 0 ]; then
  echo -e "${RED}✗ Missing critical tables: ${MISSING_TABLES[*]}${NC}"
  echo -e "  Run migrations to create missing tables"
fi

# Test 3: Check agents table schema
echo -e "\n${YELLOW}[3/10]${NC} Validating agents table schema..."
REQUIRED_AGENT_COLUMNS=("id" "farm_id" "name" "type" "status" "session_name" "pane_index")
MISSING_COLUMNS=()

for column in "${REQUIRED_AGENT_COLUMNS[@]}"; do
  if $PSQL -U "$DB_USER" -d "$DB_NAME" -tc "SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='$column';" | grep -q 1; then
    echo -e "${GREEN}  ✓ agents.$column${NC}"
  else
    echo -e "${RED}  ✗ agents.$column${NC}"
    MISSING_COLUMNS+=("$column")
  fi
done

if [ ${#MISSING_COLUMNS[@]} -gt 0 ]; then
  echo -e "${RED}✗ Missing critical columns in agents table: ${MISSING_COLUMNS[*]}${NC}"
fi

# Test 4: Check farms table schema
echo -e "\n${YELLOW}[4/10]${NC} Validating farms table schema..."
REQUIRED_FARM_COLUMNS=("id" "name" "status" "session_name" "config" "created_at")

for column in "${REQUIRED_FARM_COLUMNS[@]}"; do
  if $PSQL -U "$DB_USER" -d "$DB_NAME" -tc "SELECT 1 FROM information_schema.columns WHERE table_name='farms' AND column_name='$column';" | grep -q 1; then
    echo -e "${GREEN}  ✓ farms.$column${NC}"
  else
    echo -e "${RED}  ✗ farms.$column${NC}"
  fi
done

# Test 5: Check foreign key constraints
echo -e "\n${YELLOW}[5/10]${NC} Checking foreign key constraints..."
FK_CHECK=$($PSQL -U "$DB_USER" -d "$DB_NAME" -tc "
  SELECT COUNT(*)
  FROM information_schema.table_constraints
  WHERE constraint_type = 'FOREIGN KEY'
    AND table_name IN ('agents', 'harvests', 'seeds', 'tasks');
")

if [ "$FK_CHECK" -gt 0 ]; then
  echo -e "${GREEN}✓ Foreign key constraints found: $FK_CHECK${NC}"
else
  echo -e "${YELLOW}⚠ No foreign key constraints found${NC}"
fi

# Test 6: Check indexes on critical columns
echo -e "\n${YELLOW}[6/10]${NC} Checking performance indexes..."
CRITICAL_INDEXES=(
  "idx_agents_farm_id"
  "idx_agents_status"
  "idx_farms_status"
  "idx_agents_session_name"
)

MISSING_INDEXES=()
for index in "${CRITICAL_INDEXES[@]}"; do
  if $PSQL -U "$DB_USER" -d "$DB_NAME" -tc "SELECT 1 FROM pg_indexes WHERE indexname='$index';" | grep -q 1; then
    echo -e "${GREEN}  ✓ $index${NC}"
  else
    echo -e "${YELLOW}  ⚠ $index (missing, but not critical)${NC}"
    MISSING_INDEXES+=("$index")
  fi
done

# Test 7: Check migration tracking
echo -e "\n${YELLOW}[7/10]${NC} Checking migration tracking..."
APPLIED_MIGRATIONS=$($PSQL -U "$DB_USER" -d "$DB_NAME" -tc "SELECT COUNT(*) FROM schema_migrations;")
echo -e "${GREEN}✓ Applied migrations: $APPLIED_MIGRATIONS${NC}"

# Show which migrations are applied
echo -e "  ${BLUE}Applied migrations:${NC}"
$PSQL -U "$DB_USER" -d "$DB_NAME" -tc "SELECT version, filename FROM schema_migrations ORDER BY version;" | while read line; do
  echo -e "    $line"
done

# Test 8: Check for duplicate migration versions
echo -e "\n${YELLOW}[8/10]${NC} Checking for migration conflicts..."
MIGRATION_DIR="$PROJECT_ROOT/apps/api/src/database/migrations"
DUPLICATE_VERSIONS=$(ls "$MIGRATION_DIR"/*.sql 2>/dev/null | sed 's/.*\/\([0-9]\+\)_.*/\1/' | sort | uniq -d)

if [ -z "$DUPLICATE_VERSIONS" ]; then
  echo -e "${GREEN}✓ No duplicate migration versions${NC}"
else
  echo -e "${RED}✗ Duplicate migration versions found:${NC}"
  echo "$DUPLICATE_VERSIONS" | while read version; do
    echo -e "${RED}  Version $version:${NC}"
    ls "$MIGRATION_DIR"/"$version"_*.sql | sed 's/.*\//    /'
  done
fi

# Test 9: Data integrity checks
echo -e "\n${YELLOW}[9/10]${NC} Running data integrity checks..."

# Check for orphaned agents (agents without farms)
ORPHANED_AGENTS=$($PSQL -U "$DB_USER" -d "$DB_NAME" -tc "
  SELECT COUNT(*)
  FROM agents a
  LEFT JOIN farms f ON a.farm_id = f.id
  WHERE f.id IS NULL;
")

if [ "$ORPHANED_AGENTS" -eq 0 ]; then
  echo -e "${GREEN}✓ No orphaned agents${NC}"
else
  echo -e "${YELLOW}⚠ Found $ORPHANED_AGENTS orphaned agents${NC}"
fi

# Check for farms without agents that should have them
INCOMPLETE_FARMS=$($PSQL -U "$DB_USER" -d "$DB_NAME" -tc "
  SELECT COUNT(*)
  FROM farms f
  LEFT JOIN agents a ON f.id = a.farm_id
  WHERE f.status IN ('active', 'running')
  AND a.id IS NULL;
")

if [ "$INCOMPLETE_FARMS" -eq 0 ]; then
  echo -e "${GREEN}✓ All active farms have agents${NC}"
else
  echo -e "${YELLOW}⚠ Found $INCOMPLETE_FARMS active farms without agents${NC}"
fi

# Test 10: Performance metrics
echo -e "\n${YELLOW}[10/10]${NC} Database performance metrics..."

# Table sizes
echo -e "${BLUE}  Table sizes:${NC}"
$PSQL -U "$DB_USER" -d "$DB_NAME" -c "
  SELECT
    schemaname as schema,
    tablename as table,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
    pg_total_relation_size(schemaname||'.'||tablename) as bytes
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY bytes DESC
  LIMIT 10;
" -t | sed 's/^/    /'

# Summary
echo ""
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}              Summary${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

ISSUES=0

if [ ${#MISSING_TABLES[@]} -gt 0 ]; then
  echo -e "${RED}✗ Missing tables: ${#MISSING_TABLES[@]}${NC}"
  ISSUES=$((ISSUES + ${#MISSING_TABLES[@]}))
fi

if [ ${#MISSING_COLUMNS[@]} -gt 0 ]; then
  echo -e "${RED}✗ Missing columns in agents table: ${#MISSING_COLUMNS[@]}${NC}"
  ISSUES=$((ISSUES + ${#MISSING_COLUMNS[@]}))
fi

if [ -n "$DUPLICATE_VERSIONS" ]; then
  echo -e "${RED}✗ Duplicate migration versions detected${NC}"
  ISSUES=$((ISSUES + 1))
fi

if [ "$ISSUES" -eq 0 ]; then
  echo -e "${GREEN}✓ All validation checks passed!${NC}"
  echo -e "${GREEN}✓ Database schema is healthy and optimized${NC}"
  exit 0
else
  echo -e "${RED}✗ Found $ISSUES critical issues${NC}"
  echo -e "  Review the output above for details"
  exit 1
fi
