/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        parchment: '#f3efe1',
        ink: '#2c2418',
        brass: '#b8860b',
        brassLight: '#d4af37',
        copper: '#cd7f32',
        deepGreen: '#2f4a3d',
        slate: '#4a4439',
        border: '#c9ba9e',
        fault: '#a04000',
      },
      fontFamily: {
        display: ['"Cinzel"', '"Playfair Display"', 'Georgia', 'serif'],
        body: ['"IM Fell DW Pica"', '"Crimson Text"', 'Georgia', 'serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        none: '0',
      },
    },
  },
  plugins: [],
}
