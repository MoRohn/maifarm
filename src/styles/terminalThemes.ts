export interface TerminalTheme {
  name: string;
  background: string;
  foreground: string;
  cursor: string;
  selection: string;
  scrollbar: string;
  header: string;
  border: string;
  commandLine: string;
  statusColors: {
    info: string;
    success: string;
    warning: string;
    error: string;
    debug: string;
  };
  ansiColors: {
    black: string;
    red: string;
    green: string;
    yellow: string;
    blue: string;
    magenta: string;
    cyan: string;
    white: string;
    brightBlack: string;
    brightRed: string;
    brightGreen: string;
    brightYellow: string;
    brightBlue: string;
    brightMagenta: string;
    brightCyan: string;
    brightWhite: string;
  };
}

export const terminalThemes: Record<string, TerminalTheme> = {
  dark: {
    name: 'Dark',
    background: '#1a1b26',
    foreground: '#c0caf5',
    cursor: '#c0caf5',
    selection: '#33467C',
    scrollbar: '#2a2b3d',
    header: '#16161e',
    border: '#292a3e',
    commandLine: '#1e1e2e',
    statusColors: {
      info: '#0db9d7',
      success: '#9ece6a',
      warning: '#e0af68',
      error: '#f7768e',
      debug: '#7dcfff'
    },
    ansiColors: {
      black: '#15161E',
      red: '#f7768e',
      green: '#9ece6a',
      yellow: '#e0af68',
      blue: '#7aa2f7',
      magenta: '#bb9af7',
      cyan: '#7dcfff',
      white: '#a9b1d6',
      brightBlack: '#414868',
      brightRed: '#f7768e',
      brightGreen: '#9ece6a',
      brightYellow: '#e0af68',
      brightBlue: '#7aa2f7',
      brightMagenta: '#bb9af7',
      brightCyan: '#7dcfff',
      brightWhite: '#c0caf5'
    }
  },
  light: {
    name: 'Light',
    background: '#ffffff',
    foreground: '#4a5568',
    cursor: '#4a5568',
    selection: '#bee3f8',
    scrollbar: '#e2e8f0',
    header: '#f7fafc',
    border: '#e2e8f0',
    commandLine: '#f7fafc',
    statusColors: {
      info: '#3182ce',
      success: '#48bb78',
      warning: '#ed8936',
      error: '#f56565',
      debug: '#4299e1'
    },
    ansiColors: {
      black: '#1a202c',
      red: '#f56565',
      green: '#48bb78',
      yellow: '#ed8936',
      blue: '#4299e1',
      magenta: '#9f7aea',
      cyan: '#38b2ac',
      white: '#e2e8f0',
      brightBlack: '#718096',
      brightRed: '#fc8181',
      brightGreen: '#68d391',
      brightYellow: '#f6ad55',
      brightBlue: '#63b3ed',
      brightMagenta: '#b794f4',
      brightCyan: '#4fd1c5',
      brightWhite: '#f7fafc'
    }
  },
  matrix: {
    name: 'Matrix',
    background: '#0a0a0a',
    foreground: '#00ff41',
    cursor: '#00ff41',
    selection: '#003d0f',
    scrollbar: '#003d0f',
    header: '#000000',
    border: '#00ff41',
    commandLine: '#0d0d0d',
    statusColors: {
      info: '#00ff41',
      success: '#00ff41',
      warning: '#ffff00',
      error: '#ff0000',
      debug: '#00ffff'
    },
    ansiColors: {
      black: '#000000',
      red: '#ff0000',
      green: '#00ff41',
      yellow: '#ffff00',
      blue: '#0080ff',
      magenta: '#ff00ff',
      cyan: '#00ffff',
      white: '#c0c0c0',
      brightBlack: '#808080',
      brightRed: '#ff6060',
      brightGreen: '#60ff60',
      brightYellow: '#ffff60',
      brightBlue: '#60a0ff',
      brightMagenta: '#ff60ff',
      brightCyan: '#60ffff',
      brightWhite: '#ffffff'
    }
  },
  ocean: {
    name: 'Ocean',
    background: '#0c1e2c',
    foreground: '#b4d4e1',
    cursor: '#b4d4e1',
    selection: '#1e3a4c',
    scrollbar: '#1e3a4c',
    header: '#071118',
    border: '#2a4d63',
    commandLine: '#0f2433',
    statusColors: {
      info: '#5dade2',
      success: '#52c786',
      warning: '#f4d03f',
      error: '#ec7063',
      debug: '#85c1e2'
    },
    ansiColors: {
      black: '#071118',
      red: '#ec7063',
      green: '#52c786',
      yellow: '#f4d03f',
      blue: '#5dade2',
      magenta: '#af7ac5',
      cyan: '#76d7c4',
      white: '#d5dbdb',
      brightBlack: '#34495e',
      brightRed: '#e74c3c',
      brightGreen: '#27ae60',
      brightYellow: '#f1c40f',
      brightBlue: '#3498db',
      brightMagenta: '#9b59b6',
      brightCyan: '#1abc9c',
      brightWhite: '#ecf0f1'
    }
  },
  dracula: {
    name: 'Dracula',
    background: '#282a36',
    foreground: '#f8f8f2',
    cursor: '#f8f8f2',
    selection: '#44475a',
    scrollbar: '#44475a',
    header: '#21222c',
    border: '#44475a',
    commandLine: '#21222c',
    statusColors: {
      info: '#8be9fd',
      success: '#50fa7b',
      warning: '#f1fa8c',
      error: '#ff5555',
      debug: '#bd93f9'
    },
    ansiColors: {
      black: '#21222c',
      red: '#ff5555',
      green: '#50fa7b',
      yellow: '#f1fa8c',
      blue: '#bd93f9',
      magenta: '#ff79c6',
      cyan: '#8be9fd',
      white: '#f8f8f2',
      brightBlack: '#6272a4',
      brightRed: '#ff6e6e',
      brightGreen: '#69ff94',
      brightYellow: '#ffffa5',
      brightBlue: '#d6acff',
      brightMagenta: '#ff92df',
      brightCyan: '#a4ffff',
      brightWhite: '#ffffff'
    }
  }
};

