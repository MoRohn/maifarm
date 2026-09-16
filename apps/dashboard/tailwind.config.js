import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, 'src/**/*.{js,ts,jsx,tsx}')
  ],
  safelist: [
    // Gradient from classes for QuickActions cards (Mode colors: Quick=green/leaf, Farm=navy, GoWild=burnt orange)
    'from-leaf-400', 'from-navy-400', 'from-burnt-400',
    // Gradient to classes
    'to-leaf-800', 'to-navy-800', 'to-burnt-800',
    // Text colors for accent classes
    'text-leaf-600', 'text-navy-600', 'text-burnt-600',
    // Background colors for accent classes
    'bg-leaf-100', 'bg-navy-100', 'bg-burnt-100',
    // Dark mode text variants (explicitly listed to avoid regex matching issues)
    'dark:text-leaf-400', 'dark:text-navy-400', 'dark:text-burnt-400',
    // Dark mode background variants with opacity
    'dark:bg-leaf-900/30', 'dark:bg-navy-900/30', 'dark:bg-burnt-900/30',
    // Legacy support for existing sky/harvest references
    'from-sky-400', 'from-harvest-400', 'to-sky-800', 'to-harvest-800',
    'text-sky-600', 'text-harvest-600', 'bg-sky-100', 'bg-harvest-100',
  ],
  darkMode: 'class',
  theme: {
    // Apple device breakpoints - comprehensive coverage
    screens: {
      'iphone-se': '320px',     // iPhone SE 1st gen
      'iphone': '375px',        // iPhone X/11/12/13 Mini, iPhone SE 2nd/3rd gen
      'iphone-12': '390px',     // iPhone 12/13/14 standard
      'iphone-plus': '414px',   // iPhone Plus models
      'iphone-14-pro': '430px', // iPhone 14 Pro Max
      'sm': '640px',            // Small tablets
      'ipad-mini': '744px',     // iPad Mini portrait
      'ipad': '768px',          // iPad standard portrait
      'md': '768px',
      'ipad-11': '834px',       // iPad Pro 11" portrait
      'ipad-pro': '1024px',     // iPad Pro landscape / desktop start
      'lg': '1024px',
      'ipad-pro-lg': '1194px',  // iPad Pro 12.9"
      'xl': '1280px',           // Laptops
      'macbook': '1440px',      // MacBook Pro
      '2xl': '1536px',
      'imac': '1920px',         // iMac
      'imac-5k': '2560px',      // iMac 5K
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        'apple-blue': {
          DEFAULT: '#007AFF',
          light: '#5AC8FA',
          dark: '#0051D5',
        },
        'apple-green': {
          DEFAULT: '#34C759',
          light: '#4CD964',
          dark: '#2CA24C',
        },
        'apple-red': {
          DEFAULT: '#FF3B30',
          light: '#FF6961',
          dark: '#D70015',
        },
        'apple-yellow': {
          DEFAULT: '#FFCC00',
          light: '#FFD60A',
          dark: '#FFC107',
        },
        'apple-purple': {
          DEFAULT: '#AF52DE',
          light: '#BF5AF2',
          dark: '#8944AB',
        },
        'apple-orange': {
          DEFAULT: '#FF9500',
          light: '#FFA73B',
          dark: '#E67E00',
        },
        'apple-gray': {
          50: '#F9FAFB',
          100: '#F2F2F7',
          200: '#E5E5EA',
          300: '#D1D1D6',
          400: '#AEAEB2',
          500: '#8E8E93',
          600: '#636366',
          700: '#48484A',
          800: '#3A3A3C',
          900: '#2C2C2E',
          950: '#1C1C1E',
        },
        'farm-green': '#4A7C4E',
        'farm-brown': '#8B6F47',
        'farm-soil': '#6B4423',
        'farm-sky': '#87CEEB',
        'farm-sun': '#FFD700',
        leaf: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
          950: '#052e16',
        },
        harvest: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
          950: '#431407',
        },
        soil: {
          50: '#fafaf9',
          100: '#f5f5f4',
          200: '#e7e5e4',
          300: '#d6d3d1',
          400: '#a8a29e',
          500: '#78716c',
          600: '#57534e',
          700: '#44403c',
          800: '#292524',
          900: '#1c1917',
          950: '#0c0a09',
        },
        sky: {
          100: '#e0f2fe',
          400: '#38bdf8',
          600: '#0284c7',
          800: '#075985',
          900: '#0c4a6e',
        },
        // Navy - Darker blue for New Farm mode
        navy: {
          50: '#f0f4ff',
          100: '#e0e9ff',
          200: '#c7d5fe',
          300: '#a4b8fc',
          400: '#7c93f8',
          500: '#5a6ef2',
          600: '#4149e6',
          700: '#3538cc',
          800: '#2d31a5',
          900: '#1e2066',
          950: '#151642',
        },
        // Burnt Orange - for Go Wild mode
        burnt: {
          50: '#fff8f1',
          100: '#feecdc',
          200: '#fcd5b8',
          300: '#f9b88a',
          400: '#f5925a',
          500: '#f17336',
          600: '#e25a1e',
          700: '#bc4518',
          800: '#96381a',
          900: '#793118',
          950: '#41160a',
        },
      },
      borderRadius: {
        apple: '0.5rem',
        'apple-lg': '0.75rem',
        'apple-xl': '1rem',
        'apple-2xl': '1.25rem',
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        apple: '0 4px 15px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04)',
        'apple-sm': '0 2px 8px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.03)',
        'apple-lg': '0 8px 30px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.04)',
        'apple-inner': 'inset 0 1px 3px rgba(0, 0, 0, 0.06)',
        glass: '0 8px 32px rgba(0, 0, 0, 0.08)',
        'glass-dark': '0 8px 32px rgba(0, 0, 0, 0.3)',
      },
      fontFamily: {
        system: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
      transitionTimingFunction: {
        apple: 'cubic-bezier(0.4, 0, 0.2, 1)',
        'bounce-in': 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
      },
      backdropBlur: {
        apple: '20px',
        glass: '12px',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'spin-slow': 'spin 3s linear infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'glass-gradient': 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0) 100%)',
      },
      // Minimum touch target sizes for Apple HIG compliance (44pt minimum)
      minHeight: {
        'touch': '44px',       // Apple HIG minimum touch target
        'touch-lg': '52px',    // Comfortable touch target
      },
      minWidth: {
        'touch': '44px',       // Apple HIG minimum touch target
        'touch-lg': '52px',    // Comfortable touch target
      },
      // Safe area insets for notched devices (iPhone X+)
      spacing: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-left': 'env(safe-area-inset-left)',
        'safe-right': 'env(safe-area-inset-right)',
      },
      // Padding with safe area support
      padding: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-left': 'env(safe-area-inset-left)',
        'safe-right': 'env(safe-area-inset-right)',
      },
      // Margin with safe area support
      margin: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-left': 'env(safe-area-inset-left)',
        'safe-right': 'env(safe-area-inset-right)',
      },
    },
  },
  plugins: [],
};
