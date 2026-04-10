/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.tsx",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        black: "#000000",
        surface: "#121212",
        surface2: "#1E1E1E",
        primary: "#22D3EE",
        "primary-dark": "#0891B2",
        accent: "#22C55E",
        warning: "#F59E0B",
        error: "#EF4444",
        "text-primary": "#FFFFFF",
        "text-secondary": "#94A3B8",
        border: "#2D2D2D",
      },
      fontFamily: {
        heading: ["SpaceGrotesk"],
        body: ["DMSans"],
      },
    },
  },
  plugins: [],
};
