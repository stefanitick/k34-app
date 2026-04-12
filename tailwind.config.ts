import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        red:     '#C8392B',
        red2:    '#E8472F',
        dark:    '#0A0A0A',
        dark2:   '#111111',
        dark3:   '#181818',
        dark4:   '#1E1E1E',
        gray:    '#666666',
        gray2:   '#999999',
        light:   '#F0EDE8',
        success: '#1D9E75',
        warn:    '#EF9F27',
      },
      fontFamily: {
        display: ['var(--font-display)', 'sans-serif'],
        body:    ['var(--font-body)', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config