export interface TerminalTheme {
  name: string;
  backgroundColor: string;
  textColor: string;
  promptColor: string;
  errorColor: string;
  warningColor: string;
  successColor: string;
  infoColor: string;
  borderColor: string;
  scrollbarTrack: string;
  scrollbarThumb: string;
  selectionBackground: string;
  cursorColor: string;
  fontFamily?: string;
}

export const terminalThemes: Record<string, TerminalTheme> = {
  professionalDark: {
    name: 'Professional Dark',
    backgroundColor: 'rgba(10, 15, 27, 0.95)',
    textColor: '#94a3b8',
    promptColor: '#60a5fa',
    errorColor: '#f87171',
    warningColor: '#fbbf24',
    successColor: '#34d399',
    infoColor: '#60a5fa',
    borderColor: 'rgba(55, 65, 81, 0.5)',
    scrollbarTrack: 'rgba(31, 41, 55, 0.5)',
    scrollbarThumb: 'rgba(75, 85, 99, 0.5)',
    selectionBackground: 'rgba(59, 130, 246, 0.3)',
    cursorColor: '#60a5fa',
  },
  
  professionalLight: {
    name: 'Professional Light',
    backgroundColor: 'rgba(248, 250, 252, 0.95)',
    textColor: '#475569',
    promptColor: '#3b82f6',
    errorColor: '#dc2626',
    warningColor: '#f59e0b',
    successColor: '#10b981',
    infoColor: '#3b82f6',
    borderColor: 'rgba(209, 213, 219, 0.5)',
    scrollbarTrack: 'rgba(243, 244, 246, 0.5)',
    scrollbarThumb: 'rgba(209, 213, 219, 0.5)',
    selectionBackground: 'rgba(59, 130, 246, 0.2)',
    cursorColor: '#3b82f6',
  },
  
  matrix: {
    name: 'Matrix',
    backgroundColor: '#000000',
    textColor: '#00ff00',
    promptColor: '#00ff00',
    errorColor: '#ff0000',
    warningColor: '#ffff00',
    successColor: '#00ff00',
    infoColor: '#00ffff',
    borderColor: '#00ff00',
    scrollbarTrack: '#001100',
    scrollbarThumb: '#00ff00',
    selectionBackground: 'rgba(0, 255, 0, 0.3)',
    cursorColor: '#00ff00',
    fontFamily: 'monospace',
  },
  
  ocean: {
    name: 'Ocean Deep',
    backgroundColor: 'linear-gradient(135deg, #001e3c, #003a70)',
    textColor: '#90cdf4',
    promptColor: '#38bdf8',
    errorColor: '#fca5a5',
    warningColor: '#fde68a',
    successColor: '#86efac',
    infoColor: '#93c5fd',
    borderColor: 'rgba(30, 58, 138, 0.5)',
    scrollbarTrack: 'rgba(30, 41, 59, 0.5)',
    scrollbarThumb: 'rgba(59, 130, 246, 0.5)',
    selectionBackground: 'rgba(56, 189, 248, 0.3)',
    cursorColor: '#38bdf8',
  },
  
  dracula: {
    name: 'Dracula',
    backgroundColor: '#282a36',
    textColor: '#f8f8f2',
    promptColor: '#bd93f9',
    errorColor: '#ff5555',
    warningColor: '#f1fa8c',
    successColor: '#50fa7b',
    infoColor: '#8be9fd',
    borderColor: '#44475a',
    scrollbarTrack: '#282a36',
    scrollbarThumb: '#44475a',
    selectionBackground: 'rgba(68, 71, 90, 0.5)',
    cursorColor: '#f8f8f2',
  },
  
  cyberpunk: {
    name: 'Cyberpunk',
    backgroundColor: 'linear-gradient(135deg, #0f0f23, #1a0033)',
    textColor: '#ff00ff',
    promptColor: '#00ffff',
    errorColor: '#ff0080',
    warningColor: '#ffff00',
    successColor: '#00ff00',
    infoColor: '#00ffff',
    borderColor: 'rgba(255, 0, 255, 0.3)',
    scrollbarTrack: 'rgba(15, 15, 35, 0.5)',
    scrollbarThumb: 'rgba(255, 0, 255, 0.5)',
    selectionBackground: 'rgba(0, 255, 255, 0.3)',
    cursorColor: '#00ffff',
  },
  
  solarizedDark: {
    name: 'Solarized Dark',
    backgroundColor: '#002b36',
    textColor: '#839496',
    promptColor: '#268bd2',
    errorColor: '#dc322f',
    warningColor: '#b58900',
    successColor: '#859900',
    infoColor: '#2aa198',
    borderColor: '#073642',
    scrollbarTrack: '#002b36',
    scrollbarThumb: '#073642',
    selectionBackground: 'rgba(38, 139, 210, 0.3)',
    cursorColor: '#839496',
  },
  
  monokai: {
    name: 'Monokai',
    backgroundColor: '#272822',
    textColor: '#f8f8f2',
    promptColor: '#66d9ef',
    errorColor: '#f92672',
    warningColor: '#e6db74',
    successColor: '#a6e22e',
    infoColor: '#66d9ef',
    borderColor: '#3e3d32',
    scrollbarTrack: '#272822',
    scrollbarThumb: '#3e3d32',
    selectionBackground: 'rgba(102, 217, 239, 0.3)',
    cursorColor: '#f8f8f0',
  },
  
  nord: {
    name: 'Nord',
    backgroundColor: '#2e3440',
    textColor: '#d8dee9',
    promptColor: '#88c0d0',
    errorColor: '#bf616a',
    warningColor: '#ebcb8b',
    successColor: '#a3be8c',
    infoColor: '#81a1c1',
    borderColor: '#3b4252',
    scrollbarTrack: '#2e3440',
    scrollbarThumb: '#4c566a',
    selectionBackground: 'rgba(136, 192, 208, 0.3)',
    cursorColor: '#d8dee9',
  },
  
  github: {
    name: 'GitHub',
    backgroundColor: '#0d1117',
    textColor: '#c9d1d9',
    promptColor: '#58a6ff',
    errorColor: '#f85149',
    warningColor: '#d29922',
    successColor: '#3fb950',
    infoColor: '#58a6ff',
    borderColor: '#30363d',
    scrollbarTrack: '#0d1117',
    scrollbarThumb: '#30363d',
    selectionBackground: 'rgba(88, 166, 255, 0.3)',
    cursorColor: '#c9d1d9',
  },
};

