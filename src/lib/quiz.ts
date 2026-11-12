/**
 * Квиз «План на 30 дней»: ответы в браузере и куда ведёт кнопка плана.
 *
 * Ответы лежат в localStorage (moy-ritm.quiz) — пригодятся плану в профиле
 * и письмам. На сервер пока не уходят: бэкенд квиза не знает. Хранилище
 * закрыто (приватный режим) — квиз работает, план просто не запомнится.
 *
 * Метка воронки — как у остальных входов (src/lib/funnel.ts): ссылка
 * /quiz/<токен> запоминает токен до регистрации так же, как /go/<токен>, и
 * регистрация отдаёт его бэкенду. Квиз своей метки не придумывает.
 */

import { parseAnswers, type QuizAnswers } from '../data/quiz'
import { readFunnelToken, saveFunnelToken } from './funnel'
import { GUEST_NEXT } from './guest'

const STORAGE_KEY = 'moy-ritm.quiz'

type Saved = {
  v: 1
  answers: QuizAnswers
  /** Когда увидели план (ISO). */
  done_at: string
  /** Когда нажали кнопку плана (ISO). */
  cta_at?: string
}

function read(): Saved | null {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Saved> | null
    const answers = parseAnswers(raw?.answers)
    if (!raw || raw.v !== 1 || !answers || typeof raw.done_at !== 'string') return null
    return { v: 1, answers, done_at: raw.done_at, ...(typeof raw.cta_at === 'string' ? { cta_at: raw.cta_at } : {}) }
  } catch {
    return null
  }
}

function write(saved: Saved | null): void {
  try {
    if (saved) localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* приватный режим — план не запомнится, квиз от этого не ломается */
  }
}

/** Ответы прошлого прохождения — тогда квиз сразу показывает план. */
export const savedQuizAnswers = (): QuizAnswers | null => read()?.answers ?? null

/** План собран — запоминаем ответы. */
export function saveQuizAnswers(answers: QuizAnswers): void {
  write({ v: 1, answers, done_at: new Date().toISOString() })
}

/** «Пройти заново». */
export const forgetQuiz = (): void => write(null)

function markCta(): void {
  const saved = read()
  if (saved) write({ ...saved, cta_at: new Date().toISOString() })
}

/* ——— Кнопка «Начать: 3 дня за 1 ₽» ——— */

/** Метка в адресе регистрации: человек пришёл из квиза. Регистрация её пока не читает. */
export const QUIZ_FROM = 'quiz'

/**
 * Куда ведёт кнопка плана, пока оплаты пробного за 1 ₽ нет: туда же, куда
 * сейчас ведёт старт пробного у гостя trial3d («3 дня бесплатно» на тарифах,
 * src/components/TariffPlans.tsx) — регистрация с токеном воронки, после
 * неё обычный плеер (GUEST_NEXT).
 *
 * Когда появится оплата пробного — поменять только эту константу (и при
 * необходимости ветку вошедшего в quizCtaPath ниже).
 */
export const QUIZ_CTA_PATH = `/register?next=${encodeURIComponent(GUEST_NEXT)}&from=${QUIZ_FROM}`

/**
 * Квиз открыли без токена (/quiz) и токена с прошлых ссылок нет — брать ли
 * токен «Сначала гость» (метка site, как у кнопки на главной). Без него
 * регистрация пройдёт без воронки, и трёх дней не будет. false — квиз без
 * токена в адресе метку не ставит вовсе.
 */
export const QUIZ_SITE_TOKEN_FALLBACK = true

/**
 * Адрес для кнопки плана. Единственное место, которое решает, куда она ведёт.
 *   • вошёл и доступ оплачен — в тренировку;
 *   • вошёл без оплаты — на тарифы (регистрация ему уже ни к чему);
 *   • не вошёл — QUIZ_CTA_PATH. Токен воронки к этому моменту уже запомнен,
 *     если пришёл по /quiz/<токен> или раньше по /go, /play; иначе — токен
 *     «Сначала гость» (QUIZ_SITE_TOKEN_FALLBACK).
 */
export function quizCtaPath(opts: { signedIn: boolean; paid: boolean; siteToken: string | null }): string {
  markCta()
  if (opts.signedIn) return opts.paid ? GUEST_NEXT : '/tariffs'
  if (QUIZ_SITE_TOKEN_FALLBACK && opts.siteToken && !readFunnelToken()) saveFunnelToken(opts.siteToken)
  return QUIZ_CTA_PATH
}
