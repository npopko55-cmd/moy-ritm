/**
 * Единый интерфейс работы с бэкендом и выбор реализации.
 *
 * Реализаций две и они взаимозаменяемы:
 *   • http.ts — настоящий бэкенд, адрес из VITE_API_URL;
 *   • demo.ts — память браузера, для GitHub Pages, где бэкенда нет.
 *     Подключается через import() и только при пустом VITE_API_URL: адрес
 *     подставляется при сборке, ветка с демо в боевой сборке мёртвая, и
 *     сборщик выбрасывает её вместе с демо-кодом.
 *
 * В интерфейсе перечислены все пользовательские ручки, которыми пользуются
 * экраны. Ручку обращений в поддержку (POST /support/requests) фронтенд не
 * зовёт: формы обращения нет — писем с неё никто не получает, связь только
 * через Telegram.
 */

import { createHttpApi } from './http'
import type {
  Access,
  Chunk,
  ChunksResponse,
  FunnelVisit,
  Me,
  MessageResponse,
  PaymentCheck,
  PaymentLink,
  PlayerBootstrap,
  RegisterResponse,
  SessionRow,
  Settings,
  StatsProgress,
  StatsSummary,
  Tariff,
  TelegramAuthResponse,
  TokenResponse,
} from './types'

export type RegisterBody = {
  email: string
  password: string
  name?: string
  /** IANA-строка из Intl.DateTimeFormat().resolvedOptions().timeZone. */
  timezone?: string
  /** Токен ссылки воронки (/go/<токен>), если человек пришёл по ней. */
  funnel_token?: string
}

/** Явный null у name стирает имя; у timezone null игнорируется. */
export type PatchMeBody = { name?: string | null; timezone?: string }

export type PatchSettingsBody = Partial<Settings>

export interface Api {
  /** true — работаем без бэкенда, на данных из этого браузера. */
  readonly isDemo: boolean

  /* ——— Вход и учётная запись ——— */
  /** Успешная регистрация сразу входит: в ответе те же токены, что у login. */
  register(body: RegisterBody): Promise<RegisterResponse>
  confirmEmail(token: string): Promise<MessageResponse>
  /** Письмо с подтверждением ещё раз. Требует входа. */
  resendConfirmation(): Promise<MessageResponse>
  login(email: string, password: string): Promise<TokenResponse>
  /** Обновление access-токена по cookie. Один на всё приложение. */
  refresh(): Promise<TokenResponse>
  logout(): Promise<MessageResponse>
  logoutAll(): Promise<MessageResponse>
  forgotPassword(email: string): Promise<MessageResponse>
  resetPassword(token: string, newPassword: string): Promise<MessageResponse>
  changePassword(currentPassword: string, newPassword: string): Promise<MessageResponse>
  changeEmail(newEmail: string, currentPassword: string): Promise<MessageResponse>
  confirmNewEmail(token: string): Promise<MessageResponse>

  /* ——— Профиль, настройки, сессии ——— */
  getMe(): Promise<Me>
  patchMe(body: PatchMeBody): Promise<Me>
  getSettings(): Promise<Settings>
  patchSettings(body: PatchSettingsBody): Promise<Settings>
  getSessions(): Promise<{ items: SessionRow[] }>
  deleteSession(id: string): Promise<MessageResponse>
  deleteAccountRequest(currentPassword: string): Promise<MessageResponse>
  deleteAccountConfirm(token: string): Promise<MessageResponse>

  /* ——— Тарифы и оплата ——— */
  getTariffs(): Promise<Tariff[]>
  paymentLink(tariffCode: string): Promise<PaymentLink>
  paymentCheck(): Promise<PaymentCheck>

  /* ——— Плеер и статистика ——— */
  playerBootstrap(): Promise<PlayerBootstrap>
  sendChunks(chunks: Chunk[]): Promise<ChunksResponse>
  statsSummary(): Promise<StatsSummary>
  /** month в формате YYYY-MM; без него — текущий месяц человека. */
  statsProgress(month?: string): Promise<StatsProgress>

  /* ——— Воронки ——— */
  /**
   * Заход по ссылке воронки. Входа не требует. `anonId` — постоянный id
   * посетителя из localStorage: по нему бэкенд считает уникальные визиты.
   * Незнакомый токен — 404 FUNNEL_NOT_FOUND.
   */
  funnelVisit(token: string, anonId: string): Promise<FunnelVisit>
  /** Предложение тарифов после 10-й тренировки показано. Требует входа. */
  funnelOfferSeen(): Promise<{ ok: boolean }>

  /* ——— Telegram Mini App ——— */
  /**
   * Вход по initData. При `logged_in` человек уже вошёл — как после login.
   * 401 TELEGRAM_BAD_SIGNATURE, 503 TELEGRAM_DISABLED.
   */
  telegramAuth(initData: string): Promise<TelegramAuthResponse>
  /** Привязать Telegram к вошедшему. 409 TELEGRAM_ALREADY_LINKED. */
  linkTelegram(initData: string): Promise<Me>

  /* ——— Служебное для контекста сессии ——— */
  /** Забыть access-токен: выход и потерянная сессия. */
  clearSession(): void
  /**
   * Подписка на «сессия больше не действует»: обновление по cookie не
   * прошло. Возвращает функцию отписки.
   */
  onSessionLost(listener: () => void): () => void
}

/**
 * Демо-API, которое подгружается при первом обращении.
 *
 * Экраны зовут методы синхронно (`api.getMe()`), поэтому наружу отдаём
 * обёртку: каждый метод дожидается загрузки модуля и зовёт настоящий.
 * Демо живёт в localStorage и отвечает мгновенно — лишний промис незаметен.
 */
function lazyDemoApi(): Api {
  let loaded: Promise<Api> | null = null
  const impl = () => (loaded ??= import('./demo').then((m) => m.createDemoApi()))

  const target = {
    isDemo: true,
    clearSession() {
      void impl().then((a) => a.clearSession())
    },
    onSessionLost(listener: () => void) {
      let off: (() => void) | null = null
      let cancelled = false
      void impl().then((a) => {
        if (!cancelled) off = a.onSessionLost(listener)
      })
      return () => {
        cancelled = true
        off?.()
      }
    },
  }

  return new Proxy(target, {
    get(obj, name: string | symbol) {
      // Обёртка не должна притворяться промисом или чем-то ещё служебным.
      if (typeof name !== 'string' || name === 'then') return undefined
      if (name in obj) return obj[name as keyof typeof obj]
      return (...args: unknown[]) =>
        impl().then((a) => (a[name as keyof Api] as (...rest: unknown[]) => unknown)(...args))
    },
  }) as unknown as Api
}

/**
 * Адрес API задан — работаем с бэкендом, не задан — демо-режим.
 * На GitHub Pages переменная не задаётся намеренно: бэкенда там нет.
 *
 * Условие нарочно на самой переменной: Vite подставляет её значение при
 * сборке, и в боевой сборке `import('./demo')` оказывается в мёртвой ветке.
 * Пустая строка — это «адреса нет».
 */
export const api: Api = import.meta.env.VITE_API_URL
  ? createHttpApi(import.meta.env.VITE_API_URL)
  : lazyDemoApi()

/** Показать подпись «Демо-режим…» на экране входа. */
export const IS_DEMO = !import.meta.env.VITE_API_URL

export type { Access, Me, Settings, Tariff }