// CSS class generator for themes
export function getTerminalThemeClasses(themeName: string): string {
  const theme = terminalThemes[themeName] || terminalThemes.dark;

  return `
    terminal-theme-${themeName}
    bg-[${theme.background}]
    text-[${theme.foreground}]
    selection:bg-[${theme.selection}]
    scrollbar-thin
    scrollbar-thumb-[${theme.scrollbar}]
    scrollbar-track-transparent
  `.trim().replace(/\s+/g, ' ');
}

// Generate CSS variables for a theme
export function generateThemeCSSVariables(themeName: string): Record<string, string> {
  const theme = terminalThemes[themeName] || terminalThemes.dark;

  return {
    '--terminal-bg': theme.background,
    '--terminal-fg': theme.foreground,
    '--terminal-cursor': theme.cursor,
    '--terminal-selection': theme.selection,
    '--terminal-scrollbar': theme.scrollbar,
    '--terminal-header': theme.header,
    '--terminal-border': theme.border,
    '--terminal-command': theme.commandLine,
    // ANSI colors
    '--ansi-black': theme.ansiColors.black,
    '--ansi-red': theme.ansiColors.red,
    '--ansi-green': theme.ansiColors.green,
    '--ansi-yellow': theme.ansiColors.yellow,
    '--ansi-blue': theme.ansiColors.blue,
    '--ansi-magenta': theme.ansiColors.magenta,
    '--ansi-cyan': theme.ansiColors.cyan,
    '--ansi-white': theme.ansiColors.white,
    '--ansi-bright-black': theme.ansiColors.brightBlack,
    '--ansi-bright-red': theme.ansiColors.brightRed,
    '--ansi-bright-green': theme.ansiColors.brightGreen,
    '--ansi-bright-yellow': theme.ansiColors.brightYellow,
    '--ansi-bright-blue': theme.ansiColors.brightBlue,
    '--ansi-bright-magenta': theme.ansiColors.brightMagenta,
    '--ansi-bright-cyan': theme.ansiColors.brightCyan,
    '--ansi-bright-white': theme.ansiColors.brightWhite,
  };
}

// Export theme names for selection
export const availableThemes = Object.keys(terminalThemes);
export const defaultTheme = 'dark';