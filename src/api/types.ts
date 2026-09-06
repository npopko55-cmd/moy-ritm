/**
 * Типы ответов бэкенда — ровно по backend/docs/API.md.
 *
 * Здесь только формы данных и ошибка. Как их получать — в client.ts
 * (интерфейс), http.ts (настоящий бэкенд) и demo.ts (режим без бэкенда).
 *
 * Даты приходят строкой ISO 8601 с явным смещением («…+00:00»), поэтому
 * везде `string`: превращать их в Date — дело того экрана, который печатает.
 */

/* ─────────────────────────  Доступ  ───────────────────────── */

/**
 * Пять состояний доступа. Решать «пускать или нет» фронтенд не может и не
 * должен: контентные ручки закрыты на бэкенде. Статус нужен для того, какой
 * экран показать.
 */
export type AccessStatus = 'none' | 'active' | 'expiring' | 'grace' | 'expired'

export type AccessTariff = { code: string; name: string }

export type Access = {
  status: AccessStatus
  paid_until: string | null
  tariff: AccessTariff | null
  /** Округляется вверх: последние 20 часов — это «остался 1 день». */
  days_left: number
  /** Момент, после которого плеер закрывается окончательно. */
  grace_until: string | null
}

/** Доступ есть — можно в отсчёт и плеер. */
export const hasAccess = (a: Access | null | undefined): boolean =>
  a?.status === 'active' || a?.status === 'expiring' || a?.status === 'grace'

/* ─────────────────────────  Учётная запись  ───────────────────────── */

export type MeUser = {
  id: string
  email: string
  email_verified: boolean
  name: string | null
  timezone: string
  created_at: string
}

export type Settings = {
  /** Только 15, 30, 60 или 120. */
  move_interval_seconds: number
  music_enabled: boolean
  /** 0…100. */
  music_volume: number
  motivation_enabled: boolean
  email_reminders: boolean
}

export type Totals = {
  total_seconds: number
  total_workouts: number
  current_streak_days: number
  longest_streak_days: number
  /** Оценка плеера, а не показания шагомера: печатать только с «~». */
  total_steps: number
  /** Дней с движением за всё время, а не за месяц. */
  days_active_total: number
}

/** Куда ведут кнопки экрана «Нужна помощь?». Пустой telegram_url — кнопки нет. */
export type Support = { email: string; telegram_url: string | null }

export type Me = {
  user: MeUser
  settings: Settings
  access: Access
  totals: Totals
  support: Support
}

/** Пользователь в ответе на вход и обновление токена — короче, чем в /me. */
export type AuthUser = { id: string; email: string; role: string; created_at: string }

export type TokenResponse = { access_token: string; token_type: string; user: AuthUser }

export type MessageResponse = { message: string }

export type SessionRow = {
  id: string
  /** Строка браузера как есть: разбирать её на «iPhone, Safari» — работа фронтенда. */
  user_agent: string | null
  ip: string | null
  issued_at: string
  expires_at: string
  /** Та сессия, из которой пришёл запрос. */
  current: boolean
}

/* ─────────────────────────  Тарифы и оплата  ───────────────────────── */

export type Tariff = {
  code: string
  name: string
  duration_days: number
  /** Число, а не строка: карточка делает с ценой ровно одно — печатает её. */
  price: number
  currency: string
  features: string[]
  is_recommended: boolean
  note: string | null
  /** Текст владельца («−15%»), а не посчитанный процент. Пусто — бейджа нет. */
  discount_label: string | null
  per_month: number
  /** У самого короткого тарифа выгоды нет. */
  savings: number | null
}

export type PaymentLink = { url: string }

export type PaymentCheck = {
  access: Access
  checked_at: string
  /** Через сколько секунд можно снова дёрнуть проверку: за ней GetCourse. */
  next_check_in: number
}

/* ─────────────────────────  Плеер и статистика  ───────────────────────── */

export type Exercise = {
  id: string
  stream_id: string
  title: string
  description: string | null
  video_url: string
  duration: number
  steps_per_minute: number
  sort_order: number
  is_active: boolean
}

export type Track = {
  id: string
  stream_id: string
  title: string
  artist: string | null
  audio_url: string
  duration: number
  sort_order: number
  is_active: boolean
}

export type PlayerStream = {
  id: string
  title: string
  description: string | null
  exercises: Exercise[]
  tracks: Track[]
}

export type PlayerBootstrap = {
  streams: PlayerStream[]
  settings: Settings
  access: Access
  stats: StatsSummary
}

/** Один кусок движения. `client_chunk_id` плеер придумывает сам до отправки. */
export type Chunk = {
  client_chunk_id: string
  stream_code: string
  move_id: string
  /** Время начала по часам устройства, с явным смещением. */
  started_at: string
  /** 1…300. */
  duration_seconds: number
  /** Необязательное, 0…5000. Не прислали — ноль. */
  steps?: number
}

