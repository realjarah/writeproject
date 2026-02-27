import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "SF Pro Text", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        background: "#080808",
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.25rem",
      },
      backdropBlur: {
        "2xl": "40px",
        "3xl": "64px",
      },
    },
  },
  plugins: [],
};

export default config;
