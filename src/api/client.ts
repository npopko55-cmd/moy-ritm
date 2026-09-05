/**
 * Единый интерфейс работы с бэкендом и выбор реализации.
 *
 * Реализаций две и они взаимозаменяемы:
 *   • http.ts — настоящий бэкенд, адрес из VITE_API_URL;
 *   • demo.ts — память браузера, для GitHub Pages, где бэкенда нет.
 *
 * В интерфейсе перечислены ВСЕ пользовательские ручки, включая те, что нужны
 * экранам статистики, профиля и помощи. Так эти экраны пишутся без правок
 * клиента: метод уже есть в обеих реализациях.
 */

import { createDemoApi } from './demo'
import { createHttpApi } from './http'
import type {
  Access,
  Chunk,
  ChunksResponse,
  Me,
  MessageResponse,
  PaymentCheck,
  PaymentLink,
  PlayerBootstrap,
  SessionRow,
  Settings,
  StatsProgress,
  StatsSummary,
  SupportCreated,
  SupportTopic,
  Tariff,
  TokenResponse,
} from './types'

export type RegisterBody = {
  email: string
  password: string
  name?: string
  /** IANA-строка из Intl.DateTimeFormat().resolvedOptions().timeZone. */
  timezone?: string
}

/** Явный null у name стирает имя; у timezone null игнорируется. */
export type PatchMeBody = { name?: string | null; timezone?: string }

export type PatchSettingsBody = Partial<Settings>

export interface Api {
  /** true — работаем без бэкенда, на данных из этого браузера. */
  readonly isDemo: boolean

  /* ——— Вход и учётная запись ——— */
  register(body: RegisterBody): Promise<MessageResponse>
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

  /* ——— Поддержка ——— */
  supportRequest(topic: SupportTopic, message: string): Promise<SupportCreated>

  /* ——— Служебное для контекста сессии ——— */
  /** Забыть access-токен: выход и потерянная сессия. */
  clearSession(): void
  /**
   * Подписка на «сессия больше не действует»: обновление по cookie не
   * прошло. Возвращает функцию отписки.
   */
  onSessionLost(listener: () => void): () => void
}

/** Пустая строка и «undefined» из окружения — это «адреса нет». */
const baseUrl = (import.meta.env.VITE_API_URL ?? '').trim()

/**
 * Адрес API задан — работаем с бэкендом, не задан — демо-режим.
 * На GitHub Pages переменная не задаётся намеренно: бэкенда там нет.
 */
export const api: Api = baseUrl ? createHttpApi(baseUrl) : createDemoApi()

/** Показать подпись «Демо-режим…» на экране входа. */
export const IS_DEMO = api.isDemo

export type { Access, Me, Settings, Tariff }
