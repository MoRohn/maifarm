#!/bin/bash

echo "Fixing Redis v4+ API changes in all TypeScript files..."

# Fix hash operations (hset -> hSet, hget -> hGet, etc.)
echo "Fixing hash operations..."
find /Users/rohnspringfield/maifarm/server -name "*.ts" -type f -exec sed -i '' 's/\.hset(/\.hSet(/g' {} \;
find /Users/rohnspringfield/maifarm/server -name "*.ts" -type f -exec sed -i '' 's/\.hget(/\.hGet(/g' {} \;
find /Users/rohnspringfield/maifarm/server -name "*.ts" -type f -exec sed -i '' 's/\.hdel(/\.hDel(/g' {} \;
find /Users/rohnspringfield/maifarm/server -name "*.ts" -type f -exec sed -i '' 's/\.hgetall(/\.hGetAll(/g' {} \;
find /Users/rohnspringfield/maifarm/server -name "*.ts" -type f -exec sed -i '' 's/\.hmset(/\.hSet(/g' {} \;  # hmset is deprecated, use hSet
find /Users/rohnspringfield/maifarm/server -name "*.ts" -type f -exec sed -i '' 's/\.hmget(/\.hmGet(/g' {} \;
find /Users/rohnspringfield/maifarm/server -name "*.ts" -type f -exec sed -i '' 's/\.hexists(/\.hExists(/g' {} \;
find /Users/rohnspringfield/maifarm/server -name "*.ts" -type f -exec sed -i '' 's/\.hlen(/\.hLen(/g' {} \;
find /Users/rohnspringfield/maifarm/server -name "*.ts" -type f -exec sed -i '' 's/\.hkeys(/\.hKeys(/g' {} \;
find /Users/rohnspringfield/maifarm/server -name "*.ts" -type f -exec sed -i '' 's/\.hvals(/\.hVals(/g' {} \;

# Fix list operations
echo "Fixing list operations..."
find /Users/rohnspringfield/maifarm/server -name "*.ts" -type f -exec sed -i '' 's/\.lpush(/\.lPush(/g' {} \;
find /Users/rohnspringfield/maifarm/server -name "*.ts" -type f -exec sed -i '' 's/\.rpush(/\.rPush(/g' {} \;
find /Users/rohnspringfield/maifarm/server -name "*.ts" -type f -exec sed -i '' 's/\.lpop(/\.lPop(/g' {} \;
find /Users/rohnspringfield/maifarm/server -name "*.ts" -type f -exec sed -i '' 's/\.rpop(/\.rPop(/g' {} \;
find /Users/rohnspringfield/maifarm/server -name "*.ts" -type f -exec sed -i '' 's/\.llen(/\.lLen(/g' {} \;
find /Users/rohnspringfield/maifarm/server -name "*.ts" -type f -exec sed -i '' 's/\.lrange(/\.lRange(/g' {} \;
find /Users/rohnspringfield/maifarm/server -name "*.ts" -type f -exec sed -i '' 's/\.ltrim(/\.lTrim(/g' {} \;

# Fix set operations
echo "Fixing set operations..."
find /Users/rohnspringfield/maifarm/server -name "*.ts" -type f -exec sed -i '' 's/\.sadd(/\.sAdd(/g' {} \;
find /Users/rohnspringfield/maifarm/server -name "*.ts" -type f -exec sed -i '' 's/\.srem(/\.sRem(/g' {} \;
find /Users/rohnspringfield/maifarm/server -name "*.ts" -type f -exec sed -i '' 's/\.smembers(/\.sMembers(/g' {} \;
find /Users/rohnspringfield/maifarm/server -name "*.ts" -type f -exec sed -i '' 's/\.sismember(/\.sIsMember(/g' {} \;
find /Users/rohnspringfield/maifarm/server -name "*.ts" -type f -exec sed -i '' 's/\.scard(/\.sCard(/g' {} \;

# Fix sorted set operations
echo "Fixing sorted set operations..."
find /Users/rohnspringfield/maifarm/server -name "*.ts" -type f -exec sed -i '' 's/\.zadd(/\.zAdd(/g' {} \;
find /Users/rohnspringfield/maifarm/server -name "*.ts" -type f -exec sed -i '' 's/\.zrem(/\.zRem(/g' {} \;
find /Users/rohnspringfield/maifarm/server -name "*.ts" -type f -exec sed -i '' 's/\.zrange(/\.zRange(/g' {} \;
find /Users/rohnspringfield/maifarm/server -name "*.ts" -type f -exec sed -i '' 's/\.zrevrange(/\.zRevRange(/g' {} \;
find /Users/rohnspringfield/maifarm/server -name "*.ts" -type f -exec sed -i '' 's/\.zscore(/\.zScore(/g' {} \;
find /Users/rohnspringfield/maifarm/server -name "*.ts" -type f -exec sed -i '' 's/\.zcard(/\.zCard(/g' {} \;

# Fix other common operations
echo "Fixing other common operations..."
find /Users/rohnspringfield/maifarm/server -name "*.ts" -type f -exec sed -i '' 's/\.getset(/\.getSet(/g' {} \;
find /Users/rohnspringfield/maifarm/server -name "*.ts" -type f -exec sed -i '' 's/\.strlen(/\.strLen(/g' {} \;
find /Users/rohnspringfield/maifarm/server -name "*.ts" -type f -exec sed -i '' 's/\.dbsize(/\.dbSize(/g' {} \;
find /Users/rohnspringfield/maifarm/server -name "*.ts" -type f -exec sed -i '' 's/\.flushdb(/\.flushDb(/g' {} \;
find /Users/rohnspringfield/maifarm/server -name "*.ts" -type f -exec sed -i '' 's/\.flushall(/\.flushAll(/g' {} \;

echo "Completed fixing Redis v4+ API changes"

# Count affected files
echo "Checking for files with Redis operations..."
grep -r "\.(hSet\|hGet\|lPush\|sAdd\|zAdd)" /Users/rohnspringfield/maifarm/server --include="*.ts" -l | wc -l | xargs echo "Files with Redis operations:"