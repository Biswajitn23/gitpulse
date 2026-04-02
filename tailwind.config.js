/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        glow: '0 0 20px rgba(16, 185, 129, 0.35), 0 0 40px rgba(16, 185, 129, 0.12)',
        danger: '0 0 18px rgba(248, 113, 113, 0.35), 0 0 36px rgba(248, 113, 113, 0.12)',
      },
      backgroundImage: {
        'grid-radial': 'radial-gradient(circle at top, rgba(16, 185, 129, 0.18), transparent 35%)',
      },
    },
  },
  plugins: [],
};