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
        // Apple-inspired color palette
        'apple-gray': {
          50: '#fafafa',
          100: '#f5f5f7',
          200: '#e8e8ed',
          300: '#d2d2d7',
          400: '#a1a1aa',
          500: '#86868b',
          600: '#515154',
          700: '#3e3e41',
          800: '#1d1d1f',
          900: '#141414',
          950: '#000000',
        },
        'apple-blue': {
          light: '#0071e3',
          DEFAULT: '#0066cc',
          dark: '#004c99',
        },
        'apple-green': {
          light: '#34c759',
          DEFAULT: '#28a745',
          dark: '#1c7430',
        },
        'apple-red': {
          light: '#ff453a',
          DEFAULT: '#ff3b30',
          dark: '#d70015',
        },
        'apple-yellow': {
          light: '#ffcc00',
          DEFAULT: '#f7b500',
          dark: '#e5a200',
        },
        'apple-purple': {
          light: '#af52de',
          DEFAULT: '#a550df',
          dark: '#7d35b2',
        },
        'maifarm': {
          primary: '#0066cc',
          secondary: '#34c759',
          accent: '#af52de',
          warning: '#ffcc00',
          danger: '#ff3b30',
        }
      },
      fontFamily: {
        'system': ['-apple-system', 'BlinkMacSystemFont', 'Inter', 'system-ui', 'sans-serif'],
        'mono': ['SF Mono', 'Monaco', 'Consolas', 'monospace'],
      },
      fontSize: {
        'xxs': '0.625rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'spin-slow': 'spin 3s linear infinite',
        'bounce-soft': 'bounceSoft 2s ease-in-out infinite',
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
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        bounceSoft: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' },
        },
      },
      backdropBlur: {
        'xs': '2px',
      },
      boxShadow: {
        'apple': '0 10px 30px -5px rgba(0, 0, 0, 0.3)',
        'apple-sm': '0 4px 15px -2px rgba(0, 0, 0, 0.2)',
        'apple-lg': '0 20px 40px -10px rgba(0, 0, 0, 0.3)',
        'glow': '0 0 20px rgba(0, 102, 204, 0.3)',
        'glow-sm': '0 0 10px rgba(0, 102, 204, 0.2)',
      },
      borderRadius: {
        'apple': '0.5rem',
        'apple-lg': '1rem',
      },
      transitionTimingFunction: {
        'apple': 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
}