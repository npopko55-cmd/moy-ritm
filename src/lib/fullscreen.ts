/**
 * Тренировка на весь экран телефона (src/screens/Player.tsx).
 *
 * «Погружённый» вид — забота самого плеера: по касанию кружка он прячет
 * нижнее меню и логотип и растягивает круг во всю ширину (Player.css,
 * .player--immersive). Здесь — системный полноэкранный режим поверх него,
 * чтобы пропали и чужие рамки:
 *   • мини-ап — полноэкранный режим Telegram (с версии 8.0): уходит шапка
 *     Telegram, страница ложится под чёлку, а отступы под неё и под кнопки
 *     Telegram дают переменные --tg-inset-* (src/lib/telegram.ts);
 *   • браузер на Android — Fullscreen API на всю страницу: уходят адресная
 *     строка и системные полосы;
 *   • браузер на iPhone — ничего: Safari на телефоне отдаёт весь экран
 *     только ролику, а не странице. Остаётся «погружённый» вид.
 *
 * Не вышло (старый клиент, отказ браузера, fullscreenFailed) — молча
 * остаёмся в «погружённом» виде: меню он прячет и без системного режима.
 *
 * Просить режим — только в касании и синхронно, рядом с unlockMedia():
 * Chrome без жеста откажет, а после await жеста для браузера уже нет.
 */

import { useEffect, useState } from 'react'
import {
  IN_TELEGRAM,
  exitTelegramFullscreen,
  onTelegramEvent,
  requestTelegramFullscreen,
  telegramActive,
  telegramIsFullscreen,
} from './telegram'

/**
 * Телефон: палец вместо мыши и раскладки телефона из Player.css — портрет
 * до 768 px и ландшафт ниже 500 px. Пороги те же, что у CSS: иначе класс
 * «весь экран» мог бы встать там, где для него нет правил.
 */
const PHONE_QUERY =
  '(pointer: coarse) and (max-width: 767.98px) and (orientation: portrait), ' +
  '(pointer: coarse) and (orientation: landscape) and (max-height: 500px) and (max-width: 1023.98px)'

function phoneQuery(): MediaQueryList | null {
  try {
    return typeof window.matchMedia === 'function' ? window.matchMedia(PHONE_QUERY) : null
  } catch {
    return null
  }
}

/** Экран телефона — прямо сейчас. Для обработчиков касаний. */
export function isPhoneScreen(): boolean {
  return phoneQuery()?.matches ?? false
}

/** То же для отрисовки: меняется при повороте и смене размера окна. */
export function usePhoneScreen(): boolean {
  const [phone, setPhone] = useState(isPhoneScreen)
  useEffect(() => {
    const query = phoneQuery()
    if (!query) return
    const update = () => setPhone(query.matches)
    update()
    // Safari до 14 знает только addListener.
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', update)
      return () => query.removeEventListener('change', update)
    }
    query.addListener(update)
    return () => query.removeListener(update)
  }, [])
  return phone
}

/* ─────────────  Системный полноэкранный режим  ───────────── */

/**
 * Какой режим включили мы. Выключаем только его: мини-ап, который бот
 * открыл сразу на весь экран, тренировка не свернёт.
 */
let ours: 'telegram' | 'browser' | null = null

/** Telegram отказал (fullscreenFailed) — до перезагрузки больше не просим. */
let telegramRefused = false

const lostListeners = new Set<() => void>()

let wired = false

/** iPhone и iPad, в том числе iPad, который называет себя «Macintosh». */
function isIOS(): boolean {
  const ua = navigator.userAgent
  return /iP(hone|od|ad)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

/** Страница сейчас перед глазами: вкладка не спрятана и мини-ап не свёрнут. */
function onScreen(): boolean {
  return document.visibilityState !== 'hidden' && telegramActive()
}

/**
 * Режим пропал не по нашей просьбе. На виду — человек вышел из него сам
 * («Назад» на Android, меню Telegram): плееру пора в обычный вид. Спрятанной
 * вкладке режим снимает сама система — «погружённый» вид остаётся, а
 * следующее касание «Играть» или кружка попросит режим снова.
 */
function lost(): void {
  ours = null
  if (!onScreen()) return
  for (const fn of [...lostListeners]) {
    try {
      fn()
    } catch {
      /* подписчик упал — остальные всё равно узнают */
    }
  }
}

function wire(): void {
  if (wired) return
  wired = true
  if (IN_TELEGRAM) {
    onTelegramEvent('fullscreenChanged', () => {
      if (ours === 'telegram' && !telegramIsFullscreen()) lost()
    })
    // Отказ (клиент не умеет, уже на весь экран и прочее) — молча остаёмся
    // в «погружённом» виде. «Уже на весь экран» — не наш режим: не выключаем.
    onTelegramEvent('fullscreenFailed', () => {
      if (ours !== 'telegram') return
      ours = null
      telegramRefused = true
    })
  }
  document.addEventListener('fullscreenchange', () => {
    if (ours === 'browser' && !document.fullscreenElement) lost()
  })
}

/**
 * Попросить весь экран у системы. Звать в касании, синхронно. Уже включён
 * нами — ничего не делает, поэтому повторное касание безопасно.
 */
export function openFullscreen(): void {
  try {
    wire()
    if (ours) return
    if (IN_TELEGRAM) {
      // В мини-апе — только режим Telegram: браузерный API во вьюхе
      // Telegram либо не работает, либо спорит с его шапкой.
      if (telegramRefused || telegramIsFullscreen()) return
      if (requestTelegramFullscreen()) ours = 'telegram'
      return
    }
    const root = document.documentElement
    if (isIOS() || document.fullscreenElement || typeof root.requestFullscreen !== 'function') return
    ours = 'browser'
    Promise.resolve(root.requestFullscreen({ navigationUI: 'hide' })).then(
      () => {
        // Пока браузер включал режим, его успели выключить (пауза, «Свернуть»).
        if (ours !== 'browser' && document.fullscreenElement) {
          void Promise.resolve(document.exitFullscreen()).catch(() => undefined)
        }
      },
      () => {
        if (ours === 'browser') ours = null
      },
    )
  } catch {
    // Режим — подстраховка: «погружённый» вид работает и без него.
    ours = null
  }
}

/** Выйти из режима, который включили мы. Не включали — ничего не делает. */
export function closeFullscreen(): void {
  const was = ours
  ours = null
  try {
    if (was === 'telegram') exitTelegramFullscreen()
    else if (was === 'browser' && document.fullscreenElement) {
      void Promise.resolve(document.exitFullscreen()).catch(() => undefined)
    }
  } catch {
    /* режим уже снят системой */
  }
}

/**
 * Подписка: человек сам вышел из системного режима, пока страница на виду.
 * Возвращает отписку.
 */
export function onFullscreenLost(fn: () => void): () => void {
  lostListeners.add(fn)
  return () => {
    lostListeners.delete(fn)
  }
}
