/**
 * Админские ручки: аналитика воронок, посты и рассылки, опрос — только для
 * страницы /admin.
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
  /**
   * Ссылка для канала — через бота: https://t.me/ritmritm_bot?start=<token>.
   * null или нет поля — бот не настроен (или бэкенд старый), тогда в
   * админке, как раньше, одна прямая ссылка на сайт.
   */
  bot_link?: string | null
  visitors: number
  bot_starts: number
  registered: number
  email_verified: number
  started: number
  /** Дошли до предложения тарифов — есть только у trial20. */
  reached_offer: number | null
  /** Пробный период кончился без оплаты — только trial3d; у челленджа trial20 null. */
  expired: number | null
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

/* ——— Поведение по воронкам (раздел 10 docs/STATS.md бэкенда) ——— */

/** Колонка сравнения поведения: воронка или «без воронки». */
export type BehaviorGroup = Funnel | 'none'

/** Активные дни за первые `window` дней — только у тех, чьё окно прошло (`users`). */
export type BehaviorActiveDays = { window: number; users: number; mean: number | null; median: number | null }

/** Удержание дня `day`: база `users` — у кого этот день уже закончился. */
export type BehaviorRetention = { day: number; users: number; returned: number; share: number | null }

export type BehaviorColumn = {
  funnel: BehaviorGroup
  registered: number
  active_days_7: BehaviorActiveDays
  active_days_21: BehaviorActiveDays
  retention: BehaviorRetention[]
  returned_week2: { users: number; returned: number; share: number | null }
  /** Активных дней в днях 0…20 у всей группы — база средних «в активный день». */
  active_days: number
  sessions_per_active_day: number | null
  session_minutes: number | null
  minutes_per_active_day: number | null
  steps_per_active_day: number | null
}

export type BehaviorReport = {
  date_from: string | null
  date_to: string | null
  /** Порог активного дня, секунды. */
  active_day_min_seconds: number
  /** Перерыв, после которого начинается новая сессия, секунды. */
  session_gap_seconds: number
  window_days: number
  funnels: BehaviorColumn[]
}

/* ——— Посты в Telegram-каналы и рассылки ботом (docs/POSTS.md бэкенда) ——— */

/**
 * Куда пост: f1, f2 — каналы «Мой ритм! 1» и «Мой ритм! 2»; bot_f1, bot_f2 —
 * рассылка личными сообщениями ботом людям воронки 1 (3 дня) и 2 (челлендж).
 */
export type PostChannelKey = 'f1' | 'f2' | 'bot_f1' | 'bot_f2'

export const isBotAudience = (key: PostChannelKey): boolean => key === 'bot_f1' || key === 'bot_f2'

/** Кнопка под постом: без кнопки, ссылка или «открыть приложение» (только бот). */
export type PostButtonType = 'none' | 'url' | 'web_app'

/** Кому из воронки уходит рассылка ботом. */
export type PostSegment = 'all' | 'registered_idle' | 'active_yesterday' | 'inactive_yesterday' | 'unpaid'

/** Счётчики рассылки ботом. */
export type PostDeliveries = {
  recipients: number
  delivered: number
  /** Ошибки, в том числе blocked — заблокировали бота. */
  failed: number
  blocked: number
  pending: number
}

export type PostStatus = 'draft' | 'scheduled' | 'sending' | 'published' | 'failed' | 'cancelled'

export type PostMediaType = 'none' | 'photo' | 'video' | 'animation'

export type ChannelPost = {
  id: number
  channel: PostChannelKey
  channel_title: string
  /** Рассылка ботом, а не канал. Старый бэкенд поля не шлёт. */
  is_bot?: boolean
  /** ISO с поясом; null — черновик без времени или шаблон «день N». */
  publish_at: string | null
  /** Шаблон «день N в ЧЧ:ММ по Москве» — только у рассылки ботом. */
  schedule_day?: number | null
  schedule_time?: string | null
  segment?: PostSegment
  /** Продающий: оплатившим не уходит. */
  selling?: boolean
  /** Telegram HTML. */
  text: string
  /** Видимая длина (без тегов, как считает Telegram) и лимит: 4096 или 1024 с медиа. */
  text_length: number
  text_limit: number
  media_type: PostMediaType
  has_media: boolean
  button_type?: PostButtonType
  button_text: string | null
  button_url: string | null
  status: PostStatus
  telegram_message_id: number | null
  error: string | null
  source_ref: string | null
  created_at: string
  updated_at: string
  published_at: string | null
  /** Только у рассылки ботом. */
  deliveries?: PostDeliveries | null
}

