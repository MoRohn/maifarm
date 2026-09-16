# MaiFarm Widgets

A comprehensive WidgetKit suite for MaiFarm, providing real-time farm status monitoring across iOS, iPadOS, and macOS.

## Widget Kinds

### 1. MaiFarm Overview (`MaiFarmOverviewWidget`)
**Families:** Small, Medium, Large

A dashboard widget showing farm status rollups and top farms.

| Size | Content |
|------|---------|
| Small | Top farm with progress, Running/Completed count |
| Medium | Rollup stats (Running/Queued/Completed/Failed) + 2 top farms |
| Large | Full rollup banner + 4 top farms with detailed progress |

**Deep Link:** `maifarm://harvest` (default tap opens Harvest page)

### 2. Farm Monitor (`MaiFarmFarmMonitorWidget`)
**Families:** Medium, Large
**Configurable:** Yes (select specific farm)

Detailed monitoring of a single selected farm.

- Farm name and status chip
- Progress bar with percentage
- Agent count (active/total)
- ETA (when available)
- Last harvest result (success/fail summary)
- "Open Harvest" CTA button

**Configuration:** Long-press widget to select a farm from the list.

**Deep Link:** `maifarm://harvest?farmId={id}`

### 3. Harvest Terminal (`MaiFarmHarvestTerminalWidget`)
**Families:** Large only
**Configurable:** Yes (select farm, toggle timestamps, line count)

A CLI-style terminal snapshot showing recent harvest logs.

- Traffic light window controls
- Farm name + status + "LIVE SNAPSHOT" indicator
- Last 10-14 lines of terminal output (configurable)
- Syntax highlighting for agents, system, errors
- ASCII-style progress bar in footer

**Configuration Options:**
- Farm selection
- Show timestamps (default: on)
- Line count (default: 12)

**Deep Link:** `maifarm://harvest?farmId={id}`

### 4. Lock Screen Status (`MaiFarmLockScreenWidget`)
**Families:** accessoryRectangular, accessoryCircular, accessoryInline (iOS only)

Quick glance widgets for Lock Screen and StandBy mode.

| Family | Content |
|--------|---------|
| Rectangular | Top farm name, status, progress ring |
| Circular | Progress ring or farm count |
| Inline | "Farm 67%" or "Running 2 • Done 5" |

**Deep Link:** `maifarm://harvest`

### 5. Assistant Status (`AssistantWidget`) - Legacy
**Families:** Small, Medium, Large

Original assistant widget showing stall detection status.

---

## Data Architecture

### App Group Identifier
```
group.app.maifarm
```

### Data Schema

#### `widget_farms_status` (UserDefaults key)
```json
{
  "farms": [
    {
      "farmId": "uuid-string",
      "name": "Farm Name",
      "status": "running",
      "progress": 0.67,
      "phase": "Farming",
      "updatedAt": "2025-01-08T12:00:00Z",
      "etaSeconds": 1800,
      "lastResult": {
        "success": true,
        "summary": "Generated 12 files",
        "timestamp": "2025-01-08T11:00:00Z",
        "filesGenerated": 12
      },
      "activeAgents": 3,
      "totalAgents": 5,
      "provider": "claude"
    }
  ],
  "logs": {
    "uuid-string": {
      "farmId": "uuid-string",
      "lines": ["[Agent-1] Working...", "[System] Progress: 67%"],
      "updatedAt": "2025-01-08T12:00:00Z"
    }
  },
  "lastUpdate": "2025-01-08T12:00:00Z",
  "rollup": {
    "running": 1,
    "queued": 2,
    "completedToday": 5,
    "failedToday": 0,
    "totalActive": 3
  }
}
```

### Status Values
- `idle` - Farm not started
- `launching` - Starting up
- `running` - Actively processing
- `active` - Agents working
- `completed` - Successfully finished
- `failed` - Error occurred
- `queued` - Waiting to start
- `recovering` - Attempting recovery

### Phase Values
- `Planning` (0-10%)
- `Analyzing` (10-30%)
- `Farming` (30-70%)
- `Synthesizing` (70-90%)
- `Harvesting` (90-100%)
- `Done` (100%)

---

## Deep Links

| URL | Action |
|-----|--------|
| `maifarm://harvest` | Open Harvest tab |
| `maifarm://harvest?farmId={id}` | Open specific farm's harvest view |
| `maifarm://farms` | Open Farms tab |
| `maifarm://farm/{id}` | Open specific farm detail |

---

## Timeline Refresh Strategy

| Widget | Active Farms | Idle |
|--------|--------------|------|
| Overview | 60 sec | 15 min |
| Farm Monitor | 30 sec | 5 min |
| Terminal | 15 sec | 5 min |
| Lock Screen | 60 sec | 15 min |

