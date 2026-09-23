/**
 * Возвращение в приложение.
 *
 * Человек ушёл оплачивать (из мини-апа — во внешний браузер), переключился
 * на другое приложение или свернул мини-ап — и вернулся. Пока его не было,
 * доступ мог открыться: оплата пришла, а профиль и ответ bootstrap в памяти
 * страницы — прежние, и мини-ап так и показывал блок разблокировки.
 *
 * Узнаём о возвращении двумя путями: вкладка снова на виду (visibilitychange)
 * и событие Telegram activated — свёрнутый мини-ап вкладку не прячет, и
 * первого события может не быть. Часто приходят оба разом, а переключаться
 * туда-сюда человек может каждые пару секунд, поэтому подписчиков зовём не
 * чаще раза в MIN_GAP_MS — всех разом, чтобы профиль и bootstrap
 * перечитывались вместе.
 *
 * Подписчики: SessionProvider (перечитать профиль), src/lib/trial.ts
 * (ответ bootstrap устарел) и плеер (перечитать bootstrap, если тренировка
 * на паузе).
 */

import { onTelegramEvent } from './telegram'

/** Не чаще раза в полминуты. */
const MIN_GAP_MS = 30_000

/** Только что открытой странице перечитывать нечего: всё загружено сейчас. */
let last = Date.now()
let wired = false
const listeners = new Set<() => void>()

function returned(): void {
  if (document.visibilityState === 'hidden') return
  const now = Date.now()
  if (now - last < MIN_GAP_MS) return
  last = now
  listeners.forEach((fn) => fn())
}

/** Подписаться на возвращение в приложение. Возвращает функцию отписки. */
export function onAppReturn(listener: () => void): () => void {
  if (!wired) {
    wired = true
    document.addEventListener('visibilitychange', returned)
    onTelegramEvent('activated', returned)
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
