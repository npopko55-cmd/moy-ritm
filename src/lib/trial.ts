/**
 * Пробный период воронки — по ответу GET /player/bootstrap.
 *
 * Отдельной ручки у пробного периода нет: объект `trial` приходит в
 * bootstrap плеера. Поэтому здесь последний ответ bootstrap, общий для всех:
 *   • охранник тренировки (RequireTrial в auth/guards.tsx) решает по нему,
 *     пускать ли в отсчёт и плеер или показать /trial-ended и /offer;
 *   • плеер берёт отсюда тот же ответ, если он совсем свежий, — второго
 *     запроса сразу после охранника не будет;
 *   • блок разблокировки и экран паузы печатают, сколько пробного осталось.
 *
 * Вернулся человек в приложение (src/lib/appReturn.ts) — ответ помечается
 * устаревшим: пока его не было, он мог оплатить доступ или потренироваться в
 * другом окне, и следующий вход в тренировку спросит сервер заново.
 *
 * Решает по-прежнему бэкенд: free_tier в том же ответе уже урезан по
 * пробному периоду, а контентные ручки закрыты сами. Здесь — только какой
 * экран показать.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { api } from '../api/client'
import { hasAccess, type Access, type PlayerBootstrap, type Trial } from '../api/types'
import { useSession } from '../auth/SessionProvider'
import { onAppReturn } from './appReturn'
import { plural } from './date'

const DAY_MS = 86_400_000

/** Ответ моложе этого плеер берёт без нового запроса. */
const REUSE_MS = 10_000

type Snapshot = {
  userId: string
  boot: PlayerBootstrap
  at: number
  /** После тренировки счёт тренировок trial20 мог сдвинуться — нужен свежий ответ. */
  stale: boolean
}

let snap: Snapshot | null = null
let pending: { userId: string; job: Promise<PlayerBootstrap> } | null = null
const listeners = new Set<() => void>()

const emit = () => listeners.forEach((fn) => fn())
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
const getSnap = () => snap

/**
 * Bootstrap для этого человека. `reuseMs` — насколько старый ответ годится
 * без запроса; 0 — только свежий. Параллельные вызовы ждут один запрос.
 */
export function loadBootstrap(userId: string, reuseMs = REUSE_MS): Promise<PlayerBootstrap> {
  if (snap && snap.userId === userId && !snap.stale && Date.now() - snap.at < reuseMs) {
    return Promise.resolve(snap.boot)
  }
  if (pending?.userId === userId) return pending.job
  const job = api.playerBootstrap().then((boot) => {
    snap = { userId, boot, at: Date.now(), stale: false }
    emit()
    return boot
  })
  const entry = { userId, job }
  pending = entry
  const clear = () => {
    if (pending === entry) pending = null
  }
  job.then(clear, clear)
  return job
}

/**
 * Последний ответ bootstrap этого человека — сразу, без запроса, даже
 * устаревший. Плеер берёт из него бесплатный уровень в первом же рендере:
 * охранник тренировки этот ответ уже дождался, и колода не пересобирается,
 * когда плеер спросит сервер сам.
 */
export function lastBootstrap(userId: string | undefined): PlayerBootstrap | null {
  return snap && userId && snap.userId === userId ? snap.boot : null
}

/** Заранее, пока человек смотрит на кнопку «Влиться в поток»: тогда отсчёт не ждёт ответа. */
export function warmTrial(userId: string | undefined): void {
  if (userId) loadBootstrap(userId, 60_000).catch(() => undefined)
}

/**
 * Плеер закрылся — тренировки trial20 могли прибавиться. Следующий вход в
 * тренировку спросит сервер заново. То же — при возвращении в приложение.
 *
 * Подписчики узнают об этом сразу: охранник тренировки и страницы пробного
 * периода перечитают ответ в фоне, не убирая того, что уже на экране.
 */
export function markTrialStale(): void {
  if (!snap || snap.stale) return
  snap = { ...snap, stale: true }
  emit()
}

// Вернулись в приложение — ответ мог устареть: оплата, тренировки в другом окне.
onAppReturn(markTrialStale)

/**
 * Хватает ли того, что знаем, чтобы решить про пробный период. У trial3d
 * срок идёт по часам и считается из ends_at, у кого воронки нет — ничего не
 * меняется. Свежий ответ нужен только trial20 после тренировки.
 */
function knownFor(s: Snapshot | null, userId: string | undefined): boolean {
  if (!s || !userId || s.userId !== userId) return false
  return !s.stale || s.boot.trial?.funnel !== 'trial20'
}

/** Предложение после 10-й тренировки показано: второй раз не зовём. */
export function markOfferSeen(): void {
  const trial = snap?.boot.trial
  if (!snap || !trial) return
  snap = { ...snap, boot: { ...snap.boot, trial: { ...trial, offer_due: false } } }
  emit()
}

