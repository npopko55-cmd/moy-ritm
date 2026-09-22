/**
 * Защита маршрутов.
 *
 * Решает, какой экран показать, а не что разрешить: контентные ручки закрыты
 * на бэкенде и сами отвечают 403 access_required. Обход этих обёрток руками
 * в адресной строке ничего не даёт.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation, useParams } from 'react-router-dom'
import { DEFAULT_STREAM, getStream } from '../data/streams'
import { useFlow, type FlowSession } from '../flow/FlowSession'
import { loadBootstrap, offerDue, trialBlocks, useTrialState } from '../lib/trial'
import { OFFLINE_WAITING, Waiting } from '../screens/Account'
import { useSession } from './SessionProvider'

/** Куда вернуть человека после входа. */
export const nextParam = (pathname: string, search = '') =>
  `?next=${encodeURIComponent(pathname + search)}`

/**
 * Параметр next, если ему можно верить: только путь внутри сайта. Ссылку
 * «/login?next=https://чужой.сайт» или «//чужой.сайт» пропускать нельзя.
 */
export function safeNext(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null
  return raw
}

/** Поток по умолчанию — с него начинается тренировка. Выбора больше нет. */
export const FIRST_STREAM = `/start/${DEFAULT_STREAM.id}`

/**
 * Куда ведёт «Влиться в поток»: не вошёл — на вход и обратно сюда,
 * вошёл — сразу в отсчёт, оплачено или нет.
 *
 * Тренировка уже идёт (человек вышел из плеера в меню и вернулся) — ведём
 * прямо в плеер, минуя отсчёт: он и так в потоке, музыка стоит на своей
 * секунде, и начинать заново нечего.
 *
 * На тарифы отсюда больше не уводим. Пейволл живёт внутри тренировки —
 * ярким блоком разблокировки: человек сначала пробует бесплатный поток и
 * только потом решает, платить ли.
 */
export function flowTarget(signedIn: boolean, flow?: FlowSession | null): string {
  const target = flow ? `/player/${flow.streamId}` : FIRST_STREAM
  return signedIn ? target : `/login${nextParam(target)}`
}

/** Подпись той же кнопки: заход продолжается — значит, «вернуться». */
export function flowLabel(flow?: FlowSession | null): string {
  return flow ? 'Вернуться в поток' : 'Влиться в поток'
}

/**
 * Не вошёл — на вход, с адресом возврата. Пока это неизвестно (сервер не
 * отвечает), ждём: увести на вход того, кто вошёл, хуже, чем подождать.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { me, loading, offline } = useSession()
  const { pathname, search } = useLocation()

  if (loading) return <Waiting text={offline ? OFFLINE_WAITING : undefined} />
  if (!me) return <Navigate to={`/login${nextParam(pathname, search)}`} replace />
  return <>{children}</>
}

/** Сколько ждём ответа о пробном периоде, прежде чем пустить без него. */
const TRIAL_WAIT_MS = 5000

/**
 * Пробный период воронки — единственное место, где он решает, пускать ли в
 * тренировку. Стоит на отсчёте (`start`) и плеере, поэтому сюда приходят
 * все кнопки разом: «Влиться в поток» на главной, в «Моём прогрессе», в
 * меню, «Вернуться в поток» и прямые ссылки.
 *
 *   • пробный кончился, оплаченного доступа нет → /trial-ended;
 *   • trial20 и пора предложение (offer_due) → /offer, но только перед
 *     отсчётом и не посреди идущей тренировки: в плеер возвращаем как есть.
 *
 * Пока ответа bootstrap нет — пустой фон, как у подгрузки экрана. Сервер
 * молчит дольше TRIAL_WAIT_MS или ответил ошибкой — пускаем: закрывает
 * контент всё равно бэкенд, а тренировку из-за сети не отнимаем.
 */
export function RequireTrial({ start = false, children }: { start?: boolean; children: ReactNode }) {
  const { access } = useSession()
  const { session: flow } = useFlow()
  const { streamId } = useParams()
  const { trial, known, userId } = useTrialState()
  const [gaveUp, setGaveUp] = useState(false)

  useEffect(() => {
    if (known || !userId) return
    let alive = true
    const stop = () => {
      if (alive) setGaveUp(true)
    }
    const timer = window.setTimeout(stop, TRIAL_WAIT_MS)
    loadBootstrap(userId, 0).catch(stop)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [known, userId])

  if (!known && !gaveUp) return null
  if (trialBlocks(trial, access)) return <Navigate to="/trial-ended" replace />
  const resuming = flow?.streamId === getStream(streamId).id
  if (start && !resuming && offerDue(trial, access)) return <Navigate to="/offer" replace />
  return <>{children}</>
}

/*
 * Обёртки RequireAccess здесь больше нет: тренировка открыта любому
 * вошедшему. Что именно ему доступно — бесплатный поток из нескольких
 * движений или всё сразу — решает плеер по bootstrap.free_tier, а
 * контентные ручки бэкенда по-прежнему закрыты сами.
 */
