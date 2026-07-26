/* eslint-disable global-require */
/* eslint-disable @typescript-eslint/no-var-requires */
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        background: 'var(--background)',
        button: 'var(--button)',
        sidebar: 'var(--sidebar)',
        orange: 'var(--orange)',
        buttonSidebar: 'var(--button-sidebar)',
        text1: 'var(--text1)',
        text2: 'var(--text2)',
      },
    },
  },
  // eslint-disable-next-line global-require
  plugins: [
    require('tailwindcss-animate'),
    require('@tailwindcss/forms')({ strategy: 'class' }),
  ],
};
