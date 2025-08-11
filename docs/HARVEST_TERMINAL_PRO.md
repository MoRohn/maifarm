# Harvest Terminal Pro - User Guide

## Overview

Harvest Terminal Pro is a next-generation terminal interface for MaiFarm's multi-agent orchestration system. It provides a professional-grade terminal experience with advanced features including:

- **Professional Terminal Emulation** - Powered by XTerm.js
- **7+ Beautiful Themes** - Matrix, Cyberpunk, Dracula, and more
- **Mobile Monitoring** - Access terminals remotely via Cloudflare tunnel
- **Real-time Visualizations** - Live performance metrics and agent status
- **Session Recording** - Record and replay terminal sessions
- **Advanced Command Palette** - Quick access to all features

## Quick Start

### Enabling Harvest Terminal Pro

1. **Via Settings:**
   ```javascript
   // In Settings page
   Enable "Harvest Terminal Pro" toggle
   ```

2. **Via Code:**
   ```tsx
   <HarvestTerminal farmId={farmId} forceProMode={true} />
   ```

3. **Via Feature Flag:**
   ```javascript
   // In your settings store
   settings.setSetting('harvestTerminalPro', true);
   ```

### Basic Usage

1. **Launch a Farm or Quick Task**
   - Start any multi-agent operation
   - Terminal sessions will auto-detect

2. **Choose Your Theme**
   - Press `Cmd/Ctrl + T` to cycle themes
   - Or click the theme button in the toolbar

3. **Select View Mode**
   - **Grid View** - See all agents simultaneously
   - **Stacked View** - Expandable agent bars
   - **Single View** - Focus on one agent

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + K` | Open command palette |
| `Cmd/Ctrl + T` | Cycle through themes |
| `Cmd/Ctrl + 1-9` | Switch to agent 1-9 |
| `Cmd/Ctrl + F` | Search in terminal |
| `Cmd/Ctrl + Shift + C` | Copy terminal output |
| `Cmd/Ctrl + Shift + V` | Paste to terminal |
| `Esc` | Exit fullscreen mode |

## Themes

### Available Themes

1. **Matrix** - Classic green-on-black hacker aesthetic
2. **Cyberpunk** - Neon pink and cyan on dark background
3. **Dracula** - Popular dark theme with purple accents
4. **Solarized Dark** - Easy on the eyes with warm colors
5. **Monokai** - Sublime Text inspired theme
6. **Retro Amber** - Classic CRT monitor look
7. **Nord** - Cool, muted Arctic color palette

### Customizing Themes

```typescript
// Add custom theme in HarvestTerminalPro.tsx
const TERMINAL_THEMES = {
  myTheme: {
    name: 'My Custom Theme',
    background: '#1a1a1a',
    foreground: '#e0e0e0',
    cursor: '#00ff00',
    // ... more colors
  }
};
```

## Mobile Access

### Setting Up Cloudflare Tunnel

1. **Enable Cloudflare Integration:**
   ```tsx
   <HarvestTerminal 
     farmId={farmId} 
     enableCloudflare={true} 
   />
   ```

2. **Connect to Tunnel:**
   - Click the cloud icon in the toolbar
   - Wait for connection (turns green when ready)
   - Scan QR code with mobile device

3. **Mobile Features:**
   - Touch-optimized interface
   - Gesture controls for navigation
   - Virtual keyboard support
   - Responsive layout

### Security Considerations

- Tunnels are temporary and expire after session
- All traffic is encrypted end-to-end
- Authentication required for access
- IP whitelisting available

## Advanced Features

### Session Recording

Record terminal sessions for playback and analysis:

1. **Start Recording:**
   - Press `Cmd/Ctrl + K` → Select "Start Recording"
   - Or click the record button in toolbar

2. **During Recording:**
   - All commands and outputs are captured
   - Recording indicator shows in status bar
   - Command count displayed

3. **Stop and Export:**
   - Stop recording via command palette
   - Export as JSON or text file
   - Replay in terminal or share with team

### Performance Monitoring

Real-time metrics displayed in the header:

- **FPS** - Terminal rendering performance
- **Latency** - WebSocket connection latency
- **Memory** - JavaScript heap usage
- **Throughput** - Data transfer rate

### Command Palette

Access all features quickly:

1. Open with `Cmd/Ctrl + K`
2. Type to search commands
3. Use arrow keys to navigate
4. Press Enter to execute

Available commands:
- Theme switching
- View mode changes
- Recording controls
- Mobile view toggle
- Cloudflare connection
- Export options
- Settings access

## API Reference

### Component Props

```typescript
interface HarvestTerminalProProps {
  farmId?: string;           // Farm ID to monitor
  className?: string;        // Additional CSS classes
  legacyMode?: boolean;      // Force legacy terminal
  forceProMode?: boolean;    // Force Pro terminal
  onThemeChange?: (theme: string) => void;  // Theme change callback
  enableMobileView?: boolean;  // Enable mobile support
  enableCloudflare?: boolean;  // Enable tunnel support
}
```

### WebSocket Events

```typescript
// Listening to terminal events
socket.on('terminal:output', (data) => {
  // data.sessionId - Session identifier
  // data.agentId - Agent number
  // data.output - Terminal output text
});

