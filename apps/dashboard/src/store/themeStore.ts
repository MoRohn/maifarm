import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ColorScheme, COLOR_SCHEMES } from '@/types/theme'
import { themeService } from '@/services/themeService'

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
  saveChanges: () => void
  discardChanges: () => void
  resetToDefault: () => void
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
        themeService.applyColorScheme(state.colorScheme, theme === 'system' ? 'dark' : theme);
      },
      
      setColorScheme: (scheme) => {
        set({ 
          colorScheme: scheme,
          primaryColor: scheme.primary,
          accentColor: scheme.accent
        });
        const effectiveTheme = get().theme === 'system' 
          ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
          : get().theme;
        themeService.applyColorScheme(scheme, effectiveTheme as 'light' | 'dark');
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
      },
      
      setReduceMotion: (enabled) => {
        set({ reduceMotion: enabled });
        document.documentElement.classList.toggle('reduce-motion', enabled);
      },
      
      applyTheme: () => {
        const state = get();
        themeService.applyColorScheme(state.colorScheme, state.theme === 'system' ? 'dark' : state.theme);
      },
      
      saveChanges: () => {
        const state = get();
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
          themeService.applyColorScheme(customScheme, state.theme === 'system' ? 'dark' : state.theme);
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
          themeService.applyColorScheme(customScheme, state.theme === 'system' ? 'dark' : state.theme);
        }
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
      
      resetToDefault: () => {
        set({
          colorScheme: defaultColorScheme,
          primaryColor: defaultColorScheme.primary,
          accentColor: defaultColorScheme.accent,
          pendingColorScheme: null,
          hasUnsavedChanges: false
        });
        themeService.resetToDefault();
      }
    }),
    {
      name: 'maifarm-theme',
      onRehydrateStorage: () => (state) => {
        // Apply saved theme on app load
        if (state) {
          themeService.applyColorScheme(state.colorScheme, state.theme === 'system' ? 'dark' : state.theme);
        }
      }
    }
  )
)