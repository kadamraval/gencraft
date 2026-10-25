/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx,js,jsx}",
    "./node_modules/streamdown/dist/*.js",
    "./node_modules/@streamdown/*/dist/*.js",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
    },
    extend: {
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["Inter", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "transparent",
        select: "hsl(var(--select) / <alpha-value>)",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      spacing: {
        112: "28rem",
        116: "29rem",
        120: "30rem",
      },
      boxShadow: {
        none: "none",
        xs: "none",
        sm: "none",
        md: "none",
        lg: "none",
        floating: "none",
        glow: "none",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "ob-float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        "ob-draw": {
          "0%": { strokeDashoffset: "120" },
          "100%": { strokeDashoffset: "0" },
        },
        "ob-pop": {
          "0%": { opacity: "0", transform: "scale(0.6)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "ob-orbit": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        "bottom-gradient-rise": {
          "0%, 100%": {
            transform: "translateY(0%) scale(1)",
            opacity: "0.45",
          },
          "50%": {
            transform: "translateY(-15%) scale(1.08)",
            opacity: "0.75",
          },
        },
      },
      animation: {
        "ob-float": "ob-float 5s ease-in-out infinite",
        "ob-float-slow": "ob-float 7s ease-in-out infinite",
        "ob-draw": "ob-draw 1.2s ease-out forwards",
        "ob-pop": "ob-pop 0.5s ease-out both",
        "ob-orbit": "ob-orbit 18s linear infinite",
        "fade-in": "fade-in 0.2s ease-out forwards",
        "bottom-rise": "bottom-gradient-rise 8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
}
