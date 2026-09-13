/**
 * Настоящий бэкенд поверх fetch.
 *
 * Три правила из docs/API.md, из которых вырос весь этот файл:
 *   • access-токен живёт 30 минут и хранится в памяти страницы, не в
 *     localStorage — иначе чужой скрипт унесёт его вместе с вкладкой;
 *   • refresh-токен лежит в httpOnly-cookie с Path=/api/v1/auth, поэтому
 *     каждый запрос идёт с credentials: 'include';
 *   • каждый успешный refresh отзывает предъявленный токен, и два
 *     параллельных обновления дадут 401 на втором. Значит обновление
 *     запускается в одном месте — общим промисом, а между вкладками —
 *     под общей блокировкой (cookie у вкладок одна на всех).
 */

import type { Api, PatchMeBody, PatchSettingsBody, RegisterBody } from './client'
import {
  ApiError,
  type Chunk,
  type ChunksResponse,
  type Me,
  type MessageResponse,
  type PaymentCheck,
  type PaymentLink,
  type PlayerBootstrap,
  type RegisterResponse,
  type SessionRow,
  type Settings,
  type StatsProgress,
  type StatsSummary,
  type SupportCreated,
  type SupportTopic,
  type Tariff,
  type TokenResponse,
} from './types'

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

type Options = {
  body?: unknown
  /** false — публичная ручка: ни заголовка, ни повтора после обновления. */
  auth?: boolean
}

/** Ответ, прочитанный целиком: тело читается под тем же таймаутом, что и заголовки. */
type Raw = { status: number; ok: boolean; text: string }

/**
 * Сколько ждём ответа. На зависшей мобильной сети fetch не падает сам —
 * без предела экраны вечно стояли бы на «Секунду…».
 */
const TIMEOUT_MS = 20_000

/** Имя межвкладочной блокировки на обновление токена. */
const REFRESH_LOCK = 'moy-ritm-refresh'

/**
 * Код бэкенда для истёкшего или недействительного access-токена
 * (app/security/tokens.py, app/dependencies.py). Другие 401 — например,
 * INVALID_CURRENT_PASSWORD при смене почты — к сроку токена отношения не
 * имеют: обновлять токен ради них значит тратить лимит и рисковать входом.
 */
const TOKEN_REJECTED = 'UNAUTHORIZED'

/** Код ошибки из тела `{error: {code}}`, не разбирая остального. */
function errorCode(raw: Raw): string | undefined {
  try {
    const code = (JSON.parse(raw.text) as { error?: { code?: unknown } } | null)?.error?.code
    return typeof code === 'string' ? code : undefined
  } catch {
    return undefined
  }
}

