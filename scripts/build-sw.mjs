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

/**
 * Постеры первых WARM_MOVES движений каталога — с ними плеер открывается без
 * пустого круга. Остальные подтягиваются по ходу тренировки, как и ролики:
 * с 45 движениями все постеры сразу заметно утяжелили бы первый заход.
 * Порядок и число — из src/data/streams.ts, чтобы не держать их в двух местах.
 */
function warmPosters() {
  const src = readFileSync(join(ROOT, 'src/data/streams.ts'), 'utf8')
  const count = Number(/export const WARM_MOVES = (\d+)/.exec(src)?.[1])
  const list = /export const ALL_MOVES: Loop\[\] = pick\(([^)]*)\)/.exec(src)?.[1] ?? ''
  const ids = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1])
  if (!count || ids.length === 0) {
    throw new Error('build-sw: не нашёл WARM_MOVES или ALL_MOVES в src/data/streams.ts')
  }
  const posters = ids.slice(0, count).map((id) => `loops/${id}.webp`)
  const missing = posters.filter((f) => !filesIn('loops').includes(f))
  if (missing.length) throw new Error(`build-sw: нет постеров ${missing.join(', ')}`)
  return posters
}

/**
 * Постер ролика в круге на главной (src/lib/landingLoop.ts): круг виден в
 * первом экране, и до ролика в нём стоит этот кадр. Какой ролик — из
 * src/data/loops.ts (LANDING_LOOP), чтобы не держать id в двух местах. Сам
 * ролик, как и все *.mp4, идёт мимо воркера (см. fetch ниже).
 */
function landingPoster() {
  const src = readFileSync(join(ROOT, 'src/data/loops.ts'), 'utf8')
  const id = /export const LANDING_LOOP = '([^']+)'/.exec(src)?.[1]
  if (!id) throw new Error('build-sw: не нашёл LANDING_LOOP в src/data/loops.ts')
  const poster = `loops/${id}.webp`
  if (!filesIn('loops').includes(poster)) throw new Error(`build-sw: нет постера ${poster}`)
  return poster
}

/**
 * Что не идёт в предкэш, хоть и лежит рядом: код админки (её открывает один
 * владелец — сюда же попадут и новые её экраны, Admin*.js и Admin*.css),
 * юридические страницы (оферта, политика, согласие — 14 КБ текста, их
 * открывают единицы) и рукописный шрифт Caveat (подписи на тарифах, паузе и
 * прогрессе — без него виден запасной шрифт, а догрузится он по ходу). Всё
 * это по-прежнему доступно — просто качается, когда понадобится, а не при
 * установке воркера у каждого посетителя.
 */
const NOT_PRECACHED = [/^assets\/admin/i, /^assets\/Legal-/, /^fonts\/caveat-/i]
const precached = (f) => !NOT_PRECACHED.some((re) => re.test(f))

// Предкэш — только то, без чего первый экран не покажется: разметка, бандлы
// (чанки из assets/, в том числе экраны, которые грузятся по маршруту, — кроме
// NOT_PRECACHED), шрифты, постер ролика в круге на главной, постер маскота
// (24 КБ — героиня в окне регистрации гостя, src/components/GuestPrompt.tsx)
// и постеры первых движений. Фото потоков сюда больше не идут: потоки скрыты
// и нигде не показываются. Анимации маскота на главной больше нет (с 06.10.2026
// там круг с роликом), и её ролики с анимированным WebP воркер не трогает
// вовсе: прежний кэш myrithm-mascot-* удалит activate.
const precache = [
  ...new Set([
    'index.html',
    ...filesIn('assets').filter(precached),
    ...filesIn('fonts').filter(precached),
    ...filesIn('mascot').filter((f) => f.endsWith('-poster.webp')),
    landingPoster(),
    ...warmPosters(),
    'manifest.webmanifest',
  ]),
].sort()

const urls = precache.map((f) => BASE + f)

// Версии кэшей — хеши содержимого: поменялся хоть один файл — у кэша новое
// имя, и старый удаляется при активации воркера.
const version = contentHash(precache)
const musicVersion = contentHash(filesIn('music').filter((f) => f.endsWith('.m4a')))

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
const MUSIC = 'myrithm-music-${musicVersion}'
// Кэша роликов больше нет (см. fetch ниже): прежний myrithm-loops-* удалит activate.
// Кэша анимации маскота тоже: на главной её больше нет, myrithm-mascot-* удалит activate.
const CURRENT = [PRECACHE, MUSIC]
const MUSIC_LIMIT = 13

