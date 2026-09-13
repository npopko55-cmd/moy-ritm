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

/**
 * Хеш содержимого, а не имён: постер, шрифт, ролик или трек могут заменить
 * под тем же именем, и по списку имён такую замену не заметить.
 */
function contentHash(files) {
  const hash = createHash('sha256')
  for (const f of [...files].sort()) {
    hash.update(f)
    hash.update('\0')
    try {
      hash.update(readFileSync(join(DIST, f)))
    } catch {
      /* файла нет — хватит и имени */
    }
  }
  return hash.digest('hex').slice(0, 12)
}

// Предкэш — только то, без чего первый экран не покажется: разметка, бандлы
// (все чанки из assets/, в том числе экраны, которые грузятся по маршруту),
// шрифты, постер маскота и постеры роликов. Фото потоков сюда больше не идут:
// потоки скрыты и нигде не показываются. Сам ролик маскота тоже не идёт: он
// мегабайтный и нужен не сразу.
const precache = [
  'index.html',
  ...filesIn('assets'),
  ...filesIn('fonts'),
  ...filesIn('mascot').filter((f) => f.endsWith('.webp')),
  ...filesIn('loops').filter((f) => f.endsWith('.webp')),
  'manifest.webmanifest',
].sort()

const urls = precache.map((f) => BASE + f)

// Версии кэшей — хеши содержимого: поменялся хоть один файл — у кэша новое
// имя, и старый удаляется при активации воркера.
const version = contentHash(precache)
const loopsVersion = contentHash(filesIn('loops').filter((f) => f.endsWith('.mp4')))
const musicVersion = contentHash(filesIn('music').filter((f) => f.endsWith('.m4a')))
const mascotVersion = contentHash(filesIn('mascot').filter((f) => /\.(webm|mov)$/.test(f)))

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
const LOOPS = 'myrithm-loops-${loopsVersion}'
const MUSIC = 'myrithm-music-${musicVersion}'
const MASCOT = 'myrithm-mascot-${mascotVersion}'
const CURRENT = [PRECACHE, LOOPS, MUSIC, MASCOT]
const MUSIC_LIMIT = 13

/** Сети, на которых второй поток того же файла ради кэша — плохая сделка. */
const SLOW = ['slow-2g', '2g']

const ASSETS = ${JSON.stringify(urls, null, 2)}

self.addEventListener('install', (e) => {
  // Промахи не должны валить установку целиком: кладём файлы по одному.
  // Всё берём мимо кэша браузера (cache: 'reload'): nginx отдаёт файлам
  // недельный кэш, и заменённый под тем же именем файл иначе приехал бы
  // из него старым.
  e.waitUntil(
    caches.open(PRECACHE).then((c) =>
      Promise.all(ASSETS.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => undefined))),
    ).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (e) => {
  // Всё своё, что не совпадает с текущими именами, — прошлые версии,
  // включая медиа-кэши старого образца без версии в имени.
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('myrithm-') && !CURRENT.includes(k))
          .map((k) => caches.delete(k)),
      ),
    ).then(() => self.clients.claim()),
  )
})

/** Файлы, которые сейчас докачиваются в кэш фоном: второй раз не начинаем. */
const filling = new Set()

function slowNetwork() {
  const net = self.navigator && self.navigator.connection
  return Boolean(net && (net.saveData || SLOW.includes(net.effectiveType)))
}

/** Положить ответ в кэш и подрезать кэш до limit записей. */
function keep(cache, whole, response, limit) {
  return cache
    .put(whole, response)
    .then(() => (limit ? trim(cache, limit) : undefined))
    .catch(() => undefined)
}

/**
 * Медиа: из кэша, а при промахе — из сети как есть.
 *
 * Плеер и звук просят файл кусками (заголовок Range), а Cache API умеет
 * хранить только целые ответы. Попадание в кэш — нарезаем кусок сами и
 * отдаём как 206: без этого Safari не играет ни видео, ни музыку.
 *
 * Промах с Range — отдаём ответ сети без задержки: браузер сам получит 206 и
 * начнёт играть, не дожидаясь, пока файл скачается целиком (раньше воркер
 * сначала качал весь файл, и на слабой сети звук стоял). Целый файл в кэш
 * докачиваем фоном — кроме экономии трафика и совсем медленных сетей, где
 * второй поток отнял бы канал у воспроизведения.
 */
async function media(event, request, cacheName, limit) {
  const whole = new Request(request.url, { credentials: 'same-origin' })
  const cache = await caches.open(cacheName)
  const range = request.headers.get('range')
  const full = await cache.match(whole)

  if (!full) {
    if (!range) {
      // Целиком файл просит предзагрузка: одна загрузка — и в ответ, и в кэш.
      const response = await fetch(whole)
      if (response.status === 200) event.waitUntil(keep(cache, whole, response.clone(), limit))
      return response
    }
    if (!filling.has(request.url) && !slowNetwork()) {
      filling.add(request.url)
      event.waitUntil(
        fetch(whole)
          .then((response) => (response.status === 200 ? keep(cache, whole, response, limit) : undefined))
          .catch(() => undefined)
          .finally(() => filling.delete(request.url)),
      )
    }
    return fetch(request)
  }

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
    e.respondWith(media(e, req, LOOPS))
    return
  }

  // Музыка: тринадцать треков по 0,6–1,3 МБ, больше в кэше держать незачем.
  if (url.pathname.endsWith('.m4a')) {
    e.respondWith(media(e, req, MUSIC, MUSIC_LIMIT))
    return
  }

  // Маскот с главной: несколько файлов, из них качается один — тот, что
  // подошёл браузеру и ширине экрана. Со второго захода берём из кэша.
  if (
    url.pathname.includes('/mascot/') &&
    (url.pathname.endsWith('.webm') || url.pathname.endsWith('.mov'))
  ) {
    e.respondWith(media(e, req, MASCOT))
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
