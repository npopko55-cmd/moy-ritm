/**
 * Два <video> плеера — одни на всю жизнь страницы.
 *
 * Вьюха Telegram на iPhone (WKWebView) пускает медиа только из касания:
 * play() вне обработчика жеста отклоняется с NotAllowedError, даже у
 * беззвучного ролика. Разрешение WebKit выдаёт не странице, а конкретному
 * элементу: один раз запущенный в касании <video> дальше можно запускать из
 * кода — и после смены src тоже.
 *
 * Поэтому элементы не живут в разметке плеера. Они создаются здесь один раз,
 * разблокируются в касании «Влиться в поток» (unlockVideos), а плеер лишь
 * вставляет их в свой круг и меняет им src. Уходя с экрана, плеер забирает
 * их из DOM, но не уничтожает: вернувшись, он получит те же два элемента,
 * уже разблокированные. Новый <video> на месте старого пришлось бы
 * разрешать заново — именно так ролик и застывал на первом кадре.
 */

import { asset } from '../lib/asset'

/**
 * Заглушка для разблокировки: один кадр 16×16, H.264 baseline, без звука,
 * полтора килобайта. Нужна, пока плеер ещё не поставил элементу ролик.
 * Лежит в корне, а не в `media/`: адрес `/media/` на сервере nginx отдаёт из
 * каталога загрузок бэкенда, и файл сайта там был бы недоступен (404).
 */
const UNLOCK_SRC = asset('unlock.mp4')

type Pair = readonly [HTMLVideoElement, HTMLVideoElement]

let pool: Pair | null = null

/** Элементы, которые плеер сейчас хочет видеть играющими. */
const wanted = new Set<HTMLVideoElement>()

/** Элементы, которым браузер уже разрешил играть. */
const unlocked = new Set<HTMLVideoElement>()

function create(): HTMLVideoElement {
  const video = document.createElement('video')
  // Звука в роликах нет, но без muted WebKit вообще не пускает видео без
  // касания. Атрибуты дублируем свойствами: часть вьюх смотрит только на них.
  video.muted = true
  video.defaultMuted = true
  video.setAttribute('muted', '')
  // Без playsinline iPhone разворачивает ролик на весь экран.
  video.playsInline = true
  video.setAttribute('playsinline', '')
  video.setAttribute('webkit-playsinline', '')
  video.preload = 'auto'
  video.loop = true
  video.controls = false
  return video
}

/** Оба элемента. Создаются при первом обращении — и больше никогда. */
export function videoPool(): Pair {
  pool ??= [create(), create()]
  return pool
}

/**
 * Поставить ролик и постер. Тот же адрес второй раз не ставим: присвоение
 * src, даже прежнего, заново запускает загрузку, и ролик мигал бы.
 */
export function setVideoSource(video: HTMLVideoElement, src: string, poster: string): void {
  if (video.getAttribute('poster') !== poster) video.poster = poster
  if (video.getAttribute('src') !== src) video.src = src
}

/** play(), который всегда возвращает обещание: старые вьюхи отдают undefined. */
function start(video: HTMLVideoElement): Promise<void> {
  try {
    return Promise.resolve(video.play())
  } catch (error) {
    return Promise.reject(error)
  }
}

/** Запустить ролик. Обещание — как у play(): отказ браузера придёт в catch. */
export function playVideo(video: HTMLVideoElement): Promise<void> {
  wanted.add(video)
  const started = start(video)
  // Заиграл — значит, разрешение у элемента уже есть, разблокировать нечего.
  started.then(
    () => unlocked.add(video),
    () => undefined,
  )
  return started
}

/** Остановить ролик. */
export function pauseVideo(video: HTMLVideoElement): void {
  wanted.delete(video)
  video.pause()
}

/** Браузер не пустил медиа без касания. */
export function isNotAllowed(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotAllowedError'
}

/**
 * Разблокировать оба элемента. Звать синхронно, прямо в обработчике касания:
 * после первого await или таймера жеста для WebKit уже нет.
 *
 * Элементу без ролика ставим заглушку, запускаем и сразу останавливаем —
 * если плеер тем временем не попросил его играть. Отказ, отличный от
 * NotAllowedError (AbortError, когда плеер успел сменить src или поставить
 * паузу), — тоже успех: запуск был разрешён. Разблокированные элементы
 * повторно не трогаем, так что второй вызов ничего не стоит.
 *
 * В Chrome, Firefox и на Android беззвучное видео играет и без касания —
 * там это просто короткий пуск и остановка, ничего не меняющие.
 */
export function unlockVideos(): void {
  for (const video of videoPool()) {
    if (unlocked.has(video)) continue
    if (!video.getAttribute('src')) video.src = UNLOCK_SRC
    // Разблокировка — не просьба плеера: играть элемент оставит только он.
    start(video).then(
      () => {
        unlocked.add(video)
        if (!wanted.has(video)) video.pause()
      },
      (error: unknown) => {
        if (!isNotAllowed(error)) unlocked.add(video)
      },
    )
  }
}
