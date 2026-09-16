# Terminal Streaming Integration Guide

This guide shows how to integrate the new unified terminal streaming system into MaiFarm applications.

## Quick Start

### Backend Integration

#### 1. Import the Services

```typescript
import { unifiedTerminalStreamService } from '@/services/UnifiedTerminalStreamService';
import { orchestratorIntegrationService } from '@/services/OrchestratorIntegrationService';
import { createUnifiedTerminalHandlers } from '@/websocket/unifiedTerminalHandlers';
```

#### 2. Setup WebSocket Handlers

```typescript
// In your socketServer.ts or main server file
import { Server } from 'socket.io';

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

// Initialize unified terminal handlers
createUnifiedTerminalHandlers(io);
```

#### 3. Launch a Farm with Terminal Streaming

```typescript
// Example: Farm creation endpoint
router.post('/api/farms/:id/launch', async (req, res) => {
  const { id } = req.params;
  const { numberOfAgents, prompt, provider } = req.body;

  try {
    // Launch farm with orchestrator integration
    const result = await orchestratorIntegrationService.launchFarm({
      farmId: id,
      farmName: 'My Farm',
      agentCount: numberOfAgents,
      prompt: prompt,
      provider: provider || 'claude',
      mode: 'farm',
      timeout: 3600000 // 1 hour in milliseconds
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      data: {
        farmId: id,
        sessionName: result.sessionName,
        message: 'Farm launched successfully'
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

#### 4. Manual Stream Control (Optional)

If you need fine-grained control:

```typescript
// Register a farm session before orchestrator starts
unifiedTerminalStreamService.registerFarmSession(
  farmId,
  `farm-${farmId.substring(0, 8)}`,
  agentCount,
  'agents'
);

// Wait for orchestrator to create tmux session...

// Then start streaming for all agents
await unifiedTerminalStreamService.startFarmStreaming(
  farmId,
  `farm-${farmId.substring(0, 8)}`,
  agentCount
);

// Stop streaming when done
await unifiedTerminalStreamService.stopFarmStreaming(farmId);
```

### Frontend Integration

#### 1. Connect to WebSocket

```typescript
import { useWebSocket } from '@/hooks/useWebSocket';

