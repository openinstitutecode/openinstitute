/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "rgb(var(--c-ink) / <alpha-value>)",
        paper: "rgb(var(--c-paper) / <alpha-value>)",
        navy: {
          DEFAULT: "rgb(var(--c-navy) / <alpha-value>)",
          dark: "rgb(var(--c-navy-dark) / <alpha-value>)",
          light: "rgb(var(--c-navy-light) / <alpha-value>)",
        },
        gold: {
          DEFAULT: "#E8A33D",
          dark: "#C4832A",
          light: "#F3C578",
        },
        forest: {
          DEFAULT: "#2F5233",
          dark: "#213B25",
        },
        line: "rgb(var(--c-line) / <alpha-value>)",
      },
      fontFamily: {
        display: ["'Fraunces'", "serif"],
        sans: ["'Inter'", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
      maxWidth: {
        prose: "68ch",
      },
      backgroundImage: {
        ledger:
          "repeating-linear-gradient(180deg, transparent, transparent 27px, rgba(27,58,75,0.07) 28px)",
      },
    },
  },
  plugins: [],
};
