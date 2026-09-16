# MaiFarm Logging Standards

**Version**: 1.0.0
**Last Updated**: 2025-10-09
**Status**: Production-Ready

---

## Overview

This document defines the logging standards for MaiFarm, ensuring consistent, professional-grade logging across the entire application. These standards follow industry best practices and are inspired by mature systems like iOS applications and enterprise-grade servers.

---

## Principles

### 1. **Clarity**
- Logs must be clear, concise, and actionable
- Use proper English grammar and formatting
- Avoid abbreviations unless industry-standard

### 2. **Consistency**
- All logs follow the same format
- Categories are standardized and well-defined
- Log levels are used appropriately

### 3. **Performance**
- Minimal performance overhead (<1ms per log entry)
- Deduplication prevents log spam
- Efficient file I/O with buffering

### 4. **Security**
- Sensitive data (passwords, API keys, tokens) is automatically masked
- PII (Personally Identifiable Information) is redacted in production
- Stack traces limited in production

### 5. **Maintainability**
- Structured logging for easy parsing
- Correlation IDs for request tracking
- Automatic log rotation and retention

---

## Log Levels

### FATAL (0)
**When to use**: System is unusable and requires immediate attention
**Examples**:
- Database connection pool exhausted
- Critical service failure preventing startup
- Unrecoverable system errors

```typescript
logger.fatal(LogCategory.SYSTEM, 'Failed to initialize database pool', { error });
```

### ERROR (1)
**When to use**: Error conditions that need investigation
**Examples**:
- Failed API requests (500 errors)
- Database query failures
- Unhandled exceptions

```typescript
logger.error(LogCategory.DATABASE, 'Query failed', { query, error });
```

### WARN (2)
**When to use**: Warning conditions that may require attention
**Examples**:
- Deprecated API usage
- Resource usage approaching limits
- Recoverable errors

```typescript
logger.warn(LogCategory.FARM, 'Farm timeout approaching', { farmId, timeRemaining });
```

### INFO (3)
**When to use**: Normal but significant events
**Examples**:
- Server startup/shutdown
- Farm launched
- Harvest completed

```typescript
logger.info(LogCategory.FARM, 'Farm launched successfully', { farmId, agentCount });
```

### DEBUG (4)
**When to use**: Detailed diagnostic information
**Examples**:
- Function entry/exit
- State changes
- Configuration details

```typescript
logger.debug(LogCategory.ORCHESTRATOR, 'Agent state changed', { agentId, from, to });
```

### TRACE (5)
**When to use**: Very detailed diagnostic information
**Examples**:
- WebSocket message details
- Database query parameters
- Internal function calls

```typescript
logger.trace(LogCategory.WEBSOCKET, 'Message received', { event, payload });
```

---

## Categories

All logs must specify a category from the `LogCategory` enum:

### System Categories
- **SYSTEM**: System-level operations (startup, shutdown, configuration)
- **SERVER**: HTTP server operations
- **CONFIG**: Configuration loading and validation

### Application Categories
- **API**: REST API endpoints
- **DATABASE**: Database operations
- **CACHE**: Redis/caching operations

### Business Logic Categories
- **FARM**: Farm lifecycle and operations
- **AGENT**: Agent management and coordination
- **HARVEST**: Harvest collection and processing
- **ORCHESTRATOR**: Task orchestration and scheduling

### Communication Categories
- **WEBSOCKET**: WebSocket connections and events
- **HTTP**: HTTP request/response logging

### Infrastructure Categories
- **TERMINAL**: Terminal streaming and output
- **SERVICES**: Background services
- **HEALTH**: Health checks and monitoring
- **METRICS**: Metrics collection and reporting

### Security & Operations Categories
- **AUTH**: Authentication and authorization
- **SECURITY**: Security-related events
- **CLEANUP**: Resource cleanup operations
- **COORD**: Coordination and synchronization

---

## Message Format

### Development (Compact)
```
ℹ️  [FARM] Farm launched successfully { farmId: 'abc123', agentCount: 5 }
```

### Production (JSON)
```json
{
  "timestamp": "2025-10-09T10:30:45.123Z",
  "level": "INFO",
  "category": "FARM",
  "message": "Farm launched successfully",
  "data": { "farmId": "abc123", "agentCount": 5 },
  "correlationId": "req-xyz789"
}
```

