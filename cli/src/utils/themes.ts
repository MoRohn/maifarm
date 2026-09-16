/**
 * CLI Themes - Terminal color schemes with ANSI support
 *
 * Replicates UI themes in a CLI-friendly way using chalk and ANSI colors
 * Includes agent messaging themes matching the UI version
 */

import chalk from 'chalk';

// Use ReturnType to extract the chalk instance type
type ChalkInstance = ReturnType<typeof chalk.hex>;

export interface CLITheme {
  name: string;
  description: string;
  emoji: string;
  colors: {
    primary: ChalkInstance;
    secondary: ChalkInstance;
    accent: ChalkInstance;
    success: ChalkInstance;
    warning: ChalkInstance;
    error: ChalkInstance;
    info: ChalkInstance;
    muted: ChalkInstance;
    text: ChalkInstance;
    background: ChalkInstance;
  };
  effects: {
    bold: boolean;
    dim: boolean;
    underline: boolean;
    inverse: boolean;
  };
  agentColors: {
    agent1: ChalkInstance;
    agent2: ChalkInstance;
    agent3: ChalkInstance;
    agent4: ChalkInstance;
    agent5: ChalkInstance;
    agent6: ChalkInstance;
    agent7: ChalkInstance;
    agent8: ChalkInstance;
  };
}

