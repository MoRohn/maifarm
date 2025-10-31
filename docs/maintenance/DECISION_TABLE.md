# Cleanup Decision Table

## Evidence-Based Deletion Plan

### Cache Directories (100% Delete - meets ≥3 criteria)

| Path | Size | Criteria Met | Decision | Action |
|------|------|--------------|----------|--------|
| `.mypy_cache/` | 80M | Cache, 0 references, build output, already in .gitignore | **DELETE** | Remove from repo, ensure .gitignore |
| `.pytest_cache/` | 24K | Cache, 0 references, build output, already in .gitignore | **DELETE** | Remove from repo, ensure .gitignore |
| `.ruff_cache/` | 860K | Cache, 0 references, build output, already in .gitignore | **DELETE** | Remove from repo, ensure .gitignore |
| `.benchmarks/` | 0B | Empty cache dir, 0 references, not in builds | **DELETE** | Remove entirely |
| `.maifarm_cache/` | 0B | Empty cache dir, 0 references, not in builds | **DELETE** | Remove entirely |
| `dist/` | 53M | Build output, already gitignored, regenerated | **DELETE** | Remove from repo, ensure .gitignore |

### Vendored Libraries (Conservative - requires validation)

| Path | Size | Usage | Package Manager | Decision | Action |
|------|------|-------|-----------------|----------|--------|
| `aiosqlite/` | 8K | In pyproject.toml deps | pip/poetry installs | **QUARANTINE** | Move to deprecated/, document restore |
| `portalocker/` | 4K | In pyproject.toml deps | pip/poetry installs | **QUARANTINE** | Move to deprecated/, document restore |
| `prometheus_client/` | 4K | In pyproject.toml deps | pip/poetry installs | **QUARANTINE** | Move to deprecated/, document restore |
| `structlog/` | 4K | In pyproject.toml deps | pip/poetry installs | **QUARANTINE** | Move to deprecated/, document restore |

**Note**: These are excluded in ruff config but also listed as regular dependencies. Need to verify no custom patches before full deletion.

### Root-Level Documentation (Archive 90% to docs/)

| Path | Keep/Archive | Reason |
|------|--------------|--------|
| `README.md` | **KEEP** | Primary project documentation |
| `CLAUDE.md` | **KEEP** | Essential AI assistant instructions |
| `SETUP.md` | **KEEP** | Essential setup guide |
| `CHANGELOG.md` | **KEEP** | Version history |
| `CONTRIBUTING.md` | **KEEP** | Contributor guidelines |
| `LICENSE` | **KEEP** | Legal requirement |
| `RUNBOOK.md` | **KEEP** | Operational guide |
| All `TERMINAL_*` files (15 files) | **ARCHIVE** | Historical fix reports → docs/archive/terminal-fixes/ |
| All `FARM_LAUNCH_*` files (7 files) | **ARCHIVE** | Historical fix reports → docs/archive/farm-launch-fixes/ |
| All `*_FIX_*.md` files (10 files) | **ARCHIVE** | Historical fix reports → docs/archive/fixes/ |
| All `*_ANALYSIS*.md` files (8 files) | **ARCHIVE** | Historical analysis → docs/archive/analysis/ |
| All `*_COMPLETE.md` files (5 files) | **ARCHIVE** | Historical completions → docs/archive/completions/ |
| Other misc reports (10 files) | **ARCHIVE** | → docs/archive/reports/ |

**Total**: Keep 7 essential, archive 54 historical docs

### Root-Level Scripts & Test Files (Move to proper locations)

| Pattern | Count | Decision | Action |
|---------|-------|----------|--------|
| `test-*.{js,mjs,cjs,html,sh}` | 25 | **MOVE** | → `tests/manual/` or delete if superseded |
| `fix-*.{sh,sql,mjs}` | 8 | **ARCHIVE** | → `tools/scripts/legacy-fixes/` (historical) |
| `validate-*.sh` | 3 | **MOVE** | → `tools/scripts/validation/` |
| `debug-*.sh` | 1 | **MOVE** | → `tools/scripts/debugging/` |
| `analyze-*.sh` | 1 | **MOVE** | → `tools/scripts/analysis/` |
| `add-api-key.sh` | 1 | **MOVE** | → `tools/scripts/setup/` |

### Empty/Minimal Directories

