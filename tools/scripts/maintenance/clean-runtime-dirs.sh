#!/usr/bin/env bash
# Cleans up MaiFarm runtime directories that should never be committed.
# Safe to run in CI or locally before commits. Skips directories that are
# missing and preserves marker files like .gitkeep.

set -euo pipefail

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT_DIR"

# Directories whose contents are ephemeral agent output or tmux sockets.
RUNTIME_DIRS=(
  "maibarn/harvests"
  "maibarn/terminals"
  "maibarn/workspaces"
  "var/tmp"
  "var/tmux"
  "var/maibarn/harvests"
  "var/maibarn/terminals"
  "var/maibarn/workspaces"
  "var/maibarn/xenosync-sessions"
  "var/maibarn/temp"
  "var/maibarn/logs"
  "xsync-sessions"
  ".xenosync_session"
  ".xenosync_coordination"
)

# Files we intentionally retain even inside runtime directories.
KEEP_BASENAMES=(".gitkeep" "README.md")

# Directories that should exist after cleanup even if they were fully removed
# during the purge (prevents runtime errors expecting them).
BASELINE_DIRS=(
  "maibarn/harvests"
  "maibarn/terminals"
  "maibarn/workspaces"
  "var/tmp"
  "var/tmux"
  "var/maibarn/harvests/active"
  "var/maibarn/harvests/completed"
  "var/maibarn/harvests/in-progress"
  "var/maibarn/terminals"
  "var/maibarn/workspaces/active"
  "var/maibarn/workspaces/archived"
  "var/maibarn/xenosync-sessions/coordination"
  "var/maibarn/logs/agents"
  "var/maibarn/logs/system"
)

remove_contents() {
  local target="$1"
  if [[ ! -e "$target" ]]; then
    echo "[skip] $target (missing)"
    return
  fi

  if [[ -f "$target" ]]; then
    # Certain runtime artefacts are single files (e.g. .xenosync_session).
    if $DRY_RUN; then
      echo "[dry-run] would remove file $target"
    else
      rm -f "$target"
      echo "[cleaned] removed file $target"
    fi
    return
  fi

  shopt -s dotglob nullglob
  local entries=("$target"/*)
  shopt -u dotglob

  if [[ ${#entries[@]} -eq 0 ]]; then
    echo "[skip] $target (already empty)"
    return
  fi

  for entry in "${entries[@]}"; do
    local name="$(basename "$entry")"
    local keep=false
    for keep_name in "${KEEP_BASENAMES[@]}"; do
      if [[ "$name" == "$keep_name" ]]; then
        keep=true
        break
      fi
    done
    if $keep; then
      continue
    fi

    if $DRY_RUN; then
      echo "[dry-run] would remove $entry"
    else
      rm -rf "$entry"
      echo "[cleaned] removed $entry"
    fi
  done
}

for dir in "${RUNTIME_DIRS[@]}"; do
  remove_contents "$dir"
done

if $DRY_RUN; then
  for dir in "${BASELINE_DIRS[@]}"; do
    echo "[dry-run] would ensure directory $dir exists"
  done
else
  for dir in "${BASELINE_DIRS[@]}"; do
    mkdir -p "$dir"
    touch "$dir/.gitkeep" 2>/dev/null || true
  done
fi

exit 0
