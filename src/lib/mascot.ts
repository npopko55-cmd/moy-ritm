/**
 * Анимация маскота на главной — сразу после первой отрисовки, но не раньше.
 *
 * В разметке её нет: адрес ставит хук, когда страница уже на экране (два
 * requestAnimationFrame после монтирования). Раньше ждали load и паузы в
 * работе браузера, и разминка начиналась с заметной задержкой — до 2 с.
 * Пока анимация качается, на её месте стоит постер (24 КБ), он же остаётся
 * навсегда, если сеть слабая или человек выключил анимацию.
 *
 * Формат зависит от браузера:
 * · WebKit (Safari, любой браузер на iPhone и iPad, вьюхи Telegram на iOS и
 *   macOS) и всегда мини-ап Telegram — анимированный WebP в <img>;
 * · остальные (Chrome, Firefox, Android) — VP9 с альфой в <video>.
 *
 * HEVC с альфой (mascot/*.mov) больше не берём никому. Файл исправен, но во
 * вьюхе Telegram на iPhone видео рисуется непрозрачным слоем: за фигурой
 * встаёт прямоугольная плашка. Альфу в VP9 Safari не показывает, так что
 * WebKit остаётся только картинка — анимированный WebP с альфой он умеет
 * везде, где вообще открывается наш сайт.
 */

import { useEffect, useState } from 'react'
import type { RefObject } from 'react'
import { asset } from './asset'
import { IN_TELEGRAM } from './telegram'

type Connection = { saveData?: boolean; effectiveType?: string }

/**
 * Сети, на которых мегабайт анимации ради украшения — плохая сделка.
 *
 * '3g' сюда не входит намеренно: Chrome вешает эту метку на любое соединение с
 * откликом дольше ~270 мс, а у нашей аудитории через VPN так почти всегда.
 * Анимация и без того грузится с низким приоритетом, до её прихода стоит постер.
 */
const SLOW = ['slow-2g', '2g']

/** Потолок повторных запусков — свой на каждый повод, чтобы не закольцеваться. */
const TRIES = 5

/** Случаи, когда анимация не нужна вовсе: остаёмся на постере. */
function skip(): boolean {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true
  const net = (navigator as Navigator & { connection?: Connection }).connection
  if (!net) return false
  return Boolean(net.saveData) || SLOW.includes(net.effectiveType ?? '')
}

/**
 * Движок Apple WebKit: Safari на Mac, любой браузер на iPhone и iPad (там
 * все они — WebKit) и вьюхи приложений, в том числе Telegram.
 *
 * iPad в режиме «как на компьютере» представляется Маком — выдаёт его только
 * сенсорный экран. На Mac Chrome, Edge и Opera пишут в userAgent «AppleWebKit»
 * по наследству, поэтому нужен ещё vendor от Apple и отсутствие их меток.
 */
function appleWebKit(): boolean {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua)) return true
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true
  return (
    /AppleWebKit/.test(ua) &&
    navigator.vendor.startsWith('Apple') &&
    !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/.test(ua)
  )
}

/** Анимированный WebP вместо видео — WebKit и мини-ап Telegram. */
export const MASCOT_AS_IMAGE: boolean = IN_TELEGRAM || appleWebKit()

/**
 * На телефоне — версия 346x480 вместо 672x934: полная весит вдвое больше
 * (WebP — 1,45 МБ против 0,7 МБ), а берут её и на мобильной сети.
 */
function small(): boolean {
  return window.innerWidth < 768
}

/** Колбэк после первой отрисовки: в первом кадре страница только считается. */
function afterPaint(cb: () => void): () => void {
  let id = requestAnimationFrame(() => {
    id = requestAnimationFrame(cb)
  })
  return () => cancelAnimationFrame(id)
}

/**
 * Анимированный WebP. Картинка прозрачна до события load (файл скачан
 * целиком — анимация пойдёт без запинок) и разбора первого кадра: подмена
 * постера идёт уже готовым кадром, без мигания.
 */
