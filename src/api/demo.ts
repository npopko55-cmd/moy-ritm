/**
 * Демо-режим: то же API, но без бэкенда.
 *
 * Нужен там, где сервера нет вовсе — на GitHub Pages. Всё живёт в
 * localStorage этого браузера и никуда не уходит. Поэтому правила мягкие и
 * честно об этом говорят на экране входа:
 *   • регистрация сразу подтверждает почту — писем слать нечем;
 *   • вход принимает любой пароль от 8 символов для знакомой почты;
 *   • «оплата» открывает доступ через три секунды после возврата.
 *
 * Формы ответов те же, что у настоящего бэкенда: экран не должен знать,
 * с кем он говорит.
 */

import { TARIFFS } from '../data/tariffs'
import type { Api, PatchMeBody, PatchSettingsBody, RegisterBody } from './client'
import {
  ApiError,
  type Access,
  type Chunk,
  type ChunksResponse,
  type DayStats,
  type Me,
  type MessageResponse,
  type PaymentCheck,
  type PaymentLink,
  type PlayerBootstrap,
  type Settings,
  type StatsProgress,
  type StatsSummary,
  type SupportCreated,
  type SupportTopic,
  type Tariff,
  type TokenResponse,
  type Totals,
} from './types'

const PREFIX = 'moy-ritm.demo.'
const DAY_MS = 86_400_000
/** Через столько после возврата с «оплаты» доступ считается полученным. */
const PAY_DELAY_MS = 3000
/** Перерыв, после которого начинается новая тренировка — как на бэкенде. */
const WORKOUT_GAP_MS = 600_000
const MIN_PASSWORD = 8

/* ─────────────────────────  Хранилище  ───────────────────────── */

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    /* приватный режим или запрет хранилища — просто не запоминаем */
  }
}

function drop(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {
    /* см. выше */
  }
}

