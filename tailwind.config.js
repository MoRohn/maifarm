/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // CSS variable based colors for theming
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
        // Apple-inspired colors
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
        // Farm theme colors
        'farm-green': '#4A7C4E',
        'farm-brown': '#8B6F47',
        'farm-soil': '#6B4423',
        'farm-sky': '#87CEEB',
        'farm-sun': '#FFD700',
        // Quick Actions colors
        'leaf': {
          100: '#dcfce7',
          400: '#4ade80',
          600: '#16a34a',
          800: '#166534',
          900: '#14532d',
        },
        'harvest': {
          100: '#fed7aa',
          400: '#fb923c',
          600: '#ea580c',
          800: '#9a3412',
          900: '#7c2d12',
        },
        'sky': {
          100: '#e0f2fe',
          400: '#38bdf8',
          600: '#0284c7',
          800: '#075985',
          900: '#0c4a6e',
        },
      },
      borderRadius: {
        'apple': '0.5rem',
        'apple-lg': '0.75rem',
        'apple-xl': '1rem',
        'apple-2xl': '1.25rem',
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        'apple': '0 4px 15px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04)',
        'apple-sm': '0 2px 8px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.03)',
        'apple-lg': '0 8px 30px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.04)',
        'apple-inner': 'inset 0 1px 3px rgba(0, 0, 0, 0.06)',
        'glass': '0 8px 32px rgba(0, 0, 0, 0.08)',
        'glass-dark': '0 8px 32px rgba(0, 0, 0, 0.3)',
      },
      fontFamily: {
        'system': ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
      transitionTimingFunction: {
        'apple': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'bounce-in': 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
      },
      backdropBlur: {
        'apple': '20px',
        'glass': '12px',
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
    },
  },
  plugins: [],
}