/** Сети, на которых второй поток того же файла ради кэша — плохая сделка. */
const SLOW = ['slow-2g', '2g']

const ASSETS = ${JSON.stringify(urls, null, 2)}

/** Куски сборки с хешем в имени: под тем же именем они не меняются никогда. */
const HASHED = BASE + 'assets/'

self.addEventListener('install', (e) => {
  // Промахи не должны валить установку целиком: кладём файлы по одному.
  // Файлы под постоянными именами (разметка, шрифты, постеры) берём мимо
  // кэша браузера (cache: 'reload'): nginx отдаёт им недельный кэш, и
  // заменённый под тем же именем файл иначе приехал бы из него старым.
  // Куски из assets/ — с хешем в имени, их обычный кэш всегда верен: берём
  // оттуда и не качаем заново при каждом обновлении воркера.
  e.waitUntil(
    caches.open(PRECACHE).then((c) =>
      Promise.all(
        ASSETS.map((u) =>
          c.add(u.startsWith(HASHED) ? u : new Request(u, { cache: 'reload' })).catch(() => undefined),
        ),
      ),
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
 *
 * Любой сбой воркера (Cache API недоступен, кончилось место, запись битая) —
 * запрос уходит в сеть как есть: лучше без кэша, чем без ролика и музыки.
 */
async function media(event, request, cacheName, limit) {
  try {
    return await mediaFromCache(event, request, cacheName, limit)
  } catch (e) {
    return fetch(request)
  }
}

async function mediaFromCache(event, request, cacheName, limit) {
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
  const size = body.byteLength
  // Пустая запись — битая: убираем её и идём в сеть.
  if (size === 0) {
    event.waitUntil(cache.delete(whole).catch(() => undefined))
    return fetch(request)
  }
  const asked = /^bytes=(\\d*)-(\\d*)$/.exec(range)
  let start = 0
  let end = size - 1
  if (asked && asked[1] === '' && asked[2] !== '') {
    // bytes=-N — последние N байт файла.
    start = Math.max(0, size - Number(asked[2]))
  } else if (asked) {
    if (asked[1]) start = Number(asked[1])
    if (asked[2]) end = Number(asked[2])
  }
  // Конец дальше файла — отдаём до последнего байта, как и сам сервер.
  end = Math.min(end, size - 1)
  // Начало за концом файла — такого куска нет: 416, как ответил бы сервер.
  if (start >= size || start > end) {
    return new Response(null, {
      status: 416,
      statusText: 'Range Not Satisfiable',
      headers: { 'Content-Range': 'bytes */' + size },
    })
  }
  return new Response(body.slice(start, end + 1), {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': full.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Range': 'bytes ' + start + '-' + end + '/' + size,
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

  // Ролики (и заглушки unlock.mp4, nosleep.mp4) воркер не трогает вовсе:
  // их берёт сам браузер — из своего HTTP-кэша (nginx отдаёт им недельный
  // Cache-Control, prefetchFiles прогревает его заранее) или из сети.
  //
  // Раньше ролики шли через media(): промах с Range — ответ сети, попадание —
  // кусок, нарезанный воркером. Chrome сверяет происхождение всех ответов
  // одного ролика, а у нарезанного new Response() адреса нет вовсе. Скрытый
  // <video> докачивал ролик из сети, файл тем временем ложился в кэш, а при
  // пуске на виду Chrome перезапрашивал его — и получал нарезку: «data source
  // error» (код 2), после load() — «Format error» (код 4) на каждой попытке.
  // Так второе движение и вставало на паузу (player_faults 05–06.10).
  if (url.pathname.endsWith('.mp4')) return

  // Сигнал смены движения (src/media/chime.ts, sounds/chime.m4a, 8 КБ) — тоже
  // мимо воркера, до правила .m4a: иначе он лёг бы в кэш музыки и отдавался
  // нарезкой. Берёт его браузер — из HTTP-кэша или сети. Нет сети и кэша —
  // плеер играет запасной синтез.
  if (url.pathname.startsWith(BASE + 'sounds/')) return

  // Музыка: тринадцать треков по 0,6–1,3 МБ, больше в кэше держать незачем.
  if (url.pathname.endsWith('.m4a')) {
    e.respondWith(media(e, req, MUSIC, MUSIC_LIMIT))
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
