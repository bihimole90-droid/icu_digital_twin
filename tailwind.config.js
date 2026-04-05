/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        tech: ['"Space Mono"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        'neon-cyan': '0 0 12px rgba(0, 240, 255, 0.4), inset 0 0 12px rgba(0, 240, 255, 0.1)',
        'neon-pink': '0 0 12px rgba(255, 0, 102, 0.4), inset 0 0 12px rgba(255, 0, 102, 0.1)',
        'neon-green': '0 0 12px rgba(57, 255, 20, 0.4), inset 0 0 12px rgba(57, 255, 20, 0.1)',
        'neon-amber': '0 0 12px rgba(255, 176, 0, 0.4), inset 0 0 12px rgba(255, 176, 0, 0.1)',
        'core': "0 20px 60px rgba(0, 0, 0, 0.8)",
        'panel': "0 24px 80px rgba(0, 0, 0, 0.9)"
      },
      colors: {
        core: {
          950: "#020408",
          900: "#050914",
          800: "#0b1426",
          700: "#13233f",
          600: "#1c335a"
        },
        neon: {
          cyan: "#00f0ff",
          pink: "#ff0066",
          green: "#39ff14",
          amber: "#ffb000",
        }
      },
      animation: {
        'pulse-fast': 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'grid-scroll': 'gridScroll 30s linear infinite',
      },
      keyframes: {
        gridScroll: {
          '0%': { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(40px)' },
        }
      }
    }
  },
  plugins: []
};
