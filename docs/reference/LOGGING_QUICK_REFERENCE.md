# Logging Quick Reference Card

**For**: MaiFarm Developers
**Version**: 1.0.0
**Last Updated**: 2025-10-09

---

## Import Statement

```typescript
import { logger, LogCategory } from '@/services/ProductionLogger';
```

---

## Log Levels (When to Use)

| Level | Icon | When to Use | Example |
|-------|------|-------------|---------|
| `FATAL` | 💀 | System unusable | Database pool exhausted |
| `ERROR` | ❌ | Error needs investigation | API request failed (500) |
| `WARN` | ⚠️ | Potential problem | Deprecated API usage |
| `INFO` | ℹ️ | Significant event | Farm launched successfully |
| `DEBUG` | 🔍 | Diagnostic info | Agent state changed |
| `TRACE` | 📝 | Very detailed info | WebSocket message details |

---

## Common Patterns

### ✅ Basic Logging

```typescript
// INFO level
logger.info(LogCategory.FARM, 'Farm launched', { farmId, agentCount });

// ERROR level
logger.error(LogCategory.DATABASE, 'Query failed', { query, error: err.message });

// DEBUG level
logger.debug(LogCategory.AGENT, 'Heartbeat received', { agentId });
```

### ✅ HTTP Request Logging

```typescript
// Automatic level selection based on status code
logger.httpRequest(method, path, statusCode, duration, userId);
```

### ✅ Error Handling

```typescript
try {
  await operation();
} catch (error) {
  logger.error(LogCategory.FARM, 'Operation failed', {
    farmId,
    error: error instanceof Error ? error.message : String(error)
  });
  throw error;
}
```

### ✅ Service Lifecycle

```typescript
logger.info(LogCategory.SERVICES, 'Service starting');
// ... initialize ...
logger.info(LogCategory.SERVICES, 'Service started successfully');
```

---

## Categories Quick Reference

### **System & Infrastructure**
- `SYSTEM` - System operations (startup, shutdown)
- `SERVER` - HTTP server operations
- `CONFIG` - Configuration loading
- `SERVICES` - Background services

### **Application Core**
- `API` - REST API endpoints
- `DATABASE` - Database operations
- `CACHE` - Redis/caching
- `HTTP` - HTTP requests

### **Business Logic**
- `FARM` - Farm operations
- `AGENT` - Agent management
- `HARVEST` - Harvest collection
- `ORCHESTRATOR` - Task orchestration

### **Communication**
- `WEBSOCKET` - WebSocket events
- `TERMINAL` - Terminal streaming

### **Operations**
- `HEALTH` - Health checks
- `METRICS` - Metrics collection
- `AUTH` - Authentication
- `SECURITY` - Security events
- `CLEANUP` - Resource cleanup

---

## ❌ Don't Do This

```typescript
// Bad - using console.log
console.log('Farm created:', farmId);

// Bad - string concatenation
logger.info(LogCategory.FARM, 'Farm ' + farmId + ' created');

// Bad - sensitive data in message
logger.info(LogCategory.AUTH, `Token: ${token}`);

// Bad - logging in loops
agents.forEach(agent => logger.debug(LogCategory.AGENT, 'Processing', { agent }));
```

## ✅ Do This Instead

```typescript
// Good - structured logging
logger.info(LogCategory.FARM, 'Farm created', { farmId });

// Good - template with data object
logger.info(LogCategory.FARM, 'Farm created', { farmId });

// Good - sensitive data automatically masked
logger.info(LogCategory.AUTH, 'Login attempt', { token }); // Auto-redacted

// Good - summary logging
logger.debug(LogCategory.AGENT, 'Processing agents', { count: agents.length });
```

---

## Environment Variables

```bash
# Development
LOG_LEVEL=DEBUG
LOG_FORMAT=compact
LOG_CONSOLE=true
LOG_FILE=false

# Production
LOG_LEVEL=INFO
LOG_FORMAT=json
LOG_CONSOLE=true
LOG_FILE=true
LOG_DIR=/var/log/maifarm
```

---

## Migration Helper

```bash
# Run migration script
./scripts/maintenance/migrate-logging.sh

# Options:
# 1. Count console.* statements
# 2. List files needing migration
# 3. Generate migration report
# 4. Show migration examples
```

---

## Need More Info?

- **Complete Guide**: `LOGGING_STANDARDS.md`
- **Implementation**: `LOGGING_UPGRADE_COMPLETE.md`
- **Source Code**: `apps/api/src/services/ProductionLogger.ts`

---

**Keep this card handy for quick reference!** 📌
