# 🌱 MaiFarm CLI Incubation Commands

**Status**: Documentation Ready (Implementation Pending)
**Priority**: Medium (Frontend UI is higher priority)

---

## Overview

These commands should be added to the `farm` command structure to provide command-line access to incubation features.

---

## Command Structure

All incubation commands follow this pattern:
```bash
farm incubate [subcommand] [options]
```

---

## Commands to Implement

### 1. **Start Incubation**

```bash
farm incubate <farm-id> [options]
```

**Description**: Start manual incubation for a completed farm

**Options**:
- `--context, -c <text>` - User guidance for incubation (optional)
- `--prompt, -p <file>` - Custom incubation prompt file (optional)
- `--no-wait` - Don't wait for completion, return immediately

**Example**:
```bash
# Basic incubation
farm incubate abc123

# With user context
farm incubate abc123 --context "Focus on performance optimization"

# With custom prompt file
farm incubate abc123 --prompt custom-incubation.txt
```

**API Call**: `POST /api/incubations/start`

**Implementation**:
```typescript
// cli/commands/incubate.ts
async function startIncubation(farmId: string, options: any) {
  const response = await fetch(`${API_URL}/api/incubations/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      farmId,
      harvestId: await getLatestHarvestId(farmId),
      userContext: options.context,
      userId: getCurrentUserId()
    })
  });

  const { sessionId } = await response.json();
  console.log(`✓ Incubation started: ${sessionId}`);

  if (!options.noWait) {
    await watchIncubation(sessionId);
  }
}
```

---

### 2. **Check Incubation Status**

```bash
farm incubate status <session-id>
```

**Description**: Get current incubation progress

**Example**:
```bash
farm incubate status session-xyz789
```

**Output**:
```
🌱 Incubation Status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Session ID:    session-xyz789
Farm ID:       abc123
Status:        incubating
Progress:      60% (Stage 3/5)
Current Stage: Evolutionary Leap
Started:       2025-01-30 14:30:00
Duration:      5m 23s

Stage Progress:
  ✓ 1. Contextual Grounding      (100%)
  ✓ 2. Gap & Potential Scan       (100%)
  ⟳ 3. Evolutionary Leap          (60%)
  ○ 4. Validation Simulation      (0%)
  ○ 5. Deliverable Format         (0%)
```

**API Call**: `GET /api/incubations/:sessionId`

---

### 3. **Watch Incubation Progress**

```bash
farm incubate watch <session-id>
```

**Description**: Watch incubation progress in real-time (like `watch` command)

**Example**:
```bash
farm incubate watch session-xyz789
```

**Output**: Live-updating progress display with WebSocket connection

**Features**:
- Real-time stage updates
- Progress bar animation
- Current stage output preview
- Estimated time remaining
- Press `q` to quit watching (continues in background)

---

### 4. **Pause Incubation**

```bash
farm incubate pause <session-id>
```

**Description**: Pause a running incubation

**Example**:
```bash
farm incubate pause session-xyz789
```

**Output**:
```
⏸  Incubation paused
Session:  session-xyz789
Progress: 60% (Stage 3/5)

Use 'farm incubate resume session-xyz789' to continue
```

**API Call**: `POST /api/incubations/:sessionId/pause`

---

### 5. **Resume Incubation**

```bash
farm incubate resume <session-id>
```

**Description**: Resume a paused incubation

**Example**:
```bash
farm incubate resume session-xyz789
```

**Output**:
```
▶  Incubation resumed
Session:  session-xyz789
Progress: 60% (Stage 3/5)
```

**API Call**: `POST /api/incubations/:sessionId/resume`

---

### 6. **Stop Incubation**

```bash
farm incubate stop <session-id> [options]
```

**Description**: Stop a running incubation

**Options**:
- `--reason, -r <text>` - Reason for stopping

**Example**:
```bash
farm incubate stop session-xyz789 --reason "Going in wrong direction"
```

**Output**:
```
⏹  Incubation stopped
Session:  session-xyz789
Reason:   Going in wrong direction
Progress: 60% (Stage 3/5 incomplete)
```

**API Call**: `POST /api/incubations/:sessionId/stop`

---

### 7. **View Lineage**

```bash
farm incubate lineage <farm-id>
```

**Description**: Show incubation lineage/ancestry for a farm

**Example**:
```bash
farm incubate lineage abc123
```

**Output**:
```
🌳 Incubation Lineage
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

v1.0  farm-abc123  "Initial Implementation"
       ↓  (Created: 2025-01-30 10:00)
v2.0  farm-def456  "Enhanced with Auth"
       ↓  (Created: 2025-01-30 15:30)
v3.0  farm-ghi789  "Performance Optimized" ← Current
       ↓  (Created: 2025-01-30 18:00)

Total Generations: 3
View farm: farm show farm-abc123
```

**API Call**: `GET /api/farms/:farmId/lineage`

---

### 8. **List Incubations**

```bash
farm incubate list [options]
```

**Description**: List all incubation sessions

**Options**:
- `--farm, -f <farm-id>` - Filter by farm ID
- `--status, -s <status>` - Filter by status (pending, incubating, completed, failed)
- `--limit, -l <number>` - Limit results (default: 20)

**Example**:
```bash
# List all
farm incubate list