export type PostChannelInfo = {
  key: PostChannelKey
  kind?: 'channel' | 'bot'
  title: string
  note: string
  /** false — id канала не задан в .env сервера (у бота — токен), публиковать туда нельзя. */
  configured: boolean
  chat_id: number | null
}

export type PostChannels = {
  channels: PostChannelInfo[]
  preview_configured: boolean
  bot_configured: boolean
}

/** Что пишет человек в форме поста. */
export type PostInput = {
  channel: PostChannelKey
  publish_at: string | null
  text: string
  button_type: PostButtonType
  button_text: string | null
  button_url: string | null
  /** Только у рассылки ботом; у каналов не отправляются. */
  schedule_day?: number | null
  schedule_time?: string | null
  segment?: PostSegment
  selling?: boolean
}

/* ——— Опрос в боте (docs/BOT.md бэкенда) ——— */

export type SurveyFunnel = 'trial3d' | 'trial20' | 'organic'

export type SurveyStats = {
  /** null — без воронки. */
  funnel?: string | null
  responses: number
  scores: number
  avg_score: number | null
  nps: number | null
}

export type SurveyRow = {
  tg_user_id: number
  user_id: string | null
  email: string | null
  funnel: string | null
  point: number
  score: number | null
  answers: Record<string, string | null>
  answered_at: string
}

export type SurveyData = {
  questions: { key: string; text: string }[]
  summary: SurveyStats[]
  total: SurveyStats
  items: SurveyRow[]
}

export type SurveyQuery = { funnel?: SurveyFunnel; point?: number }

export interface AdminApi {
  readonly isDemo: boolean
  /** Токен администратора. 401 — неверная почта, пароль или это не админ. */
  login(email: string, password: string): Promise<string>
  summary(token: string, period: Period): Promise<FunnelSummary[]>
  users(token: string, query: UsersQuery): Promise<FunnelUsersPage>
  usersCsv(token: string, funnel: Funnel): Promise<Blob>
  /** Поведение по воронкам; период — даты регистрации. */
  behavior(token: string, period: Period): Promise<BehaviorReport>

  postChannels(token: string): Promise<PostChannels>
  posts(token: string, channel: PostChannelKey): Promise<ChannelPost[]>
  createPost(token: string, input: PostInput): Promise<ChannelPost>
  updatePost(token: string, id: number, input: PostInput): Promise<ChannelPost>
  deletePost(token: string, id: number): Promise<void>
  uploadPostMedia(token: string, id: number, file: File): Promise<ChannelPost>
  deletePostMedia(token: string, id: number): Promise<ChannelPost>
  schedulePost(token: string, id: number): Promise<ChannelPost>
  cancelPost(token: string, id: number): Promise<ChannelPost>
  /** Итог — в самом посте: published или failed с причиной. */
  publishPostNow(token: string, id: number): Promise<ChannelPost>
  previewPost(token: string, id: number): Promise<void>
  /** Сколько человек сейчас получили бы рассылку ботом. */
  postAudience(token: string, channel: PostChannelKey, segment: PostSegment, selling: boolean): Promise<number>

  survey(token: string, q: SurveyQuery): Promise<SurveyData>
  surveyCsv(token: string, q: SurveyQuery): Promise<Blob>
}

const TIMEOUT_MS = 20_000
/**
 * Загрузка ролика до 50 МБ, публикация и предпросмотр: бэкенд отвечает,
 * только когда файл дошёл до Telegram, — это минуты, а не секунды.
 */