// Theme definitions matching UI version
export const themes: Record<string, CLITheme> = {
  'matrix': {
    name: 'Matrix',
    description: 'Enter the digital rain of the Matrix',
    emoji: '🟩',
    colors: {
      primary: chalk.hex('#00ff00'),
      secondary: chalk.hex('#00cc00'),
      accent: chalk.hex('#55ff55'),
      success: chalk.hex('#00ff00'),
      warning: chalk.hex('#ffff00'),
      error: chalk.hex('#ff0000'),
      info: chalk.hex('#00ffff'),
      muted: chalk.hex('#008800'),
      text: chalk.hex('#00ff00'),
      background: chalk.bgHex('#0c0c0c'),
    },
    effects: {
      bold: true,
      dim: false,
      underline: false,
      inverse: false,
    },
    agentColors: {
      agent1: chalk.hex('#00ff00'),
      agent2: chalk.hex('#00dd00'),
      agent3: chalk.hex('#00bb00'),
      agent4: chalk.hex('#009900'),
      agent5: chalk.hex('#007700'),
      agent6: chalk.hex('#00ff44'),
      agent7: chalk.hex('#00ff88'),
      agent8: chalk.hex('#00ffcc'),
    },
  },

  'cyberpunk': {
    name: 'Cyberpunk 2077',
    description: 'Neon-soaked streets of Night City',
    emoji: '🌆',
    colors: {
      primary: chalk.hex('#00d9ff'),
      secondary: chalk.hex('#ff0080'),
      accent: chalk.hex('#ff00ff'),
      success: chalk.hex('#00ff88'),
      warning: chalk.hex('#ffdd00'),
      error: chalk.hex('#ff0055'),
      info: chalk.hex('#0099ff'),
      muted: chalk.hex('#666699'),
      text: chalk.hex('#00d9ff'),
      background: chalk.bgHex('#0a0e1a'),
    },
    effects: {
      bold: true,
      dim: false,
      underline: false,
      inverse: false,
    },
    agentColors: {
      agent1: chalk.hex('#ff0080'),
      agent2: chalk.hex('#00d9ff'),
      agent3: chalk.hex('#ff00ff'),
      agent4: chalk.hex('#00ff88'),
      agent5: chalk.hex('#ffdd00'),
      agent6: chalk.hex('#ff3366'),
      agent7: chalk.hex('#33aaff'),
      agent8: chalk.hex('#ff33ff'),
    },
  },

  'synthwave': {
    name: 'Synthwave',
    description: 'Retro 80s aesthetic with modern flair',
    emoji: '🌅',
    colors: {
      primary: chalk.hex('#ff6ac1'),
      secondary: chalk.hex('#57c7ff'),
      accent: chalk.hex('#ff0080'),
      success: chalk.hex('#00ff41'),
      warning: chalk.hex('#ffe700'),
      error: chalk.hex('#ff3270'),
      info: chalk.hex('#0080ff'),
      muted: chalk.hex('#6666aa'),
      text: chalk.hex('#ff6ac1'),
      background: chalk.bgHex('#1a0033'),
    },
    effects: {
      bold: true,
      dim: false,
      underline: false,
      inverse: false,
    },
    agentColors: {
      agent1: chalk.hex('#ff006e'),
      agent2: chalk.hex('#8338ec'),
      agent3: chalk.hex('#3a86ff'),
      agent4: chalk.hex('#ff6ac1'),
      agent5: chalk.hex('#57c7ff'),
      agent6: chalk.hex('#ff79c6'),
      agent7: chalk.hex('#8be9fd'),
      agent8: chalk.hex('#50fa7b'),
    },
  },

  'quantum': {
    name: 'Quantum',
    description: 'Quantum computing aesthetic with particle effects',
    emoji: '⚛️',
    colors: {
      primary: chalk.hex('#00ffff'),
      secondary: chalk.hex('#0077ff'),
      accent: chalk.hex('#c77dff'),
      success: chalk.hex('#00ff88'),
      warning: chalk.hex('#ffbe0b'),
      error: chalk.hex('#ff006e'),
      info: chalk.hex('#00ffff'),
      muted: chalk.hex('#4466aa'),
      text: chalk.hex('#00ffff'),
      background: chalk.bgHex('#000814'),
    },
    effects: {
      bold: true,
      dim: false,
      underline: false,
      inverse: false,
    },
    agentColors: {
      agent1: chalk.hex('#00ffff'),
      agent2: chalk.hex('#0077ff'),
      agent3: chalk.hex('#c77dff'),
      agent4: chalk.hex('#00ff88'),
      agent5: chalk.hex('#ffbe0b'),
      agent6: chalk.hex('#44ffff'),
      agent7: chalk.hex('#4499ff'),
      agent8: chalk.hex('#dd99ff'),
    },
  },

  'dracula': {
    name: 'Dracula',
    description: 'Dark theme with vibrant colors',
    emoji: '🧛',
    colors: {
      primary: chalk.hex('#bd93f9'),
      secondary: chalk.hex('#ff79c6'),
      accent: chalk.hex('#8be9fd'),
      success: chalk.hex('#50fa7b'),
      warning: chalk.hex('#f1fa8c'),
      error: chalk.hex('#ff5555'),
      info: chalk.hex('#8be9fd'),
      muted: chalk.hex('#6272a4'),
      text: chalk.hex('#f8f8f2'),
      background: chalk.bgHex('#282a36'),
    },
    effects: {
      bold: false,
      dim: false,
      underline: false,
      inverse: false,
    },
    agentColors: {
      agent1: chalk.hex('#bd93f9'),
      agent2: chalk.hex('#ff79c6'),
      agent3: chalk.hex('#8be9fd'),
      agent4: chalk.hex('#50fa7b'),
      agent5: chalk.hex('#f1fa8c'),
      agent6: chalk.hex('#ff6e6e'),
      agent7: chalk.hex('#69ff94'),
      agent8: chalk.hex('#a4ffff'),
    },
  },

  'hacker': {
    name: 'Hacker Elite',
    description: 'Classic hacker aesthetic with green phosphor glow',
    emoji: '💻',
    colors: {
      primary: chalk.hex('#33ff00'),
      secondary: chalk.hex('#00ff00'),
      accent: chalk.hex('#66ff33'),
      success: chalk.hex('#33ff00'),
      warning: chalk.hex('#ffff33'),
      error: chalk.hex('#ff3333'),
      info: chalk.hex('#00ffff'),
      muted: chalk.hex('#336600'),
      text: chalk.hex('#33ff00'),
      background: chalk.bgHex('#000000'),
    },
    effects: {
      bold: true,
      dim: true,
      underline: false,
      inverse: false,
    },
    agentColors: {
      agent1: chalk.hex('#33ff00'),
      agent2: chalk.hex('#00ff00'),
      agent3: chalk.hex('#66ff33'),
      agent4: chalk.hex('#99ff66'),
      agent5: chalk.hex('#ccff99'),
      agent6: chalk.hex('#00ff44'),
      agent7: chalk.hex('#00ff88'),
      agent8: chalk.hex('#00ffcc'),
    },
  },

  'tokyo': {
    name: 'Tokyo Night',
    description: 'Inspired by Tokyo city lights at night',
    emoji: '🗼',
    colors: {
      primary: chalk.hex('#7aa2f7'),
      secondary: chalk.hex('#bb9af7'),
      accent: chalk.hex('#7dcfff'),
      success: chalk.hex('#9ece6a'),
      warning: chalk.hex('#e0af68'),
      error: chalk.hex('#f7768e'),
      info: chalk.hex('#7dcfff'),
      muted: chalk.hex('#414868'),
      text: chalk.hex('#a9b1d6'),
      background: chalk.bgHex('#1a1b26'),
    },
    effects: {
      bold: false,
      dim: false,
      underline: false,
      inverse: false,
    },
    agentColors: {
      agent1: chalk.hex('#7aa2f7'),
      agent2: chalk.hex('#bb9af7'),
      agent3: chalk.hex('#7dcfff'),
      agent4: chalk.hex('#9ece6a'),
      agent5: chalk.hex('#e0af68'),
      agent6: chalk.hex('#f7768e'),
      agent7: chalk.hex('#ff9e64'),
      agent8: chalk.hex('#b9f27c'),
    },
  },

  'aurora': {
    name: 'Aurora Borealis',
    description: 'Northern lights dancing across the terminal',
    emoji: '🌌',
    colors: {
      primary: chalk.hex('#36a3d9'),
      secondary: chalk.hex('#95e6cb'),
      accent: chalk.hex('#f29718'),
      success: chalk.hex('#b8cc52'),
      warning: chalk.hex('#e7c547'),
      error: chalk.hex('#ff3333'),
      info: chalk.hex('#36a3d9'),
      muted: chalk.hex('#323232'),
      text: chalk.hex('#e6e1cf'),
      background: chalk.bgHex('#0f1419'),
    },
    effects: {
      bold: false,
      dim: false,
      underline: false,
      inverse: false,
    },
    agentColors: {
      agent1: chalk.hex('#667eea'),
      agent2: chalk.hex('#764ba2'),
      agent3: chalk.hex('#f093fb'),
      agent4: chalk.hex('#f5576c'),
      agent5: chalk.hex('#36a3d9'),
      agent6: chalk.hex('#95e6cb'),
      agent7: chalk.hex('#68d5ff'),
      agent8: chalk.hex('#c7fffd'),
    },
  },

  // Default theme (Forest Walk - matching UI)
  'forest-walk': {
    name: 'Forest Walk',
    description: 'Fresh green fields and growing harvests',
    emoji: '🌿',
    colors: {
      primary: chalk.hex('#10B981'),
      secondary: chalk.hex('#84CC16'),
      accent: chalk.hex('#22C55E'),
      success: chalk.hex('#10B981'),
      warning: chalk.hex('#F59E0B'),
      error: chalk.hex('#EF4444'),
      info: chalk.hex('#3B82F6'),
      muted: chalk.hex('#6B7280'),
      text: chalk.hex('#F3F4F6'),
      background: chalk.bgHex('#111827'),
    },
    effects: {
      bold: false,
      dim: false,
      underline: false,
      inverse: false,
    },
    agentColors: {
      agent1: chalk.hex('#10B981'),
      agent2: chalk.hex('#84CC16'),
      agent3: chalk.hex('#22C55E'),
      agent4: chalk.hex('#34D399'),
      agent5: chalk.hex('#4ADE80'),
      agent6: chalk.hex('#6EE7B7'),
      agent7: chalk.hex('#86EFAC'),
      agent8: chalk.hex('#A7F3D0'),
    },
  },
};

