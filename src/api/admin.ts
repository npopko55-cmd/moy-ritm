/**
 * Админские ручки аналитики воронок — только для страницы /admin.
 *
 * Отдельно от client.ts намеренно: у администратора свой токен и своя
 * жизнь. Токен лежит в sessionStorage (закрыл вкладку — вышел) и никогда не
 * попадает в общий SessionProvider, чтобы не смешаться с входом человека в
 * этом же браузере. По той же причине запросы идут без cookie
 * (credentials: 'omit'): вход администратора ставит свою refresh-cookie, и
 * она не должна подменить cookie пользователя. Истёк токен — просто вход
 * заново, обновления по cookie здесь нет.
 *
 * Файл грузится только вместе со страницей /admin. Без VITE_API_URL (GitHub
 * Pages) — фиктивные данные из demo.ts, чтобы страница открывалась и там.
 */

import { ApiError, type Funnel } from './types'

/** Одна колонка сравнения: воронка целиком. */
export type FunnelSummary = {
  funnel: Funnel
  /** Токен ссылки входа: https://ritmritm.ru/go/<token>. */
  token: string
  visitors: number
  bot_starts: number
  registered: number
  email_verified: number
  started: number
  /** Дошли до предложения тарифов — есть только у trial20. */
  reached_offer: number | null
  expired: number
  paid_users: number
  revenue: number
  currency: string
}

/** Тариф в строке человека: бэкенд может прислать строкой или объектом. */
export type FunnelUserTariff = string | { code?: string; name?: string } | null

export type FunnelUser = {
  user_id: string
  email: string
  name: string | null
  telegram_username: string | null
  funnel: Funnel
  registered_at: string
  email_verified: boolean
  active_days: number
  total_seconds: number
  total_steps: number
  workouts: number
  last_activity_at: string | null
  paid: boolean
  tariff: FunnelUserTariff
  paid_amount: number | null
}

export type FunnelUsersPage = { items: FunnelUser[]; total: number; page: number; per_page: number }

export type UsersSort = 'registered_at' | 'total_seconds' | 'active_days'

/** Период сводки: даты YYYY-MM-DD включительно. Пусто — за всё время. */
export type Period = { from?: string; to?: string }

export type UsersQuery = { funnel: Funnel; page: number; per_page: number; sort: UsersSort }

export interface AdminApi {
  readonly isDemo: boolean
  /** Токен администратора. 401 — неверная почта, пароль или это не админ. */
  login(email: string, password: string): Promise<string>
  summary(token: string, period: Period): Promise<FunnelSummary[]>
  users(token: string, query: UsersQuery): Promise<FunnelUsersPage>
  usersCsv(token: string, funnel: Funnel): Promise<Blob>
}

const TIMEOUT_MS = 20_000
const TOKEN_KEY = 'moy-ritm.admin_token'

/* ——— Токен администратора ——— */

export function readAdminToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function saveAdminToken(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token)
  } catch {
    /* приватный режим — токен проживёт до перезагрузки в памяти страницы */
  }
}

export function forgetAdminToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    /* нечего забывать */
  }
}

/** Отказ по токену: пора показать форму входа снова. */
export const adminSignedOut = (e: unknown): boolean =>
  e instanceof ApiError && (e.status === 401 || e.status === 403)

/* ——— Настоящий бэкенд ——— */

function query(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') q.set(key, String(value))
  }
  const text = q.toString()
  return text ? `?${text}` : ''
}

function createHttpAdminApi(rawBase: string): AdminApi {
  const base = rawBase.trim().replace(/\/+$/, '')

  async function send(method: 'GET' | 'POST', path: string, token?: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = {}
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (token) headers.Authorization = `Bearer ${token}`
    const ctrl = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      ctrl.abort()
    }, TIMEOUT_MS)
    try {
      const res = await fetch(base + path, {
        method,
        headers,
        // Без cookie в обе стороны: см. комментарий в начале файла.
        credentials: 'omit',
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      })
      if (!res.ok) {
        let data: unknown = null
        try {
          data = JSON.parse(await res.text())
        } catch {
          data = null
        }
        throw ApiError.fromBody(res.status, data)
      }
      return res
    } catch (e) {
      if (e instanceof ApiError) throw e
      throw timedOut ? ApiError.timeout() : ApiError.offline()
    } finally {
      clearTimeout(timer)
    }
  }

  const json = async <T>(res: Promise<Response>): Promise<T> => (await (await res).json()) as T

  return {
    isDemo: false,

    async login(email, password) {
      const data = await json<{ access_token: string }>(
        send('POST', '/admin/auth/login', undefined, { email, password }),
      )
      return data.access_token
    },

    async summary(token, period) {
      const data = await json<{ funnels: FunnelSummary[] }>(
        send('GET', `/admin/funnels/summary${query({ from: period.from, to: period.to })}`, token),
      )
      return data.funnels
    },

    users: (token, q) =>
      json<FunnelUsersPage>(
        send(
          'GET',
          `/admin/funnels/users${query({ funnel: q.funnel, page: q.page, per_page: q.per_page, sort: q.sort, order: 'desc' })}`,
          token,
        ),
      ),

    async usersCsv(token, funnel) {
      const res = await send('GET', `/admin/funnels/users.csv${query({ funnel })}`, token)
      return res.blob()
    },
  }
}

/**
 * Демо — через import(), как и пользовательское: в боевой сборке ветка
 * мёртвая и фиктивные данные в неё не попадают.
 */
function lazyDemoAdminApi(): AdminApi {
  const impl = () => import('./demo').then((m) => m.createDemoAdminApi())
  return {
    isDemo: true,
    login: (email, password) => impl().then((a) => a.login(email, password)),
    summary: (token, period) => impl().then((a) => a.summary(token, period)),
    users: (token, q) => impl().then((a) => a.users(token, q)),
    usersCsv: (token, funnel) => impl().then((a) => a.usersCsv(token, funnel)),
  }
}

export const adminApi: AdminApi = import.meta.env.VITE_API_URL
  ? createHttpAdminApi(import.meta.env.VITE_API_URL)
  : lazyDemoAdminApi()
