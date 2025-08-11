// Alien Spaceship Interior Theme for MaiFarm
// Transform your farm into an intergalactic command center!

export const alienSpaceshipTheme = {
  name: 'Alien Spaceship Interior',
  id: 'alien-spaceship',
  
  // Cosmic color palette inspired by alien technology
  colors: {
    primary: {
      main: '#00ffcc',      // Alien teal energy
      light: '#66ffdd',
      dark: '#00cc99',
      glow: 'rgba(0, 255, 204, 0.4)'
    },
    secondary: {
      main: '#ff00ff',      // Plasma purple
      light: '#ff66ff',
      dark: '#cc00cc',
      glow: 'rgba(255, 0, 255, 0.3)'
    },
    background: {
      default: '#0a0e1a',   // Deep space black
      paper: '#1a1f2e',     // Metallic hull
      elevated: '#252b3d',  // Control panel surface
      hologram: 'rgba(0, 255, 204, 0.05)'
    },
    text: {
      primary: '#e0f7fa',   // Luminescent white
      secondary: '#80deea', // Holographic blue
      disabled: '#4a5568',
      alien: '#00ff88'      // Alien script green
    },
    status: {
      online: '#00ff00',    // System active
      offline: '#ff0044',   // System critical
      standby: '#ffaa00',   // System standby
      warp: '#00ffff'       // Warp drive engaged
    },
    energy: {
      plasma: 'linear-gradient(45deg, #ff00ff, #00ffff)',
      quantum: 'linear-gradient(90deg, #00ff88, #0088ff)',
      dark: 'linear-gradient(135deg, #440088, #000044)',
      nebula: 'linear-gradient(180deg, #ff0088, #8800ff, #0088ff)'
    }
  },
  
  // Futuristic typography
  typography: {
    fontFamily: {
      main: '"Orbitron", "Space Mono", monospace',
      display: '"Audiowide", "Exo 2", sans-serif',
      alien: '"Courier New", monospace', // Simulated alien script
      code: '"Fira Code", "Source Code Pro", monospace'
    },
    sizes: {
      xs: '0.75rem',
      sm: '0.875rem',
      md: '1rem',
      lg: '1.25rem',
      xl: '1.5rem',
      xxl: '2rem',
      display: '3rem'
    }
  },
  
  // Spaceship interior effects
  effects: {
    hologram: {
      boxShadow: '0 0 20px rgba(0, 255, 204, 0.5)',
      filter: 'drop-shadow(0 0 10px rgba(0, 255, 204, 0.8))',
      animation: 'hologram-flicker 2s infinite'
    },
    neon: {
      textShadow: '0 0 10px currentColor, 0 0 20px currentColor',
      boxShadow: 'inset 0 0 10px rgba(0, 255, 204, 0.3)'
    },
    panel: {
      background: 'linear-gradient(135deg, rgba(26, 31, 46, 0.9), rgba(37, 43, 61, 0.9))',
      border: '1px solid rgba(0, 255, 204, 0.3)',
      borderRadius: '8px'
    },
    glass: {
      background: 'rgba(26, 31, 46, 0.6)',
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(0, 255, 204, 0.2)'
    },
    energy: {
      background: 'radial-gradient(circle, rgba(0, 255, 204, 0.2) 0%, transparent 70%)',
      animation: 'pulse-energy 3s infinite'
    }
  },
  
  // Component-specific styles
  components: {
    button: {
      default: {
        background: 'linear-gradient(135deg, #1a1f2e, #252b3d)',
        border: '1px solid rgba(0, 255, 204, 0.3)',
        color: '#00ffcc',
        hover: {
          background: 'linear-gradient(135deg, #252b3d, #2a3142)',
          boxShadow: '0 0 15px rgba(0, 255, 204, 0.5)'
        }
      },
      primary: {
        background: 'linear-gradient(135deg, #00ffcc, #00cc99)',
        color: '#0a0e1a',
        hover: {
          background: 'linear-gradient(135deg, #00ffdd, #00ddaa)',
          boxShadow: '0 0 20px rgba(0, 255, 204, 0.8)'
        }
      },
      danger: {
        background: 'linear-gradient(135deg, #ff0044, #cc0033)',
        animation: 'alert-pulse 1s infinite'
      }
    },
    card: {
      background: 'rgba(26, 31, 46, 0.8)',
      border: '1px solid rgba(0, 255, 204, 0.2)',
      borderRadius: '12px',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
      hover: {
        border: '1px solid rgba(0, 255, 204, 0.5)',
        boxShadow: '0 4px 30px rgba(0, 255, 204, 0.3)'
      }
    },
    input: {
      background: 'rgba(10, 14, 26, 0.6)',
      border: '1px solid rgba(0, 255, 204, 0.3)',
      color: '#e0f7fa',
      focus: {
        border: '1px solid #00ffcc',
        boxShadow: '0 0 10px rgba(0, 255, 204, 0.4)'
      }
    },
    modal: {
      background: 'rgba(26, 31, 46, 0.95)',
      border: '2px solid rgba(0, 255, 204, 0.4)',
      borderRadius: '16px',
      boxShadow: '0 0 40px rgba(0, 255, 204, 0.3)',
      backdropFilter: 'blur(10px)'
    }
  },
  
  // Animations for the spaceship interior
  animations: {
    'hologram-flicker': `
      @keyframes hologram-flicker {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.8; }
        75% { opacity: 0.95; }
      }
    `,
    'pulse-energy': `
      @keyframes pulse-energy {
        0%, 100% { transform: scale(1); opacity: 0.5; }
        50% { transform: scale(1.1); opacity: 0.8; }
      }
    `,
    'alert-pulse': `
      @keyframes alert-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
      }
    `,
    'scan-line': `
      @keyframes scan-line {
        0% { transform: translateY(-100%); }
        100% { transform: translateY(100%); }
      }
    `,
    'energy-flow': `
      @keyframes energy-flow {
        0% { background-position: 0% 50%; }
        100% { background-position: 100% 50%; }
      }
    `
  },
  
  // Sound effect references (to be implemented with audio service)
  sounds: {
    ambient: 'spaceship-hum',
    buttonClick: 'energy-pulse',
    notification: 'alien-chirp',
    alert: 'warning-klaxon',
    success: 'warp-engage',
    error: 'system-failure',
    hover: 'hologram-shimmer'
  },
  
  // Special alien UI elements
  alienElements: {
    alienScript: {
      fontFamily: '"Courier New", monospace',
      letterSpacing: '2px',
      textTransform: 'uppercase',
      color: '#00ff88',
      textShadow: '0 0 5px #00ff88'
    },
    holoDisplay: {
      position: 'relative',
      '&::before': {
        content: '""',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '2px',
        background: 'linear-gradient(90deg, transparent, #00ffcc, transparent)',
        animation: 'scan-line 3s linear infinite'
      }
    },
    energyField: {
      position: 'relative',
      overflow: 'hidden',
      '&::after': {
        content: '""',
        position: 'absolute',
        top: '-50%',
        left: '-50%',
        width: '200%',
        height: '200%',
        background: 'radial-gradient(circle, rgba(0, 255, 204, 0.1) 0%, transparent 70%)',
        animation: 'pulse-energy 4s infinite'
      }
    }
  }
};

