/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'neon-yellow': '#DFFF00',
        'neon-yellow-dim': '#B3CC00',
        'neon-yellow-bright': '#F0FF4D',
        'dark-bg': '#0D0D0D',
        'dark-surface': '#1A1A1A',
        'dark-surface-light': '#262626',
        'dark-border': '#333333',
        'text-primary': '#FFFFFF',
        'text-secondary': '#A0A0A0',
        'text-muted': '#666666',
        'error': '#FF4444',
        'success': '#44FF44',
        'warning': '#FFAA00',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', 'monospace'],
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'scan-line': 'scan-line 1.5s ease-in-out infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(223, 255, 0, 0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(223, 255, 0, 0.6)' },
        },
        'scan-line': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
      },
    },
  },
  plugins: [],
}

