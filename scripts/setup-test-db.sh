#!/bin/bash

# Test Database Setup Script
set -e

echo "🔧 Setting up test database..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Database credentials
DB_NAME="maifarm_test"
DB_USER="maifarm"
DB_PASSWORD="maifarm123"

# Check if PostgreSQL is running
if ! pg_isready -q; then
    echo -e "${RED}❌ PostgreSQL is not running. Please start PostgreSQL first.${NC}"
    exit 1
fi

echo "📦 Creating test database..."

# Drop existing test database if it exists
PGPASSWORD=$DB_PASSWORD psql -U $DB_USER -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;" 2>/dev/null || true

# Create test database
PGPASSWORD=$DB_PASSWORD psql -U $DB_USER -d postgres -c "CREATE DATABASE $DB_NAME;" || {
    echo -e "${YELLOW}⚠️  Database might already exist, continuing...${NC}"
}

# Grant privileges
PGPASSWORD=$DB_PASSWORD psql -U $DB_USER -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;" || true

echo "🔄 Running migrations on test database..."

# Run migrations
for migration in server/database/migrations/*.sql; do
    if [[ -f "$migration" ]]; then
        filename=$(basename "$migration")
        # Skip rollback and consolidated schema files
        if [[ "$filename" != "rollback-migrations.sql" ]] && [[ "$filename" != "CONSOLIDATED_SCHEMA.sql" ]]; then
            echo "  → Applying $filename..."
            PGPASSWORD=$DB_PASSWORD psql -U $DB_USER -d $DB_NAME -f "$migration" 2>/dev/null || {
                echo -e "${YELLOW}    ⚠️  Migration might have issues, continuing...${NC}"
            }
        fi
    fi
done

echo -e "${GREEN}✅ Test database setup complete!${NC}"

# Setup Redis test database
echo "🔧 Setting up Redis test database..."

# Check if Redis is running
if redis-cli ping > /dev/null 2>&1; then
    # Select test database (db 1)
    redis-cli SELECT 1
    # Clear test database
    redis-cli FLUSHDB
    echo -e "${GREEN}✅ Redis test database cleared and ready!${NC}"
else
    echo -e "${YELLOW}⚠️  Redis is not running. Tests may fail.${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Test environment setup complete!${NC}"
echo "   Database: $DB_NAME"
echo "   User: $DB_USER"
echo "   Redis DB: 1"