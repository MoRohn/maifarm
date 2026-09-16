import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ColorScheme, COLOR_SCHEMES } from '@/types/theme'
import { themeService } from '@/services/themeService'

// FIX: Helper to get effective theme based on system preference
const getEffectiveTheme = (theme: 'light' | 'dark' | 'system'): 'light' | 'dark' => {
  if (theme === 'system') {
    // Respect system preference when 'system' is selected
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark'; // Default to dark for SSR
  }
  return theme;
};

interface ThemeState {
  theme: 'light' | 'dark' | 'system'
  colorScheme: ColorScheme
  primaryColor: string
  accentColor: string
  animations: boolean
  reduceMotion: boolean
  pendingColorScheme: ColorScheme | null
  hasUnsavedChanges: boolean
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  setColorScheme: (scheme: ColorScheme) => void
  setPendingColorScheme: (scheme: ColorScheme) => void
  setPrimaryColor: (color: string) => void
  setAccentColor: (color: string) => void
  setAnimations: (enabled: boolean) => void
  setReduceMotion: (enabled: boolean) => void
  applyTheme: () => void
  saveChanges: () => Promise<void>
  discardChanges: () => void
  resetToDefault: () => Promise<void>
  hydrateFromServer: () => Promise<void>
  persistTheme: () => Promise<void>
}

const defaultColorScheme = COLOR_SCHEMES.find(s => s.id === 'forest-walk') || COLOR_SCHEMES[0];

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      colorScheme: defaultColorScheme,
      primaryColor: defaultColorScheme.primary,
      accentColor: defaultColorScheme.accent,
      animations: true,
      reduceMotion: false,
      pendingColorScheme: null,
      hasUnsavedChanges: false,
      
      setTheme: (theme) => {
        set({ theme });
        const state = get();
        // FIX: Respect system theme preference when 'system' is selected
        const effectiveTheme = getEffectiveTheme(theme);

        // Update class immediately
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(effectiveTheme);

        themeService.applyColorScheme(state.colorScheme, effectiveTheme);
        void get().persistTheme();
      },
      
      setColorScheme: (scheme) => {
        set({
          colorScheme: scheme,
          primaryColor: scheme.primary,
          accentColor: scheme.accent
        });
        // FIX: Respect system theme preference
        const effectiveTheme = getEffectiveTheme(get().theme);
        themeService.applyColorScheme(scheme, effectiveTheme);
        void get().persistTheme();
      },
      
      setPendingColorScheme: (scheme) => {
        set({ 
          pendingColorScheme: scheme,
          hasUnsavedChanges: true
        });
      },
      
      setPrimaryColor: (color) => {
        set({ primaryColor: color, hasUnsavedChanges: true });
      },

      setAccentColor: (color) => {
        set({ accentColor: color, hasUnsavedChanges: true });
      },

      setAnimations: (enabled) => {
        set({ animations: enabled });
        document.documentElement.classList.toggle('no-animations', !enabled);
        void get().persistTheme();
      },
      
      setReduceMotion: (enabled) => {
        set({ reduceMotion: enabled });
        document.documentElement.classList.toggle('reduce-motion', enabled);
        void get().persistTheme();
      },
      
      applyTheme: () => {
        const state = get();
        // FIX: Respect system theme preference
        const effectiveTheme = getEffectiveTheme(state.theme);
        themeService.applyColorScheme(state.colorScheme, effectiveTheme);
      },
      
      saveChanges: async () => {
        const state = get();
        // FIX: Respect system theme preference
        const effectiveTheme = getEffectiveTheme(state.theme);

        if (state.pendingColorScheme) {
          const customScheme: ColorScheme = {
            ...state.pendingColorScheme,
            primary: state.primaryColor,
            accent: state.accentColor
          };
          set({
            colorScheme: customScheme,
            pendingColorScheme: null,
            hasUnsavedChanges: false
          });
          themeService.applyColorScheme(customScheme, effectiveTheme);
        } else if (state.hasUnsavedChanges) {
          const customScheme: ColorScheme = {
            id: 'custom',
            name: 'Custom',
            primary: state.primaryColor,
            accent: state.accentColor
          };
          set({
            colorScheme: customScheme,
            hasUnsavedChanges: false
          });
          themeService.applyColorScheme(customScheme, effectiveTheme);
        }
        await get().persistTheme();
      },
      
      discardChanges: () => {
        const state = get();
        set({ 
          pendingColorScheme: null,
          primaryColor: state.colorScheme.primary,
          accentColor: state.colorScheme.accent,
          hasUnsavedChanges: false
        });
      },
      
      resetToDefault: async () => {
        set({
          colorScheme: defaultColorScheme,
          primaryColor: defaultColorScheme.primary,
          accentColor: defaultColorScheme.accent,
          pendingColorScheme: null,
          hasUnsavedChanges: false
        });
        themeService.resetToDefault();
        await get().persistTheme();
      },

      hydrateFromServer: async () => {
        try {
          const response = await fetch('/api/settings');
          if (!response.ok) {
            throw new Error('Failed to load theme settings');
          }
          const data = await response.json();
          const themeSettings = data?.settings?.theme;
          if (!themeSettings) {
            return;
          }

          const {
            theme,
            colorScheme,
            primaryColor,
            accentColor,
            animations,
            reduceMotion,
          } = themeSettings;

          const scheme: ColorScheme = {
            id: colorScheme?.id || defaultColorScheme.id,
            name: colorScheme?.name || defaultColorScheme.name,
            primary: primaryColor || colorScheme?.primary || defaultColorScheme.primary,
            accent: accentColor || colorScheme?.accent || defaultColorScheme.accent,
            primaryRGB: colorScheme?.primaryRGB,
            accentRGB: colorScheme?.accentRGB,
          };

          // FIX: Respect system theme preference
          const effectiveTheme = getEffectiveTheme(theme || 'dark');

          set({
            theme: theme || 'dark',
            colorScheme: scheme,
            primaryColor: scheme.primary,
            accentColor: scheme.accent,
            animations: animations ?? true,
            reduceMotion: reduceMotion ?? false,
            pendingColorScheme: null,
            hasUnsavedChanges: false,
          });

          themeService.applyColorScheme(scheme, effectiveTheme);
        } catch (error) {
          console.error('[ThemeStore] Failed to hydrate theme settings:', error);
        }
      },

      persistTheme: async () => {
        const state = get();
        try {
          const payload = {
            theme: state.theme,
            colorScheme: {
              id: state.colorScheme.id,
              name: state.colorScheme.name,
              primary: state.primaryColor,
              accent: state.accentColor,
            },
            primaryColor: state.primaryColor,
            accentColor: state.accentColor,
            animations: state.animations,
            reduceMotion: state.reduceMotion,
          };

          await fetch('/api/settings/theme', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: payload }),
          });
        } catch (error) {
          console.error('[ThemeStore] Failed to persist theme settings:', error);
        }
      }
    }),
    {
      name: 'maifarm-theme',
      onRehydrateStorage: () => (state) => {
        // Theme is already applied by index.html script
        // Only update if there's a mismatch (e.g., user changed theme in another tab)
        if (state) {
          const currentThemeClass = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
          // FIX: Respect system theme preference
          const expectedTheme = getEffectiveTheme(state.theme);

          // Only re-apply if there's a mismatch
          if (currentThemeClass !== expectedTheme) {
            themeService.applyColorScheme(state.colorScheme, expectedTheme);
          }
        }
      }
    }
  )
)
