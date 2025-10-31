# Deprecated/Quarantined Files

This directory contains files and directories that have been removed from the main codebase but preserved for potential restoration.

## Vendored Libraries (Moved: $(date))

The following vendored libraries were removed because they are also listed as regular dependencies in `pyproject.toml`:
- `aiosqlite/` - Available via pip/poetry
- `portalocker/` - Available via pip/poetry  
- `prometheus_client/` - Available via pip/poetry
- `structlog/` - Available via pip/poetry

### Restoration Instructions

If these vendored copies contain custom patches:
1. Compare with pip-installed versions
2. Extract any custom modifications
3. Apply patches to regular dependencies
4. Or restore vendored version: `git restore --source=pre-cleanup-maifarm <path>`

## Server Directory (Moved: $(date))

The `server/` directory appears to be legacy code superseded by `apps/api/`. 
- References only found in legacy scripts under `scripts/legacy/`
- Main app uses `apps/api/` structure

### Restoration
```bash
git restore --source=pre-cleanup-maifarm server/
```

## Development Assets

The `development/` directory contains manual test scripts. Preserved in place.

## Marketing Materials

The `marketing/` directory (40K) has been moved to `docs/marketing/` as it contains non-code assets.

## Rollback Plan

To restore everything:
```bash
git reset --hard pre-cleanup-maifarm
git clean -fd
```

Or restore individual items:
```bash
git restore --source=pre-cleanup-maifarm <path>
```
