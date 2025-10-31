export interface ColorScheme {
  id: string;
  name: string;
  primary: string;
  accent: string;
  primaryRGB?: string;
  accentRGB?: string;
}

export interface ThemeColors {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  accent: string;
  accentDark: string;
  accentLight: string;
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  border: string;
  error: string;
  warning: string;
  success: string;
  info: string;
}

export interface ThemeConfig {
  mode: 'light' | 'dark' | 'system';
  colorScheme: ColorScheme;
  colors: ThemeColors;
  animations: boolean;
  reduceMotion: boolean;
  fontSize: 'small' | 'medium' | 'large';
  borderRadius: 'none' | 'small' | 'medium' | 'large';
}

export const COLOR_SCHEMES: ColorScheme[] = [
  {
    id: 'purple-dreams',
    name: 'Purple Dreams',
    primary: '#8B5CF6',
    accent: '#EC4899',
    primaryRGB: '139, 92, 246',
    accentRGB: '236, 72, 153'
  },
  {
    id: 'ocean-breeze',
    name: 'Ocean Breeze',
    primary: '#0EA5E9',
    accent: '#14B8A6',
    primaryRGB: '14, 165, 233',
    accentRGB: '20, 184, 166'
  },
  {
    id: 'forest-walk',
    name: 'Forest Walk',
    primary: '#10B981',
    accent: '#84CC16',
    primaryRGB: '16, 185, 129',
    accentRGB: '132, 204, 22'
  },
  {
    id: 'sunset-glow',
    name: 'Sunset Glow',
    primary: '#F97316',
    accent: '#F59E0B',
    primaryRGB: '249, 115, 22',
    accentRGB: '245, 158, 11'
  },
  {
    id: 'cherry-blossom',
    name: 'Cherry Blossom',
    primary: '#EC4899',
    accent: '#F472B6',
    primaryRGB: '236, 72, 153',
    accentRGB: '244, 114, 182'
  },
  {
    id: 'midnight-blue',
    name: 'Midnight Blue',
    primary: '#3B82F6',
    accent: '#6366F1',
    primaryRGB: '59, 130, 246',
    accentRGB: '99, 102, 241'
  },
  {
    id: 'autumn-harvest',
    name: 'Autumn Harvest',
    primary: '#DC2626',
    accent: '#EA580C',
    primaryRGB: '220, 38, 38',
    accentRGB: '234, 88, 12'
  },
  {
    id: 'cosmic-purple',
    name: 'Cosmic Purple',
    primary: '#9333EA',
    accent: '#A855F7',
    primaryRGB: '147, 51, 234',
    accentRGB: '168, 85, 247'
  }
];

export function hexToRGB(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    const r = parseInt(result[1], 16);
    const g = parseInt(result[2], 16);
    const b = parseInt(result[3], 16);
    return `${r}, ${g}, ${b}`;
  }
  return '0, 0, 0';
}

export function generateColorVariants(hex: string): {
  base: string;
  dark: string;
  light: string;
} {
  // Convert hex to RGB
  const rgb = hexToRGB(hex).split(', ').map(Number);
  
  // Generate darker variant (20% darker)
  const dark = rgb.map(val => Math.max(0, Math.floor(val * 0.8)));
  const darkHex = `#${dark.map(val => val.toString(16).padStart(2, '0')).join('')}`;
  
  // Generate lighter variant (20% lighter)
  const light = rgb.map(val => Math.min(255, Math.floor(val * 1.2 + 25)));
  const lightHex = `#${light.map(val => val.toString(16).padStart(2, '0')).join('')}`;
  
  return {
    base: hex,
    dark: darkHex,
    light: lightHex
  };
}