// Default theme
export const DEFAULT_THEME = 'forest-walk';

// Get theme by name or default
export function getTheme(name?: string): CLITheme {
  return themes[name || DEFAULT_THEME] || themes[DEFAULT_THEME];
}

// Get all theme names
export function getThemeNames(): string[] {
  return Object.keys(themes);
}

// Apply text effects based on theme
export function applyEffects(text: string, theme: CLITheme): string {
  let result = text;
  if (theme.effects.bold) result = chalk.bold(result);
  if (theme.effects.dim) result = chalk.dim(result);
  if (theme.effects.underline) result = chalk.underline(result);
  if (theme.effects.inverse) result = chalk.inverse(result);
  return result;
}

// Format agent message with theme colors
export function formatAgentMessage(
  agentIndex: number,
  agentName: string,
  message: string,
  themeName?: string
): string {
  const theme = getTheme(themeName);
  const agentKey = `agent${(agentIndex % 8) + 1}` as keyof typeof theme.agentColors;
  const agentColor = theme.agentColors[agentKey];

  const timestamp = new Date().toLocaleTimeString();
  const timeStr = theme.colors.muted(`[${timestamp}]`);
  const nameStr = agentColor.bold(`${agentName}`);
  const messageStr = theme.colors.text(message);

  return `${timeStr} ${nameStr}: ${messageStr}`;
}