export function createHttpApi(rawBase: string): Api {
  const base = rawBase.trim().replace(/\/+$/, '')

  /** Токен в памяти модуля: перезагрузка страницы его теряет — так и надо. */
  let accessToken: string | null = null
  /** Один общий промис обновления на всё приложение. */
  let refreshing: Promise<TokenResponse> | null = null
  const listeners = new Set<() => void>()

  const clearSession = () => {
    accessToken = null
  }

  const sessionLost = () => {
    clearSession()
    listeners.forEach((fn) => fn())
  }

  async function send(method: Method, path: string, opts: Options): Promise<Raw> {
    const headers: Record<string, string> = {}
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
    if (opts.auth !== false && accessToken) headers.Authorization = `Bearer ${accessToken}`
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
        credentials: 'include',
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: ctrl.signal,
      })
      // Заголовки могли прийти, а тело — застрять: читаем его под тем же таймером.
      return { status: res.status, ok: res.ok, text: await res.text() }
    } catch {
      // fetch падает только на сетевых бедах: сервер не поднят, нет интернета,
      // или ответ не пришёл за TIMEOUT_MS и мы оборвали запрос сами.
      throw timedOut ? ApiError.timeout() : ApiError.offline()
    } finally {
      clearTimeout(timer)
    }
  }

  function parse<T>(raw: Raw): T {
    let data: unknown = null
    try {
      data = raw.text ? JSON.parse(raw.text) : null
    } catch {
      data = null
    }
    if (raw.ok) return data as T
    throw ApiError.fromBody(raw.status, data)
  }

  /**
   * Обновление токена: параллельные вызовы ждут один и тот же запрос.
   *
   * Внутри вкладки хватает общего промиса, но cookie у вкладок общая, а
   * refresh её ротирует: две вкладки разом — вторая предъявила бы уже
   * отозванный токен и получила 401. Поэтому сам запрос идёт под
   * navigator.locks: вторая вкладка дождётся первой и пойдёт уже с новой
   * cookie. Где блокировок нет (старые браузеры) — как раньше, без неё.
   */
  function refreshOnce(): Promise<TokenResponse> {
    if (!refreshing) {
      const run = async () => {
        const data = parse<TokenResponse>(await send('POST', '/auth/refresh', { auth: false }))
        accessToken = data.access_token
        return data
      }
      const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
      // request() ждёт обещание колбэка и отдаёт его значение, а типы DOM
      // оборачивают его ещё раз — отсюда приведение.
      const job: Promise<TokenResponse> =
        typeof locks?.request === 'function'
          ? (locks.request(REFRESH_LOCK, run) as unknown as Promise<TokenResponse>)
          : run()
      refreshing = job.finally(() => {
        refreshing = null
      })
    }
    return refreshing
  }

  /**
   * Запрос с одной попыткой обновить токен. Повтор ровно один: если и после
   * свежего токена 401 — дело не в сроке, и крутить круги незачем.
   *
   * Обновляем только на отказ по токену (TOKEN_REJECTED). Сессию считаем
   * потерянной, только если сервер отказал в обновлении по существу; сеть
   * и 5xx посреди перезапуска бэкенда — это ошибка запроса, а не выход.
   */
  async function request<T>(method: Method, path: string, opts: Options = {}): Promise<T> {
    const res = await send(method, path, opts)
    if (res.status !== 401 || opts.auth === false || errorCode(res) !== TOKEN_REJECTED) {
      return parse<T>(res)
    }

    try {
      await refreshOnce()
    } catch (e) {
      if (e instanceof ApiError && e.temporary) throw e
      sessionLost()
      return parse<T>(res)
    }
    return parse<T>(await send(method, path, opts))
  }

  return {
    isDemo: false,

    /* ——— Вход и учётная запись ——— */

    async register(body: RegisterBody) {
      const data = await request<RegisterResponse>('POST', '/auth/register', {
        body,
        auth: false,
      })
      // Регистрация теперь и есть вход: refresh-cookie бэкенд уже поставил,
      // остаётся запомнить access-токен. У занятой почты токенов нет.
      if (data.status === 'registered') accessToken = data.access_token
      return data
    },

    confirmEmail: (token) =>
      request<MessageResponse>('POST', '/auth/confirm-email', { body: { token }, auth: false }),

    resendConfirmation: () => request<MessageResponse>('POST', '/auth/resend-confirmation'),

    async login(email, password) {
      const data = await request<TokenResponse>('POST', '/auth/login', {
        body: { email, password },
        auth: false,
      })
      accessToken = data.access_token
      return data
    },

    refresh: () => refreshOnce(),

    async logout() {
      try {
        return await request<MessageResponse>('POST', '/auth/logout', { auth: false })
      } finally {
        // Токен забываем в любом случае: даже если сервер не ответил,
        // человек нажал «Выйти» и должен выйти.
        clearSession()
      }
    },

    async logoutAll() {
      try {
        return await request<MessageResponse>('POST', '/auth/logout-all')
      } finally {
        clearSession()
      }
    },

    forgotPassword: (email) =>
      request<MessageResponse>('POST', '/auth/forgot-password', { body: { email }, auth: false }),

    resetPassword: (token, newPassword) =>
      request<MessageResponse>('POST', '/auth/reset-password', {
        body: { token, new_password: newPassword },
        auth: false,
      }),

    changePassword: (currentPassword, newPassword) =>
      request<MessageResponse>('POST', '/auth/change-password', {
        body: { current_password: currentPassword, new_password: newPassword },
      }),

    changeEmail: (newEmail, currentPassword) =>
      request<MessageResponse>('POST', '/me/email', {
        body: { new_email: newEmail, current_password: currentPassword },
      }),

    confirmNewEmail: (token) =>
      request<MessageResponse>('POST', '/auth/confirm-new-email', { body: { token }, auth: false }),

    /* ——— Профиль, настройки, сессии ——— */

    getMe: () => request<Me>('GET', '/me'),
    patchMe: (body: PatchMeBody) => request<Me>('PATCH', '/me', { body }),
    getSettings: () => request<Settings>('GET', '/me/settings'),
    patchSettings: (body: PatchSettingsBody) => request<Settings>('PATCH', '/me/settings', { body }),
    getSessions: () => request<{ items: SessionRow[] }>('GET', '/me/sessions'),
    deleteSession: (id) => request<MessageResponse>('DELETE', `/me/sessions/${id}`),

    deleteAccountRequest: (currentPassword) =>
      request<MessageResponse>('POST', '/me/delete-request', {
        body: { current_password: currentPassword },
      }),

    // Входа не требует: письмо часто открывают на телефоне, где не залогинен.
    deleteAccountConfirm: (token) =>
      request<MessageResponse>('POST', '/me/delete-confirm', { body: { token }, auth: false }),

    /* ——— Тарифы и оплата ——— */

    getTariffs: () => request<Tariff[]>('GET', '/tariffs', { auth: false }),

    paymentLink: (tariffCode) =>
      request<PaymentLink>('POST', '/payments/link', { body: { tariff_code: tariffCode } }),

    paymentCheck: () => request<PaymentCheck>('POST', '/payments/check'),

    /* ——— Плеер и статистика ——— */

    playerBootstrap: () => request<PlayerBootstrap>('GET', '/player/bootstrap'),

    sendChunks: (chunks: Chunk[]) =>
      request<ChunksResponse>('POST', '/activity/chunks', { body: { chunks } }),

    statsSummary: () => request<StatsSummary>('GET', '/stats/summary'),

    statsProgress: (month) =>
      request<StatsProgress>(
        'GET',
        month ? `/stats/progress?month=${encodeURIComponent(month)}` : '/stats/progress',
      ),

    /* ——— Поддержка ——— */

    supportRequest: (topic: SupportTopic, message: string) =>
      request<SupportCreated>('POST', '/support/requests', { body: { topic, message } }),

    /* ——— Служебное ——— */

    clearSession,

    onSessionLost(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
