import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        bg: "#f4f7f8",
        surface: "#ffffff",
        line: "#d9e2e5",
        ink: "#101a1d",
        muted: "#5b6a70",
        accent: "#0ea5a4",
        accentDeep: "#0a7c7b",
        warm: "#ffb703",
        done: "#1f9d55"
      },
      boxShadow: {
        card: "0 18px 40px -22px rgba(16, 26, 29, 0.28)"
      },
      borderRadius: {
        xl2: "1.25rem"
      }
    }
  },
  plugins: []
};

export default config;
