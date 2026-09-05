/**
 * Защита маршрутов.
 *
 * Решает, какой экран показать, а не что разрешить: контентные ручки закрыты
 * на бэкенде и сами отвечают 403 access_required. Обход этих обёрток руками
 * в адресной строке ничего не даёт.
 */

import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { hasAccess, type Access } from '../api/types'
import { STREAMS } from '../data/streams'
import { Waiting } from '../screens/Account'
import { useSession } from './SessionProvider'

/** Куда вернуть человека после входа. */
export const nextParam = (pathname: string, search = '') =>
  `?next=${encodeURIComponent(pathname + search)}`

/** Первый поток — с него начинается тренировка по умолчанию. */
export const FIRST_STREAM = `/start/${STREAMS[0].id}`

/**
 * Куда ведёт «Влиться в поток» (раздел 2 архитектуры):
 * не вошёл — на вход и обратно сюда, вошёл без доступа — в тарифы,
 * с доступом — в отсчёт.
 */
export function flowTarget(signedIn: boolean, access: Access | null): string {
  if (!signedIn) return `/login${nextParam(FIRST_STREAM)}`
  return hasAccess(access) ? FIRST_STREAM : '/tariffs'
}

/** Не вошёл — на вход, с адресом возврата. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { me, loading } = useSession()
  const { pathname, search } = useLocation()

  if (loading) return <Waiting />
  if (!me) return <Navigate to={`/login${nextParam(pathname, search)}`} replace />
  return <>{children}</>
}

/** Доступа нет или он закончился — на тарифы, со строкой почему. */
export function RequireAccess({ children }: { children: ReactNode }) {
  const { access, loading } = useSession()

  if (loading) return <Waiting />
  if (!hasAccess(access)) {
    return <Navigate to="/tariffs" state={{ accessReason: access?.status ?? 'none' }} replace />
  }
  return <>{children}</>
}
