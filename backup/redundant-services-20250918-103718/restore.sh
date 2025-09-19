#!/bin/bash
# Restoration script for redundant services

echo "Restoring services from backup..."
BACKUP_DIR="$(dirname "$0")"
SERVICE_PATH="/Users/rohnspringfield/maifarm/server/services"

for file in "$BACKUP_DIR"/*.ts; do
    if [ -f "$file" ]; then
        filename=$(basename "$file")
        echo "  Restoring $filename..."
        cp "$file" "$SERVICE_PATH/"
    fi
done

echo "Restoration complete!"