const uuid = () =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`

/* ─────────────────────────  Что храним  ───────────────────────── */

type DemoUser = {
  id: string
  email: string
  name: string | null
  timezone: string
  created_at: string
}

type DemoAccess = { paid_until: string; tariff: { code: string; name: string } | null } | null

type DemoDay = {
  seconds: number
  steps: number
  workouts: number
  /** Конец последнего куска: по нему видно перерыв больше десяти минут. */
  last_end: number
}

type DemoStats = {
  days: Record<string, DemoDay>
  /** Идентификаторы кусков: повтор после обрыва сети не считается дважды. */
  seen: string[]
  longest_workout_seconds: number
  current_workout_seconds: number
}

const DEFAULT_SETTINGS: Settings = {
  move_interval_seconds: 30,
  music_enabled: true,
  music_volume: 80,
  motivation_enabled: true,
  email_reminders: false,
}

/**
 * Пустая статистика — функцией, а не константой.
 *
 * Константу `sendChunks` менял бы прямо в ней: `statsOf` отдаёт fallback по
 * ссылке, и первая же тренировка записывала бы дни в общий объект. Тогда
 * следующий демо-пользователь в этой же вкладке получал бы чужие минуты, хотя
 * в хранилище у него пусто.
 */
const emptyStats = (): DemoStats => ({
  days: {},
  seen: [],
  longest_workout_seconds: 0,
  current_workout_seconds: 0,
})

/**
 * Буфер незакрытых кусков плеера (`src/lib/chunks.ts`) лежит в браузере и к
 * человеку не привязан: настоящему бэкенду это и не нужно — там кусок примут
 * по токену того, кто его шлёт. В демо же люди меняются в одной вкладке, и
 * оставшийся хвост чужой (а то и ничьей) тренировки плеер показал бы новому
 * пользователю как его «сегодня» — при нулях в профиле и прогрессе.
 *
 * Поэтому при каждой смене сессии буфер сбрасываем. Ключ продублирован
 * намеренно: импорт из chunks.ts замкнул бы круг demo → chunks → client → demo.
 */
const CHUNK_BUFFER_KEY = 'moy-ritm.chunks'

function dropChunkBuffer(): void {
  try {
    localStorage.removeItem(CHUNK_BUFFER_KEY)
  } catch {
    /* приватный режим или запрет хранилища — см. write() */
  }
}

const normalize = (email: string) => email.trim().toLowerCase()

const timezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Almaty'
  } catch {
    return 'Asia/Almaty'
  }
}

/** Локальная дата браузера в виде «2026-09-05». */
function localDate(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Тарифы в форме ответа GET /tariffs. */
const FEATURES = [
  'Все потоки и движения',
  'Все новые движения',
  'Все будущие потоки',
  'На любом устройстве',
  'Без автосписаний',
]

const demoTariffs = (): Tariff[] =>
  TARIFFS.map((t) => ({
    code: t.code,
    name: t.name,
    duration_days: t.duration_days,
    price: t.price,
    currency: t.currency,
    features: FEATURES,
    is_recommended: t.is_recommended,
    note: t.note,
    discount_label: t.discount_label ?? null,
    per_month: t.per_month,
    savings: t.savings ?? null,
  }))

export function createDemoApi(): Api {
  const listeners = new Set<() => void>()

  /* ——— Люди и сессия ——— */

  const users = () => read<Record<string, DemoUser>>('users', {})
  const current = () => read<string | null>('session', null)

  function requireUser(): DemoUser {
    const email = current()
    const user = email ? users()[email] : undefined
    if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Нужно войти в аккаунт')
    return user
  }

  /* ——— Доступ ——— */

  const accessOf = (email: string) => read<DemoAccess>(`access.${email}`, null)

  function accessInfo(email: string): Access {
    const saved = accessOf(email)
    if (!saved) {
      return { status: 'none', paid_until: null, tariff: null, days_left: 0, grace_until: null }
    }
    const until = Date.parse(saved.paid_until)
    const grace = until + DAY_MS
    const now = Date.now()
    const daysLeft = Math.max(0, Math.ceil((until - now) / DAY_MS))
    const status: Access['status'] =
      now <= until ? (daysLeft <= 3 ? 'expiring' : 'active') : now <= grace ? 'grace' : 'expired'
    return {
      status,
      paid_until: saved.paid_until,
      tariff: saved.tariff,
      days_left: daysLeft,
      grace_until: new Date(grace).toISOString(),
    }
  }

  /** Продление считается от текущей даты окончания, а не с нуля. */
  function grantAccess(email: string, tariff: Tariff): void {
    const saved = accessOf(email)
    const from = Math.max(Date.now(), saved ? Date.parse(saved.paid_until) : 0)
    write(`access.${email}`, {
      paid_until: new Date(from + tariff.duration_days * DAY_MS).toISOString(),
      tariff: { code: tariff.code, name: tariff.name },
    })
  }

  /* ——— Статистика ——— */

  /** Накопленные куски этого человека. Своя копия на каждый вызов. */
  function statsOf(email: string): DemoStats {
    const saved = read<Partial<DemoStats> | null>(`stats.${email}`, null)
    return {
      ...emptyStats(),
      ...(saved ?? {}),
      days: saved?.days ?? {},
      seen: saved?.seen ?? [],
    }
  }

  function streaks(days: Record<string, DemoDay>): { current: number; longest: number } {
    const active = Object.keys(days)
      .filter((d) => days[d].seconds > 0)
      .sort()
    if (!active.length) return { current: 0, longest: 0 }

    let longest = 1
    let run = 1
    for (let i = 1; i < active.length; i += 1) {
      const prev = Date.parse(`${active[i - 1]}T00:00:00`)
      const cur = Date.parse(`${active[i]}T00:00:00`)
      run = Math.round((cur - prev) / DAY_MS) === 1 ? run + 1 : 1
      longest = Math.max(longest, run)
    }

    // Серия жива, только если последний её день — сегодня или вчера.
    const last = active[active.length - 1]
    const today = localDate(Date.now())
    const yesterday = localDate(Date.now() - DAY_MS)
    return { current: last === today || last === yesterday ? run : 0, longest }
  }

  /**
   * Единственный счётчик демо-режима.
   *
   * Все цифры на всех экранах выходят отсюда и считаются из одного и того же
   * — накопленных кусков этого человека. Заготовленных значений в демо нет:
   * новый пользователь начинает с нулей, и они растут согласованно везде —
   * «сегодня» и недельный график в плеере, «Итоги» в профиле, календарь,
   * недели и рекорды в «Моём прогрессе».
   *
   * Раньше сводку и прогресс считали два разных куска кода, и разойтись им
   * было нечем помешать.
   */
  function aggregate(email: string): {
    summary: StatsSummary
    totals: Totals
    progress(month?: string): StatsProgress
  } {
    const stats = statsOf(email)
    const now = Date.now()
    const today = localDate(now)
    const { current: currentStreak, longest: longestStreak } = streaks(stats.days)

    const day = (date: string): DayStats => ({
      local_date: date,
      seconds: stats.days[date]?.seconds ?? 0,
      steps: stats.days[date]?.steps ?? 0,
      workouts: stats.days[date]?.workouts ?? 0,
    })

    const everyDay = Object.values(stats.days)
    const totals: Totals = {
      total_seconds: everyDay.reduce((s, d) => s + d.seconds, 0),
      total_workouts: everyDay.reduce((s, d) => s + d.workouts, 0),
      current_streak_days: currentStreak,
      longest_streak_days: longestStreak,
    }

    // Итоги профиля попадают в сводку плеера как есть: разойтись они уже не
    // могут даже случайно.
    const summary: StatsSummary = {
      today_seconds: day(today).seconds,
      yesterday_seconds: day(localDate(now - DAY_MS)).seconds,
      week: Array.from({ length: 7 }, (_, i) => day(localDate(now - (6 - i) * DAY_MS))),
      ...totals,
      longest_workout_seconds: stats.longest_workout_seconds,
      timezone: timezone(),
      local_today: today,
    }

    function progress(month?: string): StatsProgress {
      const key = month ?? today.slice(0, 7)
      const [year, mon] = key.split('-').map(Number)
      const length = new Date(year, mon, 0).getDate()

      const calendar = Array.from({ length }, (_, i) => {
        const { local_date, seconds, workouts } = day(`${key}-${String(i + 1).padStart(2, '0')}`)
        return { local_date, seconds, workouts }
      })

      // Двенадцать недель с понедельника, считая от текущей.
      const monday = new Date(now)
      monday.setHours(0, 0, 0, 0)
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
      const weeks = Array.from({ length: 12 }, (_, i) => {
        const start = monday.getTime() - (11 - i) * 7 * DAY_MS
        let seconds = 0
        for (let n = 0; n < 7; n += 1) seconds += day(localDate(start + n * DAY_MS)).seconds
        return { week_start: localDate(start), seconds }
      })

      const bestDay = Object.entries(stats.days)
        .filter(([, d]) => d.seconds > 0)
        .sort((a, b) => b[1].seconds - a[1].seconds)[0]
      const bestWeek = [...weeks].sort((a, b) => b.seconds - a.seconds)[0]
      const active = calendar.filter((d) => d.seconds > 0)

      return {
        month: key,
        days: calendar,
        weeks,
        records: {
          longest_workout_seconds: summary.longest_workout_seconds,
          longest_streak_days: totals.longest_streak_days,
          best_day: bestDay ? { local_date: bestDay[0], seconds: bestDay[1].seconds } : null,
          best_week: bestWeek && bestWeek.seconds > 0 ? bestWeek : null,
        },
        totals: {
          seconds: active.reduce((s, d) => s + d.seconds, 0),
          workouts: active.reduce((s, d) => s + d.workouts, 0),
          days_active: active.length,
        },
      }
    }

    return { summary, totals, progress }
  }

  const summaryOf = (email: string): StatsSummary => aggregate(email).summary

  /* ——— Профиль целиком ——— */

  function meOf(user: DemoUser): Me {
    return {
      user: {
        id: user.id,
        email: user.email,
        // Писем в демо нет, поэтому почта считается подтверждённой сразу.
        email_verified: true,
        name: user.name,
        timezone: user.timezone,
        created_at: user.created_at,
      },
      settings: read<Settings>(`settings.${user.email}`, DEFAULT_SETTINGS),
      access: accessInfo(user.email),
      totals: aggregate(user.email).totals,
      support: { email: 'support@ritmritm.ru', telegram_url: null },
    }
  }

  const token = (user: DemoUser): TokenResponse => ({
    access_token: `demo.${user.id}`,
    token_type: 'bearer',
    user: { id: user.id, email: user.email, role: 'user', created_at: user.created_at },
  })

  const ok = (message: string): Promise<MessageResponse> => Promise.resolve({ message })

  return {
    isDemo: true,

    /* ——— Вход и учётная запись ——— */

    async register(body: RegisterBody) {
      const email = normalize(body.email)
      if (body.password.length < MIN_PASSWORD) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Пароль короче 8 символов')
      }
      const all = users()
      if (!all[email]) {
        all[email] = {
          id: uuid(),
          email,
          name: body.name?.trim() || null,
          timezone: body.timezone || timezone(),
          created_at: new Date().toISOString(),
        }
        write('users', all)
        // Новый человек — и цифры у него с нуля: хвост чужой тренировки,
        // оставшийся в буфере плеера, ему не принадлежит.
        dropChunkBuffer()
      }
      return { message: 'Проверьте почту' }
    },

    confirmEmail: () => ok('Почта подтверждена'),
    resendConfirmation: () => ok('Письмо отправлено повторно'),

    async login(email, password) {
      const key = normalize(email)
      const user = users()[key]
      // Паролей демо не хранит: достаточно того, что почта знакома,
      // а пароль похож на пароль.
      if (!user || password.length < MIN_PASSWORD) {
        throw new ApiError(401, 'UNAUTHORIZED', 'Неверная почта или пароль')
      }
      write('session', key)
      // Когда вошли — чтобы список устройств в профиле показывал настоящее
      // время входа, а не «прямо сейчас» на каждое открытие страницы.
      write('session.at', Date.now())
      // Явный вход начинает новую сессию: всё, что осталось в буфере плеера
      // до него, — из чужой. Обновление токена (refresh) буфер не трогает,
      // поэтому перезагрузка вкладки посреди тренировки минут не теряет.
      dropChunkBuffer()
      return token(user)
    },

    async refresh() {
      return token(requireUser())
    },

    async logout() {
      drop('session')
      dropChunkBuffer()
      return { message: 'Вы вышли из аккаунта' }
    },

    async logoutAll() {
      drop('session')
      dropChunkBuffer()
      return { message: 'Все сессии завершены' }
    },

    forgotPassword: () => ok('Если такая почта есть, мы отправили письмо'),
    resetPassword: () => ok('Пароль изменён. Войдите с новым паролем'),
    changePassword: () => ok('Пароль изменён'),
    changeEmail: () => ok('Проверьте новую почту'),
    confirmNewEmail: () => ok('Новая почта подтверждена'),

    /* ——— Профиль, настройки, сессии ——— */

    async getMe() {
      return meOf(requireUser())
    },

    async patchMe(body: PatchMeBody) {
      const user = requireUser()
      const all = users()
      if (body.name !== undefined) all[user.email].name = body.name?.trim() || null
      if (body.timezone) all[user.email].timezone = body.timezone
      write('users', all)
      return meOf(all[user.email])
    },

    async getSettings() {
      const user = requireUser()
      return read<Settings>(`settings.${user.email}`, DEFAULT_SETTINGS)
    },

    async patchSettings(body: PatchSettingsBody) {
      const user = requireUser()
      const next = { ...read<Settings>(`settings.${user.email}`, DEFAULT_SETTINGS), ...body }
      write(`settings.${user.email}`, next)
      return next
    },

    async getSessions() {
      const user = requireUser()
      // Устройство в демо всегда одно — это самое, из которого смотрят.
      const at = read<number>('session.at', Date.now())
      return {
        items: [
          {
            id: user.id,
            user_agent: navigator.userAgent,
            ip: null,
            issued_at: new Date(at).toISOString(),
            expires_at: new Date(at + 30 * DAY_MS).toISOString(),
            current: true,
          },
        ],
      }
    },

    deleteSession: () => ok('Сессия завершена'),
    deleteAccountRequest: () => ok('Проверьте почту'),

    async deleteAccountConfirm() {
      const email = current()
      if (email) {
        const all = users()
        delete all[email]
        write('users', all)
        drop(`access.${email}`)
        drop(`stats.${email}`)
        drop(`settings.${email}`)
        drop(`pending.${email}`)
        drop('session')
        drop('session.at')
        dropChunkBuffer()
      }
      return { message: 'Аккаунт удалён' }
    },

    /* ——— Тарифы и оплата ——— */

    async getTariffs() {
      return demoTariffs()
    },

    async paymentLink(tariffCode) {
      const user = requireUser()
      const tariff = demoTariffs().find((t) => t.code === tariffCode)
      if (!tariff) throw new ApiError(404, 'TARIFF_NOT_FOUND', 'Такого тарифа нет')
      write(`pending.${user.email}`, { code: tariff.code, at: Date.now() })
      // Возврат с «оплаты» — на тот же экран, что и у настоящего GetCourse.
      const url = new URL(`${import.meta.env.BASE_URL}payment/success`, window.location.origin)
      url.searchParams.set('demo', '1')
      return { url: url.toString() } satisfies PaymentLink
    },

    async paymentCheck() {
      const user = requireUser()
      const pending = read<{ code: string; at: number } | null>(`pending.${user.email}`, null)
      if (pending && Date.now() - pending.at >= PAY_DELAY_MS) {
        const tariff = demoTariffs().find((t) => t.code === pending.code)
        if (tariff) grantAccess(user.email, tariff)
        drop(`pending.${user.email}`)
      }
      return {
        access: accessInfo(user.email),
        checked_at: new Date().toISOString(),
        // Три секунды: столько же «идёт» демо-оплата.
        next_check_in: 3,
      } satisfies PaymentCheck
    },

    /* ——— Плеер и статистика ——— */

    async playerBootstrap() {
      const user = requireUser()
      return {
        // Контент в демо берётся из локальных данных фронтенда, не отсюда.
        streams: [],
        settings: read<Settings>(`settings.${user.email}`, DEFAULT_SETTINGS),
        access: accessInfo(user.email),
        stats: summaryOf(user.email),
      } satisfies PlayerBootstrap
    },

    async sendChunks(chunks: Chunk[]) {
      const user = requireUser()
      const stats = statsOf(user.email)
      const seen = new Set(stats.seen)
      let accepted = 0
      let duplicates = 0

      for (const chunk of chunks) {
        if (seen.has(chunk.client_chunk_id)) {
          duplicates += 1
          continue
        }
        const started = Date.parse(chunk.started_at)
        const duration = chunk.duration_seconds
        if (Number.isNaN(started) || duration < 1 || duration > 300) continue

        seen.add(chunk.client_chunk_id)
        accepted += 1

        const key = localDate(started)
        const day = stats.days[key] ?? { seconds: 0, steps: 0, workouts: 0, last_end: 0 }
        const isNewWorkout = !day.last_end || started - day.last_end > WORKOUT_GAP_MS
        if (isNewWorkout) {
          day.workouts += 1
          stats.current_workout_seconds = 0
        }
        day.seconds += duration
        day.steps += chunk.steps ?? 0
        day.last_end = started + duration * 1000
        stats.days[key] = day

        stats.current_workout_seconds += duration
        stats.longest_workout_seconds = Math.max(
          stats.longest_workout_seconds,
          stats.current_workout_seconds,
        )
      }

      // Список идентификаторов не растёт бесконечно: хватает последней тысячи.
      stats.seen = [...seen].slice(-1000)
      write(`stats.${user.email}`, stats)
      return {
        accepted,
        duplicates,
        rejected: [],
        summary: summaryOf(user.email),
      } satisfies ChunksResponse
    },

    async statsSummary() {
      return summaryOf(requireUser().email)
    },

    async statsProgress(month) {
      return aggregate(requireUser().email).progress(month)
    },

    /* ——— Поддержка ——— */

    async supportRequest(_topic: SupportTopic, _message: string) {
      requireUser()
      return { id: uuid(), created_at: new Date().toISOString() } satisfies SupportCreated
    },

    /* ——— Служебное ——— */

    clearSession() {
      drop('session')
    },

    onSessionLost(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
