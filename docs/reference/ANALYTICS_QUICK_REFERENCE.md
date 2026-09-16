# Analytics Quick Reference Card

**For**: MaiFarm Developers
**Version**: 1.0.0
**Last Updated**: 2025-10-09

---

## Common Issues & Quick Fixes

### ❌ Problem: Random Data in Metrics
```typescript
// Bad - using random data
const storage = Math.round(Math.random() * 40 + 30);

// Good - fetch real data
const { systemInfo } = useSystemMetrics();
const storage = systemInfo.storage.percentage;
```

### ❌ Problem: No Loading States
```typescript
// Bad - chart renders immediately
<RealTimeChart data={timeSeriesData} />

// Good - show skeleton while loading
{isLoading ? <ChartSkeleton height={250} /> : <RealTimeChart data={timeSeriesData} />}
```

### ❌ Problem: No Error Handling
```typescript
// Bad - errors crash the page
const data = await fetch('/api/analytics/metrics');

// Good - wrap in error boundary and retry
<AnalyticsErrorBoundary>
  <AnalyticsPage />
</AnalyticsErrorBoundary>

const data = await fetchWithRetry(() => fetch('/api/analytics/metrics'));
```

---

## Quick Patterns

### ✅ Fetch System Metrics
```typescript
import { useSystemMetrics } from '@/hooks/useSystemMetrics';

function MyComponent() {
  const { systemInfo, loading } = useSystemMetrics();

  return (
    <div>
      CPU: {systemInfo.cpu.usage}%
      Memory: {systemInfo.memory.percentage}%
      Storage: {systemInfo.storage.percentage}%
    </div>
  );
}
```

### ✅ Add Loading Skeleton
```typescript
import { ChartSkeleton } from '@/components/Analytics/Skeletons/ChartSkeleton';

{loading ? (
  <ChartSkeleton height={250} />
) : (
  <RealTimeChart data={data} height={250} />
)}
```

### ✅ Validate Data
```typescript
import { validateSystemMetrics } from '@/utils/analyticsValidation';

const rawData = await fetch('/api/metrics/system');
const validatedData = validateSystemMetrics(rawData);

if (!validatedData) {
  // Handle invalid data
  showError('Invalid metrics data');
  return;
}
```

### ✅ Add Retry Logic
```typescript
import { fetchWithRetry } from '@/utils/retryableFetch';

const data = await fetchWithRetry(
  () => analyticsService.refreshMetrics(),
  {
    maxRetries: 3,
    retryDelay: 1000,
    onRetry: (attempt) => toast.loading(`Retrying... (${attempt}/3)`)
  }
);
```

### ✅ Memoize Expensive Calculations
```typescript
import { useMemo } from 'react';

// Bad - recalculates on every render
const metrics = calculateMetrics(farms, agents);

// Good - only recalculates when dependencies change
const metrics = useMemo(
  () => calculateMetrics(farms, agents),
  [farms.length, agents.length]  // Use length, not full objects
);
```

---

## API Endpoints Reference

### System Metrics
```bash
GET /api/metrics/system
# Returns: { cpu, memory, storage, gpu }
```

### Analytics Metrics
```bash
GET /api/analytics/metrics?period=current&range=24h
GET /api/analytics/metrics?period=previous&range=24h
# Returns: { totalTasks, completedTasks, activeAgents, etc. }
```

### Cost Breakdown
```bash
GET /api/analytics/costs
# Returns: { total, compute, storage, network, api }
```

### Agent Efficiency
```bash
GET /api/analytics/agent-efficiency
# Returns: [{ agentId, successRate, tasksCompleted, etc. }]
```

---

## WebSocket Events

### Subscribe to Updates
```typescript
import { useAnalyticsWebSocket } from '@/hooks/useAnalyticsWebSocket';

const { connected } = useAnalyticsWebSocket();

useEffect(() => {
  analyticsService.subscribeToRealtimeUpdates('my-component', (data) => {
    // Handle update
  });

  return () => {
    analyticsService.unsubscribeFromRealtimeUpdates('my-component');
  };
}, []);
```

### Event Types
- `metrics:update` - Real-time metrics update
- `analytics:update` - Full analytics refresh
- `claude:metrics` - Claude Code specific metrics
- `farm:performance` - Farm performance update
- `agent:efficiency` - Agent efficiency update

---

## Testing Patterns

### Test with Mock Data
```typescript
import { render, screen, waitFor } from '@testing-library/react';
import { AnalyticsPage } from './AnalyticsPage';

test('renders analytics with data', async () => {
  render(<AnalyticsPage />);

  // Check loading state
  expect(screen.getAllByTestId('skeleton')).toHaveLength(4);

  // Wait for data to load
  await waitFor(() => {
    expect(screen.getByText(/Active Farms/)).toBeInTheDocument();
  });
});
```

### Test Error Handling
```typescript
test('handles API errors gracefully', async () => {
  server.use(
    rest.get('/api/analytics/metrics', (req, res, ctx) => {
      return res(ctx.status(500));
    })
  );

  render(<AnalyticsPage />);

  await waitFor(() => {
    expect(screen.getByText(/Failed to load/)).toBeInTheDocument();
  });
});
```

---

## Performance Tips

### ✅ DO:
- Use `useMemo` for expensive calculations
- Debounce WebSocket updates (300ms)
- Use React.memo for chart components
- Implement virtual scrolling for large lists
- Clean up D3.js selections on unmount

### ❌ DON'T:
- Pass full `farms` array as dependency (use `farms.length`)
- Create new objects in render functions
- Use `console.log` (use ProductionLogger)
- Forget to clean up intervals and timeouts
- Render charts on every state change

---

## Common Mistakes

### Mistake 1: Deep Object Comparison
```typescript
// Bad - causes re-render on every farms update
useEffect(() => {
  loadData();
}, [farms]);  // farms is a large array of objects

// Good - only re-render when farm count changes
useEffect(() => {
  loadData();
}, [farms.length, farms.map(f => f.status).join(',')]);
```

### Mistake 2: Missing Cleanup
```typescript
// Bad - interval keeps running after unmount
useEffect(() => {
  setInterval(fetchData, 15000);
}, []);

// Good - cleanup interval on unmount
useEffect(() => {
  const interval = setInterval(fetchData, 15000);
  return () => clearInterval(interval);
}, []);
```

### Mistake 3: Not Validating Data
```typescript
// Bad - assumes data is valid
const percentage = data.cpu.usage;

// Good - validate before using
const validatedData = validateSystemMetrics(data);
if (!validatedData) {
  return <ErrorState />;
}
const percentage = validatedData.cpu.usage;
```

---

## Debugging Tips

### Check System Metrics
```bash
# Verify API is returning real data
curl http://localhost:4567/api/metrics/system | jq '.'

# Should see actual CPU, memory, storage percentages
```

### Check WebSocket Connection
```bash
# Verify WebSocket health
curl http://localhost:4567/api/websocket-health | jq '.'
```

### Check Console for Errors
```typescript
// Add ProductionLogger for debugging
import { logger, LogCategory } from '@/services/ProductionLogger';

logger.debug(LogCategory.ANALYTICS, 'Loading analytics data', {
  timeRange,
  farmsCount: farms.length
});
```

---

## Need More Info?

- **Complete Guide**: `ANALYTICS_UPGRADE_COMPLETE.md`
- **Logging Standards**: `LOGGING_STANDARDS.md`
- **Main Docs**: `CLAUDE.md`

---

**Keep this card handy for quick reference!** 📊
