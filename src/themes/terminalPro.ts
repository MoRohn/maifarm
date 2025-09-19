/**
 * Terminal Pro Theme System
 * Professional terminal themes for Harvest Terminal Pro
 */

import type { TerminalProTheme } from '@/types/harvestTerminalPro';

// ============================================================================
// Cyberpunk Orange Theme (Default)
// ============================================================================
export const cyberpunkOrange: TerminalProTheme = {
  id: 'cyberpunk-orange',
  name: 'Cyberpunk Orange',
  type: 'dark',
  category: 'cyberpunk',
  
  terminal: {
    background: '#0d1117',
    foreground: '#ffffff',
    cursor: '#ff6b35',
    cursorAccent: '#ff8659',
    selectionBackground: 'rgba(255, 107, 53, 0.3)',
    selectionForeground: '#ffffff',
    
    // ANSI Colors
    black: '#1b1f23',
    red: '#da3633',
    green: '#3fb950',
    yellow: '#d29922',
    blue: '#58a6ff',
    magenta: '#bc8cff',
    cyan: '#39c5cf',
    white: '#b1bac4',
    
    // Bright ANSI Colors
    brightBlack: '#484f58',
    brightRed: '#ff7b72',
    brightGreen: '#56d364',
    brightYellow: '#e3b341',
    brightBlue: '#79c0ff',
    brightMagenta: '#d2a8ff',
    brightCyan: '#56d4dd',
    brightWhite: '#ffffff',
  },
  
  ui: {
    primaryBackground: '#0d1117',
    secondaryBackground: '#161b22',
    tertiaryBackground: '#21262d',
    surfaceBackground: '#30363d',
    overlayBackground: 'rgba(13, 17, 23, 0.95)',
    
    primaryText: '#ffffff',
    secondaryText: '#8b949e',
    tertiaryText: '#6e7681',
    mutedText: '#484f58',
    
    accentColor: '#ff6b35',
    accentHover: '#ff8659',
    accentActive: '#ff9a7d',
    
    successColor: '#3fb950',
    warningColor: '#d29922',
    errorColor: '#da3633',
    infoColor: '#58a6ff',
    
    borderColor: '#30363d',
    borderHover: '#484f58',
    shadowColor: 'rgba(0, 0, 0, 0.5)',
    shadowElevation: [
      '0 1px 3px rgba(0, 0, 0, 0.12)',
      '0 4px 6px rgba(0, 0, 0, 0.16)',
      '0 10px 20px rgba(0, 0, 0, 0.19)',
      '0 15px 30px rgba(0, 0, 0, 0.23)',
    ],
  },
  
  effects: {
    glowEffect: true,
    scanlines: false,
    noise: false,
    chromatic: false,
    bloom: true,
    animations: {
      cursorPulse: true,
      textGlow: true,
      matrixRain: false,
      retroCRT: false,
      typewriter: false,
    },
  },
};

