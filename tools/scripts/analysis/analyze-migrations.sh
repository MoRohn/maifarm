#!/bin/bash

# Analyze all migration files to understand what they do
MIGRATION_DIR="$(pwd)/apps/api/src/database/migrations"

echo "=== MIGRATION ANALYSIS ==="
echo ""

for file in $(ls $MIGRATION_DIR/*.sql | sort); do
    filename=$(basename "$file")
    echo "----------------------------------------"
    echo "FILE: $filename"
    echo "----------------------------------------"
    
    # Extract key operations
    echo "TABLES CREATED:"
    grep -i "CREATE TABLE" "$file" | sed 's/CREATE TABLE IF NOT EXISTS//' | sed 's/CREATE TABLE//' | awk '{print "  -", $1}'
    
    echo "TABLES ALTERED:"
    grep -i "ALTER TABLE" "$file" | grep -v "DROP" | sed 's/ALTER TABLE//' | awk '{print "  -", $1}' | sort -u
    
    echo "COLUMNS ADDED:"
    grep -i "ADD COLUMN" "$file" | sed 's/.*ADD COLUMN/  -/'
    
    echo "INDEXES CREATED:"
    grep -i "CREATE INDEX" "$file" | sed 's/CREATE INDEX IF NOT EXISTS//' | sed 's/CREATE INDEX//' | awk '{print "  -", $1}'
    
    echo "CONSTRAINTS ADDED:"
    grep -i "ADD CONSTRAINT" "$file" | sed 's/.*ADD CONSTRAINT/  -/' | head -5
    
    echo ""
done

echo "=== DUPLICATE MIGRATION NUMBERS ==="
echo ""
ls $MIGRATION_DIR/*.sql | xargs -n1 basename | cut -d_ -f1 | sort | uniq -d | while read num; do
    echo "Number $num:"
    ls $MIGRATION_DIR/${num}_*.sql | xargs -n1 basename
    echo ""
done

echo "=== DISABLED MIGRATIONS ==="
ls $MIGRATION_DIR/*.disabled 2>/dev/null | xargs -n1 basename

echo ""
echo "=== TOTAL MIGRATION COUNT ==="
ls $MIGRATION_DIR/*.sql | wc -l
