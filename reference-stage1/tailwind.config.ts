import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        forest: { DEFAULT: "#173F32", 700: "#1f5242", 800: "#173F32", 900: "#0f2b22" },
        ivory: { DEFAULT: "#F1EBDD", dark: "#E4DCC8" },
        gold: { DEFAULT: "#B69A62", dark: "#8f7740" },
        canvas: "#F7F7F3",
        ink: "#1c2420",
        muted: "#5f6b64",
        line: "#dcd7c8",
        st: {
          ok: "#2f7d4f",
          warn: "#b7791f",
          late: "#b3392f",
          info: "#2b6a8a",
          idle: "#7a817c",
        },
      },
      fontFamily: {
        sans: ["var(--font-tajawal)", "system-ui", "sans-serif"],
        display: ["var(--font-cairo)", "var(--font-tajawal)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