// ============================================================================
// Matrix Green Theme
// ============================================================================
export const matrixGreen: TerminalProTheme = {
  id: 'matrix-green',
  name: 'Matrix Green',
  type: 'dark',
  category: 'cyberpunk',
  
  terminal: {
    background: '#0a0e0a',
    foreground: '#00ff41',
    cursor: '#00ff41',
    cursorAccent: '#33ff66',
    selectionBackground: 'rgba(0, 255, 65, 0.2)',
    selectionForeground: '#00ff41',
    
    black: '#0a0e0a',
    red: '#ff0040',
    green: '#00ff41',
    yellow: '#ffdd00',
    blue: '#0080ff',
    magenta: '#ff00ff',
    cyan: '#00ffff',
    white: '#c7c7c7',
    
    brightBlack: '#686868',
    brightRed: '#ff6680',
    brightGreen: '#66ff88',
    brightYellow: '#ffff66',
    brightBlue: '#66b3ff',
    brightMagenta: '#ff66ff',
    brightCyan: '#66ffff',
    brightWhite: '#ffffff',
  },
  
  ui: {
    primaryBackground: '#0a0e0a',
    secondaryBackground: '#0d1a0d',
    tertiaryBackground: '#112211',
    surfaceBackground: '#1a2e1a',
    overlayBackground: 'rgba(10, 14, 10, 0.95)',
    
    primaryText: '#00ff41',
    secondaryText: '#00cc33',
    tertiaryText: '#009926',
    mutedText: '#006619',
    
    accentColor: '#00ff41',
    accentHover: '#33ff66',
    accentActive: '#66ff88',
    
    successColor: '#00ff41',
    warningColor: '#ffdd00',
    errorColor: '#ff0040',
    infoColor: '#0080ff',
    
    borderColor: '#003311',
    borderHover: '#00551a',
    shadowColor: 'rgba(0, 255, 65, 0.3)',
    shadowElevation: [
      '0 1px 3px rgba(0, 255, 65, 0.12)',
      '0 4px 6px rgba(0, 255, 65, 0.16)',
      '0 10px 20px rgba(0, 255, 65, 0.19)',
      '0 15px 30px rgba(0, 255, 65, 0.23)',
    ],
  },
  
  effects: {
    glowEffect: true,
    scanlines: true,
    noise: true,
    chromatic: true,
    bloom: true,
    animations: {
      cursorPulse: true,
      textGlow: true,
      matrixRain: true,
      retroCRT: true,
      typewriter: false,
    },
  },
};

// ============================================================================
// Synthwave Purple Theme
// ============================================================================
export const synthwavePurple: TerminalProTheme = {
  id: 'synthwave-purple',
  name: 'Synthwave Purple',
  type: 'dark',
  category: 'retro',
  
  terminal: {
    background: '#241b2f',
    foreground: '#f92aad',
    cursor: '#72f1b8',
    cursorAccent: '#8ff7d2',
    selectionBackground: 'rgba(249, 42, 173, 0.3)',
    selectionForeground: '#ffffff',
    
    black: '#241b2f',
    red: '#ff2079',
    green: '#72f1b8',
    yellow: '#feff80',
    blue: '#36f9f6',
    magenta: '#f92aad',
    cyan: '#72f1b8',
    white: '#f7f7f7',
    
    brightBlack: '#495495',
    brightRed: '#ff6ac1',
    brightGreen: '#8fffd2',
    brightYellow: '#ffff9f',
    brightBlue: '#5afffd',
    brightMagenta: '#ff6ac1',
    brightCyan: '#8fffd2',
    brightWhite: '#ffffff',
  },
  
  ui: {
    primaryBackground: '#241b2f',
    secondaryBackground: '#2e2141',
    tertiaryBackground: '#3a2854',
    surfaceBackground: '#463465',
    overlayBackground: 'rgba(36, 27, 47, 0.95)',
    
    primaryText: '#f92aad',
    secondaryText: '#e894d5',
    tertiaryText: '#b676d0',
    mutedText: '#8458b3',
    
    accentColor: '#72f1b8',
    accentHover: '#8ff7d2',
    accentActive: '#a9ffdd',
    
    successColor: '#72f1b8',
    warningColor: '#feff80',
    errorColor: '#ff2079',
    infoColor: '#36f9f6',
    
    borderColor: '#463465',
    borderHover: '#5d4876',
    shadowColor: 'rgba(249, 42, 173, 0.4)',
    shadowElevation: [
      '0 1px 3px rgba(249, 42, 173, 0.12)',
      '0 4px 6px rgba(249, 42, 173, 0.16)',
      '0 10px 20px rgba(249, 42, 173, 0.19)',
      '0 15px 30px rgba(249, 42, 173, 0.23)',
    ],
  },
  
  effects: {
    glowEffect: true,
    scanlines: true,
    noise: false,
    chromatic: true,
    bloom: true,
    animations: {
      cursorPulse: true,
      textGlow: true,
      matrixRain: false,
      retroCRT: true,
      typewriter: false,
    },
  },
};

