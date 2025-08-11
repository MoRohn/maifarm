# MaiFarm Graceful Shutdown System

## Overview

The MaiFarm graceful shutdown system ensures that all Claude Code agent outputs are properly collected and stored in the Barn before task termination. This system operates consistently across all three Quick Action modes: Quick Task, Farm, and GoWild.

## Key Features

- **30-Second Grace Period**: Graceful shutdown initiates 30 seconds before the ultimate timeout
- **File Collection with Retry**: Robust file collection with automatic retry on failure
- **Validation**: Ensures all required files are collected before marking shutdown complete
- **Barn Integration**: Automatic storage of collected files in the Barn for easy access

## Timing Configuration

### Quick Task Mode
- **Fixed Timeout**: 5 minutes (300,000ms) - NOT configurable
- **Graceful Shutdown**: Triggers at 4:30 (270,000ms)
- **Grace Period**: 30 seconds for file collection

### Farm Mode
- **Configurable Timeout**: Set via Settings > Agent Settings > Default Timeout
- **Graceful Shutdown**: Triggers 30 seconds before configured timeout
- **Grace Period**: Dynamically calculated based on total timeout

### GoWild Mode
- **Configurable Duration**: Set when starting exploration (in minutes)
- **Graceful Shutdown**: Triggers 30 seconds before exploration duration
- **Grace Period**: 30 seconds for discovery collection

## Architecture

### Core Components

#### 1. Shutdown Coordinator (`server/services/shutdownCoordinator.ts`)
Central service managing all shutdown operations:
- Schedules graceful shutdowns based on mode and timeout
- Executes shutdown sequence (prompt → collect → store → cleanup)
- Handles errors and retries
- Emits WebSocket events for UI updates

#### 2. Timing Constants (`server/constants/timing.ts`)
Centralized timing configuration:
```typescript
GRACEFUL_SHUTDOWN_PERIOD = 30000;  // 30 seconds
QUICK_TASK_TIMEOUT = 300000;        // 5 minutes (fixed)
FILE_COLLECTION_TIMEOUT = 15000;    // 15 seconds
FILE_COLLECTION_MAX_RETRIES = 3;    // Max retry attempts
```

#### 3. Harvest File Collector (`server/services/harvestFileCollector.ts`)
Enhanced file collection with:
- Retry logic for failed collections
- Validation of collected files
- Progress reporting via WebSocket
- Isolated storage in `maibarn/` directory

## Shutdown Flow

### 1. Scheduling Phase
```typescript
// Quick Task - Fixed 5-minute timeout
shutdownCoordinator.scheduleShutdown({
  mode: 'quick-task',
  farmId: farmId,
  userId: userId,
  reason: 'timeout',
  harvestId: harvestId
});

// Farm - Settings-based timeout
shutdownCoordinator.scheduleShutdown({
  mode: 'farm',
  farmId: farmId,
  userId: userId,
  reason: 'timeout',
  timeout: configuredTimeout * 1000,
  harvestId: harvestId
});
```

### 2. Execution Phase (30s before timeout)
1. **Send Closing Prompt**: Notify agents to finalize work
2. **Wait for Response**: 5-second window for agents to save outputs
3. **Collect Files**: Gather all agent outputs with retry logic
4. **Validate Collection**: Ensure required files are present
5. **Store in Barn**: Save harvest for user access
6. **Update Status**: Mark farm/task as completed
7. **Cleanup Resources**: Stop tmux sessions, clear timers

### 3. File Collection Process
```typescript
// With retry and validation
const collection = await harvestFileCollector.collectHarvestFiles(
  harvestId,
  farmId,
  farmName,
  agentIds
);

// Validates:
- Required directories exist (config, logs, yield, summary)
- Harvest summary file present
- Files are not empty/corrupted
- Retry up to 3 times on failure
```

## WebSocket Events

The system emits real-time events for UI updates:

```typescript
// Shutdown lifecycle events
'farm:graceful_shutdown_started'   // Shutdown initiated
'farm:graceful_shutdown_completed' // Shutdown finished
'harvest:collection-started'       // File collection begun
'harvest:file-collected'          // Individual file collected
'harvest:file-tree-ready'        // All files ready
```

## Usage Examples

