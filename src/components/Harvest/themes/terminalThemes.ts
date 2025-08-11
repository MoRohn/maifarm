/**
 * Terminal Themes - The most visually stunning terminal themes ever created
 * Each theme includes complete color palettes, visual effects, and animations
 */

export interface TerminalTheme {
  name: string;
  description: string;
  colors: {
    background: string;
    foreground: string;
    cursor: string;
    cursorAccent: string;
    selection: string;
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
    // Special colors
    accent: string;
    accentSecondary: string;
    border: string;
    headerBg: string;
    promptBg: string;
    scrollbarThumb: string;
    scrollbarTrack: string;
  };
  effects: {
    rainEffect?: boolean;
    glowText?: boolean;
    scanlines?: boolean;
    neonGlow?: boolean;
    glitchEffect?: boolean;
    particleBackground?: boolean;
    holographicShimmer?: boolean;
    crtEffect?: boolean;
    waveAnimation?: boolean;
    starField?: boolean;
    gradientAnimation?: boolean;
    pulseGlow?: boolean;
    typewriterCursor?: boolean;
    retroTerminal?: boolean;
    quantumFluctuation?: boolean;
  };
  font: {
    family: string;
    size: string;
    lineHeight: string;
    letterSpacing?: string;
    weight?: string;
  };
  css?: string; // Additional CSS for custom effects
}

