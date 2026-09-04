import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Порт берётся из PORT, по умолчанию 3000 — именно его ждёт CORS бэкенда.
const port = Number(process.env.PORT) || 3000

// На GitHub Pages сайт живёт в подпапке /moy-ritm/, локально — в корне.
const base = process.env.GITHUB_PAGES === 'true' ? '/moy-ritm/' : '/'

export default defineConfig({
  base,
  plugins: [react()],
  server: { port, host: true },
  preview: { port },
})
