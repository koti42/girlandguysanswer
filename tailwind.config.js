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
        background: '#F4F6FA',
        'text-dark': '#333333',
        'text-light': '#777777',
        // Soru kartı / premium yüzey token'ları
        ink: '#202B3C',
        'ink-muted': '#778397',
        'brand-blue': '#3978E8',
        'brand-pink': '#E74798',
        line: '#E6EAF0',
        'blue-soft': '#EEF4FF',
        'pink-soft': '#FFF0F7',
        success: '#159B68',
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
        card: '0 4px 16px rgba(25, 40, 70, 0.045)',
        'card-hover': '0 8px 24px rgba(25, 40, 70, 0.07)',
      }
    },
  },
  plugins: [],
}
