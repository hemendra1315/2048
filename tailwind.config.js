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
          950: '#050505',
          900: '#0C0D0F',
          850: '#131417',
          800: '#1B1D21',
          700: '#1E2025',
          600: '#2E3137',
          400: '#A7ABB3',
          200: '#E4E6E9',
        },
        // Neutral ramp of the redesign (AMOLED ground → text). 950 is the app background.
        vault: {
          50: '#F4F5F6',
          100: '#F4F5F6',
          200: '#D8DBE0',
          300: '#BDC1C8',
          400: '#A7ABB3',
          500: '#80858F',
          600: '#5A5F68',
          700: '#2E3137',
          750: '#25282D',
          800: '#1E2025',
          850: '#16181B',
          900: '#0C0D0F',
          950: '#050505',
        },
        cy: {
          DEFAULT: '#00E5FF',
        },
        gold: {
          DEFAULT: '#E3B341',
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
