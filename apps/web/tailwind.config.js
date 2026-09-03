/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Ouro do brasão — a voz principal (era o verde de campo).
        campo: {
          50: '#FBF6E8',
          100: '#F4E8C6',
          200: '#E9D399',
          300: '#DEBB63',
          400: '#CFA13C',
          500: '#B78628',
          600: '#946A1D',
          700: '#6E4F16',
          800: '#4A3510',
          900: '#2C1F09',
        },
        // Verde de grama — segunda voz: confirmado, presença, "em campo".
        grama: {
          50: '#EEF5EE',
          100: '#DBEBDD',
          200: '#B4D3B9',
          300: '#82B98E',
          400: '#4FA173',
          500: '#3B8659',
          600: '#2C6845',
          700: '#215033',
          800: '#173A25',
          900: '#0E2617',
        },
        // Noite — preto morno do brasão, para o chrome (topo, nav, placar).
        noite: {
          DEFAULT: '#15110A',
          raised: '#221C12',
          line: '#3A3020',
        },
        // Superfícies — creme morno, "cal sobre a mesa".
        gramado: {
          bg: '#F5F0E4',
          raised: '#FFFDF7',
          sunk: '#EBE3D1',
          dark: '#15110A',
        },
        // Tinta — marrom-café bem escuro, nunca #000.
        tinta: {
          DEFAULT: '#221C10',
          soft: '#5B5240',
          faint: '#8A7E64',
          line: '#E4DBC5',
        },
        // Ouro aceso — brilho sobre superfícies escuras (placar, estrelas, troféu).
        ouro: {
          100: '#F8EFD3',
          200: '#F0DDA6',
          300: '#E7C158',
          400: '#DCAE3A',
          500: '#C6902B',
          600: '#9E7020',
          700: '#6E4E15',
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
        raise: '0 1px 2px rgba(30,22,6,.06), 0 10px 28px -12px rgba(30,22,6,.16)',
        pop: '0 2px 6px rgba(30,22,6,.09), 0 18px 40px -16px rgba(30,22,6,.30)',
        scoreboard: 'inset 0 2px 10px rgba(0,0,0,.55), 0 1px 0 rgba(255,255,255,.05)',
        ouro: '0 8px 22px -10px rgba(183,134,40,.55)',
      },
      backgroundImage: {
        // Textura sutil de fundo — fios de ouro bem discretos.
        gramada:
          'repeating-linear-gradient(118deg, rgba(120,92,28,.045) 0 46px, rgba(120,92,28,0) 46px 92px)',
        // Brilho dourado no topo dos painéis escuros.
        brasao:
          'radial-gradient(120% 120% at 50% -10%, rgba(231,193,88,.16) 0%, rgba(231,193,88,0) 62%)',
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
