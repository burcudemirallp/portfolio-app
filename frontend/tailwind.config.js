/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bnc: {
          bg: '#0B0E11',
          surface: '#1E2329',
          surfaceAlt: '#2B3139',
          border: '#2B3139',
          accent: '#F0B90B',
          accentHover: '#D4A40A',
          green: '#0ECB81',
          red: '#F6465D',
          textPri: '#EAECEF',
          textSec: '#B7BDC6',
          textTer: '#848E9C',
        },
      },
    },
  },
  plugins: [],
}
