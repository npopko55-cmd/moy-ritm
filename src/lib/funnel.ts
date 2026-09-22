/**
 * Метка воронки и анонимный id посетителя.
 *
 * Человек приходит из Telegram по ссылке входа /go/<токен>. Токен сохраняем
 * до регистрации и отдаём в POST /auth/register (funnel_token) — дальше
 * метку воронки хранит бэкенд, а токен здесь больше не нужен. Какая это
 * воронка, фронтенд не решает: токен передаётся из адреса как есть.
 *
 * Анонимный id нужен бэкенду, чтобы считать уникальные визиты по ссылке,
 * а не открытия страницы. Хранилище может быть недоступно (приватный режим)
 * — тогда id живёт до перезагрузки, а токен просто не запоминается.
 */

const ANON_KEY = 'moy-ritm.anon'
const TOKEN_KEY = 'moy-ritm.funnel_token'

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
