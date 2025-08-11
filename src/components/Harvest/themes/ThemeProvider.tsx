import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { themes as terminalThemes, TerminalTheme } from './terminalThemes';

interface ThemeContextType {
  theme: TerminalTheme;
  themeName: string;
  setTheme: (themeName: string) => void;
  availableThemes: string[];
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: string;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ 
  children, 
  defaultTheme = 'matrix' 
}) => {
  const [themeName, setThemeName] = useState<string>(() => {
    // Load saved theme from localStorage
    const saved = localStorage.getItem('harvest-terminal-theme');
    return saved && terminalThemes[saved] ? saved : defaultTheme;
  });

  const theme = terminalThemes[themeName] || terminalThemes[defaultTheme];

  useEffect(() => {
    // Save theme preference
    localStorage.setItem('harvest-terminal-theme', themeName);
    
    // Apply theme CSS variables
    const root = document.documentElement;
    Object.entries(theme.colors).forEach(([key, value]) => {
      root.style.setProperty(`--terminal-${key}`, value);
    });
    
    // Apply theme class to body for global styling
    document.body.className = `terminal-theme-${themeName}`;
  }, [themeName, theme]);

  const setTheme = (newThemeName: string) => {
    if (terminalThemes[newThemeName]) {
      setThemeName(newThemeName);
    } else {
      console.error(`Theme '${newThemeName}' not found`);
    }
  };

  const availableThemes = Object.keys(terminalThemes);

  return (
    <ThemeContext.Provider value={{ theme, themeName, setTheme, availableThemes }}>
      {children}
    </ThemeContext.Provider>
  );
};

export default ThemeProvider;