#!/bin/bash
# Update blerbz-plugins from GitHub
# Usage: ./scripts/maintenance/update-blerbz-plugins.sh [--force]
#
# This script updates the blerbz-plugins directory from the upstream GitHub repo.
# It preserves local changes by stashing them before pulling and re-applying after.
#
# Options:
#   --force    Discard local changes and force update to match upstream
#   --check    Only check for updates, don't apply them
#   --version  Show current version info

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PLUGINS_DIR="$PROJECT_ROOT/blerbz-plugins"
GITHUB_URL="https://github.com/Blerbz/blerbz-plugins.git"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

show_version() {
    if [ -d "$PLUGINS_DIR" ]; then
        cd "$PLUGINS_DIR"
        local current_commit=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
        local current_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
        local remote_url=$(git remote get-url origin 2>/dev/null || echo "not set")

        echo "Blerbz Plugins Version Info"
        echo "============================"
        echo "Location:      $PLUGINS_DIR"
        echo "Branch:        $current_branch"
        echo "Commit:        $current_commit"
        echo "Remote URL:    $remote_url"
        echo ""

        # Show latest commit info
        echo "Latest commit:"
        git log -1 --format="  %h - %s (%cr)" 2>/dev/null || echo "  Unable to read commit info"
    else
        log_error "blerbz-plugins directory not found at $PLUGINS_DIR"
        exit 1
    fi
}

check_for_updates() {
    if [ ! -d "$PLUGINS_DIR" ]; then
        log_error "blerbz-plugins directory not found at $PLUGINS_DIR"
        exit 1
    fi

    cd "$PLUGINS_DIR"

    log_info "Fetching latest from origin..."
    git fetch origin --quiet 2>/dev/null || {
        log_error "Failed to fetch from origin. Check your network connection."
        exit 1
    }

    local local_commit=$(git rev-parse HEAD)
    local remote_commit=$(git rev-parse origin/main 2>/dev/null || git rev-parse origin/master 2>/dev/null)

    if [ "$local_commit" = "$remote_commit" ]; then
        log_success "Already up to date!"
        return 0
    else
        local behind=$(git rev-list --count HEAD..origin/main 2>/dev/null || git rev-list --count HEAD..origin/master 2>/dev/null || echo "?")
        log_warn "Updates available: $behind commit(s) behind"

        echo ""
        echo "New commits:"
        git log --oneline HEAD..origin/main 2>/dev/null || git log --oneline HEAD..origin/master 2>/dev/null | head -10
        echo ""

        return 1
    fi
}

update_plugins() {
    local force=$1

    if [ ! -d "$PLUGINS_DIR" ]; then
        log_info "blerbz-plugins not found. Cloning from GitHub..."
        git clone "$GITHUB_URL" "$PLUGINS_DIR"
        log_success "Successfully cloned blerbz-plugins"
        return 0
    fi

    cd "$PLUGINS_DIR"

    # Check for local changes
    local has_changes=false
    if ! git diff --quiet 2>/dev/null || ! git diff --staged --quiet 2>/dev/null; then
        has_changes=true
    fi

    # Check for untracked files that might conflict
    local untracked=$(git ls-files --others --exclude-standard)

    if [ "$force" = "true" ]; then
        log_warn "Force mode: discarding local changes..."
        git reset --hard HEAD
        git clean -fd
    elif [ "$has_changes" = "true" ]; then
        log_info "Stashing local changes..."
        git stash push -m "Auto-stash before update $(date +%Y%m%d-%H%M%S)"
    fi

    # Determine the main branch
    local main_branch="main"
    if ! git show-ref --verify --quiet refs/remotes/origin/main; then
        main_branch="master"
    fi

    log_info "Fetching updates from origin..."
    git fetch origin --quiet

    local current_branch=$(git rev-parse --abbrev-ref HEAD)

    if [ "$current_branch" != "$main_branch" ]; then
        log_warn "Currently on branch '$current_branch', switching to '$main_branch'"
        git checkout "$main_branch"
    fi

    log_info "Pulling latest changes..."
    git pull origin "$main_branch" --rebase

    # Re-apply stashed changes if we had any
    if [ "$has_changes" = "true" ] && [ "$force" != "true" ]; then
        log_info "Re-applying stashed changes..."
        if git stash pop 2>/dev/null; then
            log_success "Local changes re-applied successfully"
        else
            log_warn "Could not automatically re-apply local changes. Check 'git stash list'"
        fi
    fi

    local new_commit=$(git rev-parse --short HEAD)
    log_success "Updated to commit $new_commit"

    # Show what changed
    echo ""
    echo "Plugins included:"
    for plugin in inference-confidenz inference-continuez inference-planz; do
        if [ -d "$plugin" ]; then
            echo "  - $plugin"
        fi
    done
}

# Parse arguments
case "${1:-}" in
    --version|-v)
        show_version
        exit 0
        ;;
    --check|-c)
        check_for_updates
        exit $?
        ;;
    --force|-f)
        update_plugins "true"
        ;;
    --help|-h)
        echo "Update blerbz-plugins from GitHub"
        echo ""
        echo "Usage: $0 [option]"
        echo ""
        echo "Options:"
        echo "  --check, -c     Check for updates without applying them"
        echo "  --force, -f     Discard local changes and force update"
        echo "  --version, -v   Show current version info"
        echo "  --help, -h      Show this help message"
        echo ""
        echo "Without options, updates while preserving local changes via stash."
        exit 0
        ;;
    "")
        update_plugins "false"
        ;;
    *)
        log_error "Unknown option: $1"
        echo "Use --help for usage information"
        exit 1
        ;;
esac