// Utility function to apply theme
export const applyAlienTheme = () => {
  const root = document.documentElement;
  
  // Set CSS variables
  Object.entries(alienSpaceshipTheme.colors).forEach(([category, values]) => {
    if (typeof values === 'object' && !values.includes('gradient')) {
      Object.entries(values).forEach(([key, value]) => {
        root.style.setProperty(`--alien-${category}-${key}`, value as string);
      });
    }
  });
  
  // Add theme class
  document.body.classList.add('alien-spaceship-theme');
  
  // Initialize ambient effects
  initializeSpaceshipAmbiance();
};

// Initialize spaceship ambiance
const initializeSpaceshipAmbiance = () => {
  // Add floating particles
  const particleContainer = document.createElement('div');
  particleContainer.className = 'alien-particle-container';
  particleContainer.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 1;
  `;
  
  // Create energy particles
  for (let i = 0; i < 20; i++) {
    const particle = document.createElement('div');
    particle.style.cssText = `
      position: absolute;
      width: 2px;
      height: 2px;
      background: #00ffcc;
      border-radius: 50%;
      box-shadow: 0 0 6px #00ffcc;
      animation: float-particle ${10 + Math.random() * 20}s linear infinite;
      left: ${Math.random() * 100}%;
      top: ${Math.random() * 100}%;
      opacity: ${0.3 + Math.random() * 0.7};
    `;
    particleContainer.appendChild(particle);
  }
  
  document.body.appendChild(particleContainer);
};

// Theme utilities
export const alienUtils = {
  generateAlienText: (text: string): string => {
    // Convert text to "alien" characters
    const alienChars = '⟨⟩⟪⟫⟬⟭⟮⟯⦃⦄⦅⦆⦇⦈⦉⦊⦋⦌⦍⦎⦏⦐⦑⦒⦓⦔⦕⦖⦗⦘';
    return text.split('').map(char => 
      char === ' ' ? ' ' : alienChars[Math.floor(Math.random() * alienChars.length)]
    ).join('');
  },
  
  createHologram: (element: HTMLElement) => {
    element.style.filter = 'drop-shadow(0 0 10px rgba(0, 255, 204, 0.8))';
    element.style.animation = 'hologram-flicker 2s infinite';
  },
  
  addEnergyPulse: (element: HTMLElement) => {
    element.style.animation = 'pulse-energy 3s infinite';
  }
};

export default alienSpaceshipTheme;