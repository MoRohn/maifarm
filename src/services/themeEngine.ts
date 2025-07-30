interface ThemeConfig {
  mode: 'light' | 'dark' | 'system';
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
  fontSize: 'small' | 'medium' | 'large';
  animations: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
}

class ThemeEngine {
  private root: HTMLElement;
  private defaultTheme: ThemeConfig = {
    mode: 'system',
    primaryColor: '#8B5CF6',
    accentColor: '#EC4899',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 'medium',
    animations: true,
    reducedMotion: false,
    highContrast: false
  };

  constructor() {
    this.root = document.documentElement;
  }

  applyTheme(theme: ThemeConfig): void {
    // Apply color scheme
    this.applyColorScheme(theme.mode);
    
    // Apply custom colors
    this.applyCustomColors(theme.primaryColor, theme.accentColor);
    
    // Apply typography
    this.applyTypography(theme.fontFamily, theme.fontSize);
    
    // Apply accessibility settings
    this.applyAccessibilitySettings(theme);
    
    // Save theme to localStorage
    this.saveTheme(theme);
  }

  private applyColorScheme(mode: 'light' | 'dark' | 'system'): void {
    if (mode === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.root.classList.toggle('dark', prefersDark);
    } else {
      this.root.classList.toggle('dark', mode === 'dark');
    }
  }

  private applyCustomColors(primary: string, accent: string): void {
    // Convert hex to RGB for CSS variables
    const primaryRgb = this.hexToRgb(primary);
    const accentRgb = this.hexToRgb(accent);
    
    if (primaryRgb) {
      this.root.style.setProperty('--color-primary', primary);
      this.root.style.setProperty('--color-primary-rgb', `${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}`);
      
      // Generate color variations
      this.generateColorVariations('primary', primary);
    }
    
    if (accentRgb) {
      this.root.style.setProperty('--color-accent', accent);
      this.root.style.setProperty('--color-accent-rgb', `${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}`);
      
      // Generate color variations
      this.generateColorVariations('accent', accent);
    }
  }

  private applyTypography(fontFamily: string, fontSize: string): void {
    this.root.style.setProperty('--font-family', fontFamily);
    
    // Apply font size scale
    const scales = {
      small: 0.875,
      medium: 1,
      large: 1.125
    };
    
    const scale = scales[fontSize] || 1;
    this.root.style.setProperty('--font-scale', scale.toString());
    
    // Update base font size
    const baseSizes = {
      small: '14px',
      medium: '16px',
      large: '18px'
    };
    
    this.root.style.fontSize = baseSizes[fontSize] || '16px';
  }

  private applyAccessibilitySettings(theme: ThemeConfig): void {
    // Reduced motion
    if (theme.reducedMotion) {
      this.root.classList.add('reduce-motion');
      this.root.style.setProperty('--transition-duration', '0ms');
      this.root.style.setProperty('--animation-duration', '0ms');
    } else {
      this.root.classList.remove('reduce-motion');
      this.root.style.setProperty('--transition-duration', '200ms');
      this.root.style.setProperty('--animation-duration', '300ms');
    }
    
    // High contrast
    if (theme.highContrast) {
      this.root.classList.add('high-contrast');
      this.root.style.setProperty('--contrast-multiplier', '1.5');
    } else {
      this.root.classList.remove('high-contrast');
      this.root.style.setProperty('--contrast-multiplier', '1');
    }
    
    // Animations
    this.root.classList.toggle('animations-disabled', !theme.animations);
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

  private generateColorVariations(name: string, baseColor: string): void {
    // Generate lighter and darker variations
    const variations = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
    
    variations.forEach(level => {
      const variation = this.adjustColorBrightness(baseColor, level);
      this.root.style.setProperty(`--color-${name}-${level}`, variation);
    });
  }

  private adjustColorBrightness(color: string, level: number): string {
    // Simple brightness adjustment algorithm
    const rgb = this.hexToRgb(color);
    if (!rgb) return color;
    
    // Map level (50-900) to brightness factor (-0.8 to 0.8)
    const factor = (level - 500) / 500;
    
    const adjust = (value: number) => {
      if (factor > 0) {
        return Math.round(value + (255 - value) * factor);
      } else {
        return Math.round(value * (1 + factor));
      }
    };
    
    const r = adjust(rgb.r);
    const g = adjust(rgb.g);
    const b = adjust(rgb.b);
    
    return `#${[r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')}`;
  }

  private saveTheme(theme: ThemeConfig): void {
    localStorage.setItem('maifarm-theme-config', JSON.stringify(theme));
  }

  loadTheme(): ThemeConfig {
    const saved = localStorage.getItem('maifarm-theme-config');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return this.defaultTheme;
      }
    }
    return this.defaultTheme;
  }

  resetToDefaults(): void {
    this.applyTheme(this.defaultTheme);
  }

  getDefaultTheme(): ThemeConfig {
    return { ...this.defaultTheme };
  }

  // Listen for system theme changes
  watchSystemTheme(callback: (isDark: boolean) => void): () => void {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => callback(e.matches);
    
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }
}

export const themeEngine = new ThemeEngine();