| Path | Size | Contents | Decision | Action |
|------|------|----------|----------|--------|
| `images/` | 0B | Empty | **DELETE** | Remove entirely |
| `packages/` | 0B | Empty (has tooling subdir only) | **KEEP STRUCTURE** | Keep for future use |
| `recipes/` | 0B | Empty | **DELETE** | Remove entirely |
| `tmux/` | 0B | Empty (not tmux/, should be .gitignored) | **DELETE** | Remove, add to .gitignore |

### Operational Directories (Requires Analysis)

| Path | Size | Purpose | Decision | Validation Needed |
|------|------|---------|----------|-------------------|
| `cypress/` | 124K | E2E tests | **KEEP** | Has npm script `test:e2e` |
| `development/` | 856K | Dev assets/templates | **ANALYZE** | Check usage in codebase |
| `marketing/` | 40K | Marketing materials | **QUARANTINE** | Not code - move to docs/marketing/ |
| `ops/` | 212K | Deployment configs | **KEEP** | Docker/nginx configs |
| `run/` | 720K | Unknown | **ANALYZE** | Check purpose and usage |
| `tools/` | 188K | Dev tools | **KEEP** | Config/testing utilities |
| `maibarn/` | 12K | Agent workspace storage | **KEEP** | Runtime directory per CLAUDE.md |
| `xsync-sessions/` | 448K | XenoSync session data | **KEEP** | Runtime directory |
| `var/` | 25M | Runtime data/logs | **KEEP** | Runtime directory per CLAUDE.md |

### Server Directory (Legacy)

| Path | Size | Contents | Decision | Action |
|------|------|----------|----------|--------|
| `server/` | 24K | Old server code? | **ANALYZE** | Check if superseded by apps/api/ |

### Generated/DB Files

| Path | Size | Decision | Action |
|------|------|----------|--------|
| `maifarm-demo.db` | 52K | **DELETE** | Dev database, should be gitignored |
| `maifarm-fallback.db` | 512K | **DELETE** | Dev database, should be gitignored |
| `poetry.lock` | 28K | **KEEP** | Dependency lock file |

### Configuration Files (Root)

| File | Keep | Reason |
|------|------|--------|
| `postcss.config.js` | KEEP | Frontend build |
| `tailwind.config.js` | KEEP | Frontend styling |
| `Dockerfile` | KEEP | Container build |
| `docker-compose.yml` | KEEP | Local dev setup |
| `Makefile` | KEEP | Build automation |
| `Makefile.tmp` | DELETE | Temporary file |
| `tsconfig*.json` | KEEP | TypeScript config |
| `pyproject.toml` | KEEP | Python config |
| `requirements*.txt` | KEEP | Python deps |
| `jest.config.cjs` | KEEP | Testing config |
| `cypress.config.ts` | KEEP | E2E testing |
| `.gitignore` | UPDATE | Add more cache patterns |

## Summary Statistics

### Deletion Targets (High Confidence)
- Cache directories: 154M
- Empty directories: 4 items
- Root-level test files: 25 files
- Root-level fix scripts: 8 files
- Temp databases: 564K
- Total immediate deletions: ~155M + 37 files

### Archive/Move Targets
- Historical MD docs: 54 files → docs/archive/
- Scripts to tools/: 13 files
- Vendored libs: 4 dirs → deprecated/ (quarantine)

### .gitignore Updates Needed
```
# Python caches
.mypy_cache/
.pytest_cache/
.ruff_cache/
__pycache__/

# Build outputs
dist/
build/

# Databases
*.db
*.sqlite
*.sqlite3

# Benchmarks
.benchmarks/

# Cache
.maifarm_cache/

# Temp
tmux/
```

## Risk Assessment

### Zero Risk (Delete Immediately)
- All cache directories (mypy, pytest, ruff, benchmarks)
- Empty directories (images, recipes)
- Temporary Makefile.tmp
- Dev databases (*.db files)

### Low Risk (Archive First)
- Historical MD docs (backup to docs/archive/)
- Root-level test scripts (move to tests/manual/)
- Legacy fix scripts (move to tools/scripts/legacy-fixes/)

### Medium Risk (Quarantine)
- Vendored libraries (need to verify no patches)
- development/ directory (need usage analysis)
- marketing/ directory (non-code assets)
- server/ directory (may be superseded)

### High Risk (Analyze More)
- run/ directory (unknown purpose)
- Any operational config in ops/
