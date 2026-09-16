import { ColorScheme, ThemeColors, generateColorVariants, hexToRGB } from '@/types/theme';

export class ThemeService {
  private static instance: ThemeService;
  private currentScheme: ColorScheme | null = null;

  private constructor() {}

  static getInstance(): ThemeService {
    if (!ThemeService.instance) {
      ThemeService.instance = new ThemeService();
    }
    return ThemeService.instance;
  }

  applyColorScheme(scheme: ColorScheme, mode: 'light' | 'dark' = 'dark'): void {
    this.currentScheme = scheme;
    const colors = this.generateThemeColors(scheme, mode);
    this.applyColorsToDOM(colors, scheme);
    this.updateTailwindConfig(scheme);
    this.saveToLocalStorage(scheme);

    // Force a synchronous style recalculation to prevent flash
    // This ensures CSS variables are applied immediately
    void document.documentElement.offsetHeight;
  }

  private generateThemeColors(scheme: ColorScheme, mode: 'light' | 'dark'): ThemeColors {
    const primaryVariants = generateColorVariants(scheme.primary);
    const accentVariants = generateColorVariants(scheme.accent);

    if (mode === 'dark') {
      return {
        primary: primaryVariants.base,
        primaryDark: primaryVariants.dark,
        primaryLight: primaryVariants.light,
        accent: accentVariants.base,
        accentDark: accentVariants.dark,
        accentLight: accentVariants.light,
        background: '#0a0a0a',
        surface: '#1a1a1a',
        text: '#ffffff',
        textSecondary: '#a3a3a3',
        border: '#2a2a2a',
        error: '#ef4444',
        warning: '#f59e0b',
        success: '#10b981',
        info: '#3b82f6'
      };
    } else {
      return {
        primary: primaryVariants.base,
        primaryDark: primaryVariants.dark,
        primaryLight: primaryVariants.light,
        accent: accentVariants.base,
        accentDark: accentVariants.dark,
        accentLight: accentVariants.light,
        background: '#ffffff',
        surface: '#f9fafb',
        text: '#111827',
        textSecondary: '#6b7280',
        border: '#e5e7eb',
        error: '#dc2626',
        warning: '#d97706',
        success: '#059669',
        info: '#2563eb'
      };
    }
  }

  private applyColorsToDOM(colors: ThemeColors, scheme: ColorScheme): void {
    const root = document.documentElement;

    // Apply CSS variables
    root.style.setProperty('--color-primary', colors.primary);
    root.style.setProperty('--color-primary-dark', colors.primaryDark);
    root.style.setProperty('--color-primary-light', colors.primaryLight);
    root.style.setProperty('--color-primary-rgb', scheme.primaryRGB || hexToRGB(scheme.primary));

    root.style.setProperty('--color-accent', colors.accent);
    root.style.setProperty('--color-accent-dark', colors.accentDark);
    root.style.setProperty('--color-accent-light', colors.accentLight);
    root.style.setProperty('--color-accent-rgb', scheme.accentRGB || hexToRGB(scheme.accent));

    root.style.setProperty('--color-background', colors.background);
    root.style.setProperty('--color-surface', colors.surface);
    root.style.setProperty('--color-text', colors.text);
    root.style.setProperty('--color-text-secondary', colors.textSecondary);
    root.style.setProperty('--color-border', colors.border);

    root.style.setProperty('--color-error', colors.error);
    root.style.setProperty('--color-warning', colors.warning);
    root.style.setProperty('--color-success', colors.success);
    root.style.setProperty('--color-info', colors.info);

    // Update meta theme-color for mobile browsers
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', colors.primary);
    }

    // Force style recalculation to ensure colors are applied immediately
    // This prevents color flash by ensuring all CSS variables are set before any paint
    void root.offsetHeight;
  }

  private updateTailwindConfig(scheme: ColorScheme): void {
    // Dynamically update Tailwind classes by adding a data attribute
    document.documentElement.setAttribute('data-theme', scheme.id);
  }

  private saveToLocalStorage(scheme: ColorScheme): void {
    localStorage.setItem('maifarm-color-scheme', JSON.stringify(scheme));
  }

  loadSavedScheme(): ColorScheme | null {
    const saved = localStorage.getItem('maifarm-color-scheme');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    return null;
  }

  getCurrentScheme(): ColorScheme | null {
    return this.currentScheme;
  }

  updateLogoColor(primaryColor: string): void {
    // This will be called when logos are manually created with different colors
    const logoElement = document.querySelector('.maifarm-logo') as HTMLImageElement;
    if (logoElement) {
      const mode = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
      const colorId = this.currentScheme?.id || 'default';
      logoElement.src = `/maifarm-logo-${colorId}-${mode}.svg`;
    }
  }

  resetToDefault(): void {
    localStorage.removeItem('maifarm-color-scheme');
    const root = document.documentElement;
    root.removeAttribute('data-theme');
    
    // Reset to default green colors
    root.style.setProperty('--color-primary', '#10B981');
    root.style.setProperty('--color-primary-rgb', '16, 185, 129');
    root.style.setProperty('--color-accent', '#84CC16');
    root.style.setProperty('--color-accent-rgb', '132, 204, 22');
  }
}

export const themeService = ThemeService.getInstance();