function FarmTerminalView({ farmId }: { farmId: string }) {
  const { socket, isConnected } = useWebSocket();
  const [terminalOutput, setTerminalOutput] = useState<Record<number, string[]>>({});

  useEffect(() => {
    if (!socket || !isConnected) return;

    // Join farm session
    const sessionName = `farm-${farmId.substring(0, 8)}`;
    socket.emit('terminal:join_session', {
      sessionId: sessionName,
      farmId
    });

    // Listen for join confirmation
    socket.on('terminal:joined', (data) => {
      console.log('Joined terminal session:', data);
    });

    // Listen for terminal output
    socket.on('terminal:output', (data) => {
      const { agentIndex, content } = data;

      setTerminalOutput(prev => ({
        ...prev,
        [agentIndex]: [...(prev[agentIndex] || []), content]
      }));
    });

    // Listen for connection quality
    socket.on('terminal:quality', (data) => {
      console.log('Connection quality:', data.status, data.latency, 'ms');
    });

    // Listen for errors
    socket.on('terminal:error', (data) => {
      console.error('Terminal error:', data);
    });

    // Cleanup on unmount
    return () => {
      socket.emit('terminal:leave_session', { sessionId: sessionName });
      socket.off('terminal:joined');
      socket.off('terminal:output');
      socket.off('terminal:quality');
      socket.off('terminal:error');
    };
  }, [socket, isConnected, farmId]);

  return (
    <div className="terminal-container">
      {Object.entries(terminalOutput).map(([agentIndex, lines]) => (
        <div key={agentIndex} className="agent-terminal">
          <h3>Agent {agentIndex}</h3>
          <pre className="terminal-output">
            {lines.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </pre>
        </div>
      ))}
    </div>
  );
}
```

#### 2. Handle Connection Quality

```typescript
function TerminalQualityIndicator() {
  const { socket } = useWebSocket();
  const [quality, setQuality] = useState<'excellent' | 'good' | 'poor'>('excellent');
  const [latency, setLatency] = useState(0);

  useEffect(() => {
    if (!socket) return;

    // Listen for heartbeats
    socket.on('terminal:heartbeat', (data) => {
      // Respond to heartbeat
      socket.emit('terminal:heartbeat_pong', { timestamp: data.timestamp });
    });

    // Listen for quality updates
    socket.on('terminal:quality', (data) => {
      setQuality(data.status);
      setLatency(data.latency);
    });

    return () => {
      socket.off('terminal:heartbeat');
      socket.off('terminal:quality');
    };
  }, [socket]);

  return (
    <div className={`quality-indicator quality-${quality}`}>
      <span className="status-dot" />
      <span>{quality}</span>
      {latency > 0 && <span className="latency">{latency}ms</span>}
    </div>
  );
}
```

#### 3. Advanced: Virtual Scrolling

```typescript
import { FixedSizeList as List } from 'react-window';

function VirtualizedTerminal({ lines }: { lines: string[] }) {
  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => (
    <div style={style} className="terminal-line">
      {lines[index]}
    </div>
  );

  return (
    <List
      height={600}
      itemCount={lines.length}
      itemSize={20}
      width="100%"
    >
      {Row}
    </List>
  );
}
```

## Advanced Usage

### Monitoring Stream Health

```typescript
// Backend
const metrics = unifiedTerminalStreamService.getMetrics();
console.log('Streaming Metrics:', {
  totalStreams: metrics.totalStreams,
  activeStreams: metrics.activeStreams,
  avgLatency: `${metrics.averageLatency.toFixed(2)}ms`,
  errorRate: `${(metrics.errorRate * 100).toFixed(2)}%`,
  healthyStreams: metrics.healthyStreams,
  unhealthyStreams: metrics.unhealthyStreams
});

// Check specific stream health
const health = unifiedTerminalStreamService.getStreamHealth(farmId, 'agent-0');
if (health && !health.isHealthy) {
  console.warn('Stream unhealthy:', {
    errorRate: health.errorRate,
    latency: health.latency,
    throughput: health.throughput
  });
}
```

### Listening to Service Events

```typescript
// Listen for stream lifecycle events
unifiedTerminalStreamService.on('stream:started', ({ farmId, agentId, agentIndex }) => {
  console.log(`Stream started: ${farmId}/${agentId} (pane ${agentIndex})`);
});

unifiedTerminalStreamService.on('stream:stopped', ({ farmId, agentId }) => {
  console.log(`Stream stopped: ${farmId}/${agentId}`);
});

unifiedTerminalStreamService.on('output', ({ farmId, agentId, agentIndex, content }) => {
  // Process output directly from service
  console.log(`[${farmId}:${agentIndex}]`, content);
});

unifiedTerminalStreamService.on('metrics', (metrics) => {
  // Process metrics updates
  console.log('Metrics update:', metrics);
});
```

### Custom Error Handling

```typescript
// Backend
try {
  await unifiedTerminalStreamService.startStream(
    farmId,
    agentId,
    agentIndex,
    sessionName
  );
} catch (error) {
  if (error.message.includes('Circuit breaker is open')) {
    // Circuit breaker triggered - system is recovering
    console.warn('Circuit breaker open, waiting for recovery...');

    // Wait and retry
    setTimeout(async () => {
      await unifiedTerminalStreamService.startStream(
        farmId,
        agentId,
        agentIndex,
        sessionName
      );
    }, 60000); // Wait 60 seconds

  } else if (error.message.includes('Timeout waiting for pane')) {
    // Tmux pane not ready
    console.error('Tmux pane not ready, check orchestrator status');

  } else {
    // Other error
    console.error('Stream start failed:', error);
  }
}

// Frontend
socket.on('terminal:error', (data) => {
  switch (data.code) {
    case 'JOIN_FAILED':
      // Failed to join session
      showNotification('Failed to join terminal session', 'error');
      break;

    case 'STREAM_INACTIVE':
      // Stream became inactive
      showNotification('Terminal stream inactive', 'warning');
      break;

    case 'CIRCUIT_BREAKER_OPEN':
      // Circuit breaker triggered
      showNotification('Connection issues, retrying...', 'warning');
      break;

    default:
      showNotification(data.message || 'Terminal error', 'error');
  }
});
```

### Performance Optimization

```typescript
// Frontend: Batch state updates
function useBatchedTerminalOutput(farmId: string) {
  const [output, setOutput] = useState<Record<number, string[]>>({});
  const updateQueue = useRef<Array<{ agentIndex: number; content: string }>>([]);
  const flushTimer = useRef<NodeJS.Timeout>();

  const addOutput = useCallback((agentIndex: number, content: string) => {
    updateQueue.current.push({ agentIndex, content });

    // Debounce updates to max 60fps
    if (flushTimer.current) {
      clearTimeout(flushTimer.current);
    }

    flushTimer.current = setTimeout(() => {
      const updates = updateQueue.current;
      updateQueue.current = [];

      setOutput(prev => {
        const next = { ...prev };
        for (const { agentIndex, content } of updates) {
          next[agentIndex] = [...(next[agentIndex] || []), content];
        }
        return next;
      });
    }, 16); // ~60fps
  }, []);

  return { output, addOutput };
}
```

## Troubleshooting

### Issue: No terminal output appears

**Diagnosis**:
1. Check if WebSocket is connected:
```typescript
const { isConnected } = useWebSocket();
console.log('WebSocket connected:', isConnected);
```

2. Check if session joined successfully:
```typescript
socket.on('terminal:joined', (data) => {
  console.log('Joined session:', data.success);
  console.log('Rooms:', data.rooms);
});
```

3. Check backend logs:
```bash
grep "TERMINAL" logs/app.log | tail -50
```

4. Check if tmux session exists:
```bash
TMUX_TMPDIR=/tmp tmux ls
```

**Solution**:
- Ensure orchestrator has created the tmux session
- Verify session name matches (frontend → backend → tmux)
- Check if agents are actually running

### Issue: High latency / delayed output

**Diagnosis**:
```typescript
// Frontend
socket.on('terminal:quality', (data) => {
  console.log('Connection quality:', data.status, data.latency);
});

// Backend
const metrics = unifiedTerminalStreamService.getMetrics();
console.log('Average latency:', metrics.averageLatency, 'ms');
```

**Solution**:
- Check network conditions
- Reduce terminal output frequency if possible
- Implement virtual scrolling to reduce DOM updates
- Use Web Workers for ANSI parsing

### Issue: Circuit breaker opens frequently

**Diagnosis**:
```typescript
// Backend
const health = unifiedTerminalStreamService.getStreamHealth(farmId, agentId);
console.log('Error rate:', health?.errorRate);
console.log('Stream healthy:', health?.isHealthy);
```

**Solution**:
- Check system resources (file descriptors, memory)
- Review tmux session health
- Check output file permissions
- Increase circuit breaker threshold if needed

## Migration from Legacy System

### 1. Identify Legacy Code

Look for:
- `terminalStreamService` (old service)
- `TerminalStreamingEnhanced`
- `terminalHandlers.ts` with batching
- Manual pipe-pane setup

### 2. Replace with Unified Services

**Before**:
```typescript
import { terminalStreamService } from '@/services/terminalStreamService';

await terminalStreamService.startStreaming(farmId, sessionName, agents);
```

**After**:
```typescript
import { unifiedTerminalStreamService } from '@/services/UnifiedTerminalStreamService';

await unifiedTerminalStreamService.startFarmStreaming(farmId, sessionName, agentCount);
```

### 3. Update WebSocket Event Handlers

**Before**:
```typescript
socket.on('terminal:output', (data) => {
  // data.lines was array
  const lines = data.lines || [];
  // ...
});
```

**After**:
```typescript
socket.on('terminal:output', (data) => {
  // data.content is string
  const content = data.content;
  // ...
});
```

### 4. Remove Batching Logic

**Before**:
```typescript
const messageBatcher = new MessageBatcher();
messageBatcher.addMessage('terminal:output', data, rooms);
```

**After**:
```typescript
// Batching removed - direct emission
io.to(`farm:${farmId}`).emit('terminal:output', data);
```

## Best Practices

### 1. Always Register Sessions

```typescript
// Register BEFORE orchestrator starts
unifiedTerminalStreamService.registerFarmSession(
  farmId,
  sessionName,
  agentCount,
  'agents'
);

// Then launch orchestrator
await orchestratorIntegrationService.launchFarm(config);
```

### 2. Handle Errors Gracefully

```typescript
try {
  await unifiedTerminalStreamService.startFarmStreaming(farmId, sessionName, agentCount);
} catch (error) {
  logger.error('Failed to start streaming:', error);

  // Notify user
  websocketManager.sendToRoom(`farm:${farmId}`, 'farm:error', {
    message: 'Terminal streaming failed to start',
    error: error.message
  });

  // Continue with farm launch
  // (streaming will retry automatically)
}
```

### 3. Clean Up Resources

```typescript
// Stop streaming when farm completes
farm.on('completed', async (farmId) => {
  await unifiedTerminalStreamService.stopFarmStreaming(farmId);
  await orchestratorIntegrationService.stopFarm(farmId);
});

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  // Stop all active streams
  const sessions = orchestratorIntegrationService.getActiveSessions();
  for (const session of sessions) {
    await orchestratorIntegrationService.stopFarm(session.farmId);
  }

  process.exit(0);
});
```

### 4. Monitor Performance

```typescript
// Collect metrics every minute
setInterval(() => {
  const metrics = unifiedTerminalStreamService.getMetrics();

  // Log to monitoring system
  monitoringService.recordMetrics({
    'terminal.streams.total': metrics.totalStreams,
    'terminal.streams.active': metrics.activeStreams,
    'terminal.latency.avg': metrics.averageLatency,
    'terminal.error_rate': metrics.errorRate,
    'terminal.bytes_transferred': metrics.totalBytesTransferred
  });
}, 60000);
```

### 5. Use Feature Flags

```typescript
const USE_UNIFIED_TERMINAL = process.env.USE_UNIFIED_TERMINAL === 'true';