// Create themed box with borders
export function createThemedBox(
  title: string,
  content: string,
  themeName?: string
): string {
  const theme = getTheme(themeName);
  const lines = content.split('\n');
  const maxLength = Math.max(...lines.map(l => l.length), title.length);
  const width = maxLength + 4;

  const topBorder = theme.colors.primary('┌' + '─'.repeat(width - 2) + '┐');
  const titleLine = theme.colors.primary('│ ') + theme.colors.accent.bold(title.padEnd(width - 4)) + theme.colors.primary(' │');
  const divider = theme.colors.primary('├' + '─'.repeat(width - 2) + '┤');
  const contentLines = lines.map(line =>
    theme.colors.primary('│ ') + theme.colors.text(line.padEnd(width - 4)) + theme.colors.primary(' │')
  );
  const bottomBorder = theme.colors.primary('└' + '─'.repeat(width - 2) + '┘');

  return [topBorder, titleLine, divider, ...contentLines, bottomBorder].join('\n');
}

// Create themed progress bar
export function createProgressBar(
  progress: number,
  total: number,
  label: string,
  themeName?: string
): string {
  const theme = getTheme(themeName);
  const percentage = Math.round((progress / total) * 100);
  const barLength = 30;
  const filledLength = Math.round((percentage / 100) * barLength);
  const emptyLength = barLength - filledLength;

  const filled = theme.colors.success('█'.repeat(filledLength));
  const empty = theme.colors.muted('░'.repeat(emptyLength));
  const percentText = theme.colors.accent(`${percentage}%`);
  const labelText = theme.colors.text(label);

  return `${labelText} [${filled}${empty}] ${percentText}`;
}

// Create themed spinner frames
export function getSpinnerFrames(themeName?: string): string[] {
  const theme = getTheme(themeName);
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  return frames.map(f => theme.colors.accent(f));
}

// Create themed status badge
export function createStatusBadge(
  status: 'success' | 'warning' | 'error' | 'info',
  text: string,
  themeName?: string
): string {
  const theme = getTheme(themeName);
  const colorMap = {
    success: theme.colors.success,
    warning: theme.colors.warning,
    error: theme.colors.error,
    info: theme.colors.info,
  };

  const color = colorMap[status];
  return color.bold(`[${text}]`);
}

// Export theme names for CLI commands
export { themes as allThemes };
