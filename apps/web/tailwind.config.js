/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Verde de campo — a voz principal.
        campo: {
          50: '#EEF5EE',
          100: '#D8EBDB',
          200: '#AFD5B7',
          300: '#7EBB8D',
          400: '#4CAE7A',
          500: '#2E8B54',
          600: '#1F6B42',
          700: '#175230',
          800: '#123F26',
          900: '#0B2917',
        },
        // Superfícies — off-white morno com viés verde, "cal sobre grama".
        gramado: {
          bg: '#EFF3EA',
          raised: '#FFFFFF',
          sunk: '#E5EBDD',
          dark: '#0C1A12',
        },
        // Tinta — preto-verde, nunca #000.
        tinta: {
          DEFAULT: '#16211B',
          soft: '#46564D',
          faint: '#6E7E72',
          line: '#CBD7C4',
        },
        // Ouro — segunda voz: destaque, troféu, placar aceso.
        ouro: {
          100: '#F7ECD4',
          300: '#EFC873',
          500: '#DFA129',
          600: '#B87E17',
          700: '#8A5D12',
        },
        // Barro — perigo / desistência.
        barro: {
          100: '#F1DFD8',
          500: '#B24F30',
          600: '#8E3D24',
        },
      },
      fontFamily: {
        display: ['"Barlow Condensed"', '"Barlow"', 'system-ui', 'sans-serif'],
        sans: ['"Barlow"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      letterSpacing: {
        eyebrow: '0.14em',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      boxShadow: {
        raise: '0 1px 2px rgba(11,41,23,.06), 0 10px 28px -12px rgba(11,41,23,.14)',
        pop: '0 2px 6px rgba(11,41,23,.08), 0 18px 40px -16px rgba(11,41,23,.28)',
        scoreboard: 'inset 0 2px 10px rgba(0,0,0,.55), 0 1px 0 rgba(255,255,255,.05)',
      },
      backgroundImage: {
        // Grama recém-cortada — faixas diagonais bem sutis.
        gramada:
          'repeating-linear-gradient(118deg, rgba(31,107,66,.05) 0 44px, rgba(31,107,66,0) 44px 88px)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up .28s ease-out both',
      },
    },
  },
  plugins: [],
};