### Manual Shutdown (User Request)
```typescript
await shutdownCoordinator.executeGracefulShutdown({
  mode: 'quick-task',
  farmId: farmId,
  userId: userId,
  reason: 'user_request',
  harvestId: harvestId
});
```

### Completion-Based Shutdown
```typescript
await shutdownCoordinator.executeGracefulShutdown({
  mode: 'farm',
  farmId: farmId,
  userId: userId,
  reason: 'completion',
  harvestId: harvestId
});
```

## Testing

### Integration Tests
Located in `tests/integration/graceful-shutdown.test.ts`:
- Timeout trigger validation
- File collection retry logic
- Barn storage verification
- Error recovery scenarios

### E2E Tests
Located in `tests/e2e/quick-action-shutdown.spec.ts`:
- Full user flow testing
- UI interaction validation
- Concurrent shutdown handling
- Network failure recovery

### Running Tests
```bash
# Integration tests
npm run test:integration -- graceful-shutdown

# E2E tests
npm run test:e2e -- quick-action-shutdown

# All shutdown tests
npm test -- --grep "shutdown"
```

## QA Checklist

### Quick Task Mode
- [ ] Task creates with 5-minute timeout
- [ ] Graceful shutdown triggers at 4:30
- [ ] Files collected successfully
- [ ] Harvest appears in Barn
- [ ] Files accessible via Barn UI

### Farm Mode
- [ ] Custom timeout from settings applied
- [ ] Shutdown scheduled 30s before timeout
- [ ] All agent outputs collected
- [ ] Multi-agent farms handled correctly
- [ ] Barn storage successful

### GoWild Mode
- [ ] Exploration duration respected
- [ ] Discoveries collected properly
- [ ] Shutdown timing accurate
- [ ] Files organized in Barn

### Error Scenarios
- [ ] Network failures trigger retry
- [ ] Partial collection handles gracefully
- [ ] Resources cleaned up on failure
- [ ] User notified of issues

## Troubleshooting

### Common Issues

#### Files Not Appearing in Barn
1. Check harvest ID is valid
2. Verify file collection succeeded in logs
3. Ensure barn storage path is accessible
4. Check WebSocket events for errors

#### Shutdown Too Early/Late
1. Verify timeout configuration
2. Check timer scheduling in logs
3. Ensure system time is synchronized
4. Review graceful shutdown time calculation

#### Collection Failures
1. Check tmux session accessibility
2. Verify coordination directory permissions
3. Review retry attempts in logs
4. Ensure sufficient disk space

### Debug Logging
Enable detailed logging:
```typescript
// Set in environment
DEBUG=shutdown:*,harvest:* npm run dev

// Check logs for:
[ShutdownCoordinator] Scheduling shutdown...
[ShutdownCoordinator] Initiating graceful shutdown...
[HarvestFileCollector] Collecting files...
[HarvestFileCollector] Validation passed...
```

## Configuration

### Environment Variables
```bash
# Development settings
BYPASS_AUTH=true              # Skip authentication
NODE_ENV=development          # Development mode
GRACEFUL_SHUTDOWN_ENABLED=true # Enable graceful shutdown

# Timing overrides (testing only)
TEST_QUICK_TASK_TIMEOUT=60000    # 1 minute for testing
TEST_GRACE_PERIOD=10000          # 10 seconds for testing
```

### Settings Configuration
```typescript
// src/store/settingsStore.ts
{
  agent: {
    defaultTimeout: 3600,  // Farm/GoWild timeout in seconds
    maxAgents: 10,
    autoScale: true
  }
}
```

## Best Practices

1. **Always Use Shutdown Coordinator**: Never bypass the centralized shutdown system
2. **Handle Errors Gracefully**: Continue shutdown even if collection partially fails
3. **Emit Progress Events**: Keep UI informed of shutdown status
4. **Validate Collections**: Ensure files are complete before marking success
5. **Clean Up Resources**: Always release tmux sessions and timers
6. **Test Timeout Scenarios**: Verify behavior at boundary conditions

## Future Improvements

- [ ] Configurable grace period per mode
- [ ] Progressive file collection during task execution
- [ ] Compression of large harvest files
- [ ] Selective file collection based on user preferences
- [ ] Real-time progress percentage in UI
- [ ] Automated harvest cleanup after X days