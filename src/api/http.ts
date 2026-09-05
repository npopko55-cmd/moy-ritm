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
 *     запускается в одном месте — общим промисом.
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

export function createHttpApi(rawBase: string): Api {
  const base = rawBase.replace(/\/+$/, '')

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

  async function send(method: Method, path: string, opts: Options): Promise<Response> {
    const headers: Record<string, string> = {}
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
    if (opts.auth !== false && accessToken) headers.Authorization = `Bearer ${accessToken}`
    try {
      return await fetch(base + path, {
        method,
        headers,
        credentials: 'include',
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      })
    } catch {
      // fetch падает только на сетевых бедах: сервер не поднят, нет интернета.
      throw ApiError.offline()
    }
  }

  async function parse<T>(res: Response): Promise<T> {
    const text = await res.text()
    let data: unknown = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = null
    }
    if (res.ok) return data as T
    throw ApiError.fromBody(res.status, data)
  }

  /** Обновление токена: параллельные вызовы ждут один и тот же запрос. */
  function refreshOnce(): Promise<TokenResponse> {
    if (!refreshing) {
      refreshing = send('POST', '/auth/refresh', { auth: false })
        .then((res) => parse<TokenResponse>(res))
        .then((data) => {
          accessToken = data.access_token
          return data
        })
        .finally(() => {
          refreshing = null
        })
    }
    return refreshing
  }

  /**
   * Запрос с одной попыткой обновить токен. Повтор ровно один: если и после
   * свежего токена 401 — дело не в сроке, и крутить круги незачем.
   */
  async function request<T>(method: Method, path: string, opts: Options = {}): Promise<T> {
    const res = await send(method, path, opts)
    if (res.status !== 401 || opts.auth === false) return parse<T>(res)

    try {
      await refreshOnce()
    } catch {
      sessionLost()
      return parse<T>(res)
    }
    return parse<T>(await send(method, path, opts))
  }

  return {
    isDemo: false,

    /* ——— Вход и учётная запись ——— */

    register: (body: RegisterBody) =>
      request<MessageResponse>('POST', '/auth/register', { body, auth: false }),

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
