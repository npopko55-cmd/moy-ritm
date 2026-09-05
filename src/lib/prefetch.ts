/**
 * Предзагрузка файлов на «пустых» экранах.
 *
 * До GitHub Pages от 0,4 до 0,85 с на каждый запрос, поэтому важно не столько
 * сэкономить байты, сколько начать качать заранее: пока человек читает лендинг
 * и смотрит отсчёт, фото, постеры и первые ролики уже оказываются в кэше
 * браузера (и в кэше сервис-воркера).
 */

/** Один раз на файл: повторные вызовы с тем же адресом ничего не делают. */
const asked = new Set<string>()

/** Картинки — через Image: браузер сам кладёт их в кэш и в память декодера. */
export function prefetchImages(urls: string[]): void {
  for (const url of urls) {
    if (asked.has(url)) continue
    asked.add(url)
    const img = new Image()
    img.decoding = 'async'
    img.src = url
  }
}

/** Видео и прочие файлы — фоновым fetch, не мешая тому, что грузится сейчас. */
export function prefetchFiles(urls: string[]): void {
  if (typeof fetch !== 'function') return
  for (const url of urls) {
    if (asked.has(url)) continue
    asked.add(url)
    // priority — подсказка Chrome; в остальных браузерах поле просто игнорируется.
    // Тело обязательно дочитываем: недочитанный ответ браузер вправе оборвать,
    // и в кэш тогда попадёт не весь файл.
    void fetch(url, { priority: 'low' } as RequestInit)
      .then((r) => r.blob())
      .catch(() => undefined)
  }
}

/** Выполнить, когда браузеру нечем заняться (или через паузу, если API нет). */
export function whenIdle(run: () => void): () => void {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
    cancelIdleCallback?: (id: number) => void
  }
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(run, { timeout: 2000 })
    return () => w.cancelIdleCallback?.(id)
  }
  const id = window.setTimeout(run, 300)
  return () => window.clearTimeout(id)
}
