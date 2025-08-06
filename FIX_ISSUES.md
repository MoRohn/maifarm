# MaiFarm Issue Resolution Guide

This document provides step-by-step instructions for fixing critical and moderate issues in the MaiFarm application. Copy and paste these instructions into a new Claude Code session to resolve all issues systematically.

## Critical Issues to Fix

### 1. Fix TypeScript Compilation Errors (780 errors)

```
Please fix all TypeScript compilation errors in the MaiFarm project. Start by running:

1. Run `npx tsc --noEmit` to see all errors
2. Focus on fixing errors in this priority order:
   - src/services/orchestration/* (most critical)
   - src/services/farmOrchestrationService.ts
   - src/services/failoverService.ts
   - src/components/Analytics/*
   - All remaining errors

Common fixes needed:
- Fix missing method 'refreshData' in AnalyticsService
- Change 'formatPercent' to 'formatPercentage' in imports
- Add missing 'formatCurrency' export to utils/format.ts
- Fix type mismatches in Chart components
- Resolve missing properties in orchestration services

After fixing, verify with `npx tsc --noEmit` shows 0 errors.
```

### 2. Fix Server Binding Issue

```
The server needs to bind to all interfaces. Please:

1. Check server/index.ts around line 330
2. Ensure httpServer.listen includes '0.0.0.0' as the hostname:
   httpServer.listen(PORT, '0.0.0.0', () => { ... })
3. This ensures the server is accessible from Docker containers and external connections
```

### 3. Set Up Redis for Caching

```
Please set up Redis for the application:

1. Check if Docker is running: `docker --version`
2. Start Redis container: `docker-compose up -d redis`
3. Verify Redis is running: `docker ps | grep redis`
4. Test Redis connection: `redis-cli ping` (should return PONG)
5. Restart the server to enable caching features
```

## Moderate Issues to Fix

### 4. Fix Environment File Permissions

```
Secure the environment files:

1. Set proper permissions for all .env files:
   chmod 600 .env
   chmod 600 .env.development
   chmod 644 .env.example  # Example can stay readable

2. Verify permissions: `ls -la .env*`
3. Ensure no secrets are committed to git: `git status`
```

### 5. Fix NODE_ENV Warning in Vite

```
Fix the Vite NODE_ENV warning:

1. Edit vite.config.ts
2. Add to defineConfig:
   define: {
     'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
   }
3. Remove NODE_ENV from .env files (Vite handles this internally)
4. Test with `npm run dev:client` - warning should be gone
```

### 6. Set Up PostgreSQL Database

```
Set up PostgreSQL for data persistence:

1. Start PostgreSQL with Docker:
   docker-compose up -d postgres

2. Or use the simple setup (includes Postgres):
   docker-compose -f docker-compose.simple.yml up -d

3. Verify database connection in server logs
4. Run migrations if needed (should auto-run on server start)
5. Test data persistence by creating a farm and restarting
```

### 7. Enable WebSocket Orchestrator

```
Re-enable the WebSocket orchestrator and Farm-Harvest integration:

1. Ensure Redis is running (see issue #3)
2. Edit server/index.ts around lines 307-318
3. Uncomment these lines:
   - await orchestrator.start();
   - console.log('Task orchestrator started');
   - const { farmHarvestIntegration } = await import('./services/farmHarvestIntegration');
   - farmHarvestIntegration.initialize();
   - console.log('Farm-Harvest integration initialized');

4. Restart the server
5. Verify in logs that orchestrator and integration are initialized
```

## Quick Fix Script

```
For a quick setup, run these commands in order:

# 1. Start all Docker services
docker-compose -f docker-compose.simple.yml up -d

# 2. Fix permissions
chmod 600 .env .env.development

# 3. Install dependencies and run type check
npm install
npm run typecheck

# 4. If TypeScript errors exist, fix them first, then:
npm run build

# 5. Start the application
npm run dev

The application should now be running at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:4567
```

## Verification Checklist

After running fixes, verify:

- [ ] `npx tsc --noEmit` shows 0 errors
- [ ] No "Could not connect to server" errors in browser console
- [ ] Redis is running: `docker ps | grep redis`
- [ ] PostgreSQL is running: `docker ps | grep postgres`
- [ ] Server binds to 0.0.0.0:4567
- [ ] No NODE_ENV warnings from Vite
- [ ] WebSocket connections work (check browser DevTools Network tab)
- [ ] Data persists after server restart
- [ ] .env files have 600 permissions

## Additional Recommendations

1. **For Production**: Never use BYPASS_AUTH=true
2. **For Development**: Use docker-compose.dev.yml for full stack
3. **For Testing**: Run `npm test` after fixes to ensure nothing broke
4. **For Monitoring**: Access Grafana at http://localhost:3001 (if enabled)

## Need Help?

If issues persist after following these steps:
1. Check logs: `npm run docker:logs`
2. Reset everything: `docker-compose down -v && docker-compose up -d`
3. Clear node_modules: `rm -rf node_modules package-lock.json && npm install`