function playImage(img: HTMLImageElement, onLive: () => void): () => void {
  let gone = false

  // decode() на анимированной картинке иногда отказывает — тогда показываем
  // и так: load уже пришёл, значит, файл цел.
  const onLoad = () =>
    void img
      .decode()
      .catch(() => undefined)
      .then(() => {
        if (!gone) onLive()
      })
  img.addEventListener('load', onLoad)

  const stop = afterPaint(() => {
    // Низкий приоритет: постер и шрифты не должны ждать мегабайтную анимацию.
    img.fetchPriority = 'low'
    img.src = asset(small() ? 'mascot/warmup-anim.webp' : 'mascot/warmup-anim-lg.webp')
  })

  return () => {
    gone = true
    stop()
    img.removeEventListener('load', onLoad)
    // Снятый src обрывает уже начатую закачку.
    img.removeAttribute('src')
  }
}

/**
 * VP9 с альфой. У <video> нет fetchpriority, но видео браузер и так качает
 * с низким приоритетом — постер и шрифты вперёд него.
 */
function playVideo(video: HTMLVideoElement, onLive: () => void): () => void {
  let dataTries = 0
  let visibleTries = 0

  // Автовоспроизведение могут запретить, файл может не скачаться — оба
  // случая просто оставляют постер на месте, ругаться в консоль незачем.
  const start = () => void video.play().catch(() => undefined)

  /**
   * play() сразу после load() часто отклоняется: данных ещё нет. Пробуем
   * снова, когда они подъехали, и снимаем слушатели, как только заиграло.
   */
  const onData = () => {
    if (dataTries >= TRIES || !video.paused) return
    dataTries += 1
    start()
  }

  /**
   * В фоновой вкладке Chrome ролик без звука либо не запускает вовсе, либо
   * ставит на паузу сразу после playing. Единственный надёжный момент — когда
   * вкладку открыли, так что слушатель живёт до размонтирования; счётчик не
   * даёт ему закольцеваться, а уже играющий ролик мы не трогаем.
   */
  const onVisible = () => {
    if (visibleTries >= TRIES) return
    if (document.visibilityState !== 'visible' || !video.paused) return
    visibleTries += 1
    start()
  }

  const stopData = () => {
    video.removeEventListener('loadeddata', onData)
    video.removeEventListener('canplay', onData)
  }

  const onPlaying = () => {
    onLive()
    stopData()
  }
  video.addEventListener('playing', onPlaying)

  const stop = afterPaint(() => {
    const source = document.createElement('source')
    source.src = asset(small() ? 'mascot/warmup-small.webm' : 'mascot/warmup.webm')
    source.type = 'video/webm; codecs="vp9"'
    video.appendChild(source)
    video.addEventListener('loadeddata', onData)
    video.addEventListener('canplay', onData)
    document.addEventListener('visibilitychange', onVisible)
    video.load()
    start()
  })

  return () => {
    stop()
    video.removeEventListener('playing', onPlaying)
    stopData()
    document.removeEventListener('visibilitychange', onVisible)
    video.pause()
    video.removeAttribute('src')
    while (video.firstChild) video.removeChild(video.firstChild)
    // load() после снятия источников обрывает уже начатую закачку.
    video.load()
  }
}

/**
 * true, когда анимация действительно пошла и её можно показывать вместо
 * постера. В разметке стоит что-то одно — <img> или <video>, смотря по
 * MASCOT_AS_IMAGE; ref второго остаётся пустым.
 */
export function useMascot(
  image: RefObject<HTMLImageElement>,
  video: RefObject<HTMLVideoElement>,
): boolean {
  const [live, setLive] = useState(false)

  useEffect(() => {
    if (skip()) return
    const onLive = () => setLive(true)
    if (MASCOT_AS_IMAGE) return image.current ? playImage(image.current, onLive) : undefined
    return video.current ? playVideo(video.current, onLive) : undefined
  }, [image, video])

  return live
}
