# MaiFarm Repository Cleanup Plan

## Overview
This document outlines the strategy for cleaning up the MaiFarm repository by removing unnecessary files while preserving essential development and production functionality.

## Analysis Summary

### Repository Size Before Cleanup
- **Total files analyzed**: 1000+ files
- **Large files identified**: 1.2MB+ in log files alone
- **Temporary files**: 50+ test scripts and temporary files
- **System files**: 5+ .DS_Store files
- **Build artifacts**: dist/ directory with generated files

### Critical Dependencies Verified
✅ **Core application files** - All essential for development/production
✅ **Configuration files** - Required for build and deployment
✅ **Documentation** - Important for project maintenance
✅ **Docker files** - Needed for containerization
✅ **Test infrastructure** - Required for CI/CD

## Cleanup Categories

### 🟢 SAFE TO REMOVE (Immediate)

#### 1. Log Files (1.2MB+ total)
```
combined.log          # 1.2MB - development log
error.log            # 12KB - error log  
test-output.log      # 973B - test output
docker-build.log     # Docker build log
client.log           # Client log
frontend.log         # Frontend log
startup.log          # Startup log
dev.log              # Development log
dev2.log             # Development log
typescript-errors.log # TypeScript errors log
```

#### 2. System Files
```
.DS_Store            # macOS system files (5 instances)
src/.DS_Store
src/components/.DS_Store
src/assets/.DS_Store
src/assets/logos/.DS_Store
```

#### 3. Backup Files
```
src/components/Analytics/Analytics.tsx.backup  # Backup file
```

#### 4. Temporary Test Files (Root level)
```
test-*.js            # Various test scripts
test-*.cjs           # CommonJS test files
test-*.py            # Python test files
test-*.sh            # Shell test scripts
test-*.yaml          # Test YAML configurations
qa-*.js              # QA test files
```

### 🟡 NEEDS VERIFICATION (Check before removing)

#### 1. External Projects
```
trump-infog/         # Separate project - verify if needed
infograph-t47/       # Separate project - verify if needed
```

#### 2. Generated Reports
```
reports/             # Generated reports (except if needed for CI/CD)
```

#### 3. Uploaded Files
```
uploads/             # Uploaded files (except if needed for app functionality)
```

#### 4. Temporary Repositories
```
temp_repos/          # Temporary repositories
```

#### 5. Build Artifacts
```
dist/                # Build output (if not needed for deployment)
```

### 🔴 SAFE TO KEEP (Essential)

#### 1. Core Application
```
src/                 # Main application source code
server/              # Backend server code
public/              # Static assets
```

#### 2. Configuration Files
```
package.json         # Dependencies and scripts
tsconfig.json        # TypeScript configuration
vite.config.ts       # Vite configuration
tailwind.config.js   # Tailwind CSS configuration
jest.config.cjs      # Jest configuration
cypress.config.ts    # Cypress configuration
playwright.config.ts # Playwright configuration
```

#### 3. Documentation
```
README.md            # Project documentation
CLAUDE.md            # Development guide
CONTRIBUTING.md      # Contribution guidelines
```

#### 4. Docker Files
```
docker-compose.yml   # Main Docker configuration
Dockerfile           # Main Dockerfile
```

## Cleanup Script

A cleanup script has been created at `cleanup-script.sh` that will:

1. **Create a backup** of all files before removal
2. **Safely remove** unnecessary files
3. **Provide restoration instructions**

### Usage
```bash
# Make script executable
chmod +x cleanup-script.sh

# Run cleanup
./cleanup-script.sh

# Review backup directory
ls -la cleanup-backup-*

# Restore if needed
mv cleanup-backup-*/* .

# Permanently delete backup
rm -rf cleanup-backup-*
```

## Expected Results

### Before Cleanup
- Repository size: ~500MB+ (estimated)
- Files: 1000+ files
- Log files: 1.2MB+
- Temporary files: 50+

### After Cleanup
- Repository size: ~300MB (estimated 40% reduction)
- Files: ~800 files
- Log files: 0MB
- Temporary files: 0

## Verification Steps

After cleanup, verify the following:

1. **Build process works**
   ```bash
   npm run build
   ```

2. **Development server starts**
   ```bash
   npm run dev
   ```

3. **Tests pass**
   ```bash
   npm test
   ```

4. **Docker builds**
   ```bash
   docker-compose up -d
   ```

## Rollback Plan

If issues arise after cleanup:

1. **Restore from backup**
   ```bash
   mv cleanup-backup-*/* .
   ```

2. **Verify functionality**
   ```bash
   npm run build
   npm run dev
   ```

3. **Selective restoration**
   - Only restore specific files if needed
   - Check git status for any missing files

## Recommendations

### 1. Update .gitignore
Add the following to prevent future clutter:
```
# Logs
*.log
logs/

# System files
.DS_Store
Thumbs.db

# Temporary files
*.tmp
*.bak
*.backup

# Build artifacts (if not needed in repo)
dist/
build/
```

### 2. Regular Maintenance
- Run cleanup script monthly
- Review and remove temporary files regularly
- Monitor repository size

### 3. CI/CD Integration
- Add cleanup step to CI/CD pipeline
- Automate log file removal
- Include size monitoring

## Conclusion

This cleanup plan will significantly reduce repository size while maintaining all essential functionality. The backup approach ensures no data loss, and the verification steps guarantee application integrity.

**Estimated time savings**: 40% reduction in repository size
**Risk level**: Low (with backup strategy)
**Recommended approach**: Run cleanup script and verify functionality 