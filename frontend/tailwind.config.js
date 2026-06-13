/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eefbf7",
          500: "#14a37f",
          600: "#0d8367",
          700: "#0c6955",
        },
      },
    },
  },
  plugins: [],
};