### Structured
```
2025-10-09T10:30:45.123Z ℹ️ FARM [req-xyz789]: Farm launched successfully
  { farmId: 'abc123', agentCount: 5 }
```

---

## Best Practices

### ✅ DO

**Use appropriate log levels**
```typescript
// Good - INFO for significant events
logger.info(LogCategory.FARM, 'Farm created', { farmId });

// Good - DEBUG for diagnostic info
logger.debug(LogCategory.AGENT, 'Agent heartbeat received', { agentId });
```

**Provide context with data objects**
```typescript
logger.error(LogCategory.DATABASE, 'Failed to save farm', {
  farmId,
  error: error.message,
  retryCount
});
```

**Use correlation IDs for request tracking**
```typescript
logger.setCorrelationId(req.id);
logger.info(LogCategory.API, 'Processing farm creation');
// ... do work ...
logger.clearCorrelationId();
```

**Log HTTP requests with structured data**
```typescript
logger.httpRequest('POST', '/api/farms', 201, 150, userId);
```

**Sanitize sensitive data**
```typescript
// Logger automatically masks passwords, API keys, tokens
logger.debug(LogCategory.AUTH, 'User login attempt', {
  username,
  password: 'secret123' // Automatically becomes '***REDACTED***'
});
```

### ❌ DON'T

**Don't use console.log**
```typescript
// Bad
console.log('Farm created:', farmId);

// Good
logger.info(LogCategory.FARM, 'Farm created', { farmId });
```

**Don't log in tight loops**
```typescript
// Bad - logs 1000 times
agents.forEach(agent => {
  logger.debug(LogCategory.AGENT, 'Processing agent', { agent });
});

// Good - log summary
logger.debug(LogCategory.AGENT, 'Processing agents', { count: agents.length });
```

**Don't include sensitive data in messages**
```typescript
// Bad
logger.info(LogCategory.AUTH, `User ${email} logged in with token ${token}`);

// Good
logger.info(LogCategory.AUTH, 'User logged in', { userId, email });
```

**Don't log errors without context**
```typescript
// Bad
logger.error(LogCategory.API, 'Error occurred');

// Good
logger.error(LogCategory.API, 'Failed to create farm', {
  farmId,
  userId,
  error: error.message
});
```

**Don't use string concatenation**
```typescript
// Bad
logger.info(LogCategory.FARM, 'Farm ' + farmId + ' created with ' + agentCount + ' agents');

// Good
logger.info(LogCategory.FARM, 'Farm created', { farmId, agentCount });
```

---

## Configuration

### Environment Variables

```bash
# Log level (FATAL, ERROR, WARN, INFO, DEBUG, TRACE)
LOG_LEVEL=INFO

# Log format (compact, json, structured)
LOG_FORMAT=json

# Enable/disable console output
LOG_CONSOLE=true

# Enable/disable file logging
LOG_FILE=true

# Log directory (for file logging)
LOG_DIR=/var/log/maifarm

# Max log file size (bytes)
LOG_MAX_FILE_SIZE=10485760  # 10MB

# Max number of log files to retain
LOG_MAX_FILES=10

# Enable sensitive data masking
LOG_MASK_SENSITIVE=true

# Enable color output (auto-detected for TTY)
LOG_COLORIZE=true
```

### Development vs Production

**Development**:
- Level: `DEBUG`
- Format: `compact`
- Console: `enabled`
- File: `disabled`
- Colorize: `enabled`
- Mask sensitive: `disabled`

**Production**:
- Level: `INFO`
- Format: `json`
- Console: `enabled`
- File: `enabled`
- Colorize: `disabled`
- Mask sensitive: `enabled`

---

## Usage Examples

### Basic Logging

```typescript
import { logger, LogCategory } from '@/services/ProductionLogger';

// INFO level
logger.info(LogCategory.FARM, 'Farm launched', { farmId: 'abc123', agentCount: 5 });

// ERROR level
logger.error(LogCategory.DATABASE, 'Query failed', {
  query: 'SELECT * FROM farms',
  error: err.message
});

// DEBUG level
logger.debug(LogCategory.AGENT, 'Agent heartbeat', { agentId: 'agent-1', timestamp: Date.now() });
```

### HTTP Request Logging

