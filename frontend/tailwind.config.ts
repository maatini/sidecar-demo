import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        success: "#16a34a",
        danger: "#dc2626",
      },
    },
  },
  plugins: [],
};

export default config;
