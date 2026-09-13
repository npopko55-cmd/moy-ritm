/**
 * Кусок кода не скачался — почти всегда это выкладка.
 *
 * Экраны грузятся отдельными кусками с хешем в имени. Вкладка, открытая до
 * выкладки, помнит старые имена, а на сервере и в кэше сервис-воркера их уже
 * может не быть — переход на другой экран падал в «Что-то пошло не так».
 * Лечит это одна перезагрузка: свежий index.html знает новые имена. Идущая
 * тренировка лежит в sessionStorage (src/flow/FlowSession.tsx) и переживает
 * перезагрузку — «Вернуться в поток» после неё работает.
 *
 * Входа два: событие Vite `vite:preloadError` (main.tsx) и ErrorBoundary —
 * он узнаёт ошибку динамического импорта по тексту. От цикла защищает
 * отметка времени в sessionStorage: перезагружались меньше минуты назад —
 * больше не пробуем и показываем обычную страницу ошибки.
 */

const KEY = 'moy-ritm.chunk-reload'

/** Вторая перезагрузка раньше этого срока — уже цикл. */
const WINDOW_MS = 60_000

/**
 * Как браузеры называют сбой import(): Chrome, Safari, Firefox. Последнее —
 * текст Vite, когда не скачались стили куска.
 */
const MESSAGES = [
  'failed to fetch dynamically imported module',
  'importing a module script failed',
  'error loading dynamically imported module',
  'unable to preload css',
]

/** Перезагрузка уже пошла на этой странице: повторные сбои ждут её молча. */
let started = false

export function isChunkLoadError(error: unknown): boolean {
  const text = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase()
  return MESSAGES.some((m) => text.includes(m))
}

/** Можно ли перезагрузиться: за последнюю минуту этого не делали. */
export function mayReload(): boolean {
  if (started) return true
  try {
    const last = Number(sessionStorage.getItem(KEY))
    return !last || Date.now() - last >= WINDOW_MS
  } catch {
    // Хранилища нет — от цикла защититься нечем, поэтому не перезагружаем.
    return false
  }
}

/** Перезагрузить страницу, если это не цикл. true — перезагрузка пошла. */
export function reloadOnce(): boolean {
  if (started) return true
  if (!mayReload()) return false
  try {
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    return false
  }
  started = true
  window.location.reload()
  return true
}