/**
 * Пробный период вошедшего по последнему ответу и знаем ли мы его.
 * Не вошёл или ответа ещё нет — trial null.
 */
export function useTrialState(): { trial: Trial | null; known: boolean; userId: string | undefined } {
  const { me } = useSession()
  const s = useSyncExternalStore(subscribe, getSnap)
  const userId = me?.user.id
  const mine = s && userId && s.userId === userId ? s : null
  return { trial: mine?.boot.trial ?? null, known: knownFor(s, userId), userId }
}

export function useTrial(): Trial | null {
  return useTrialState().trial
}

/**
 * Пробный период кончился. trial3d проверяем и по часам: ответ мог прийти
 * до конца срока, а вкладка — провисеть открытой дольше.
 */
export function trialExpired(trial: Trial | null | undefined): boolean {
  if (!trial?.funnel) return false
  if (trial.state === 'expired') return true
  return (
    trial.state === 'active' &&
    trial.funnel === 'trial3d' &&
    Boolean(trial.ends_at) &&
    Date.parse(trial.ends_at as string) <= Date.now()
  )
}

/** В тренировку не пускаем: пробный кончился, а оплаченного доступа нет. */
export const trialBlocks = (trial: Trial | null | undefined, access: Access | null): boolean =>
  !hasAccess(access) && trialExpired(trial)

/** trial20: пора один раз показать предложение тарифов перед отсчётом. */
export const offerDue = (trial: Trial | null | undefined, access: Access | null): boolean =>
  !hasAccess(access) &&
  trial?.funnel === 'trial20' &&
  trial.state === 'active' &&
  trial.offer_due === true

/**
 * trial20 идёт: открыто всё, ограничено только число тренировок. Блоку
 * разблокировки обещать «все движения» тут нечего — они уже открыты.
 */
export const trialOpensAll = (trial: Trial | null | undefined, access: Access | null): boolean =>
  !hasAccess(access) && trial?.funnel === 'trial20' && trial.state === 'active' && !trialExpired(trial)

/** trial3d: дней осталось — по ends_at, если он есть, иначе как прислал сервер. */
function daysLeft(trial: Trial): number {
  if (trial.ends_at) return Math.max(0, Math.ceil((Date.parse(trial.ends_at) - Date.now()) / DAY_MS))
  return Math.max(0, trial.days_left ?? 0)
}

/** trial20: сколько бесплатных тренировок осталось. */
export function workoutsLeft(trial: Trial | null | undefined): number {
  if (!trial || trial.workouts_limit == null) return 0
  return Math.max(0, trial.workouts_limit - (trial.workouts_done ?? 0))
}

/**
 * Подсказка о пробном периоде для блока разблокировки и экрана паузы.
 * Нет пробного, он кончился или доступ оплачен — null, и там всё как было.
 */
export function trialHint(trial: Trial | null | undefined, access: Access | null): string | null {
  if (!trial?.funnel || trial.state !== 'active' || hasAccess(access) || trialExpired(trial)) return null
  if (trial.funnel === 'trial3d') {
    return `Пробный доступ: ещё ${plural(daysLeft(trial), 'день', 'дня', 'дней')}`
  }
  if (trial.workouts_limit == null) return null
  return `Бесплатных тренировок: осталось ${workoutsLeft(trial)} из ${trial.workouts_limit}`
}

/**
 * Страницы пробного периода: человек ушёл оплачивать (в мини-апе — во
 * внешний браузер) и вернулся на вкладку. Перечитываем доступ и пробный
 * период — оплата пришла, и страница сама уведёт в продукт.
 */
export function useRecheckOnReturn(): void {
  const { me, reload } = useSession()
  const userId = me?.user.id
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      void reload()
      if (userId) loadBootstrap(userId, 0).catch(() => undefined)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [reload, userId])
}

/**
 * Пробный период для страниц /trial-ended и /offer. Открыли по прямой
 * ссылке — ответа ещё нет, спрашиваем сервер. `failed` — не ответил.
 *
 * Страница уже показана, а ответ устарел (вернулись в приложение) — он
 * перечитывается в фоне, а страница остаётся на месте, а не пропадает до
 * ответа: `known` для неё остаётся true.
 */
export function useTrialPage(): { trial: Trial | null; known: boolean; failed: boolean } {
  const { trial, known, userId } = useTrialState()
  const [failed, setFailed] = useState(false)
  const shown = useRef(false)
  if (known) shown.current = true
  useEffect(() => {
    if (known || !userId) return
    let alive = true
    loadBootstrap(userId, 0).catch(() => {
      if (alive) setFailed(true)
    })
    return () => {
      alive = false
    }
  }, [known, userId])
  return { trial, known: known || shown.current, failed }
}
