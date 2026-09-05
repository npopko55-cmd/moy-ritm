/**
 * Собирает dist/sw.js после vite build.
 *
 * GitHub Pages отдаёт Cache-Control: max-age=600 — через десять минут браузер
 * перезапрашивает всё заново, а до Pages от 0,4 до 0,85 с на запрос. Свой кэш
 * снимает это: со второго захода сайт открывается вообще без сети.
 *
 * Готового решения не берём намеренно: новых зависимостей в проекте нет.
 *
 * Запуск: node scripts/build-sw.mjs (сам находит dist/ рядом со скриптом)
 */

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')

// Та же логика базы, что в vite.config.ts.
const BASE = process.env.GITHUB_PAGES === 'true' ? '/moy-ritm/' : '/'

/** Все файлы внутри dist/<dir> относительно dist. */
function filesIn(dir) {
  const abs = join(DIST, dir)
  let entries
  try {
    entries = readdirSync(abs, { withFileTypes: true })
  } catch {
    return []
  }
  return entries.flatMap((e) => {
    const full = join(abs, e.name)
    if (e.isDirectory()) return filesIn(relative(DIST, full))
    return [relative(DIST, full).split('\\').join('/')]
  })
}

// Предкэш — только то, без чего первый экран не покажется: разметка, бандлы,
// шрифты, фото карточек, hero и постеры роликов. Всё вместе меньше мегабайта.
const precache = [
  'index.html',
  ...filesIn('assets'),
  ...filesIn('fonts'),
  ...filesIn('streams').filter((f) => f.endsWith('.jpg')),
  ...filesIn('hero'),
  ...filesIn('loops').filter((f) => f.endsWith('.webp')),
  'manifest.webmanifest',
].sort()

const urls = precache.map((f) => BASE + f)

// Версия кэша — хеш самого списка: поменялись файлы, поменялось имя кэша.
const version = createHash('sha256').update(urls.join('\n')).digest('hex').slice(0, 12)

const bytes = precache.reduce((sum, f) => {
  try {
    return sum + statSync(join(DIST, f)).size
  } catch {
    return sum
  }
}, 0)

const sw = `/* Сгенерировано scripts/build-sw.mjs — правки затрутся при сборке. */
const VERSION = '${version}'
const BASE = '${BASE}'
const PRECACHE = 'myrithm-precache-' + VERSION
const LOOPS = 'myrithm-loops'
const MUSIC = 'myrithm-music'
const MUSIC_LIMIT = 13

const ASSETS = ${JSON.stringify(urls, null, 2)}

self.addEventListener('install', (e) => {
  // Промахи не должны валить установку целиком: кладём файлы по одному.
  // Только разметку берём мимо кэша браузера — у неё на Pages max-age=600,
  // остальное либо с хешем в имени, либо уже скачано этой же страницей.
  e.waitUntil(
    caches.open(PRECACHE).then((c) =>
      Promise.all(
        ASSETS.map((u) => {
          const req = u.endsWith('index.html') ? new Request(u, { cache: 'reload' }) : u
          return c.add(req).catch(() => undefined)
        }),
      ),
    ).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('myrithm-precache-') && k !== PRECACHE)
          .map((k) => caches.delete(k)),
      ),
    ).then(() => self.clients.claim()),
  )
})

/**
 * Медиа из кэша, иначе из сети целиком.
 *
 * Плеер и звук просят файл кусками (заголовок Range), а Cache API умеет
 * хранить только целые ответы. Поэтому кладём файл целиком, а кусок нарезаем
 * сами и отдаём как 206 — без этого Safari не играет ни видео, ни музыку.
 */
async function media(request, cacheName, limit) {
  const whole = new Request(request.url, { credentials: 'same-origin' })
  const cache = await caches.open(cacheName)
  let full = await cache.match(whole)
  if (!full) {
    full = await fetch(whole)
    if (full.status === 200) {
      await cache.put(whole, full.clone())
      if (limit) await trim(cache, limit)
    }
  }

  const range = request.headers.get('range')
  if (!range) return full

  const body = await full.clone().arrayBuffer()
  const asked = /^bytes=(\\d*)-(\\d*)$/.exec(range)
  const start = asked && asked[1] ? Number(asked[1]) : 0
  const end = asked && asked[2] ? Number(asked[2]) : body.byteLength - 1
  return new Response(body.slice(start, end + 1), {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': full.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Range': 'bytes ' + start + '-' + end + '/' + body.byteLength,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  })
}

/** Держим в кэше не больше limit записей, лишние — самые старые. */
async function trim(cache, limit) {
  const keys = await cache.keys()
  for (let i = 0; i < keys.length - limit; i++) await cache.delete(keys[i])
}

/** Разметка приложения из кэша: роутер сам разберётся, какой это экран. */
async function fallbackPage(networkResponse) {
  const hit = await caches.match(BASE + 'index.html')
  return hit || networkResponse || Response.error()
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // Переходы по ссылкам: сначала сеть (вдруг сайт обновился), иначе index.html.
  // Так работают и прямые ссылки вида /player/cardio.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((r) => (r.ok ? r : fallbackPage(r)))
        .catch(() => fallbackPage(null)),
    )
    return
  }

  // Ролики: 1,6 МБ на все четырнадцать — держим целиком.
  if (url.pathname.endsWith('.mp4')) {
    e.respondWith(media(req, LOOPS))
    return
  }

  // Музыка: тринадцать треков по 0,6–1,3 МБ, больше в кэше держать незачем.
  if (url.pathname.endsWith('.m4a')) {
    e.respondWith(media(req, MUSIC, MUSIC_LIMIT))
    return
  }

  // Всё остальное — из предкэша, если оно там есть.
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)))
})
`

writeFileSync(join(DIST, 'sw.js'), sw)
console.log(
  `sw.js: ${precache.length} файлов в предкэше, ${(bytes / 1024).toFixed(0)} КБ, база ${BASE}, версия ${version}`,
)