```typescript
// Automatic formatting with status code-based level
logger.httpRequest('POST', '/api/farms', 201, 150, userId);
// Output: ℹ️  [HTTP] POST /api/farms { statusCode: 201, duration: 150, userId: 'user-123' }

logger.httpRequest('GET', '/api/farms/invalid', 404, 25);
// Output: ⚠️  [HTTP] GET /api/farms/invalid { statusCode: 404, duration: 25 }
```

### Error Logging with Context

```typescript
try {
  await createFarm(farmData);
} catch (error) {
  logger.error(LogCategory.FARM, 'Farm creation failed', {
    farmName: farmData.name,
    userId: farmData.userId,
    agentCount: farmData.agentCount,
    error: error instanceof Error ? error.message : String(error)
  });
}
```

### Correlation ID Tracking

```typescript
// Middleware to set correlation ID
app.use((req, res, next) => {
  const correlationId = req.headers['x-correlation-id'] || `req-${Date.now()}`;
  logger.setCorrelationId(correlationId);
  res.setHeader('x-correlation-id', correlationId);
  next();
});

// All logs within this request will include the correlation ID
logger.info(LogCategory.API, 'Processing farm creation');
logger.debug(LogCategory.DATABASE, 'Saving farm to database');
logger.info(LogCategory.WEBSOCKET, 'Broadcasting farm created event');

// Clear correlation ID after request completes
app.use((req, res, next) => {
  res.on('finish', () => {
    logger.clearCorrelationId();
  });
  next();
});
```

### Service Lifecycle Logging

```typescript
class FarmService {
  async start() {
    logger.info(LogCategory.SERVICES, 'Farm service starting');

    try {
      await this.initializeDatabase();
      logger.info(LogCategory.SERVICES, 'Farm service started successfully');
    } catch (error) {
      logger.fatal(LogCategory.SERVICES, 'Farm service failed to start', { error });
      throw error;
    }
  }

  async shutdown() {
    logger.info(LogCategory.SERVICES, 'Farm service shutting down');
    await this.cleanup();
    logger.info(LogCategory.SERVICES, 'Farm service stopped');
  }
}
```

---

## Log Rotation and Retention

### Automatic Rotation

Logs are automatically rotated when:
1. **Daily rotation**: New day begins (UTC timezone)
2. **Size-based rotation**: File exceeds `LOG_MAX_FILE_SIZE` (default: 10MB)

### File Naming Convention

```
maifarm-2025-10-09-10-30-45.log
maifarm-2025-10-09-14-22-18.log
maifarm-2025-10-10-09-15-32.log
```

Format: `maifarm-{DATE}-{TIME}.log`

### Retention Policy

- **Development**: Unlimited (logs not written to file by default)
- **Production**: Keep last `LOG_MAX_FILES` files (default: 10)
- **Archive**: Old logs can be archived to S3/GCS for long-term retention

---

## Performance Guidelines

### Deduplication

The logger automatically deduplicates rapid identical messages:
- Window: 1 second
- Max occurrences: 5 per second
- Messages exceeding threshold are suppressed

### Buffering

- Console output: Unbuffered (real-time)
- File output: Buffered with 5-second flush interval
- Graceful shutdown: All buffered logs flushed before exit

### Overhead

Target performance impact:
- Per log entry: <1ms overhead
- Memory usage: <10MB for logger instance
- File I/O: Async, non-blocking

---

## Migration Guide

### Step 1: Replace console.log

**Before**:
```typescript
console.log('Farm created:', farmId);
console.error('Error:', error);
```

**After**:
```typescript
import { logger, LogCategory } from '@/services/ProductionLogger';

logger.info(LogCategory.FARM, 'Farm created', { farmId });
logger.error(LogCategory.FARM, 'Farm creation failed', { error: error.message });
```

### Step 2: Replace old logger calls

**Before**:
```typescript
import { logger } from '@/utils/logger';

logger.info(LogCategory.FARM, `Farm ${farmId} created`);
```

**After**:
```typescript
import { logger, LogCategory } from '@/services/ProductionLogger';

logger.info(LogCategory.FARM, 'Farm created', { farmId });
```

### Step 3: Add correlation IDs

**Before**:
```typescript
app.post('/api/farms', async (req, res) => {
  logger.info(LogCategory.API, 'Creating farm');
  // ... create farm ...
});
```

