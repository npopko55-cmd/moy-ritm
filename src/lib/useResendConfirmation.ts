/**
 * «Отправить письмо ещё раз» — повторное письмо для подтверждения почты.
 *
 * Кнопка живёт в нескольких местах: плашка на главной, страница оплаты
 * /pay, «Проверяем оплату» и строка «Почта» в профиле. Логика у всех одна,
 * поэтому она здесь, а вид каждый экран рисует сам.
 *
 * Сервер шлёт не чаще письма в минуту (письмо при регистрации тоже
 * считается) и не больше пяти в сутки, сверх этого — 429 со сроком. Пока
 * срок идёт, кнопка неактивна и считает время назад. Конец паузы лежит в
 * localStorage: отсчёт переживает перезагрузку и переход между экранами.
 */

import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import { ApiError } from '../api/types'
import { useSession } from '../auth/SessionProvider'
import { errorText } from '../screens/Account'

/** Пауза после отправленного письма и при 429 без срока — как у сервера. */
const PAUSE_SECONDS = 60

const KEY = 'moy-ritm.resendUntil'

/** Конец паузы (мс) у этого человека. Нет, прошёл или хранилище закрыто — 0. */
function loadUntil(userId: string | undefined): number {
  if (!userId) return 0
  try {
    const until = Number(localStorage.getItem(`${KEY}.${userId}`))
    return Number.isFinite(until) && until > Date.now() ? until : 0
  } catch {
    return 0
  }
}

function saveUntil(userId: string | undefined, until: number): void {
  if (!userId) return
  try {
    localStorage.setItem(`${KEY}.${userId}`, String(until))
  } catch {
    /* приватный режим или запрет хранилища — отсчёт доживёт до перезагрузки */
  }
}

/** «0:59» — до часа; дольше (суточный потолок) — «3 ч 20 мин». */
export function waitText(seconds: number): string {
  if (seconds <= 3600) {
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  }
  const minutes = Math.ceil(seconds / 60)
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} ч ${m} мин` : `${h} ч`
}

export type ResendConfirmation = {
  busy: boolean
  /** Ответ сервера после успешной отправки. */
  ok: string
  /** Что пошло не так; при 429 — текст сервера про лимит. */
  error: string
  /** Письмо уходит или идёт пауза. */
  disabled: boolean
  /** Подпись кнопки; `idle` — её обычный текст на этом экране. */
  label: (idle: string) => string
  send: () => Promise<void>
}

export function useResendConfirmation(): ResendConfirmation {
  const { me, reload } = useSession()
  const userId = me?.user.id
  const [state, setState] = useState({ busy: false, ok: '', error: '' })
  const [until, setUntil] = useState(() => loadUntil(userId))
  const [now, setNow] = useState(() => Date.now())

  // Профиль пришёл позже экрана или вошёл другой человек — пауза у него своя.
  useEffect(() => {
    setNow(Date.now())
    setUntil(loadUntil(userId))
  }, [userId])

  // Тикаем раз в секунду, пока пауза идёт; кончилась — таймер снимаем.
  useEffect(() => {
    if (until <= Date.now()) return
    const timer = window.setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (t >= until) window.clearInterval(timer)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [until])

  const send = useCallback(async () => {
    // «Сейчас» ставим вместе с концом паузы: иначе первая отрисовка считала
    // бы от давнего тика и показала лишние секунды.
    const pause = (seconds: number) => {
      const t = Date.now()
      const end = t + seconds * 1000
      setNow(t)
      setUntil(end)
      saveUntil(userId, end)
    }

    setState({ busy: true, ok: '', error: '' })
    try {
      const res = await api.resendConfirmation()
      setState({ busy: false, ok: res.message, error: '' })
      pause(PAUSE_SECONDS)
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) {
        // Срок: из тела, иначе из Retry-After (это уже сделал разбор ошибки),
        // иначе минута. Текст — серверный: он объясняет, какой лимит упёрся.
        setState({ busy: false, ok: '', error: e.message })
        pause(e.retry_after && e.retry_after > 0 ? e.retry_after : PAUSE_SECONDS)
      } else {
        setState({ busy: false, ok: '', error: errorText(e) })
      }
      return
    }
    // Перечитываем профиль: почту могли подтвердить в соседней вкладке,
    // пока человек был здесь. В демо кнопка подтверждает её сама — строка
    // про подтверждение пропадает сразу. reload сам не бросает.
    await reload()
  }, [reload, userId])

  const left = Math.max(0, Math.ceil((until - now) / 1000))

  const label = (idle: string) => {
    if (state.busy) return 'Отправляем…'
    if (!left) return idle
    return state.ok
      ? `Письмо отправлено · повторно через ${waitText(left)}`
      : `Повторно через ${waitText(left)}`
  }

  return { ...state, disabled: state.busy || left > 0, label, send }
}
