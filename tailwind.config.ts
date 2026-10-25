import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/presentation/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "DM Sans", "sans-serif"],
        display: ["var(--font-display)", "Manrope", "sans-serif"],
      },
      colors: {
        ink: "var(--ink)",
        muted: "var(--muted)",
        brand: { DEFAULT: "var(--blue)", hover: "var(--blue-hover)", soft: "var(--blue-soft)" },
        navy: "var(--navy)",
      },
    },
  },
  plugins: [],
};

export default config;