export type RejectedChunk = { client_chunk_id: string; reason: string }

export type ChunksResponse = {
  accepted: number
  duplicates: number
  rejected: RejectedChunk[]
  /** Та же сводка, что у GET /stats/summary: второй запрос не нужен. */
  summary: StatsSummary
}

export type DayStats = { local_date: string; seconds: number; steps: number; workouts: number }

export type StatsSummary = {
  today_seconds: number
  yesterday_seconds: number
  /** Ровно семь элементов, последний — local_today. Дырок нет. */
  week: DayStats[]
  total_seconds: number
  total_workouts: number
  current_streak_days: number
  longest_streak_days: number
  longest_workout_seconds: number
  /** Оценка за всё время. В интерфейсе всегда с «~». */
  total_steps: number
  timezone: string
  local_today: string
}

export type ProgressDay = { local_date: string; seconds: number; workouts: number }
export type ProgressWeek = { week_start: string; seconds: number; steps: number; workouts: number }

/** Минуты и занятия по одному потоку за всё время. Пустых потоков в списке нет. */
export type StreamStat = {
  code: string
  seconds: number
  steps: number
  sessions: number
  /** Последняя активность, ISO 8601. */
  last_at: string
}

/**
 * Награда. Тексты приходят с сервера — своих в интерфейсе нет.
 * `earned_at` null — ещё не получена, тогда смотрим на `progress`.
 */
export type Achievement = {
  code: string
  title: string
  description: string
  earned_at: string | null
  earned_local_date: string | null
  progress: { current: number; target: number }
}

export type StatsProgress = {
  month: string
  /** Все дни месяца подряд, включая пустые: календарю нужна полная сетка. */
  days: ProgressDay[]
  /** Последние 12 недель от текущей, а не от показанного месяца. */
  weeks: ProgressWeek[]
  records: {
    longest_workout_seconds: number
    longest_streak_days: number
    best_day: { local_date: string; seconds: number } | null
    best_week: { week_start: string; seconds: number } | null
  }
  /** seconds, workouts и days_active — за показанный месяц; days_active_total — за всё время. */
  totals: { seconds: number; workouts: number; days_active: number; days_active_total: number }
  /** Оценка шагов за всё время. */
  total_steps: number
  averages: { per_active_day_seconds: number }
  /** Только потоки с активностью, по убыванию минут. */
  streams: StreamStat[]
  /** Всегда шесть, в постоянном порядке: карточки не должны прыгать. */
  achievements: Achievement[]
}

/* ─────────────────────────  Поддержка  ───────────────────────── */

export type SupportTopic = 'payment' | 'access' | 'music' | 'other'

export type SupportCreated = { id: string; created_at: string }

/* ─────────────────────────  Ошибка  ───────────────────────── */

export type FieldError = { field: string; message: string }

/**
 * Ошибка запроса в одном виде для всех ручек и обоих режимов.
 *
 * Опираться нужно на `code`, а не на текст: тексты будут меняться.
 * `status === 0` — сети не было вовсе, ответа нет.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  /** Секунды до следующей попытки: блокировка входа и лимиты запросов. */
  readonly retry_after?: number
  readonly details?: FieldError[]
  /** У 403 access_required состояние доступа приходит прямо в теле ошибки. */
  readonly access?: Access
  readonly request_id?: string

  constructor(
    status: number,
    code: string,
    message: string,
    extra: {
      retry_after?: number
      details?: FieldError[]
      access?: Access
      request_id?: string
    } = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.retry_after = extra.retry_after
    this.details = extra.details
    this.access = extra.access
    this.request_id = extra.request_id
  }

  /** Разбор тела `{error: {...}}`. Пришло что-то другое — общий текст. */
  static fromBody(status: number, body: unknown): ApiError {
    const err = (body as { error?: Record<string, unknown> } | null)?.error
    if (!err || typeof err.code !== 'string') {
      return new ApiError(status, 'UNKNOWN', 'Что-то пошло не так, попробуйте ещё раз')
    }
    return new ApiError(status, err.code, String(err.message ?? 'Ошибка'), {
      retry_after: typeof err.retry_after === 'number' ? err.retry_after : undefined,
      details: Array.isArray(err.details) ? (err.details as FieldError[]) : undefined,
      access: (err.access as Access | undefined) ?? undefined,
      request_id: typeof err.request_id === 'string' ? err.request_id : undefined,
    })
  }

  /** Сети нет: dev-сервер не поднят, самолётный режим, упал бэкенд. */
  static offline(): ApiError {
    return new ApiError(0, 'NETWORK', 'Не получилось связаться с сервером. Проверьте соединение')
  }
}