if (USE_UNIFIED_TERMINAL) {
  await unifiedTerminalStreamService.startFarmStreaming(farmId, sessionName, agentCount);
} else {
  // Fallback to legacy system
  await legacyTerminalService.startStreaming(farmId, sessionName, agents);
}
```

## Testing

### Unit Tests

```typescript
import { unifiedTerminalStreamService } from '@/services/UnifiedTerminalStreamService';

describe('UnifiedTerminalStreamService', () => {
  it('should start streaming for a farm', async () => {
    await unifiedTerminalStreamService.startFarmStreaming(
      'test-farm-id',
      'farm-testfarm',
      3
    );

    const metrics = unifiedTerminalStreamService.getMetrics();
    expect(metrics.activeStreams).toBe(3);
  });

  it('should handle stream failures gracefully', async () => {
    // Simulate failure
    await expect(
      unifiedTerminalStreamService.startStream(
        'invalid-farm',
        'agent-0',
        0,
        'nonexistent-session'
      )
    ).rejects.toThrow();
  });
});
```

### Integration Tests

```typescript
describe('Terminal Streaming Integration', () => {
  it('should stream output end-to-end', async () => {
    // Launch farm
    const result = await orchestratorIntegrationService.launchFarm({
      farmId: 'test-farm',
      farmName: 'Test Farm',
      agentCount: 2,
      prompt: 'test prompt',
      provider: 'claude',
      mode: 'farm'
    });

    expect(result.success).toBe(true);

    // Wait for streaming to start
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify streams are active
    const metrics = unifiedTerminalStreamService.getMetrics();
    expect(metrics.activeStreams).toBeGreaterThanOrEqual(2);

    // Cleanup
    await orchestratorIntegrationService.stopFarm('test-farm');
  });
});
```

## API Reference

See [TERMINAL_STREAMING_ARCHITECTURE.md](./TERMINAL_STREAMING_ARCHITECTURE.md) for complete API documentation.

## Support

For issues or questions:
1. Check [TERMINAL_STREAMING_ARCHITECTURE.md](./TERMINAL_STREAMING_ARCHITECTURE.md) for architecture details
2. Review logs: `grep "TERMINAL" logs/app.log`
3. Check metrics: `unifiedTerminalStreamService.getMetrics()`
4. Open an issue on GitHub with logs and reproduction steps