// ============================================================================
// Tokyo Night Theme
// ============================================================================
export const tokyoNight: TerminalProTheme = {
  id: 'tokyo-night',
  name: 'Tokyo Night',
  type: 'dark',
  category: 'modern',
  
  terminal: {
    background: '#1a1b26',
    foreground: '#c0caf5',
    cursor: '#c0caf5',
    cursorAccent: '#a9b1d6',
    selectionBackground: 'rgba(51, 73, 144, 0.5)',
    selectionForeground: '#c0caf5',
    
    black: '#15161e',
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
    brightWhite: '#c0caf5',
  },
  
  ui: {
    primaryBackground: '#1a1b26',
    secondaryBackground: '#24283b',
    tertiaryBackground: '#2f3549',
    surfaceBackground: '#3b4261',
    overlayBackground: 'rgba(26, 27, 38, 0.95)',
    
    primaryText: '#c0caf5',
    secondaryText: '#a9b1d6',
    tertiaryText: '#9aa5ce',
    mutedText: '#565f89',
    
    accentColor: '#7aa2f7',
    accentHover: '#89b4fa',
    accentActive: '#96c7ff',
    
    successColor: '#9ece6a',
    warningColor: '#e0af68',
    errorColor: '#f7768e',
    infoColor: '#7dcfff',
    
    borderColor: '#3b4261',
    borderHover: '#545c7e',
    shadowColor: 'rgba(0, 0, 0, 0.4)',
    shadowElevation: [
      '0 1px 3px rgba(0, 0, 0, 0.12)',
      '0 4px 6px rgba(0, 0, 0, 0.16)',
      '0 10px 20px rgba(0, 0, 0, 0.19)',
      '0 15px 30px rgba(0, 0, 0, 0.23)',
    ],
  },
  
  effects: {
    glowEffect: false,
    scanlines: false,
    noise: false,
    chromatic: false,
    bloom: false,
    animations: {
      cursorPulse: true,
      textGlow: false,
      matrixRain: false,
      retroCRT: false,
      typewriter: false,
    },
  },
};

// ============================================================================
// Dracula Theme
// ============================================================================
export const dracula: TerminalProTheme = {
  id: 'dracula',
  name: 'Dracula',
  type: 'dark',
  category: 'modern',
  
  terminal: {
    background: '#282a36',
    foreground: '#f8f8f2',
    cursor: '#f8f8f2',
    cursorAccent: '#50fa7b',
    selectionBackground: 'rgba(68, 71, 90, 0.5)',
    selectionForeground: '#f8f8f2',
    
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
    brightWhite: '#ffffff',
  },
  
  ui: {
    primaryBackground: '#282a36',
    secondaryBackground: '#21222c',
    tertiaryBackground: '#343746',
    surfaceBackground: '#44475a',
    overlayBackground: 'rgba(40, 42, 54, 0.95)',
    
    primaryText: '#f8f8f2',
    secondaryText: '#e6e6e6',
    tertiaryText: '#bfbfbf',
    mutedText: '#6272a4',
    
    accentColor: '#bd93f9',
    accentHover: '#caa9fa',
    accentActive: '#d6bffb',
    
    successColor: '#50fa7b',
    warningColor: '#f1fa8c',
    errorColor: '#ff5555',
    infoColor: '#8be9fd',
    
    borderColor: '#44475a',
    borderHover: '#6272a4',
    shadowColor: 'rgba(0, 0, 0, 0.5)',
    shadowElevation: [
      '0 1px 3px rgba(0, 0, 0, 0.12)',
      '0 4px 6px rgba(0, 0, 0, 0.16)',
      '0 10px 20px rgba(0, 0, 0, 0.19)',
      '0 15px 30px rgba(0, 0, 0, 0.23)',
    ],
  },
  
  effects: {
    glowEffect: false,
    scanlines: false,
    noise: false,
    chromatic: false,
    bloom: false,
    animations: {
      cursorPulse: true,
      textGlow: false,
      matrixRain: false,
      retroCRT: false,
      typewriter: false,
    },
  },
};

