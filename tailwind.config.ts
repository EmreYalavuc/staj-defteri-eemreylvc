import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        burgundy: {
          900: "#1a0508",
          800: "#2d0a10",
          700: "#3d0c11",
          600: "#5c1219",
          500: "#7a1a22",
          400: "#a02030",
        },
        gold: {
          100: "#fdf6e3",
          200: "#f5e6c8",
          300: "#e8c98a",
          400: "#d4a855",
          500: "#b8860b",
        },
        cream: "#f9f3e8",
      },
      fontFamily: {
        serif: ["Georgia", "Cambria", "serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