// Sending input to terminal
socket.emit('terminal:input', {
  sessionId: 'session-id',
  agentId: 0,
  data: 'command to execute'
});
```

### Theme API

```typescript
// Get current theme
const currentTheme = settings.getSetting('terminalTheme', 'matrix');

// Set theme programmatically
updateTerminalTheme('cyberpunk');

// Add custom theme
TERMINAL_THEMES['custom'] = {
  name: 'Custom Theme',
  background: '#000000',
  foreground: '#ffffff',
  // ... colors
};
```

## Troubleshooting

### Common Issues

1. **Terminal not rendering:**
   - Check XTerm dependencies are installed
   - Run `npm install` to update packages
   - Clear browser cache

2. **WebSocket disconnections:**
   - Check network connectivity
   - Verify firewall settings
   - Try manual reconnect button

3. **Theme not applying:**
   - Refresh the page
   - Check browser console for errors
   - Verify theme name is correct

4. **Mobile connection fails:**
   - Ensure Cloudflare is enabled
   - Check tunnel status (should be green)
   - Verify mobile device is online

### Debug Mode

Enable debug logging:

```javascript
// In browser console
localStorage.setItem('harvestTerminalDebug', 'true');
```

View terminal internals:
```javascript
// Access terminal instances
window.__HARVEST_TERMINALS__ // Map of all terminals
```

## Performance Optimization

### Best Practices

1. **Limit concurrent agents:**
   - Grid view: Max 8 agents
   - Stacked view: Unlimited
   - Single view: Best for focus

2. **Optimize rendering:**
   - Disable animations in settings
   - Use canvas renderer (default)
   - Reduce scrollback buffer if needed

3. **Network optimization:**
   - Enable compression
   - Use batch updates
   - Implement throttling

### Configuration

```javascript
// Optimize for performance
const terminalOptions = {
  rendererType: 'canvas',  // or 'dom' for compatibility
  scrollback: 5000,        // Reduce for better performance
  fontSize: 14,            // Adjust for readability
  fontFamily: 'JetBrains Mono',  // Monospace font
  cursorBlink: false,      // Disable for less CPU usage
};
```

## Examples

### Basic Integration

```tsx
import { HarvestTerminal } from './components/Harvest/HarvestTerminal';

function MyDashboard() {
  return (
    <HarvestTerminal 
      farmId="farm-123"
      className="h-screen"
    />
  );
}
```

### Advanced Configuration

```tsx
function AdvancedTerminal() {
  const [theme, setTheme] = useState('matrix');
  
  return (
    <HarvestTerminal
      farmId="farm-456"
      forceProMode={true}
      enableMobileView={true}
      enableCloudflare={true}
      onThemeChange={setTheme}
      className="custom-terminal"
    />
  );
}
```

### Custom Theme

```tsx
// Add before component
const customTheme = {
  name: 'Ocean',
  background: '#001f3f',
  foreground: '#7fdbff',
  cursor: '#39cccc',
  // ... more colors
};

TERMINAL_THEMES.ocean = customTheme;
```

## Migration Guide

### From Legacy Terminal

1. **Enable Pro Mode:**
   ```javascript
   settings.setSetting('harvestTerminalPro', true);
   ```

2. **Update imports (if customized):**
   ```tsx
   // Old
   import HarvestTerminal from './HarvestTerminal';
   
   // New - automatic with feature flag
   import { HarvestTerminal } from './HarvestTerminal';
   ```

3. **Test thoroughly:**
   - Verify all agents connect
   - Check custom commands work
   - Ensure themes apply correctly

### Rollback if Needed

```tsx
// Force legacy mode
<HarvestTerminal legacyMode={true} />

// Or via settings
settings.setSetting('harvestTerminalPro', false);
```

## Support

For issues or questions:
- Check the [GitHub Issues](https://github.com/maifarm/issues)
- Join our Discord community
- Email support@maifarm.ai

## License

MIT License - See LICENSE file for details