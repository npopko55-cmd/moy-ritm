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
  BannerAction,
  BannerPlace,
  Checkout,
  Chunk,
  ChunksResponse,
  ExitOfferState,
  FunnelVisit,
  GuestBootstrap,
  GuestConfig,
  GuestEventBody,
  Me,
  MessageResponse,
  OffersState,
  PaymentCheck,
  PaymentLink,
  PlayerBootstrap,
  PlayerFault,
  RegisterResponse,
  SessionRow,
  Settings,
  StatsProgress,
  StatsSummary,
  SubscriptionCancel,
  SubscriptionState,
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
  /** Пришёл гостем со ссылки /play/: регистрация получит meta.guest. */
  guest?: boolean
  /**
   * Браузер гостя (anonId() из lib/funnel — тот же, что у гостевых событий),
   * только вместе с guest. Бэкенд кладёт его в meta.anon_id регистрации: по
   * нему админка видит, с какого показа окна гость зарегистрировался (09.10.2026).
   */
  anon_id?: string
  /**
   * Согласие на обработку персональных данных (/consent) — галочка в форме
   * регистрации. Без неё запрос не уходит, поэтому здесь всегда true.
   */
  personal_data_consent: true
  /**
   * Согласие на рекламные сообщения (/ads-consent) — вторая галочка формы,
   * необязательная и по умолчанию пустая (закон о рекламе). true — бэкенд
   * запишет момент и редакцию согласия; false — регистрация та же.
   */
  ads_consent?: boolean
}

/**
 * Явный null у name стирает имя; у timezone null игнорируется. ads_consent —
 * переключатель согласия на рекламу в настройках: true — дать, false — снять.
 */
export type PatchMeBody = { name?: string | null; timezone?: string; ads_consent?: boolean }

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
  /** Всё для страницы оплаты: карточка тарифа, виджет GetCourse, запасная ссылка. */
  paymentCheckout(tariffCode: string): Promise<Checkout>
  paymentCheck(): Promise<PaymentCheck>

  /* ——— Подписка через Продамус (backend/docs/PRODAMUS.md, «Подписка») ——— */
  subscriptionState(): Promise<SubscriptionState>
  /**
   * Ссылка на оформление. consentVersion — offer.consent_version: без
   * отмеченной галочки согласия на автосписание экран сюда не зовёт.
   */
  subscriptionCheckout(trial: boolean, consentVersion: string): Promise<{ page_url: string }>
  subscriptionCancel(): Promise<SubscriptionCancel>
  /** Год вместо месячной подписки (upsell): ссылка на разовую оплату года. */
  subscriptionUpgrade(): Promise<{ page_url: string }>

  /* ——— Персональные предложения на тарифах (offer_service на бэкенде) ——— */
  /** Тарифы показаны: действующее предложение, колесо, предложение при уходе. */
  offersPaywall(): Promise<OffersState>
  /** Колесо: приз выбирает сервер. 409 WHEEL_NOT_AVAILABLE — уже было. */
  offersSpin(): Promise<OffersState>
  /** Колесо закрыли, не вращая: больше не показываем. */
  offersSkipWheel(): Promise<OffersState>
  /** Уход с тарифов без оплаты. 409 EXIT_OFFER_NOT_AVAILABLE — показать нечего. */
  offersExit(): Promise<ExitOfferState>

  /* ——— Плеер и статистика ——— */
  playerBootstrap(): Promise<PlayerBootstrap>
  /**
   * Пакет кусков движения. keepalive — вкладку прячут или закрывают: запрос
   * должен дойти и без страницы (у демо ничего не меняет).
   */
  sendChunks(chunks: Chunk[], options?: { keepalive?: boolean }): Promise<ChunksResponse>
  statsSummary(): Promise<StatsSummary>
  /** month в формате YYYY-MM; без него — текущий месяц человека. */
  statsProgress(month?: string): Promise<StatsProgress>

  /* ——— Воронки ——— */
  /**
   * Заход по ссылке воронки. Входа не требует. `anonId` — постоянный id
   * посетителя из localStorage: по нему бэкенд считает уникальные визиты.
   * Незнакомый токен — 404 FUNNEL_NOT_FOUND.
   */
  funnelVisit(token: string, anonId: string, guest?: boolean): Promise<FunnelVisit>
  /**
   * Плеер гостя по ссылке /play/<токен>. Входа не требует; та же форма, что
   * playerBootstrap. Незнакомый токен — 404 FUNNEL_NOT_FOUND.
   */
  guestBootstrap(token: string): Promise<GuestBootstrap>
  /** Событие гостя: пуск тренировки, окно регистрации. Входа не требует, 204. */
  guestEvent(body: GuestEventBody): Promise<void>
  /** Ведёт ли «Включить эфир» невошедшего в гостевой режим. Входа не требует. */
  guestConfig(): Promise<GuestConfig>
  /**
   * Заход на сайт — счётчик «сколько людей заходит в день» в общей статистике
   * админки. Входа не требует и не передаёт: только `anonId`. 204; повтор за
   * те же сутки бэкенд молча не пишет.
   */
  siteVisit(anonId: string): Promise<void>
  /** Предложение тарифов после 10-й тренировки показано. Требует входа. */
  funnelOfferSeen(): Promise<{ ok: boolean }>
  /**
   * Плашка «Открой все 40»: показана или нажали «Открыть». Требует входа.
   * Показ бэкенд пишет не чаще раза в сутки по Москве, нажатие — каждое.
   */
  funnelBanner(action: BannerAction, place: BannerPlace): Promise<{ ok: boolean }>
  /**
   * Диагностика: сбой ролика в плеере. Зовётся только через
   * reportPlayerFault (src/api/playerFault.ts) — тот глотает любые ошибки.
   */
  playerFault(fault: PlayerFault): Promise<void>

  /* ——— Telegram Mini App ——— */
  /**
   * Вход по initData. При `logged_in` человек уже вошёл — как после login.
   * 401 TELEGRAM_BAD_SIGNATURE, 503 TELEGRAM_DISABLED.
   */
  telegramAuth(initData: string): Promise<TelegramAuthResponse>
  /** Привязать Telegram к вошедшему. 409 TELEGRAM_ALREADY_LINKED. */
  linkTelegram(initData: string): Promise<Me>
  /**
   * Привязать Telegram по токену из ссылки бота «Открыть в браузере»
   * (?tglink=…). 400 TELEGRAM_LINK_INVALID, 410 TELEGRAM_LINK_EXPIRED,
   * 409 TELEGRAM_ALREADY_LINKED / TELEGRAM_OTHER_LINKED.
   */
  linkTelegramToken(token: string): Promise<Me>

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
