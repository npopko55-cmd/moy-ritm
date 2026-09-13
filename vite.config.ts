import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Порт берётся из PORT, по умолчанию 3000 — именно его ждёт CORS бэкенда.
const port = Number(process.env.PORT) || 3000

// На GitHub Pages сайт живёт в подпапке /moy-ritm/, локально — в корне.
const pages = process.env.GITHUB_PAGES === 'true'
const base = pages ? '/moy-ritm/' : '/'

/**
 * Демо на GitHub Pages — копия сайта без бэкенда, поисковикам она не нужна:
 * noindex и canonical на боевой адрес, чтобы демо не спорило с ritmritm.ru
 * в выдаче. В боевой сборке этих тегов нет.
 */
const pagesSeo = (): Plugin => ({
  name: 'moy-ritm-pages-seo',
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { name: 'robots', content: 'noindex' }, injectTo: 'head' },
    { tag: 'link', attrs: { rel: 'canonical', href: 'https://ritmritm.ru/' }, injectTo: 'head' },
  ],
})

export default defineConfig({
  base,
  plugins: [react(), ...(pages ? [pagesSeo()] : [])],
  server: { port, host: true },
  preview: { port },
})
