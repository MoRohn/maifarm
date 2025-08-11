import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { TerminalTheme, themes, applyTheme, getTheme } from './terminalThemes';

interface TerminalThemeContextType {
  currentTheme: TerminalTheme;
  themeName: string;
  setTheme: (themeName: string) => void;
  availableThemes: string[];
  previewTheme: (themeName: string) => void;
  resetTheme: () => void;
}

const TerminalThemeContext = createContext<TerminalThemeContextType | undefined>(undefined);

interface TerminalThemeProviderProps {
  children: ReactNode;
  defaultTheme?: string;
  persistTheme?: boolean;
}

export const TerminalThemeProvider: React.FC<TerminalThemeProviderProps> = ({
  children,
  defaultTheme = 'cyberpunk',
  persistTheme = true,
}) => {
  const [themeName, setThemeName] = useState<string>(() => {
    if (persistTheme) {
      const savedTheme = localStorage.getItem('terminal-theme');
      if (savedTheme && themes[savedTheme]) {
        return savedTheme;
      }
    }
    return defaultTheme;
  });

  const [currentTheme, setCurrentTheme] = useState<TerminalTheme>(() => getTheme(themeName));
  const [previewThemeName, setPreviewThemeName] = useState<string | null>(null);

  useEffect(() => {
    const theme = applyTheme(previewThemeName || themeName);
    setCurrentTheme(theme);

    // Save theme preference
    if (persistTheme && !previewThemeName) {
      localStorage.setItem('terminal-theme', themeName);
    }

    // Apply theme class to body for global effects
    document.body.className = document.body.className
      .replace(/terminal-theme-\w+/g, '')
      .trim() + ` terminal-theme-${previewThemeName || themeName}`;

    // Apply effects classes
    const effects = theme.effects;
    const effectClasses = [];
    if (effects.rainEffect) effectClasses.push('terminal-rain-effect');
    if (effects.glowText) effectClasses.push('terminal-glow-text');
    if (effects.scanlines) effectClasses.push('terminal-scanlines');
    if (effects.neonGlow) effectClasses.push('terminal-neon-glow');
    if (effects.glitchEffect) effectClasses.push('terminal-glitch');
    if (effects.particleBackground) effectClasses.push('terminal-particles');
    if (effects.holographicShimmer) effectClasses.push('terminal-holographic');
    if (effects.crtEffect) effectClasses.push('terminal-crt');
    if (effects.retroTerminal) effectClasses.push('terminal-retro');

    // Add effect classes to terminal container
    effectClasses.forEach(className => {
      if (!document.body.classList.contains(className)) {
        document.body.classList.add(className);
      }
    });

    // Clean up old effect classes
    const allEffectClasses = [
      'terminal-rain-effect', 'terminal-glow-text', 'terminal-scanlines',
      'terminal-neon-glow', 'terminal-glitch', 'terminal-particles',
      'terminal-holographic', 'terminal-crt', 'terminal-retro'
    ];
    allEffectClasses.forEach(className => {
      if (!effectClasses.includes(className)) {
        document.body.classList.remove(className);
      }
    });
  }, [themeName, previewThemeName, persistTheme]);

  const setTheme = (newThemeName: string) => {
    if (themes[newThemeName]) {
      setThemeName(newThemeName);
      setPreviewThemeName(null);
    }
  };

  const previewTheme = (newThemeName: string) => {
    if (themes[newThemeName]) {
      setPreviewThemeName(newThemeName);
    }
  };

  const resetTheme = () => {
    setPreviewThemeName(null);
  };

  const value: TerminalThemeContextType = {
    currentTheme,
    themeName: previewThemeName || themeName,
    setTheme,
    availableThemes: Object.keys(themes),
    previewTheme,
    resetTheme,
  };

  return (
    <TerminalThemeContext.Provider value={value}>
      {children}
    </TerminalThemeContext.Provider>
  );
};

export const useTerminalTheme = (): TerminalThemeContextType => {
  const context = useContext(TerminalThemeContext);
  if (context === undefined) {
    throw new Error('useTerminalTheme must be used within a TerminalThemeProvider');
  }
  return context;
};