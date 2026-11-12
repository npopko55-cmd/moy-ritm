/**
 * Персональные предложения на экране тарифов (backend/app/services/offer_service.py).
 *
 * Сервер решает всё: выдать ли предложение, какой приз у колеса, сколько оно
 * действует. Здесь — только показ:
 *   • useOffers — состояние для тарифов: POST /offers/paywall при открытии
 *     (вошедшим), колесо, уход с тарифов. Гостю и при ошибке — пусто: тарифы
 *     работают как раньше;
 *   • useCountdown — честный отсчёт до expires_at по часам сервера: разница
 *     между server_time ответа и часами устройства учитывается, поэтому
 *     переведённые часы телефона отсчёт не растянут;
 *   • последнее состояние кэшируется: страница оплаты узнаёт по нему код
 *     скрытого тарифа предложения (на витрине его нет).
 */

import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import type { ExitOfferState, OffersState, PersonalOffer } from '../api/types'

/** Часы сервера минус часы устройства, мс. */
let skewMs = 0
let cached: OffersState | null = null

function remember(state: OffersState): OffersState {
  skewMs = Date.parse(state.server_time) - Date.now()
  if (!Number.isFinite(skewMs)) skewMs = 0
  cached = state
  return state
}

/** Сейчас по часам сервера. */
export const serverNow = (): number => Date.now() + skewMs

/** Действующее предложение из последнего ответа — для страницы оплаты. */
export function cachedOffer(): PersonalOffer | null {
  const offer = cached?.offer ?? null
  return offer && Date.parse(offer.expires_at) > serverNow() ? offer : null
}

export type Offers = {
  state: OffersState | null
  spin(): Promise<OffersState | null>
  skipWheel(): void
  /** Уход с тарифов: предложение (новое или напоминание) или null — уходим. */
  leave(): Promise<ExitOfferState | null>
  /** Срок вышел — перечитать: предложения больше нет, цена обычная. */
  refresh(): void
}

export function useOffers(enabled: boolean): Offers {
  const [state, setState] = useState<OffersState | null>(null)
  const [round, setRound] = useState(0)

  useEffect(() => {
    if (!enabled) {
      setState(null)
      return
    }
    let alive = true
    api.offersPaywall().then(
      (s) => {
        if (alive) setState(remember(s))
      },
      () => {
        if (alive) setState(null)
      },
    )
    return () => {
      alive = false
    }
  }, [enabled, round])

  const spin = useCallback(async () => {
    try {
      const s = remember(await api.offersSpin())
      setState(s)
      return s
    } catch {
      setState((prev) => (prev ? { ...prev, wheel: false } : prev))
      return null
    }
  }, [])

  const skipWheel = useCallback(() => {
    setState((prev) => (prev ? { ...prev, wheel: false } : prev))
    api.offersSkipWheel().then(
      (s) => setState(remember(s)),
      () => undefined,
    )
  }, [])

  const leave = useCallback(async () => {
    try {
      const s = await api.offersExit()
      remember(s)
      setState(s)
      return s
    } catch {
      return null
    }
  }, [])

  const refresh = useCallback(() => setRound((n) => n + 1), [])

  return { state, spin, skipWheel, leave, refresh }
}

/** «14:32» или «23:59:10»: сколько осталось до конца предложения. */
export function formatLeft(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

/** Отсчёт до expiresAt по часам сервера; раз в секунду. done — срок вышел. */
export function useCountdown(expiresAt: string | null | undefined): { left: string; done: boolean } {
  const end = expiresAt ? Date.parse(expiresAt) : NaN
  const [now, setNow] = useState(serverNow)
  useEffect(() => {
    if (!Number.isFinite(end)) return
    const id = window.setInterval(() => setNow(serverNow()), 1000)
    return () => window.clearInterval(id)
  }, [end])
  if (!Number.isFinite(end)) return { left: '', done: true }
  return { left: formatLeft(end - now), done: end - now <= 0 }
}
