#!/bin/bash

# XenoSync Workspace Cleanup Script
# Removes recursive workspace pollution while preserving legitimate workspaces

echo "====================================="
echo "XenoSync Workspace Cleanup"
echo "====================================="

XSYNC_ROOT="/Users/rohnspringfield/maifarm/xsync-sessions"

if [ ! -d "$XSYNC_ROOT" ]; then
    echo "❌ XenoSync sessions directory not found: $XSYNC_ROOT"
    exit 1
fi

# Count recursive directories before cleanup
BEFORE_COUNT=$(find "$XSYNC_ROOT" -type d -name "xsync-sessions" 2>/dev/null | wc -l)
echo "📊 Found $BEFORE_COUNT xsync-sessions directories (including root)"

# Remove recursive xsync-sessions directories (keep only the root)
echo "🧹 Cleaning recursive xsync-sessions directories..."
find "$XSYNC_ROOT" -mindepth 2 -type d -name "xsync-sessions" -exec rm -rf {} + 2>/dev/null

# Remove recursive workspace directories that contain workspace
echo "🧹 Cleaning recursive workspace copies..."
find "$XSYNC_ROOT" -mindepth 4 -type d -path "*/workspace/*/project/xsync-sessions" -exec rm -rf {} + 2>/dev/null

# Remove broken symlinks
echo "🔗 Removing broken symlinks..."
find "$XSYNC_ROOT" -type l ! -exec test -e {} \; -delete 2>/dev/null

# Remove empty directories
echo "📁 Removing empty directories..."
find "$XSYNC_ROOT" -type d -empty -delete 2>/dev/null

# Count after cleanup
AFTER_COUNT=$(find "$XSYNC_ROOT" -type d -name "xsync-sessions" 2>/dev/null | wc -l)
echo "✅ Cleanup complete. Remaining: $AFTER_COUNT xsync-sessions directories"

# Show disk space saved
if command -v du &> /dev/null; then
    SPACE_USED=$(du -sh "$XSYNC_ROOT" 2>/dev/null | cut -f1)
    echo "💾 Current XenoSync space usage: $SPACE_USED"
fi

# Optional: Clean up old sessions (older than 7 days)
read -p "Remove XenoSync sessions older than 7 days? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🗓️  Removing sessions older than 7 days..."
    find "$XSYNC_ROOT" -maxdepth 1 -type d -mtime +7 -exec basename {} \; | while read session; do
        if [[ "$session" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
            echo "  Removing old session: $session"
            rm -rf "$XSYNC_ROOT/$session"
        fi
    done
fi

echo "====================================="
echo "✨ XenoSync cleanup completed!"
echo "====================================="