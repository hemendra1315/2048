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
        obsidian: {
          950: '#0A0A0A',
          900: '#111111',
          850: '#171717',
          800: '#222222',
          700: '#262626',
          600: '#383838',
          400: '#A1A1AA',
          200: '#E4E4E7',
        },
        vault: {
          50: '#f6f7f9',
          100: '#edeef2',
          200: '#d7dbe2',
          300: '#b4bccb',
          400: '#8c98af',
          500: '#6f7c97',
          600: '#58637c',
          700: '#262626',
          800: '#1e222c',
          900: '#111111',
          950: '#0A0A0A',
        },
        emerald: {
          DEFAULT: '#10B981',
          500: '#10B981',
          400: '#34D399',
          600: '#059669',
        },
        arcade: {
          gold: '#10b981',
          neon: '#06b6d4',
          emerald: '#10b981',
          rose: '#ef4444',
          amber: '#f59e0b',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'slide-up': 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'pulse-subtle': 'pulseSubtle 2s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
      },
    },
  },
  plugins: [],
}