# List for specific farm
farm incubate list --farm abc123

# List completed only
farm incubate list --status completed
```

**Output**:
```
🌱 Incubation Sessions
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Session ID         Farm ID    Status       Progress  Started
session-xyz789     abc123     incubating   60%       5m ago
session-uvw456     abc123     completed    100%      2h ago
session-rst123     def456     failed       40%       1d ago

Total: 3 sessions
```

**API Call**: `GET /api/farms/:farmId/incubations`

---

## Implementation Priority

**HIGH PRIORITY**:
1. `farm incubate <farm-id>` - Start incubation
2. `farm incubate status <session-id>` - Check status
3. `farm incubate watch <session-id>` - Watch progress

**MEDIUM PRIORITY**:
4. `farm incubate pause/resume/stop` - Control commands
5. `farm incubate lineage <farm-id>` - View ancestry

**LOW PRIORITY**:
6. `farm incubate list` - List all sessions

---

## Implementation Files

### Structure
```
cli/
├── index.ts                 # Main CLI entry point
├── commands/
│   ├── incubate.ts         # Incubation commands handler
│   └── ...                 # Other commands
├── utils/
│   ├── api.ts              # API client
│   ├── websocket.ts        # WebSocket client for live updates
│   └── formatters.ts       # Output formatting
└── types/
    └── cli.ts              # CLI type definitions
```

### Example Implementation

**`cli/commands/incubate.ts`**:
```typescript
import chalk from 'chalk';
import ora from 'ora';
import { apiClient } from '../utils/api';
import { formatProgress, formatLineage } from '../utils/formatters';
import { WebSocketClient } from '../utils/websocket';

export async function incubateCommand(args: string[], options: any) {
  const subcommand = args[0];

  switch (subcommand) {
    case undefined:
    case 'start':
      await startIncubation(args[1], options);
      break;
    case 'status':
      await showStatus(args[1]);
      break;
    case 'watch':
      await watchIncubation(args[1]);
      break;
    case 'pause':
      await pauseIncubation(args[1]);
      break;
    case 'resume':
      await resumeIncubation(args[1]);
      break;
    case 'stop':
      await stopIncubation(args[1], options);
      break;
    case 'lineage':
      await showLineage(args[1]);
      break;
    case 'list':
      await listIncubations(options);
      break;
    default:
      console.error(chalk.red(`Unknown subcommand: ${subcommand}`));
      showHelp();
  }
}

async function startIncubation(farmId: string, options: any) {
  const spinner = ora('Starting incubation...').start();

  try {
    const response = await apiClient.post('/incubations/start', {
      farmId,
      harvestId: await getLatestHarvestId(farmId),
      userContext: options.context
    });

    spinner.succeed(`Incubation started: ${response.data.sessionId}`);

    if (!options.noWait) {
      await watchIncubation(response.data.sessionId);
    }
  } catch (error) {
    spinner.fail('Failed to start incubation');
    console.error(chalk.red(error.message));
  }
}

async function watchIncubation(sessionId: string) {
  console.log(chalk.blue('Watching incubation progress...'));
  console.log(chalk.gray('Press Ctrl+C to stop watching'));

  const ws = new WebSocketClient();

  ws.on('incubation:stage-progress', (data) => {
    if (data.sessionId === sessionId) {
      process.stdout.write('\r' + formatProgress(data));
    }
  });

  ws.on('incubation:completed', (data) => {
    if (data.sessionId === sessionId) {
      console.log(chalk.green('\n✓ Incubation completed!'));
      ws.close();
    }
  });

  await ws.connect();
}
```

---

## Dependencies

```json
{
  "dependencies": {
    "commander": "^11.0.0",
    "chalk": "^5.3.0",
    "ora": "^7.0.0",
    "ws": "^8.14.0",
    "axios": "^1.6.0",
    "inquirer": "^9.2.0",
    "cli-table3": "^0.6.3"
  }
}
```

---

## Testing

```bash
# Manual testing
farm incubate abc123
farm incubate status session-xyz789
farm incubate watch session-xyz789
farm incubate pause session-xyz789
farm incubate resume session-xyz789
farm incubate stop session-xyz789
farm incubate lineage abc123
farm incubate list
```

---

## Integration with Frontend

CLI and UI should share the same backend APIs:
- Both call `/api/incubations/*` endpoints
- Both receive same WebSocket events
- Both display same lineage data
- Both have pause/resume/stop controls

---

## Next Steps

1. ✅ **Backend APIs** - Complete (already implemented)
2. ⏳ **CLI Commands** - To be implemented (this document)
3. ⏳ **Frontend UI** - In progress (higher priority)
4. ⏳ **Testing** - After CLI/UI complete

**Recommendation**: Implement frontend UI first (higher user value), then CLI commands for power users.
