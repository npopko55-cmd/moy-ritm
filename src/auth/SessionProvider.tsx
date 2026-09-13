/**
 * Кто вошёл и что ему доступно — одно место на всё приложение.
 *
 * При открытии страницы молча пробуем обновить токен по cookie: получилось —
 * человек вошёл, 401 — показываем «Войти». Так работает и после перезагрузки,
 * и через неделю (раздел 2 архитектуры).
 *
 * Сеть и 5xx — не ответ на вопрос «вошёл ли». Бэкенд перезапускается, у
 * человека моргнул интернет: выкидывать его на вход из-за этого нельзя.
 * При старте такие сбои повторяем с паузой, пока сервер не ответит по
 * существу, а посреди работы просто оставляем текущего пользователя.
 *
 * Состояние доступа приходит вместе с профилем, поэтому отдельного запроса
 * «а оплачено ли» нет: `access` — это `me.access`.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { api, type RegisterBody } from '../api/client'
import { ApiError, type Access, type Me, type RegisterResponse } from '../api/types'
import { flushBeforeSignOut } from '../lib/chunks'
import { saveMoveInterval } from '../lib/settings'

/** Паузы между попытками узнать, вошёл ли человек, пока сервер не отвечает; дальше — по последней. */
const RETRY_MS = [1000, 2000, 4000, 8000, 15000, 30000]

/** Сервер ответил, но это сбой, а не отказ: сеть, 5xx, 429. */
const isTemporary = (e: unknown) => !(e instanceof ApiError) || e.temporary

type SessionValue = {
  /** null — не вошёл. */
  me: Me | null
  /** Короткая дорога до me.access: им пользуются почти все экраны. */
  access: Access | null
  /**
   * true, пока неизвестно, вошёл ли человек: идёт первая попытка или сервер
   * пока не отвечает и мы пробуем снова. Защита маршрутов в это время ждёт,
   * а не уводит на вход.
   */
  loading: boolean
  /** Первая попытка упёрлась в сеть или сервер — ждём и повторяем. */
  offline: boolean
  /** Перечитать профиль с сервера. */
  reload(): Promise<Me | null>
  /**
   * Регистрация. При `registered` человек уже вошёл — профиль сразу
   * оказывается в контексте, и главная встречает его своим.
   */
  signUp(body: RegisterBody): Promise<RegisterResponse>
  signIn(email: string, password: string): Promise<Me>
  signOut(): Promise<void>
  /** Положить свежий профиль без запроса: PATCH возвращает его целиком. */
  setMe(me: Me): void
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)
  // Живо ли ещё дерево: StrictMode монтирует его дважды, и ответ от первой
  // попытки не должен оживлять размонтированный контекст.
  const alive = useRef(true)
  // Текущий пользователь для обработчиков, которые не пересоздаются.
  const meRef = useRef(me)
  meRef.current = me

  const reload = useCallback(async () => {
    try {
      const next = await api.getMe()
      if (alive.current) setMe(next)
      return next
    } catch (e) {
      // Сеть, 5xx посреди перезапуска бэкенда — человек по-прежнему вошёл:
      // оставляем того, кто был. Сбрасываем только по отказу сервера — 401
      // уже после неудачного обновления токена (или 403 на /me без токена).
      if (isTemporary(e)) return meRef.current
      if (alive.current) setMe(null)
      return null
    }
  }, [])

  useEffect(() => {
    alive.current = true
    // Своя отметка у каждого запуска эффекта: в StrictMode первый запуск
    // снимается сразу, и его запоздалый ответ ничего не должен менять.
    let cancelled = false
    let timer: number | undefined
    let attempt = 0
    let busy = false
    let refreshed = false

    // Сессия перестала действовать посреди работы — гасим состояние, чтобы
    // защита маршрутов увела на вход, а не показывала пустые экраны.
    const off = api.onSessionLost(() => {
      if (alive.current) setMe(null)
    })

    const settle = (next: Me | null) => {
      setMe(next)
      setOffline(false)
      setLoading(false)
      window.removeEventListener('online', retryNow)
      document.removeEventListener('visibilitychange', retryNow)
    }

    const tryOnce = async () => {
      if (cancelled || busy) return
      busy = true
      window.clearTimeout(timer)
      try {
        // Токен уже получили, а профиль не пришёл — второй раз cookie не крутим.
        if (!refreshed) {
          await api.refresh()
          refreshed = true
        }
        const next = await api.getMe()
        if (!cancelled) settle(next)
      } catch (e) {
        if (cancelled) return
        if (!isTemporary(e)) {
          // Обычное «не вошёл»: cookie нет или она уже не действует.
          settle(null)
          return
        }
        // Сервер не ответил по существу — это не «не вошёл». Ждём и пробуем
        // ещё раз, а экраны пока показывают ожидание, а не форму входа.
        setOffline(true)
        timer = window.setTimeout(() => void tryOnce(), RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)])
        attempt += 1
      } finally {
        busy = false
      }
    }

    // Сеть вернулась или вкладку открыли снова — не ждём конца паузы.
    function retryNow() {
      if (document.visibilityState === 'visible' && attempt > 0) void tryOnce()
    }
    window.addEventListener('online', retryNow)
    document.addEventListener('visibilitychange', retryNow)

    void tryOnce()

    return () => {
      alive.current = false
      cancelled = true
      window.clearTimeout(timer)
      window.removeEventListener('online', retryNow)
      document.removeEventListener('visibilitychange', retryNow)
      off()
    }
  }, [])

  const signUp = useCallback(async (body: RegisterBody) => {
    const res = await api.register(body)
    // Занятая почта токенов не даёт — в контексте ничего не меняем.
    if (res.status === 'registered') {
      const next = await api.getMe()
      if (alive.current) setMe(next)
    }
    return res
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    await api.login(email, password)
    const next = await api.getMe()
    setMe(next)
    return next
  }, [])

  const signOut = useCallback(async () => {
    const userId = meRef.current?.user.id
    try {
      // Неотправленные минуты уходят, пока токен ещё действует, — но выход
      // ждёт их не дольше пары секунд. Идущую тренировку после выхода
      // стирает FlowProvider: он следит, кто вошёл.
      if (userId) await flushBeforeSignOut(userId)
      await api.logout()
    } finally {
      // Даже если сервер не ответил: человек нажал «Выйти» и должен выйти.
      api.clearSession()
      setMe(null)
    }
  }, [])

  // Источник истины по настройкам — сервер, но плеер стартует мгновенно и
  // ждать профиля не может. Поэтому интервал смены движения дублируется в
  // localStorage: свежий профиль всегда переписывает кэш.
  useEffect(() => {
    if (me) saveMoveInterval(me.settings.move_interval_seconds)
  }, [me])

  const value = useMemo<SessionValue>(
    () => ({ me, access: me?.access ?? null, loading, offline, reload, signUp, signIn, signOut, setMe }),
    [me, loading, offline, reload, signUp, signIn, signOut],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession вызван вне SessionProvider')
  return value
}