**After**:
```typescript
app.post('/api/farms', async (req, res) => {
  const correlationId = req.headers['x-correlation-id'] || generateId();
  logger.setCorrelationId(correlationId);

  logger.info(LogCategory.API, 'Creating farm', { userId: req.user.id });
  // ... create farm ...

  logger.clearCorrelationId();
});
```

---

## Testing

### Unit Tests

```typescript
import { ProductionLogger, LogLevel, LogCategory } from '@/services/ProductionLogger';

describe('ProductionLogger', () => {
  let logger: ProductionLogger;

  beforeEach(() => {
    logger = new ProductionLogger({
      level: LogLevel.DEBUG,
      enableConsole: false,
      enableFile: false
    });
  });

  it('should log at INFO level', () => {
    const spy = jest.spyOn(console, 'log');
    logger.info(LogCategory.FARM, 'Test message', { data: 'test' });
    expect(spy).toHaveBeenCalled();
  });

  it('should mask sensitive data', () => {
    const spy = jest.spyOn(console, 'log');
    logger.info(LogCategory.AUTH, 'Login attempt', { password: 'secret123' });
    const call = spy.mock.calls[0][0];
    expect(call).toContain('***REDACTED***');
    expect(call).not.toContain('secret123');
  });
});
```

---

## Monitoring and Alerting

### Log-based Alerts

Set up alerts for critical log events:

**ERROR rate alert**:
```
Alert when: ERROR count > 10 in 5 minutes
Action: Send notification to on-call engineer
```

**FATAL level alert**:
```
Alert when: FATAL level log appears
Action: Immediate page to on-call engineer
```

**Disk space alert**:
```
Alert when: Log directory > 80% full
Action: Trigger log cleanup or increase retention
```

### Log Aggregation

Send logs to centralized logging service:
- **Development**: Local files only
- **Production**: Send to CloudWatch, DataDog, or ELK stack

---

## Troubleshooting

### Issue: Too many logs in production

**Solution**: Increase log level to WARN or ERROR
```bash
export LOG_LEVEL=WARN
```

### Issue: Log files growing too large

**Solution**: Decrease max file size or max files
```bash
export LOG_MAX_FILE_SIZE=5242880  # 5MB
export LOG_MAX_FILES=5
```

### Issue: Missing correlation IDs

**Solution**: Ensure middleware sets correlation ID for all requests
```typescript
app.use((req, res, next) => {
  logger.setCorrelationId(req.id || `req-${Date.now()}`);
  res.on('finish', () => logger.clearCorrelationId());
  next();
});
```

---

## Compliance

### Data Privacy (GDPR, CCPA)

- Sensitive data automatically masked in production
- PII redacted from logs
- Log retention policy: 30 days (configurable)
- Right to be forgotten: Logs purged after retention period

### Security

- No passwords, tokens, or API keys in logs
- Stack traces limited in production
- Access logs encrypted at rest
- Log files readable only by application user

---

## Appendix

### Complete LogCategory Reference

| Category | Description | Example Use Cases |
|----------|-------------|-------------------|
| SYSTEM | System operations | Startup, shutdown, config |
| SERVER | HTTP server | Port binding, connections |
| CONFIG | Configuration | Loading, validation |
| API | REST API | Endpoints, requests |
| DATABASE | Database ops | Queries, connections |
| CACHE | Caching | Redis operations |
| FARM | Farm lifecycle | Create, launch, complete |
| AGENT | Agent management | Registration, heartbeat |
| HARVEST | Harvest collection | Collection, packaging |
| ORCHESTRATOR | Orchestration | Task scheduling, coordination |
| WEBSOCKET | WebSocket | Connections, events |
| HTTP | HTTP requests | Request/response logging |
| TERMINAL | Terminal streaming | Output capture, broadcast |
| SERVICES | Background services | Service start/stop |
| HEALTH | Health checks | Health status, monitoring |
| METRICS | Metrics | Collection, reporting |
| AUTH | Authentication | Login, logout, token |
| SECURITY | Security events | Access denied, suspicious |
| CLEANUP | Resource cleanup | Session cleanup, orphaned resources |
| COORD | Coordination | Agent coordination, sync |

---

**Last Updated**: 2025-10-09
**Version**: 1.0.0
**Maintainer**: MaiFarm Development Team
