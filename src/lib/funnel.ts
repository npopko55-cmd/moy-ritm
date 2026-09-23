/**
 * Метка воронки и анонимный id посетителя.
 *
 * Человек приходит из Telegram по ссылке входа /go/<токен> или открывает
 * мини-ап ссылкой t.me/<бот>/<app>?startapp=<токен> (launchFunnel). Визит в
 * обоих случаях один и тот же (visitFunnel). Токен сохраняем
 * до регистрации и отдаём в POST /auth/register (funnel_token) — дальше
 * метку воронки хранит бэкенд, а токен здесь больше не нужен. Какая это
 * воронка, фронтенд не решает: токен передаётся из адреса как есть.
 *
 * Анонимный id нужен бэкенду, чтобы считать уникальные визиты по ссылке,
 * а не открытия страницы. Хранилище может быть недоступно (приватный режим)
 * — тогда id живёт до перезагрузки, а токен просто не запоминается.
 */

import { api } from '../api/client'
import { ApiError } from '../api/types'
import { telegramStartParam } from './telegram'
import { uuid } from './uuid'

const ANON_KEY = 'moy-ritm.anon'
const TOKEN_KEY = 'moy-ritm.funnel_token'
/** Токен из параметра запуска, визит по которому уже ушёл в этом открытии мини-апа. */
const LAUNCH_KEY = 'moy-ritm.funnel_launch'

/** Так выглядит токен ссылки воронки. Другое значение startapp — не воронка. */
const TOKEN_RE = /^[A-Za-z0-9_-]{4,64}$/

/**
 * Похоже ли значение на токен воронки. Нужно, когда сервер не ответил: такой
 * токен запоминаем до регистрации, а мусор из адреса — нет (длиннее 64
 * знаков его не примет уже сама регистрация).
 */
export const isFunnelToken = (value: string): boolean => TOKEN_RE.test(value)

/** id на время жизни страницы, если в localStorage записать нельзя. */
let memoryAnon: string | null = null

export function anonId(): string {
  try {
    const saved = localStorage.getItem(ANON_KEY)
    if (saved) return saved
    const id = uuid()
    localStorage.setItem(ANON_KEY, id)
    return id
  } catch {
    return (memoryAnon ??= uuid())
  }
}

export function saveFunnelToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    /* приватный режим — зарегистрируется без метки */
  }
}

export function readFunnelToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY) || null
  } catch {
    return null
  }
}

export function forgetFunnelToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* нечего забывать */
  }
}

/**
 * Чем кончился визит по ссылке воронки:
 *   • ok — воронка есть;
 *   • not_found — сервер ответил 404 FUNNEL_NOT_FOUND: такой ссылки нет
 *     (или воронки выключены);
 *   • error — ответа по существу нет: сеть, таймаут, 429, 5xx и всё прочее.
 *
 * Сбой — не «ссылки нет». Раньше любой сбой считался незнакомым токеном,
 * метка терялась, и человек регистрировался без воронки. Теперь при сбое
 * токен всё равно запоминается: при регистрации его проверит сам сервер,
 * незнакомый он просто не поставит.
 */
export type FunnelVisitResult = 'ok' | 'not_found' | 'error'

/** Один визит на токен за жизнь страницы: StrictMode не должен считать дважды. */
const visits = new Map<string, Promise<FunnelVisitResult>>()

/** Визит по ссылке воронки: POST /funnel/visit с анонимным id. Не падает. */
export function visitFunnel(token: string): Promise<FunnelVisitResult> {
  let job = visits.get(token)
  if (!job) {
    job = api.funnelVisit(token, anonId()).then(
      (): FunnelVisitResult => 'ok',
      (e: unknown): FunnelVisitResult =>
        e instanceof ApiError && e.status === 404 && e.code === 'FUNNEL_NOT_FOUND' ? 'not_found' : 'error',
    )
    visits.set(token, job)
  }
  return job
}

function launchCounted(token: string): boolean {
  try {
    return sessionStorage.getItem(LAUNCH_KEY) === token
  } catch {
    return false
  }
}

function markLaunchCounted(token: string): void {
  try {
    sessionStorage.setItem(LAUNCH_KEY, token)
  } catch {
    /* приватный режим — перезагрузка пришлёт визит ещё раз, это не страшно */
  }
}

let launch: Promise<string | null> | null = null

/**
 * Воронка из параметра запуска мини-апа — та же ссылка входа, что
 * /go/<токен>. Визит — один раз за открытие мини-апа: перезагрузка внутри
 * Telegram его не повторяет. Отдаёт токен или null и не падает. Запоминать
 * ли токен для регистрации, решает SessionProvider: только если человек не
 * вошёл.
 *
 * Токен отдаётся и при сбое визита (сеть, 429, 5xx): метку проверит
 * регистрация. null — только если сервер ответил, что такой ссылки нет.
 * Засчитанным визит считаем лишь по ответу сервера — после сбоя
 * перезагрузка мини-апа пошлёт его ещё раз.
 */
export function launchFunnel(): Promise<string | null> {
  launch ??= (async () => {
    const token = telegramStartParam()
    if (!TOKEN_RE.test(token) || launchCounted(token)) return null
    const result = await visitFunnel(token)
    if (result !== 'error') markLaunchCounted(token)
    return result === 'not_found' ? null : token
  })()
  return launch
}
