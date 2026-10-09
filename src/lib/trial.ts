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
 * После конца trial3d (правка 09.10.2026, Дима: «оставить 5 бесплатных
 * движений, чтобы человек не уходил совсем, как у бывших покупателей»)
 * сервер оставляет первые free_tier.exercise_limit движений (настройка
 * TRIAL3D_AFTER_EXERCISES, 5). Первый вход в тренировку после конца — всё
 * равно страница «Бесплатный доступ истёк» с тарифами и ссылкой «Продолжить
 * бесплатно»; дальше охранник пускает в плеер, как бывшего покупателя
 * (trialSendsToEnded). Лимит 0 — по-старому: страница закрывает тренировку.
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
import { ALL_MOVES, DEFAULT_FREE_TIER } from '../data/streams'
import { onAppReturn } from './appReturn'
import { plural } from './date'

const DAY_MS = 86_400_000

/** Ответ моложе этого плеер берёт без нового запроса. */
const REUSE_MS = 10_000

/**
 * Сколько движений называем в текстах челленджа trial20 — число заказчика
 * («Все 40 — в полном доступе»), а не длина каталога: каталог меняется, когда
 * ролики скрывают и возвращают, а обещание в текстах — нет.
 */
export const CATALOG_MOVES_TEXT = 40

/**
 * «+35 движений» — сколько движений оплата добавит к бесплатным: первый
 * пункт того, что входит в подписку, на странице тарифов и в демо-ответе
 * GET /tariffs. Считается от CATALOG_MOVES_TEXT, а не от длины каталога — по
 * той же причине: в текстах везде 40, сколько бы роликов ни было скрыто.
 */
export const EXTRA_MOVES_LABEL = `+${plural(
  CATALOG_MOVES_TEXT - DEFAULT_FREE_TIER.exercise_limit,
  'движение',
  'движения',
  'движений',
)}`

/** Бесплатных движений челленджа, если сервер не прислал free_tier. */
const CHALLENGE_MOVES = 10