const LONG_TIMEOUT_MS = 6 * 60_000
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

  async function send(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    token?: string,
    body?: unknown,
    timeoutMs = TIMEOUT_MS,
  ): Promise<Response> {
    const headers: Record<string, string> = {}
    // FormData (файл) — тип с границей частей ставит сам браузер.
    const isForm = body instanceof FormData
    if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json'
    if (token) headers.Authorization = `Bearer ${token}`
    const ctrl = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      ctrl.abort()
    }, timeoutMs)
    try {
      const res = await fetch(base + path, {
        method,
        headers,
        // Без cookie в обе стороны: см. комментарий в начале файла.
        credentials: 'omit',
        body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
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

    behavior: (token, period) =>
      json<BehaviorReport>(
        send('GET', `/admin/behavior${query({ date_from: period.from, date_to: period.to })}`, token),
      ),

    postChannels: (token) => json<PostChannels>(send('GET', '/admin/posts/channels', token)),

    async posts(token, channel) {
      const data = await json<{ items: ChannelPost[] }>(send('GET', `/admin/posts${query({ channel })}`, token))
      return data.items
    },

    createPost: (token, input) => json<ChannelPost>(send('POST', '/admin/posts', token, input)),

    updatePost: (token, id, input) => json<ChannelPost>(send('PATCH', `/admin/posts/${id}`, token, input)),

    async deletePost(token, id) {
      await send('DELETE', `/admin/posts/${id}`, token)
    },

    uploadPostMedia(token, id, file) {
      const form = new FormData()
      form.append('file', file)
      return json<ChannelPost>(send('POST', `/admin/posts/${id}/media`, token, form, LONG_TIMEOUT_MS))
    },

    deletePostMedia: (token, id) => json<ChannelPost>(send('DELETE', `/admin/posts/${id}/media`, token)),

    schedulePost: (token, id) => json<ChannelPost>(send('POST', `/admin/posts/${id}/schedule`, token)),

    cancelPost: (token, id) => json<ChannelPost>(send('POST', `/admin/posts/${id}/cancel`, token)),

    publishPostNow: (token, id) =>
      json<ChannelPost>(send('POST', `/admin/posts/${id}/publish-now`, token, undefined, LONG_TIMEOUT_MS)),

    async previewPost(token, id) {
      await send('POST', `/admin/posts/${id}/preview`, token, undefined, LONG_TIMEOUT_MS)
    },

    async postAudience(token, channel, segment, selling) {
      const data = await json<{ count: number }>(
        send('GET', `/admin/posts/audience${query({ channel, segment, selling: String(selling) })}`, token),
      )
      return data.count
    },

    survey: (token, q) =>
      json<SurveyData>(send('GET', `/admin/survey${query({ funnel: q.funnel, point: q.point })}`, token)),

    async surveyCsv(token, q) {
      const res = await send('GET', `/admin/survey/export.csv${query({ funnel: q.funnel, point: q.point })}`, token)
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
    behavior: (token, period) => impl().then((a) => a.behavior(token, period)),
    postChannels: (token) => impl().then((a) => a.postChannels(token)),
    posts: (token, channel) => impl().then((a) => a.posts(token, channel)),
    createPost: (token, input) => impl().then((a) => a.createPost(token, input)),
    updatePost: (token, id, input) => impl().then((a) => a.updatePost(token, id, input)),
    deletePost: (token, id) => impl().then((a) => a.deletePost(token, id)),
    uploadPostMedia: (token, id, file) => impl().then((a) => a.uploadPostMedia(token, id, file)),
    deletePostMedia: (token, id) => impl().then((a) => a.deletePostMedia(token, id)),
    schedulePost: (token, id) => impl().then((a) => a.schedulePost(token, id)),
    cancelPost: (token, id) => impl().then((a) => a.cancelPost(token, id)),
    publishPostNow: (token, id) => impl().then((a) => a.publishPostNow(token, id)),
    previewPost: (token, id) => impl().then((a) => a.previewPost(token, id)),
    postAudience: (token, channel, segment, selling) =>
      impl().then((a) => a.postAudience(token, channel, segment, selling)),
    survey: (token, q) => impl().then((a) => a.survey(token, q)),
    surveyCsv: (token, q) => impl().then((a) => a.surveyCsv(token, q)),
  }
}

export const adminApi: AdminApi = import.meta.env.VITE_API_URL
  ? createHttpAdminApi(import.meta.env.VITE_API_URL)
  : lazyDemoAdminApi()
