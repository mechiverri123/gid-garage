/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Barlow', 'system-ui', 'sans-serif'],
      },
      colors: {
        dark: '#0f0f0f',
        light: '#fafafa',
      },
    },
  },
  plugins: [],
};
