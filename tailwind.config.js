/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        coral: '#FF6B6B',
        gold: '#E2B94C',
        background: '#F5F6F8',
        'text-dark': '#333333',
        'text-light': '#777777',
      },
      fontFamily: {
        script: ['"Dancing Script"', 'cursive'],
        sans: ['Inter', 'sans-serif'],
      },
      borderRadius: {
        'xl': '1rem',
        '2xl': '1.5rem',
      },
      boxShadow: {
        'soft': '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
        'soft-hover': '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
      }
    },
  },
  plugins: [],
}
