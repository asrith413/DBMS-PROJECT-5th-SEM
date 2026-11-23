/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#040b14',
          900: '#07111f',
          850: '#0a1728',
          800: '#0d1c30',
          750: '#11243b',
          700: '#17304b',
        },
        cyan: {
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
        },
      },
      boxShadow: {
        panel: '0 18px 40px rgba(0, 0, 0, 0.18)',
        focus: '0 0 0 3px rgba(34, 211, 238, 0.16)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
}