type Snapshot = {
  userId: string
  boot: PlayerBootstrap
  at: number
  /** Вернулись в приложение или закрыли плеер — ответ мог устареть, нужен свежий. */
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
 * Плеер закрылся — у trial20 мог подойти срок предложения тарифов, доступ
 * мог появиться. Следующий вход в тренировку спросит сервер заново. То же —
 * при возвращении в приложение.
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
 * меняется. Свежий ответ нужен только trial20: положено ли предложение
 * тарифов (offer_due), знает сервер.
 */
function knownFor(s: Snapshot | null, userId: string | undefined): boolean {
  if (!s || !userId || s.userId !== userId) return false
  // trial3d кончился по часам уже после этого ответа (вкладка провисела
  // открытой). Что кончился — видно и так, но сколько движений остаётся
  // после пробного (free_tier.exercise_limit при expired), знает только
  // сервер — спрашиваем заново (09.10.2026). Ответ, полученный уже после
  // ends_at, берём как есть: иначе при спешащих часах телефона, пока сервер
  // ещё говорит active, спрашивали бы по кругу.
  const trial = s.boot.trial
  if (trial?.funnel === 'trial3d' && trial.state === 'active' && trial.ends_at) {
    const ends = Date.parse(trial.ends_at)
    if (ends <= Date.now() && s.at < ends) return false
  }
  return !s.stale || trial?.funnel !== 'trial20'
}

/** Предложение челленджа показано: второй раз не зовём. */
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

/**
 * Пробный кончился, а оплаченного доступа нет. С 09.10.2026 это ещё не
 * «тренировка закрыта»: в trial3d после конца могут остаться бесплатные
 * движения (afterTrialMoves), и куда вести, решает trialSendsToEnded. Здесь —
 * есть ли человеку что делать на странице /trial-ended.
 */
export const trialBlocks = (trial: Trial | null | undefined, access: Access | null): boolean =>
  !hasAccess(access) && trialExpired(trial)

/**
 * Сколько движений бесплатно после конца trial3d — как прислал сервер
 * (free_tier.exercise_limit при state = expired, настройка
 * TRIAL3D_AFTER_EXERCISES). 0 — после пробного закрыто всё (настройка
 * выключена), либо пробный кончился только по часам и ответа сервера о
 * конце ещё нет. Правка 09.10.2026.
 */
export function afterTrialMoves(trial: Trial | null | undefined): number {
  if (trial?.funnel !== 'trial3d' || trial.state !== 'expired') return 0
  return Math.max(0, freeLimit() ?? 0)
}

/**
 * «Бесплатный доступ истёк» уже показан этому человеку — второй раз
 * охранник туда не ведёт (09.10.2026). Отметка в localStorage по id
 * человека: на другом устройстве страницу покажут ещё раз, и это не беда.
 * Хранилище недоступно (приватный режим, запрет сайта) — помним до
 * перезагрузки вкладки: страница тогда покажется снова, но «Продолжить
 * бесплатно» всё равно ведёт в плеер, а не обратно сюда.
 */
const ENDED_SEEN_KEY = 'moy-ritm.trial_ended_seen'
const endedSeenHere = new Set<string>()

export function trialEndedSeen(userId: string | undefined): boolean {
  if (!userId) return false
  if (endedSeenHere.has(userId)) return true
  try {
    return localStorage.getItem(`${ENDED_SEEN_KEY}.${userId}`) === '1'
  } catch {
    return false
  }
}

export function markTrialEndedSeen(userId: string | undefined): void {
  if (!userId) return
  endedSeenHere.add(userId)
  try {
    localStorage.setItem(`${ENDED_SEEN_KEY}.${userId}`, '1')
  } catch {
    // Хранилище недоступно — хватит памяти вкладки (endedSeenHere).
  }
}

/**
 * Охраннику тренировки: увести на /trial-ended. Пробный кончился, оплаты
 * нет, и либо бесплатных движений после него нет (TRIAL3D_AFTER_EXERCISES =
 * 0 — по-старому), либо человек эту страницу ещё не видел. Видел — пускаем в
 * плеер с бесплатными движениями и плашкой «Открой все 40», как бывшего
 * покупателя. Правка 09.10.2026.
 */
export const trialSendsToEnded = (
  trial: Trial | null | undefined,
  access: Access | null,
  userId: string | undefined,
): boolean => trialBlocks(trial, access) && !(afterTrialMoves(trial) > 0 && trialEndedSeen(userId))

/** trial20: пора один раз показать предложение тарифов перед отсчётом. */
export const offerDue = (trial: Trial | null | undefined, access: Access | null): boolean =>
  !hasAccess(access) &&
  trial?.funnel === 'trial20' &&
  trial.state === 'active' &&
  trial.offer_due === true

/** Действующий лимит движений из последнего ответа — как его прислал сервер. */
function freeLimit(): number | null {
  return snap?.boot.free_tier?.exercise_limit ?? null
}

/**
 * trial3d идёт и открыты все движения. Блоку разблокировки обещать «все
 * движения» тут нечего — они уже открыты. Лимит сверяем с каталогом: если
 * сервер настроен на часть движений (TRIAL3D_EXERCISES), это уже не «все».
 */
export const trialOpensAll = (trial: Trial | null | undefined, access: Access | null): boolean =>
  !hasAccess(access) &&
  trial?.funnel === 'trial3d' &&
  trial.state === 'active' &&
  !trialExpired(trial) &&
  (freeLimit() ?? 0) >= ALL_MOVES.length

/** trial3d: дней осталось — по ends_at, если он есть, иначе как прислал сервер. */
function daysLeft(trial: Trial): number {
  if (trial.ends_at) return Math.max(0, Math.ceil((Date.parse(trial.ends_at) - Date.now()) / DAY_MS))
  return Math.max(0, trial.days_left ?? 0)
}

/** trial20: сколько движений бесплатно — как прислал сервер. */
export function challengeMoves(): number {
  return freeLimit() ?? CHALLENGE_MOVES
}

/**
 * Подсказка о пробном периоде для блока разблокировки, экрана паузы и
 * «Моего прогресса». Нет пробного, он кончился или доступ оплачен — null, и
 * там всё как было.
 *   • trial3d: «Пробный доступ: ещё 2 дня, открыты все движения»;
 *   • trial20: «Челлендж: 10 движений бесплатно. Все 40 — в полном доступе».
 */
export function trialHint(trial: Trial | null | undefined, access: Access | null): string | null {
  if (!trial?.funnel || trial.state !== 'active' || hasAccess(access) || trialExpired(trial)) return null
  if (trial.funnel === 'trial3d') {
    const days = `Пробный доступ: ещё ${plural(daysLeft(trial), 'день', 'дня', 'дней')}`
    return trialOpensAll(trial, access) ? `${days}, открыты все движения` : days
  }
  const free = plural(challengeMoves(), 'движение', 'движения', 'движений')
  return `Челлендж: ${free} бесплатно. Все ${CATALOG_MOVES_TEXT} — в полном доступе`
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