// ============================================================================
// Professional Light Theme
// ============================================================================
export const professionalLight: TerminalProTheme = {
  id: 'professional-light',
  name: 'Professional Light',
  type: 'light',
  category: 'minimal',
  
  terminal: {
    background: '#ffffff',
    foreground: '#383a42',
    cursor: '#526eff',
    cursorAccent: '#6b7dff',
    selectionBackground: 'rgba(82, 110, 255, 0.2)',
    selectionForeground: '#383a42',
    
    black: '#383a42',
    red: '#e45649',
    green: '#50a14f',
    yellow: '#c18401',
    blue: '#0184bc',
    magenta: '#a626a4',
    cyan: '#0997b3',
    white: '#fafafa',
    
    brightBlack: '#696c77',
    brightRed: '#e06c75',
    brightGreen: '#98c379',
    brightYellow: '#e5c07b',
    brightBlue: '#61afef',
    brightMagenta: '#c678dd',
    brightCyan: '#56b6c2',
    brightWhite: '#ffffff',
  },
  
  ui: {
    primaryBackground: '#ffffff',
    secondaryBackground: '#fafafa',
    tertiaryBackground: '#f3f3f3',
    surfaceBackground: '#e8e8e8',
    overlayBackground: 'rgba(255, 255, 255, 0.95)',
    
    primaryText: '#383a42',
    secondaryText: '#4f5258',
    tertiaryText: '#696c77',
    mutedText: '#a0a1a7',
    
    accentColor: '#526eff',
    accentHover: '#6b7dff',
    accentActive: '#8495ff',
    
    successColor: '#50a14f',
    warningColor: '#c18401',
    errorColor: '#e45649',
    infoColor: '#0184bc',
    
    borderColor: '#e1e4e8',
    borderHover: '#d1d5da',
    shadowColor: 'rgba(0, 0, 0, 0.1)',
    shadowElevation: [
      '0 1px 3px rgba(0, 0, 0, 0.06)',
      '0 4px 6px rgba(0, 0, 0, 0.08)',
      '0 10px 20px rgba(0, 0, 0, 0.10)',
      '0 15px 30px rgba(0, 0, 0, 0.12)',
    ],
  },
  
  effects: {
    glowEffect: false,
    scanlines: false,
    noise: false,
    chromatic: false,
    bloom: false,
    animations: {
      cursorPulse: false,
      textGlow: false,
      matrixRain: false,
      retroCRT: false,
      typewriter: false,
    },
  },
};

// ============================================================================
// Theme Collection
// ============================================================================
export const terminalProThemes = new Map<string, TerminalProTheme>([
  ['cyberpunk-orange', cyberpunkOrange],
  ['matrix-green', matrixGreen],
  ['synthwave-purple', synthwavePurple],
  ['tokyo-night', tokyoNight],
  ['dracula', dracula],
  ['professional-light', professionalLight],
]);

// ============================================================================
// Theme Utilities
// ============================================================================
export const getThemeById = (id: string): TerminalProTheme | undefined => {
  return terminalProThemes.get(id);
};

export const getDefaultTheme = (): TerminalProTheme => {
  return cyberpunkOrange;
};

export const getThemesByCategory = (category: TerminalProTheme['category']): TerminalProTheme[] => {
  return Array.from(terminalProThemes.values()).filter(theme => theme.category === category);
};

export const getThemesByType = (type: 'dark' | 'light'): TerminalProTheme[] => {
  return Array.from(terminalProThemes.values()).filter(theme => theme.type === type);
};