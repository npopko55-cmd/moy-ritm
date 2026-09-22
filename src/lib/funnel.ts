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
import { telegramStartParam } from './telegram'

const ANON_KEY = 'moy-ritm.anon'
const TOKEN_KEY = 'moy-ritm.funnel_token'
/** Токен из параметра запуска, визит по которому уже ушёл в этом открытии мини-апа. */
const LAUNCH_KEY = 'moy-ritm.funnel_launch'

/** Так выглядит токен ссылки воронки. Другое значение startapp — не воронка. */
const TOKEN_RE = /^[A-Za-z0-9_-]{4,64}$/

const uuid = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`

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

/** Один визит на токен за жизнь страницы: StrictMode не должен считать дважды. */
const visits = new Map<string, Promise<boolean>>()

/**
 * Визит по ссылке воронки: POST /funnel/visit с анонимным id. true — такая
 * воронка есть; незнакомый токен или сбой — false. Не падает.
 */
export function visitFunnel(token: string): Promise<boolean> {
  let job = visits.get(token)
  if (!job) {
    job = api.funnelVisit(token, anonId()).then(
      () => true,
      () => false,
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
 * Telegram его не повторяет. Отдаёт токен найденной воронки или null и не
 * падает. Запоминать ли токен для регистрации, решает SessionProvider:
 * только если человек не вошёл.
 */
export function launchFunnel(): Promise<string | null> {
  launch ??= (async () => {
    const token = telegramStartParam()
    if (!TOKEN_RE.test(token) || launchCounted(token)) return null
    const found = await visitFunnel(token)
    markLaunchCounted(token)
    return found ? token : null
  })()
  return launch
}
