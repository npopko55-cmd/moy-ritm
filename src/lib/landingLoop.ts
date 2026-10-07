/**
 * Круг с роликом на главной (src/screens/Landing.tsx) — сразу после первой
 * отрисовки, но не раньше. Порядок тот же, что был у маскота.
 *
 * В разметке у <video> только постер — первый кадр ролика, 3,5 КБ, он же
 * лежит в предкэше сервис-воркера. Адрес самого ролика (180 КБ) ставит хук,
 * когда страница уже на экране: на компьютере — через два кадра после
 * монтирования, на телефоне — после load и паузы в работе браузера. У нашей
 * аудитории мобильная сеть и VPN: ролик-украшение не должен отнимать канал у
 * кода, шрифтов и запросов к серверу. Пока он качается — постер.
 *
 * Постер остаётся навсегда, если сеть совсем слабая (экономия трафика, 2g),
 * человек выключил анимацию в системе или браузер не пустил ролик без касания
 * (режим энергосбережения на iPhone) — круг при этом не пустеет.
 *
 * Сам ролик идёт мимо сервис-воркера, как и в плеере (scripts/build-sw.mjs):
 * берёт его браузер — из своего кэша или сети.
 */

import { useEffect } from 'react'
import type { RefObject } from 'react'
import { LANDING_LOOP, loopSrc } from '../data/loops'
import { whenIdle } from './prefetch'

type Connection = { saveData?: boolean; effectiveType?: string }

/**
 * Сети, на которых ролик ради украшения — плохая сделка. '3g' сюда не входит:
 * Chrome вешает эту метку на любое соединение с откликом дольше ~270 мс, а у
 * нашей аудитории через VPN так почти всегда.
 */
const SLOW = ['slow-2g', '2g']

/** Случаи, когда ролик не нужен вовсе: остаёмся на постере. */
function skip(): boolean {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true
  const net = (navigator as Navigator & { connection?: Connection }).connection
  if (!net) return false
  return Boolean(net.saveData) || SLOW.includes(net.effectiveType ?? '')
}

/** Колбэк после первой отрисовки: в первом кадре страница только считается. */
function afterPaint(cb: () => void): () => void {
  let id = requestAnimationFrame(() => {
    id = requestAnimationFrame(cb)
  })
  return () => cancelAnimationFrame(id)
}

/** Колбэк, когда страница загрузилась и браузеру нечем заняться. */
function whenQuiet(cb: () => void): () => void {
  let stopIdle: (() => void) | undefined
  const go = () => {
    stopIdle = whenIdle(cb)
  }
  if (document.readyState === 'complete') go()
  else window.addEventListener('load', go, { once: true })
  return () => {
    window.removeEventListener('load', go)
    stopIdle?.()
  }
}

/** Ролик в круге: ставит адрес, когда пора, и держит его играющим. */
export function useLandingLoop(ref: RefObject<HTMLVideoElement | null>): void {
  useEffect(() => {
    const video = ref.current
    if (!video || skip()) return

    // muted — и свойством, и атрибутом: React атрибут не пишет, а iPhone
    // без него не пускает ролик сам.
    video.muted = true
    video.defaultMuted = true
    video.setAttribute('muted', '')

    const play = () => void video.play().catch(() => undefined)
    // Браузер останавливает ролики на скрытой вкладке — вернулись, пускаем снова.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && video.paused && video.currentSrc) play()
    }

    // На телефоне — не раньше, чем всё важное пришло.
    const stop = (window.innerWidth < 768 ? whenQuiet : afterPaint)(() => {
      video.src = loopSrc(LANDING_LOOP)
      document.addEventListener('visibilitychange', onVisible)
      play()
    })

    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisible)
      video.pause()
      video.removeAttribute('src')
      // load() после снятия адреса обрывает уже начатую закачку.
      video.load()
    }
  }, [ref])
}
