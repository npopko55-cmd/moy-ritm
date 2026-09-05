/**
 * Ролик маскота на главной — строго после того, как страница уже открылась.
 *
 * Видео весит 0,4–1,7 МБ, и в первую отрисовку оно попадать не должно: до
 * события load элемента с источником вообще нет, дальше ждём паузы в работе
 * браузера. Пока ролик не заиграл, на его месте стоит постер (24 КБ), он же
 * остаётся навсегда, если сеть слабая или человек выключил анимацию.
 */

import { useEffect, useState } from 'react'
import type { RefObject } from 'react'
import { asset } from './asset'

type Connection = { saveData?: boolean; effectiveType?: string }

/**
 * Сети, на которых мегабайт видео ради украшения — плохая сделка.
 *
 * '3g' сюда не входит намеренно: Chrome вешает эту метку на любое соединение с
 * откликом дольше ~270 мс, а у нашей аудитории через VPN так почти всегда.
 * Ролик и без того грузится лениво и последним, до его прихода стоит постер.
 */
const SLOW = ['slow-2g', '2g']

/** Потолок повторных запусков — свой на каждый повод, чтобы не закольцеваться. */
const TRIES = 5

/** Случаи, когда ролик не нужен вовсе: остаёмся на постере. */
function skip(): boolean {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true
  const net = (navigator as Navigator & { connection?: Connection }).connection
  if (!net) return false
  return Boolean(net.saveData) || SLOW.includes(net.effectiveType ?? '')
}

/**
 * Источники по порядку разбора браузером.
 *
 * Первым идёт HEVC с альфой: его возьмёт только Safari, остальные пропустят —
 * video/quicktime они не поддерживают и до кодека даже не дойдут. Дальше VP9,
 * на телефоне — версия 346x480 вместо 672x934.
 */
function sources(): Array<[src: string, type: string]> {
  const small = window.innerWidth < 768
  return [
    [asset('mascot/warmup.mov'), 'video/quicktime; codecs="hvc1"'],
    [
      asset(small ? 'mascot/warmup-small.webm' : 'mascot/warmup.webm'),
      'video/webm; codecs="vp9"',
    ],
  ]
}

/** true, когда ролик действительно пошёл и его можно показывать вместо постера. */
export function useMascotVideo(ref: RefObject<HTMLVideoElement>): boolean {
  const [live, setLive] = useState(false)

  useEffect(() => {
    const video = ref.current
    if (!video || skip()) return

    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
      cancelIdleCallback?: (id: number) => void
    }
    let idleId = 0
    let timerId = 0
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
      setLive(true)
      stopData()
    }
    video.addEventListener('playing', onPlaying)

    const load = () => {
      for (const [src, type] of sources()) {
        const source = document.createElement('source')
        source.src = src
        source.type = type
        video.appendChild(source)
      }
      video.addEventListener('loadeddata', onData)
      video.addEventListener('canplay', onData)
      document.addEventListener('visibilitychange', onVisible)
      video.load()
      start()
    }

    const schedule = () => {
      if (w.requestIdleCallback) idleId = w.requestIdleCallback(load, { timeout: 2000 })
      else timerId = window.setTimeout(load, 1500)
    }

    if (document.readyState === 'complete') schedule()
    else window.addEventListener('load', schedule, { once: true })

    return () => {
      window.removeEventListener('load', schedule)
      if (idleId) w.cancelIdleCallback?.(idleId)
      if (timerId) window.clearTimeout(timerId)
      video.removeEventListener('playing', onPlaying)
      stopData()
      document.removeEventListener('visibilitychange', onVisible)
      video.pause()
      video.removeAttribute('src')
      while (video.firstChild) video.removeChild(video.firstChild)
      // load() после снятия источников обрывает уже начатую закачку.
      video.load()
    }
  }, [ref])

  return live
}
