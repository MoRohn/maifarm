#!/bin/bash

# Fix Redis setex to setEx in all TypeScript files
echo "Fixing Redis setex to setEx in all TypeScript files..."

# Find all TypeScript files and replace setex with setEx
find /Users/rohnspringfield/maifarm/server -name "*.ts" -type f -exec sed -i '' 's/\.setex(/\.setEx(/g' {} \;

echo "Fixed all occurrences of redis.setex to redis.setEx"

# Count how many files were affected
affected_files=$(grep -r "\.setEx(" /Users/rohnspringfield/maifarm/server --include="*.ts" -l | wc -l)
echo "Updated $affected_files files"