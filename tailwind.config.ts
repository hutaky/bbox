import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        baseBlue: "#0052FF",
        epic: "#9B4DFF",
        legendary: "#FFCC33",
        rare: "#00D4FF"
      }
    }
  },
  plugins: []
};

export default config;
