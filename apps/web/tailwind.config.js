/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        campo: {
          50: '#EDF6EF',
          100: '#D9EDDD',
          200: '#B3DBBD',
          400: '#4CAE7A',
          600: '#1F6B42',
          700: '#175232',
          900: '#0E2E1D',
        },
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