export const getTerminalTheme = (themeName: string): TerminalTheme => {
  return terminalThemes[themeName] || terminalThemes.professionalDark;
};

export const applyTerminalTheme = (element: HTMLElement, theme: TerminalTheme): void => {
  if (!element) return;
  
  // Apply background
  if (theme.backgroundColor.includes('gradient')) {
    element.style.background = theme.backgroundColor;
  } else {
    element.style.backgroundColor = theme.backgroundColor;
  }
  
  // Apply text color
  element.style.color = theme.textColor;
  
  // Apply border
  element.style.borderColor = theme.borderColor;
  
  // Apply font family if specified
  if (theme.fontFamily) {
    element.style.fontFamily = theme.fontFamily;
  }
  
  // Apply CSS variables for child elements
  element.style.setProperty('--terminal-text-color', theme.textColor);
  element.style.setProperty('--terminal-prompt-color', theme.promptColor);
  element.style.setProperty('--terminal-error-color', theme.errorColor);
  element.style.setProperty('--terminal-warning-color', theme.warningColor);
  element.style.setProperty('--terminal-success-color', theme.successColor);
  element.style.setProperty('--terminal-info-color', theme.infoColor);
  element.style.setProperty('--terminal-border-color', theme.borderColor);
  element.style.setProperty('--terminal-scrollbar-track', theme.scrollbarTrack);
  element.style.setProperty('--terminal-scrollbar-thumb', theme.scrollbarThumb);
  element.style.setProperty('--terminal-selection-bg', theme.selectionBackground);
  element.style.setProperty('--terminal-cursor-color', theme.cursorColor);
};