### App-Triggered Reloads
The main app triggers `WidgetCenter.shared.reloadTimelines(ofKind:)` when:
- Farm status changes
- New log lines arrive (Terminal widget only)
- Farm is created/deleted

Reload calls are debounced (minimum 5 second interval) to preserve battery.

---

## Files

```
MaiFarmWidget/
├── AssistantWidget.swift      # Widget bundle entry + legacy Assistant widget
├── WidgetSharedModels.swift   # Shared data types
├── AppGroupFarmStatusStore.swift  # Data store for widget
├── FarmIntents.swift          # AppIntents for configuration
├── MaiFarmOverviewWidget.swift    # Overview widget
├── MaiFarmFarmMonitorWidget.swift # Farm Monitor widget
├── MaiFarmHarvestTerminalWidget.swift # Terminal widget
├── MaiFarmLockScreenWidget.swift  # Lock Screen widgets
├── WidgetPreviews.swift       # Comprehensive preview states
└── README.md                  # This file

MaiFarm/Services/
└── WidgetDataSync.swift       # Main app → widget data sync
```

---

## Testing

### Xcode Widget Previews
1. Open `WidgetPreviews.swift` in Xcode
2. Open Canvas (Editor → Canvas or ⌥⌘↵)
3. View all preview states across widget families

### Preview States Tested
- Active farm with progress
- Completed farm with result
- Failed farm with error
- Queued farm waiting
- Long farm name (truncation)
- Empty state (no farms)
- Multiple farms
- Terminal with logs
- Terminal with errors
- Terminal without logs

### Timeline Time Travel
1. Run widget extension scheme
2. In Simulator: long-press widget → Edit Widget
3. Use timeline controls to scrub through entries

### Data Corruption Test
1. Write malformed JSON to App Group:
   ```swift
   UserDefaults(suiteName: "group.app.maifarm")?.set(
       "invalid json".data(using: .utf8),
       forKey: "widget_farms_status"
   )
   ```
2. Verify widgets show empty state gracefully (no crash)

### Performance Test
1. Set breakpoint in timeline provider
2. Verify no heavy parsing on main thread
3. Check no excessive `reloadTimelines` calls (debounce working)

### Accessibility Test
1. Enable VoiceOver in Simulator
2. Navigate widgets with focus
3. Verify labels describe: farm name, status, progress percentage

---

## QA Matrix Checklist

### Devices
- [ ] iPhone (various sizes)
- [ ] iPad (portrait/landscape)
- [ ] Mac (Catalyst/macOS widget gallery)

### Widget Sizes
- [ ] Small - Overview
- [ ] Medium - Overview, Farm Monitor
- [ ] Large - Overview, Farm Monitor, Terminal
- [ ] Lock Screen - Rectangular, Circular, Inline (iOS only)

### States
- [ ] Empty (no farms)
- [ ] Single active farm
- [ ] Multiple farms (running + queued)
- [ ] Completed farm with result
- [ ] Failed farm with error
- [ ] Long farm names (truncation)
- [ ] Offline (last known data displayed)

### Navigation (Deep Links)
- [ ] Tap Overview → Harvest tab
- [ ] Tap farm row → Farm's harvest detail
- [ ] Tap Farm Monitor → Farm's harvest detail
- [ ] Tap Terminal → Farm's harvest detail
- [ ] Lock Screen tap → Harvest tab

### Configuration
- [ ] Farm Monitor: can select different farms
- [ ] Terminal: can select farm, adjust settings
- [ ] Settings persist across app launches

### Appearance
- [ ] Light mode
- [ ] Dark mode
- [ ] Dynamic Type (accessibility text sizes)
- [ ] High contrast mode

---

## Troubleshooting

### Widgets Not Updating
1. Check App Group entitlement in both targets
2. Verify `WidgetDataSyncService` is called on farm updates
3. Check `reloadTimelines` debounce isn't blocking

### No Farms in Configuration
1. Ensure farms exist in main app
2. Check `FarmEntityQuery` reads from correct App Group
3. Verify JSON decoding succeeds

### Terminal Shows No Logs
1. Verify logs are being synced via `syncLogs()`
2. Check log lines aren't empty strings
3. Confirm selected farm has log data

### Crashes on Widget Load
1. Check for force unwraps in widget code
2. Verify all optionals handled with safe defaults
3. Test data corruption recovery path

---

## Version History

- **1.0.0** - Initial WidgetKit implementation
  - Overview, Farm Monitor, Harvest Terminal, Lock Screen widgets
  - AppIntents configuration
  - Deep link navigation
  - App Group data sharing
