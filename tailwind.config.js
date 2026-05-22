/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        jarvis: {
          bg: '#090909',
          accent: 'var(--accent, #00D4FF)',
          text: '#F0F0F0',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        card: '16px',
        btn: '12px',
        pill: '999px',
      },
      boxShadow: {
        glow: '0 0 20px rgba(0, 212, 255, 0.15)',
        'glow-strong': '0 0 24px rgba(0, 212, 255, 0.35)',
      },
      backdropBlur: {
        glass: '12px',
      },
    },
  },
  plugins: [],
};
