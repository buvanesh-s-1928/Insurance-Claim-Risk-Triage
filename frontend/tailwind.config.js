/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        obsidian: {
          950: '#070a12',
          900: '#0b0f19',
          850: '#0e1524',
          800: '#111827',
          700: '#1e293b',
          600: '#334155',
        },
        indigo: {
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
        risk: {
          high: '#dc2626',
          'high-bg': '#fee2e2',
          'high-text': '#991b1b',
          med: '#d97706',
          'med-bg': '#fef3c7',
          'med-text': '#92400e',
          low: '#059669',
          'low-bg': '#d1fae5',
          'low-text': '#065f46',
        },
      },
      boxShadow: {
        'glass-panel': '0 12px 30px -8px rgba(15, 23, 42, 0.07), 0 4px 12px -2px rgba(15, 23, 42, 0.03), inset 0 1px 2px rgba(255, 255, 255, 0.95), inset 0 -2px 4px rgba(15, 23, 42, 0.02)',
        'clay-card': '0 14px 28px -6px rgba(15, 23, 42, 0.07), 0 4px 10px -2px rgba(15, 23, 42, 0.03), inset 0 2px 4px rgba(255, 255, 255, 0.95), inset 0 -3px 6px rgba(148, 163, 184, 0.12)',
        'clay-card-hover': '0 20px 36px -8px rgba(15, 23, 42, 0.11), inset 0 2px 4px rgba(255, 255, 255, 1)',
        'clay-btn': '0 8px 18px -4px rgba(79, 70, 229, 0.4), 0 3px 6px -1px rgba(79, 70, 229, 0.2), inset 0 2px 3px rgba(255, 255, 255, 0.45), inset 0 -3px 4px rgba(15, 23, 42, 0.25)',
        'clay-btn-hover': '0 12px 24px -4px rgba(79, 70, 229, 0.48), 0 4px 8px -1px rgba(79, 70, 229, 0.25), inset 0 2px 4px rgba(255, 255, 255, 0.5), inset 0 -3px 4px rgba(0, 0, 0, 0.25)',
        'clay-btn-active': '0 4px 8px -2px rgba(79, 70, 229, 0.3), inset 0 2px 3px rgba(0, 0, 0, 0.25), inset 0 -1px 2px rgba(255, 255, 255, 0.3)',
        'clay-inset': 'inset 2px 2px 4px rgba(15, 23, 42, 0.06), inset -2px -2px 4px rgba(255, 255, 255, 0.9)',
        'clay-badge-high': '0 6px 14px rgba(220, 38, 38, 0.35), inset 0 1.5px 2px rgba(255, 255, 255, 0.6), inset 0 -2.5px 3px rgba(0, 0, 0, 0.3)',
        'clay-badge-med': '0 6px 14px rgba(217, 119, 6, 0.3), inset 0 1.5px 2px rgba(255, 255, 255, 0.6), inset 0 -2.5px 3px rgba(0, 0, 0, 0.22)',
        'clay-badge-low': '0 6px 14px rgba(5, 150, 105, 0.28), inset 0 1.5px 2px rgba(255, 255, 255, 0.6), inset 0 -2.5px 3px rgba(0, 0, 0, 0.2)',
      },
    },
  },
  plugins: [],
};
