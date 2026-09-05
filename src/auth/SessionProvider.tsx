/**
 * Кто вошёл и что ему доступно — одно место на всё приложение.
 *
 * При открытии страницы молча пробуем обновить токен по cookie: получилось —
 * человек вошёл, 401 — показываем «Войти». Так работает и после перезагрузки,
 * и через неделю (раздел 2 архитектуры).
 *
 * Состояние доступа приходит вместе с профилем, поэтому отдельного запроса
 * «а оплачено ли» нет: `access` — это `me.access`.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from '../api/client'
import type { Access, Me } from '../api/types'
import { saveMoveInterval } from '../lib/settings'

type SessionValue = {
  /** null — не вошёл. */
  me: Me | null
  /** Короткая дорога до me.access: им пользуются почти все экраны. */
  access: Access | null
  /** true, пока идёт первая попытка узнать, вошёл ли человек. */
  loading: boolean
  /** Перечитать профиль с сервера. */
  reload(): Promise<Me | null>
  signIn(email: string, password: string): Promise<Me>
  signOut(): Promise<void>
  /** Положить свежий профиль без запроса: PATCH возвращает его целиком. */
  setMe(me: Me): void
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  // Живо ли ещё дерево: StrictMode монтирует его дважды, и ответ от первой
  // попытки не должен оживлять размонтированный контекст.
  const alive = useRef(true)

  const reload = useCallback(async () => {
    try {
      const next = await api.getMe()
      if (alive.current) setMe(next)
      return next
    } catch {
      if (alive.current) setMe(null)
      return null
    }
  }, [])

  useEffect(() => {
    alive.current = true

    // Сессия перестала действовать посреди работы — гасим состояние, чтобы
    // защита маршрутов увела на вход, а не показывала пустые экраны.
    const off = api.onSessionLost(() => {
      if (alive.current) setMe(null)
    })

    void (async () => {
      try {
        await api.refresh()
        await reload()
      } catch {
        // Обычное «не вошёл»: cookie нет или она уже не действует.
        if (alive.current) setMe(null)
      } finally {
        if (alive.current) setLoading(false)
      }
    })()

    return () => {
      alive.current = false
      off()
    }
  }, [reload])

  const signIn = useCallback(async (email: string, password: string) => {
    await api.login(email, password)
    const next = await api.getMe()
    setMe(next)
    return next
  }, [])

  const signOut = useCallback(async () => {
    try {
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
    () => ({ me, access: me?.access ?? null, loading, reload, signIn, signOut, setMe }),
    [me, loading, reload, signIn, signOut],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession вызван вне SessionProvider')
  return value
}