export const themes: Record<string, TerminalTheme> = {
  matrix: {
    name: 'Matrix',
    description: 'Enter the digital rain of the Matrix',
    colors: {
      background: '#0c0c0c',
      foreground: '#00ff00',
      cursor: '#00ff00',
      cursorAccent: '#ffffff',
      selection: 'rgba(0, 255, 0, 0.3)',
      black: '#000000',
      red: '#ff0000',
      green: '#00ff00',
      yellow: '#ffff00',
      blue: '#0066ff',
      magenta: '#ff00ff',
      cyan: '#00ffff',
      white: '#ffffff',
      brightBlack: '#555555',
      brightRed: '#ff5555',
      brightGreen: '#55ff55',
      brightYellow: '#ffff55',
      brightBlue: '#5555ff',
      brightMagenta: '#ff55ff',
      brightCyan: '#55ffff',
      brightWhite: '#ffffff',
      accent: '#00ff00',
      accentSecondary: '#00cc00',
      border: 'rgba(0, 255, 0, 0.2)',
      headerBg: 'rgba(0, 0, 0, 0.9)',
      promptBg: 'rgba(0, 255, 0, 0.05)',
      scrollbarThumb: '#00ff00',
      scrollbarTrack: '#0c0c0c',
    },
    effects: {
      rainEffect: true,
      glowText: true,
      scanlines: true,
      typewriterCursor: true,
    },
    font: {
      family: '"Courier New", "Consolas", monospace',
      size: '14px',
      lineHeight: '1.4',
      letterSpacing: '0.5px',
    },
    css: `
      @keyframes matrix-rain {
        0% { transform: translateY(-100%); opacity: 0; }
        10% { opacity: 1; }
        90% { opacity: 1; }
        100% { transform: translateY(100vh); opacity: 0; }
      }
      .matrix-rain-char {
        animation: matrix-rain 8s linear infinite;
      }
    `,
  },
  
  cyberpunk: {
    name: 'Cyberpunk 2077',
    description: 'Neon-soaked streets of Night City',
    colors: {
      background: '#0a0e1a',
      foreground: '#00d9ff',
      cursor: '#ff0080',
      cursorAccent: '#ffffff',
      selection: 'rgba(255, 0, 128, 0.3)',
      black: '#000000',
      red: '#ff0055',
      green: '#00ff88',
      yellow: '#ffdd00',
      blue: '#0099ff',
      magenta: '#ff00ff',
      cyan: '#00ffff',
      white: '#ffffff',
      brightBlack: '#666666',
      brightRed: '#ff3366',
      brightGreen: '#33ff99',
      brightYellow: '#ffee33',
      brightBlue: '#33aaff',
      brightMagenta: '#ff33ff',
      brightCyan: '#33ffff',
      brightWhite: '#ffffff',
      accent: '#ff0080',
      accentSecondary: '#00d9ff',
      border: 'rgba(255, 0, 128, 0.4)',
      headerBg: 'linear-gradient(135deg, #ff0080 0%, #00d9ff 100%)',
      promptBg: 'rgba(255, 0, 128, 0.1)',
      scrollbarThumb: '#ff0080',
      scrollbarTrack: '#0a0e1a',
    },
    effects: {
      neonGlow: true,
      glitchEffect: true,
      particleBackground: true,
      holographicShimmer: true,
      pulseGlow: true,
    },
    font: {
      family: '"Orbitron", "Rajdhani", monospace',
      size: '15px',
      lineHeight: '1.5',
      letterSpacing: '1px',
      weight: '500',
    },
    css: `
      @keyframes neon-pulse {
        0%, 100% { text-shadow: 0 0 10px currentColor, 0 0 20px currentColor; }
        50% { text-shadow: 0 0 20px currentColor, 0 0 40px currentColor; }
      }
      .neon-text { animation: neon-pulse 2s ease-in-out infinite; }
    `,
  },

  synthwave: {
    name: 'Synthwave',
    description: 'Retro 80s aesthetic with modern flair',
    colors: {
      background: '#1a0033',
      foreground: '#ff6ac1',
      cursor: '#ff6ac1',
      cursorAccent: '#57c7ff',
      selection: 'rgba(255, 106, 193, 0.3)',
      black: '#000000',
      red: '#ff3270',
      green: '#00ff41',
      yellow: '#ffe700',
      blue: '#0080ff',
      magenta: '#ff0080',
      cyan: '#00ffff',
      white: '#ffffff',
      brightBlack: '#666666',
      brightRed: '#ff5555',
      brightGreen: '#50fa7b',
      brightYellow: '#f1fa8c',
      brightBlue: '#6272a4',
      brightMagenta: '#ff79c6',
      brightCyan: '#8be9fd',
      brightWhite: '#ffffff',
      accent: '#ff6ac1',
      accentSecondary: '#57c7ff',
      border: 'rgba(255, 106, 193, 0.3)',
      headerBg: 'linear-gradient(90deg, #ff006e 0%, #8338ec 50%, #3a86ff 100%)',
      promptBg: 'rgba(255, 106, 193, 0.1)',
      scrollbarThumb: '#ff6ac1',
      scrollbarTrack: '#1a0033',
    },
    effects: {
      retroTerminal: true,
      scanlines: true,
      gradientAnimation: true,
      neonGlow: true,
      waveAnimation: true,
    },
    font: {
      family: '"Space Mono", "Fira Code", monospace',
      size: '14px',
      lineHeight: '1.6',
      letterSpacing: '0.5px',
    },
  },

  quantum: {
    name: 'Quantum',
    description: 'Quantum computing aesthetic with particle effects',
    colors: {
      background: '#000814',
      foreground: '#00ffff',
      cursor: '#ffffff',
      cursorAccent: '#00ffff',
      selection: 'rgba(0, 255, 255, 0.2)',
      black: '#000000',
      red: '#ff006e',
      green: '#00ff88',
      yellow: '#ffbe0b',
      blue: '#0077ff',
      magenta: '#c77dff',
      cyan: '#00ffff',
      white: '#ffffff',
      brightBlack: '#666666',
      brightRed: '#ff4488',
      brightGreen: '#44ffaa',
      brightYellow: '#ffdd44',
      brightBlue: '#4499ff',
      brightMagenta: '#dd99ff',
      brightCyan: '#44ffff',
      brightWhite: '#ffffff',
      accent: '#00ffff',
      accentSecondary: '#0077ff',
      border: 'rgba(0, 255, 255, 0.2)',
      headerBg: 'rgba(0, 8, 20, 0.95)',
      promptBg: 'rgba(0, 255, 255, 0.05)',
      scrollbarThumb: '#00ffff',
      scrollbarTrack: '#000814',
    },
    effects: {
      quantumFluctuation: true,
      particleBackground: true,
      holographicShimmer: true,
      glowText: true,
      starField: true,
    },
    font: {
      family: '"JetBrains Mono", "Fira Code", monospace',
      size: '14px',
      lineHeight: '1.5',
      letterSpacing: '0.3px',
    },
  },

  dracula: {
    name: 'Dracula',
    description: 'Dark theme with vibrant colors',
    colors: {
      background: '#282a36',
      foreground: '#f8f8f2',
      cursor: '#f8f8f2',
      cursorAccent: '#282a36',
      selection: 'rgba(68, 71, 90, 0.99)',
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
      accent: '#bd93f9',
      accentSecondary: '#ff79c6',
      border: 'rgba(68, 71, 90, 0.5)',
      headerBg: '#1e1f29',
      promptBg: 'rgba(68, 71, 90, 0.3)',
      scrollbarThumb: '#44475a',
      scrollbarTrack: '#282a36',
    },
    effects: {
      glowText: true,
      pulseGlow: true,
    },
    font: {
      family: '"Fira Code", "Cascadia Code", monospace',
      size: '14px',
      lineHeight: '1.5',
    },
  },

  hacker: {
    name: 'Hacker Elite',
    description: 'Classic hacker aesthetic with green phosphor glow',
    colors: {
      background: '#000000',
      foreground: '#33ff00',
      cursor: '#33ff00',
      cursorAccent: '#000000',
      selection: 'rgba(51, 255, 0, 0.3)',
      black: '#000000',
      red: '#ff3333',
      green: '#33ff00',
      yellow: '#ffff33',
      blue: '#3333ff',
      magenta: '#ff33ff',
      cyan: '#00ffff',
      white: '#ffffff',
      brightBlack: '#333333',
      brightRed: '#ff6666',
      brightGreen: '#66ff33',
      brightYellow: '#ffff66',
      brightBlue: '#6666ff',
      brightMagenta: '#ff66ff',
      brightCyan: '#66ffff',
      brightWhite: '#ffffff',
      accent: '#33ff00',
      accentSecondary: '#00ff00',
      border: 'rgba(51, 255, 0, 0.3)',
      headerBg: 'rgba(0, 0, 0, 0.95)',
      promptBg: 'rgba(51, 255, 0, 0.1)',
      scrollbarThumb: '#33ff00',
      scrollbarTrack: '#000000',
    },
    effects: {
      crtEffect: true,
      scanlines: true,
      glowText: true,
      retroTerminal: true,
      typewriterCursor: true,
    },
    font: {
      family: '"IBM Plex Mono", "Courier New", monospace',
      size: '13px',
      lineHeight: '1.4',
      letterSpacing: '0.5px',
    },
    css: `
      @keyframes crt-flicker {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.98; }
      }
      .crt-effect { animation: crt-flicker 0.15s infinite; }
    `,
  },

  tokyo: {
    name: 'Tokyo Night',
    description: 'Inspired by Tokyo city lights at night',
    colors: {
      background: '#1a1b26',
      foreground: '#a9b1d6',
      cursor: '#c0caf5',
      cursorAccent: '#1a1b26',
      selection: 'rgba(51, 73, 130, 0.5)',
      black: '#15161e',
      red: '#f7768e',
      green: '#9ece6a',
      yellow: '#e0af68',
      blue: '#7aa2f7',
      magenta: '#bb9af7',
      cyan: '#7dcfff',
      white: '#c0caf5',
      brightBlack: '#414868',
      brightRed: '#ff9e64',
      brightGreen: '#b9f27c',
      brightYellow: '#ff9e64',
      brightBlue: '#7aa2f7',
      brightMagenta: '#bb9af7',
      brightCyan: '#7dcfff',
      brightWhite: '#ffffff',
      accent: '#7aa2f7',
      accentSecondary: '#bb9af7',
      border: 'rgba(122, 162, 247, 0.2)',
      headerBg: '#16161e',
      promptBg: 'rgba(122, 162, 247, 0.1)',
      scrollbarThumb: '#414868',
      scrollbarTrack: '#1a1b26',
    },
    effects: {
      neonGlow: true,
      gradientAnimation: true,
    },
    font: {
      family: '"Victor Mono", "Fira Code", monospace',
      size: '14px',
      lineHeight: '1.5',
    },
  },

  aurora: {
    name: 'Aurora Borealis',
    description: 'Northern lights dancing across the terminal',
    colors: {
      background: '#0f1419',
      foreground: '#e6e1cf',
      cursor: '#f29718',
      cursorAccent: '#0f1419',
      selection: 'rgba(61, 96, 146, 0.5)',
      black: '#000000',
      red: '#ff3333',
      green: '#b8cc52',
      yellow: '#e7c547',
      blue: '#36a3d9',
      magenta: '#f07178',
      cyan: '#95e6cb',
      white: '#ffffff',
      brightBlack: '#323232',
      brightRed: '#ff6565',
      brightGreen: '#eafe84',
      brightYellow: '#fff779',
      brightBlue: '#68d5ff',
      brightMagenta: '#ffa3aa',
      brightCyan: '#c7fffd',
      brightWhite: '#ffffff',
      accent: '#36a3d9',
      accentSecondary: '#95e6cb',
      border: 'rgba(54, 163, 217, 0.3)',
      headerBg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      promptBg: 'rgba(54, 163, 217, 0.1)',
      scrollbarThumb: '#36a3d9',
      scrollbarTrack: '#0f1419',
    },
    effects: {
      waveAnimation: true,
      gradientAnimation: true,
      holographicShimmer: true,
      particleBackground: true,
    },
    font: {
      family: '"Source Code Pro", "Consolas", monospace',
      size: '14px',
      lineHeight: '1.5',
    },
    css: `
      @keyframes aurora-wave {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      .aurora-bg {
        background: linear-gradient(-45deg, #667eea, #764ba2, #f093fb, #f5576c);
        background-size: 400% 400%;
        animation: aurora-wave 15s ease infinite;
      }
    `,
  },
};

// Helper function to apply theme
export const applyTheme = (themeName: string): TerminalTheme => {
  const theme = themes[themeName] || themes.matrix;
  
  // Apply CSS custom properties
  const root = document.documentElement;
  Object.entries(theme.colors).forEach(([key, value]) => {
    root.style.setProperty(`--terminal-color-${key}`, value);
  });
  
  // Apply font settings
  root.style.setProperty('--terminal-font-family', theme.font.family);
  root.style.setProperty('--terminal-font-size', theme.font.size);
  root.style.setProperty('--terminal-line-height', theme.font.lineHeight);
  
  if (theme.font.letterSpacing) {
    root.style.setProperty('--terminal-letter-spacing', theme.font.letterSpacing);
  }
  
  // Add custom CSS if provided
  if (theme.css) {
    const styleId = 'terminal-theme-custom-css';
    let styleElement = document.getElementById(styleId);
    
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = styleId;
      document.head.appendChild(styleElement);
    }
    
    styleElement.textContent = theme.css;
  }
  
  return theme;
};

// Get theme names for UI
export const getThemeNames = (): string[] => Object.keys(themes);

// Get theme by name
export const getTheme = (name: string): TerminalTheme => themes[name] || themes.matrix;