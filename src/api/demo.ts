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

import { loopSrc } from '../data/loops'
import { DEFAULT_FREE_TIER, STREAMS } from '../data/streams'
import { EXTRA_MOVES_LABEL } from '../lib/trial'
import { PLACEHOLDER_EMAIL, TELEGRAM_URL } from '../data/support'
import { TARIFFS } from '../data/tariffs'
import { CAPTION_LIMIT, TEXT_LIMIT, visibleLength } from '../lib/posts'
import { uuid } from '../lib/uuid'
import type {
  AdminApi,
  BehaviorColumn,
  BehaviorGroup,
  ChannelPost,
  FunnelSummary,
  FunnelUser,
  Period,
  PostChannelKey,
  PostInput,
  SurveyData,
  SurveyRow,
  UsersQuery,
} from './admin'
import type { Api, PatchMeBody, PatchSettingsBody, RegisterBody } from './client'
import {
  ApiError,
  hasAccess,
  type Access,
  type Achievement,
  type Checkout,
  type Chunk,
  type ChunksResponse,
  type DayStats,
  type FreeTier,
  type Funnel,
  type FunnelVisit,
  type GuestBootstrap,
  type GuestConfig,
  type Me,
  type MessageResponse,
  type PaymentCheck,
  type PaymentLink,
  type PlayerBootstrap,
  type PlayerStream,
  type Settings,
  type StatsProgress,
  type StatsSummary,
  type StreamStat,
  type Tariff,
  type TokenResponse,
  type Totals,
  type Trial,
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

/* ─────────────────────────  Что храним  ───────────────────────── */

type DemoUser = {
  id: string
  email: string
  name: string | null
  timezone: string
  created_at: string
  /**
   * Подтверждена ли почта. Писем в демо нет, поэтому подтверждает
   * «Отправить письмо ещё раз» — она здесь делает то же, что письмо.
   * Нет поля — почта подтверждена: так у тех, кто завёлся раньше.
   */
  verified?: boolean
  /** Воронка, по ссылке которой человек зарегистрировался. */
  funnel?: Funnel | null
  /** trial20: предложение тарифов (через три дня после регистрации) уже показано. */
  offer_seen?: boolean
}

type DemoAccess = { paid_until: string; tariff: { code: string; name: string } | null } | null

type DemoDay = {
  seconds: number
  steps: number
  workouts: number
  /** Самая длинная тренировка этого дня — по ней считается награда «Поехали!». */
  longest_workout: number
  /** Конец последнего куска: по нему видно перерыв больше десяти минут. */
  last_end: number
}

/** Итоги одного потока за всё время. `last_at` — конец последнего куска, мс. */
type DemoStream = { seconds: number; steps: number; sessions: number; last_at: number }

type DemoStats = {
  days: Record<string, DemoDay>
  /** Итоги по потокам: «Кардио — 164 мин, 32 занятия». */
  streams: Record<string, DemoStream>
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
  streams: {},
  seen: [],
  longest_workout_seconds: 0,
  current_workout_seconds: 0,
})

/**
 * Шесть наград: те же коды, тексты и условия, что и на бэкенде.
 * Порядок постоянный — карточки на «Моём прогрессе» не должны прыгать.
 */
const ACHIEVEMENTS = [
  { code: 'first_step', title: 'Первый шаг', description: 'Попробовали новый формат тренировки', target: 1 },
  { code: 'lets_go', title: 'Поехали!', description: 'Завершили первую тренировку', target: 1 },
  { code: 'twice_a_day', title: 'В ритме дня', description: 'Зашли в поток 2 раза за день', target: 2 },
  { code: 'five_days', title: 'Каждый день считается', description: '5 дней подряд в движении', target: 5 },
  { code: 'week_rhythm', title: 'Неделя в ритме', description: '7 дней подряд в движении', target: 7 },
  { code: 'ten_days', title: 'Возвращаюсь к себе', description: '10 разных дней в потоке', target: 10 },
] as const

/** Тренировка, которая считается «завершённой первой» — как на бэкенде. */
const WORKOUT_DONE_SECONDS = 600

/**
 * Буфер незакрытых кусков плеера (`src/lib/chunks.ts`) лежит в браузере под
 * ключом с id человека, поэтому чужой хвост тренировки новому пользователю
 * больше не достаётся. Здесь остаётся прибрать общий буфер старых версий —
 * при каждой смене сессии — и буфер удалённого аккаунта.
 *
 * Ключ продублирован намеренно: импорт из chunks.ts замкнул бы круг
 * demo → chunks → client → demo.
 */
const CHUNK_BUFFER_KEY = 'moy-ritm.chunks'

function dropChunkBuffer(userId?: string): void {
  try {
    localStorage.removeItem(CHUNK_BUFFER_KEY)
    if (userId) localStorage.removeItem(`${CHUNK_BUFFER_KEY}.${userId}`)
  } catch {
    /* приватный режим или запрет хранилища — см. write() */
  }
}

/** Бесплатный уровень: то же правило, что отдаёт бэкенд в bootstrap. */
const FREE_TIER: FreeTier = DEFAULT_FREE_TIER

/*
 * Воронки. На настоящем бэкенде токены ссылок живут в его таблице, а
 * фронтенд их не знает и передаёт из адреса как есть. Демо изображает
 * сервер, поэтому здесь они есть — те же, что у боевых ссылок входа.
 */
const DEMO_FUNNELS: Record<string, Funnel> = { hx4q7m2p: 'trial3d', tz9w3k6r: 'trial20' }

/** Воронка по токену ссылки, как у бэкенда: хвост «_m1» — метка письма, на воронку не влияет. */
const demoFunnelOf = (token: string | undefined): Funnel | null =>
  (token && DEMO_FUNNELS[token.trim().split('_')[0]]) || null

/** trial3d: столько дней открыты все движения. */
const TRIAL_DAYS = 3
/** «Все движения» — как ALL_EXERCISES_LIMIT бэкенда: плеер обрезает длиной списка. */
const ALL_MOVES_LIMIT = 1000
/** trial20, челлендж «21 день»: бесплатных движений и через сколько дней — тарифы. */
const CHALLENGE_MOVES = 10
const CHALLENGE_OFFER_DAYS = 3

const NO_TRIAL: Trial = {
  funnel: null,
  state: 'none',
  ends_at: null,
  days_left: null,
  offer_at: null,
  offer_due: false,
}

/** Бесплатный уровень с поправкой на пробный период — как free_tier бэкенда. */
function freeTierOf(trial: Trial): FreeTier {
  if (trial.state === 'expired') return { ...FREE_TIER, exercise_limit: 0 }
  if (trial.state === 'active') {
    return { ...FREE_TIER, exercise_limit: trial.funnel === 'trial3d' ? ALL_MOVES_LIMIT : CHALLENGE_MOVES }
  }
  return FREE_TIER
}

/**
 * Потоки для bootstrap.
 *
 * У человека без доступа бесплатный поток приходит с обрезанным списком
 * движений, остальные — с замком и без содержимого. Плеер берёт контент из
 * локальных данных фронтенда, но форма ответа должна совпадать с настоящей.
 */
function demoStreams(access: Access, tier: FreeTier): PlayerStream[] {
  const limited = !hasAccess(access)
  return STREAMS.map((s) => {
    if (limited && s.id !== tier.stream_code) {
      return { id: s.id, title: s.title, description: s.subtitle, locked: true, exercises: [], tracks: [] }
    }
    const loops = limited ? s.loops.slice(0, tier.exercise_limit) : s.loops
    return {
      id: s.id,
      title: s.title,
      description: s.subtitle,
      exercises: loops.map((l, i) => ({
        id: l.id,
        stream_id: s.id,
        title: l.title,
        description: null,
        video_url: loopSrc(l.id),
        duration: l.duration,
        steps_per_minute: l.stepsPerMinute,
        sort_order: i,
        is_active: true,
      })),
      tracks: [],
    }
  })
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

/**
 * Тарифы в форме ответа GET /tariffs. Пункты те же, что в строке «что входит
 * в подписку» на странице тарифов: выводит страница свои, а не эти, но демо
 * не должно расходиться с тем, что на ней написано.
 */
const FEATURES = [
  `${EXTRA_MOVES_LABEL} и больше разнообразия`,
  'На любом устройстве',
  'Доступ открывается сам после оплаты',
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

function demoTariff(code: string): Tariff {
  const tariff = demoTariffs().find((t) => t.code === code)
  if (!tariff) throw new ApiError(404, 'TARIFF_NOT_FOUND', 'Такого тарифа нет')
  return tariff
}

/**
 * «Оплата» в демо: запоминаем тариф, а через несколько секунд проверка
 * выдаст по нему доступ. Возврат — на тот же экран, что и у настоящего
 * GetCourse.
 */
function demoPayment(user: DemoUser, tariff: Tariff): string {
  write(`pending.${user.email}`, { code: tariff.code, at: Date.now() })
  const url = new URL(`${import.meta.env.BASE_URL}payment/success`, window.location.origin)
  url.searchParams.set('demo', '1')
  return url.toString()
}

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
      // Потоки и рекорд дня появились позже: в старых записях их нет.
      streams: saved?.streams ?? {},
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
      total_steps: everyDay.reduce((s, d) => s + d.steps, 0),
      days_active_total: everyDay.filter((d) => d.seconds > 0).length,
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

    /**
     * Награды: проигрываем активные дни по порядку и запоминаем, на каком
     * из них условие выполнилось впервые. Отдельно хранить дату получения не
     * нужно — она однозначно выводится из накопленных дней.
     */
    function achievements(): Achievement[] {
      const dates = Object.keys(stats.days)
        .filter((d) => stats.days[d].seconds > 0)
        .sort()

      const at: Record<string, string> = {}
      const mark = (code: string, ok: boolean, date: string) => {
        if (ok && !at[code]) at[code] = date
      }

      let activeDays = 0
      let run = 0
      let bestStreak = 0
      let bestWorkout = 0
      let bestPerDay = 0
      let prev = ''

      for (const date of dates) {
        const d = stats.days[date]
        activeDays += 1
        const step = prev ? Math.round((Date.parse(`${date}T00:00:00`) - Date.parse(`${prev}T00:00:00`)) / DAY_MS) : 0
        run = step === 1 ? run + 1 : 1
        prev = date
        bestStreak = Math.max(bestStreak, run)
        bestWorkout = Math.max(bestWorkout, d.longest_workout ?? 0)
        bestPerDay = Math.max(bestPerDay, d.workouts)

        mark('first_step', true, date)
        mark('lets_go', bestWorkout >= WORKOUT_DONE_SECONDS, date)
        mark('twice_a_day', bestPerDay >= 2, date)
        mark('five_days', bestStreak >= 5, date)
        mark('week_rhythm', bestStreak >= 7, date)
        mark('ten_days', activeDays >= 10, date)
      }

      // Сколько набрано к сегодняшнему дню — по одному числу на награду.
      // Значения те же, что считает бэкенд в app/services/achievements.py.
      const done: Record<string, number> = {
        first_step: activeDays,
        lets_go: Math.floor(bestWorkout / WORKOUT_DONE_SECONDS),
        twice_a_day: bestPerDay,
        five_days: bestStreak,
        week_rhythm: bestStreak,
        ten_days: activeDays,
      }

      return ACHIEVEMENTS.map((a) => {
        const date = at[a.code] ?? null
        return {
          code: a.code,
          title: a.title,
          description: a.description,
          // Момент получения — конец последнего куска того дня.
          earned_at: date ? new Date(stats.days[date].last_end || Date.parse(`${date}T12:00:00`)).toISOString() : null,
          earned_local_date: date,
          progress: { current: Math.min(done[a.code] ?? 0, a.target), target: a.target },
        }
      })
    }

    /** Потоки с активностью, от самого «наезженного» к остальным. */
    const streamStats = (): StreamStat[] =>
      Object.entries(stats.streams)
        .filter(([, s]) => s.seconds > 0)
        .sort((a, b) => b[1].seconds - a[1].seconds)
        .map(([code, s]) => ({
          code,
          seconds: s.seconds,
          steps: s.steps,
          sessions: s.sessions,
          last_at: new Date(s.last_at).toISOString(),
        }))

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
        let steps = 0
        let workouts = 0
        for (let n = 0; n < 7; n += 1) {
          const d = day(localDate(start + n * DAY_MS))
          seconds += d.seconds
          steps += d.steps
          workouts += d.workouts
        }
        return { week_start: localDate(start), seconds, steps, workouts }
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
          days_active_total: totals.days_active_total,
        },
        total_steps: totals.total_steps,
        averages: {
          // Среднее по дням, когда человек двигался, а не по всем подряд:
          // иначе неделя отпуска обнуляла бы честный результат.
          per_active_day_seconds: totals.days_active_total
            ? Math.round(totals.total_seconds / totals.days_active_total)
            : 0,
        },
        streams: streamStats(),
        achievements: achievements(),
      }
    }

    return { summary, totals, progress }
  }

  const summaryOf = (email: string): StatsSummary => aggregate(email).summary

  /* ——— Пробный период воронки ——— */

  /**
   * trial3d кончается через три дня после регистрации; у челленджа trial20
   * конца нет, через три дня — один раз предложение тарифов. Считается на
   * лету от даты регистрации в демо.
   */
  function trialOf(user: DemoUser): Trial {
    if (user.funnel === 'trial3d') {
      const ends = Date.parse(user.created_at) + TRIAL_DAYS * DAY_MS
      const left = ends - Date.now()
      return {
        ...NO_TRIAL,
        funnel: 'trial3d',
        state: left > 0 ? 'active' : 'expired',
        ends_at: new Date(ends).toISOString(),
        days_left: Math.max(0, Math.ceil(left / DAY_MS)),
      }
    }
    if (user.funnel === 'trial20') {
      const offerAt = Date.parse(user.created_at) + CHALLENGE_OFFER_DAYS * DAY_MS
      return {
        ...NO_TRIAL,
        funnel: 'trial20',
        state: 'active',
        offer_at: new Date(offerAt).toISOString(),
        offer_due: Date.now() >= offerAt && !user.offer_seen,
      }
    }
    return NO_TRIAL
  }

  /* ——— Профиль целиком ——— */

  function meOf(user: DemoUser): Me {
    return {
      user: {
        id: user.id,
        email: user.email,
        // Писем в демо нет: подтверждает кнопка «Отправить письмо ещё раз».
        // Старые записи без поля считаем подтверждёнными.
        email_verified: user.verified !== false,
        name: user.name,
        timezone: user.timezone,
        created_at: user.created_at,
      },
      settings: read<Settings>(`settings.${user.email}`, DEFAULT_SETTINGS),
      access: accessInfo(user.email),
      totals: aggregate(user.email).totals,
      // Тот же Telegram, что и на боевом сервере: демо-режим должен
      // показывать страницу помощи ровно так же, как настоящий вход.
      support: { email: PLACEHOLDER_EMAIL, telegram_url: TELEGRAM_URL },
    }
  }

  const token = (user: DemoUser): TokenResponse => ({
    access_token: `demo.${user.id}`,
    token_type: 'bearer',
    user: { id: user.id, email: user.email, role: 'user', created_at: user.created_at },
  })

  const ok = (message: string): Promise<MessageResponse> => Promise.resolve({ message })

  /**
   * Подтвердить почту вошедшего.
   *
   * Писем в демо нет, поэтому и ссылка из письма, и кнопка «отправить ещё
   * раз» делают одно и то же — иначе плашку про подтверждение и пейволл
   * на тарифах было бы не пройти.
   */
  const markVerified = (message: string): string => {
    const email = current()
    const all = users()
    if (email && all[email]) {
      all[email].verified = true
      write('users', all)
    }
    return message
  }

  /**
   * Пауза между письмами подтверждения — та же минута, что у сервера, и
   * письмо при регистрации тоже считается. Суточный потолок в демо не
   * нужен: GitHub Pages должен показать отсчёт, а не лимит на пять писем.
   */
  const RESEND_PAUSE_MS = 60_000
  const letterSent = (email: string) => write(`resend.${email}`, Date.now())
  const checkResendPause = (email: string): void => {
    const left = Math.ceil((read<number>(`resend.${email}`, 0) + RESEND_PAUSE_MS - Date.now()) / 1000)
    if (left > 0) {
      throw new ApiError(
        429,
        'RATE_LIMIT_EXCEEDED',
        'Письмо уже отправлено недавно. Проверьте почту, в том числе папку «Спам».',
        { retry_after: left },
      )
    }
  }

  return {
    isDemo: true,

    /* ——— Вход и учётная запись ——— */

    async register(body: RegisterBody) {
      const email = normalize(body.email)
      if (body.password.length < MIN_PASSWORD) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Пароль короче 8 символов')
      }
      const all = users()
      // Почта занята — та же ошибка, что у настоящего бэкенда: форма сама
      // скажет «Эта почта уже зарегистрирована» и поведёт на вход.
      if (all[email]) throw new ApiError(409, 'EMAIL_TAKEN', 'Эта почта уже зарегистрирована')

      const user: DemoUser = {
        id: uuid(),
        email,
        name: body.name?.trim() || null,
        timezone: body.timezone || timezone(),
        created_at: new Date().toISOString(),
        verified: false,
        // Пришёл по ссылке воронки — метка остаётся при нём, как на бэкенде.
        funnel: demoFunnelOf(body.funnel_token),
      }
      all[email] = user
      write('users', all)
      // «Письмо» при регистрации: с него, как и на сервере, идёт минута паузы.
      letterSent(email)
      // Регистрация сразу входит: дальше человек попадает на главную уже
      // своим и жмёт «Влиться в поток» сам.
      write('session', email)
      write('session.at', Date.now())
      // Новый человек — и цифры у него с нуля: хвост чужой тренировки,
      // оставшийся в буфере плеера, ему не принадлежит.
      dropChunkBuffer()
      return { status: 'registered' as const, ...token(user) }
    },

    /** Подтверждение почты: и по ссылке из письма, и кнопкой «ещё раз». */
    confirmEmail: () => ok(markVerified('Почта подтверждена')),
    async resendConfirmation() {
      const email = current()
      if (email) {
        checkResendPause(email)
        letterSent(email)
      }
      return ok(markVerified('В демо писем нет — почта подтверждена'))
    },

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
        const id = all[email]?.id
        delete all[email]
        write('users', all)
        drop(`access.${email}`)
        drop(`stats.${email}`)
        drop(`settings.${email}`)
        drop(`pending.${email}`)
        drop('session')
        drop('session.at')
        dropChunkBuffer(id)
      }
      return { message: 'Аккаунт удалён' }
    },

    /* ——— Тарифы и оплата ——— */

    async getTariffs() {
      return demoTariffs()
    },

    async paymentLink(tariffCode) {
      const user = requireUser()
      return { url: demoPayment(user, demoTariff(tariffCode)) } satisfies PaymentLink
    },

    // Виджета GetCourse в демо нет: страница оплаты сразу ведёт на page_url —
    // ту же «оплату», что и ссылка. Почту, как и сервер, просит подтвердить.
    async paymentCheckout(tariffCode) {
      const user = requireUser()
      const tariff = demoTariff(tariffCode)
      if (user.verified === false) {
        throw new ApiError(
          403,
          'EMAIL_NOT_VERIFIED',
          'Сначала подтвердите почту: иначе чек и доступ уедут на адрес, которым вы не владеете',
        )
      }
      const prefill = { 'sv[email]': user.email, utm_source: 'site', utm_term: `mr-${user.id}` }
      return {
        tariff: {
          code: tariff.code,
          name: tariff.name,
          price: tariff.price,
          currency: tariff.currency,
          duration_days: tariff.duration_days,
          per_month: tariff.per_month,
        },
        page_url: demoPayment(user, tariff),
        widget: null,
        prefill,
      } satisfies Checkout
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
      const access = accessInfo(user.email)
      const trial = trialOf(user)
      const tier = freeTierOf(trial)
      return {
        // Контент плеер берёт из локальных данных фронтенда, но форма
        // ответа та же: у человека без доступа платные потоки с замком.
        streams: demoStreams(access, tier),
        settings: read<Settings>(`settings.${user.email}`, DEFAULT_SETTINGS),
        access,
        stats: summaryOf(user.email),
        free_tier: tier,
        trial,
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
        const day = stats.days[key] ?? {
          seconds: 0,
          steps: 0,
          workouts: 0,
          longest_workout: 0,
          last_end: 0,
        }
        const isNewWorkout = !day.last_end || started - day.last_end > WORKOUT_GAP_MS
        if (isNewWorkout) {
          day.workouts += 1
          stats.current_workout_seconds = 0
        }
        const ends = started + duration * 1000
        day.seconds += duration
        day.steps += chunk.steps ?? 0
        day.last_end = ends
        stats.days[key] = day

        stats.current_workout_seconds += duration
        stats.longest_workout_seconds = Math.max(
          stats.longest_workout_seconds,
          stats.current_workout_seconds,
        )
        day.longest_workout = Math.max(day.longest_workout ?? 0, stats.current_workout_seconds)

        // Итоги потока. Занятие целиком принадлежит тому потоку, в котором
        // его начали: перешла из кардио в танцы без перерыва — у кардио
        // занятие плюс один, у танцев ноль, а секунды и шаги разошлись по
        // обоим. Так же считает бэкенд, поэтому сумма занятий по потокам
        // равна общему числу тренировок.
        const code = chunk.stream_code
        const flow = stats.streams[code] ?? { seconds: 0, steps: 0, sessions: 0, last_at: 0 }
        if (isNewWorkout) flow.sessions += 1
        flow.seconds += duration
        flow.steps += chunk.steps ?? 0
        flow.last_at = ends
        stats.streams[code] = flow
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

    /* ——— Воронки ——— */

    async funnelVisit(token: string) {
      const funnel = demoFunnelOf(token)
      if (!funnel) throw new ApiError(404, 'FUNNEL_NOT_FOUND', 'Такой ссылки нет')
      return { funnel } satisfies FunnelVisit
    },

    async funnelOfferSeen() {
      const user = requireUser()
      const all = users()
      all[user.email].offer_seen = true
      write('users', all)
      return { ok: true }
    },

    // Метрика плашки «Открой все 40» живёт только в журнале бэкенда: в демо
    // считать её негде, а сводка админки берёт свои цифры.
    async funnelBanner() {
      requireUser()
      return { ok: true }
    },

    // Гость в демо — тот же бесплатный уровень без аккаунта: десять движений
    // (GUEST_EXERCISES бэкенда), пустая статистика, пробного периода нет.
    async guestBootstrap(token: string) {
      const funnel = demoFunnelOf(token)
      if (!funnel) throw new ApiError(404, 'FUNNEL_NOT_FOUND', 'Такой ссылки нет')
      const access = accessInfo('')
      const tier: FreeTier = { stream_code: FREE_TIER.stream_code, exercise_limit: 10 }
      return {
        streams: demoStreams(access, tier),
        settings: DEFAULT_SETTINGS,
        access,
        stats: summaryOf(''),
        free_tier: tier,
        trial: null,
        guest: { funnel, mark: token.split('_')[1] ?? null },
      } satisfies GuestBootstrap
    },

    async guestEvent() {},

    async guestConfig() {
      return { enabled: false, token: null } satisfies GuestConfig
    },

    // Диагностика роликов нужна только боевому бэкенду: в демо её некуда слать.
    async playerFault() {
      return undefined
    },

    /* ——— Telegram Mini App ——— */

    // Мини-ап открывается только с боевого сайта: в демо Telegram выключен —
    // тем же ответом, что у бэкенда без токена бота.
    async telegramAuth() {
      throw new ApiError(503, 'TELEGRAM_DISABLED', 'Вход через Telegram выключен')
    },

    async linkTelegram() {
      throw new ApiError(503, 'TELEGRAM_DISABLED', 'Вход через Telegram выключен')
    },

    async linkTelegramToken() {
      throw new ApiError(503, 'TELEGRAM_DISABLED', 'Вход через Telegram выключен')
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

/* ─────────────────────────  Админка: аналитика воронок  ───────────────────────── */

/**
 * Фиктивная аналитика для страницы /admin на GitHub Pages: настоящих людей в
 * демо нет, а страница должна открываться и показывать, как она выглядит.
 * Данные выдуманные, но согласованные: сводка считается из той же таблицы
 * людей, что и список, а генератор с постоянным зерном даёт одни и те же
 * цифры при каждом открытии.
 */

/** Простой генератор с зерном: те же «люди» при каждом открытии страницы. */
function seeded(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DEMO_NAMES = ['anna', 'olga', 'marina', 'elena', 'irina', 'natasha', 'sveta', 'tanya', 'yulia', 'ksenia', 'dasha', 'polina', 'vika', 'alina', 'katya']
const DEMO_MAILS = ['mail.ru', 'yandex.ru', 'gmail.com', 'bk.ru', 'inbox.ru']

type DemoFunnel = { funnel: Funnel; token: string; people: number; visitors: number; botStarts: number }

const DEMO_FUNNEL_TABLE: DemoFunnel[] = [
  // Путь из канала — через бота: стартов бота больше, чем визитов на сайт.
  { funnel: 'trial3d', token: 'hx4q7m2p', people: 38, visitors: 131, botStarts: 214 },
  { funnel: 'trial20', token: 'tz9w3k6r', people: 33, visitors: 122, botStarts: 197 },
]

/** Метки писем в демо и их доля в заходах и стартах бота («» — без метки). */
const DEMO_SOURCES: { source: string; part: number }[] = [
  { source: 'm1', part: 0.38 },
  { source: 'm2', part: 0.24 },
  { source: 'm3', part: 0.12 },
  { source: '', part: 0.26 },
]

/** Метка письма выдуманного человека — по его номеру, при каждом открытии та же. */
function demoSourceOf(p: FunnelUser): string {
  const i = Number(p.user_id.split('-').pop()) || 0
  return ['m1', 'm1', 'm2', 'm1', 'm3', 'm2', '', 'm1', '', 'm2'][i % 10]
}

function demoFunnelPeople(): FunnelUser[] {
  const rnd = seeded(20260922)
  const now = Date.now()
  const people: FunnelUser[] = []
  for (const f of DEMO_FUNNEL_TABLE) {
    for (let i = 0; i < f.people; i += 1) {
      const name = DEMO_NAMES[Math.floor(rnd() * DEMO_NAMES.length)]
      const registered = now - Math.floor(rnd() * 14 * DAY_MS)
      const activeDays = rnd() < 0.2 ? 0 : 1 + Math.floor(rnd() * 8)
      const seconds = activeDays ? Math.round(activeDays * (200 + rnd() * 1300)) : 0
      const workouts = activeDays ? activeDays + Math.floor(rnd() * activeDays * 2) : 0
      const paid = activeDays > 2 && rnd() < 0.3
      const tariff = paid ? TARIFFS[Math.floor(rnd() * TARIFFS.length)] : null
      people.push({
        user_id: `demo-${f.funnel}-${i}`,
        email: `${name}.${100 + i}@${DEMO_MAILS[i % DEMO_MAILS.length]}`,
        name: null,
        telegram_username: rnd() < 0.8 ? `${name}_${f.funnel === 'trial3d' ? 'd' : 't'}${i}` : null,
        funnel: f.funnel,
        registered_at: new Date(registered).toISOString(),
        email_verified: rnd() < 0.72,
        active_days: activeDays,
        total_seconds: seconds,
        total_steps: Math.round(seconds * 1.5),
        workouts,
        last_activity_at: activeDays
          ? new Date(Math.min(now, registered + Math.floor(rnd() * 5 * DAY_MS))).toISOString()
          : null,
        paid,
        tariff: tariff ? tariff.name : null,
        paid_amount: tariff ? tariff.price : null,
      })
    }
  }
  return people
}

/* ——— Посты в каналы: несколько выдуманных, живут в памяти вкладки ——— */

const DEMO_CHANNEL_TITLES: Record<PostChannelKey, string> = {
  f1: 'Мой ритм! 1',
  f2: 'Мой ритм! 2',
  bot_f1: 'Бот: воронка 1 (3 дня)',
  bot_f2: 'Бот: воронка 2 (челлендж)',
}
const isBot = (key: PostChannelKey) => key === 'bot_f1' || key === 'bot_f2'

function demoPost(id: number, fields: Partial<ChannelPost> & Pick<ChannelPost, 'channel' | 'text'>): ChannelPost {
  const now = new Date().toISOString()
  const post: ChannelPost = {
    id,
    channel_title: DEMO_CHANNEL_TITLES[fields.channel],
    publish_at: null,
    text_length: 0,
    text_limit: TEXT_LIMIT,
    media_type: 'none',
    has_media: false,
    button_type: 'none',
    button_text: null,
    button_url: null,
    schedule_day: null,
    schedule_time: null,
    segment: 'all',
    selling: false,
    status: 'draft',
    telegram_message_id: null,
    error: null,
    source_ref: null,
    created_at: now,
    updated_at: now,
    published_at: null,
    ...fields,
  }
  return withLengths(post)
}

function withLengths(post: ChannelPost): ChannelPost {
  const bot = isBot(post.channel)
  return {
    ...post,
    is_bot: bot,
    deliveries: bot ? (post.deliveries ?? { recipients: 0, delivered: 0, failed: 0, blocked: 0, pending: 0 }) : null,
    channel_title: DEMO_CHANNEL_TITLES[post.channel],
    has_media: post.media_type !== 'none',
    text_length: visibleLength(post.text),
    text_limit: post.media_type === 'none' ? TEXT_LIMIT : CAPTION_LIMIT,
  }
}

function demoPosts(): ChannelPost[] {
  const at = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString()
  return [
    demoPost(1, {
      channel: 'f1',
      text: '<b>День 1.</b> Три минуты под музыку — и вы уже в ритме 💃',
      publish_at: at(-26),
      status: 'published',
      published_at: at(-26),
      telegram_message_id: 12,
      button_type: 'url',
      button_text: 'Начать',
      button_url: 'https://t.me/ritmritm_bot?start=hx4q7m2p',
    }),
    demoPost(2, {
      channel: 'f1',
      text: '<b>День 2.</b> Сегодня — шаги с поворотом. Включайте любимый трек!',
      publish_at: at(20),
      status: 'scheduled',
      media_type: 'photo',
    }),
    demoPost(3, { channel: 'f1', text: 'Черновик: итоги недели', publish_at: null }),
    demoPost(4, {
      channel: 'f2',
      text: '<i>Двадцать тренировок</i> — это меньше, чем кажется.',
      publish_at: at(-3),
      status: 'failed',
      error: 'Канал «Мой ритм! 2» не подключён: задайте POST_CHANNEL_F2_ID в .env сервера (docs/POSTS.md)',
    }),
    demoPost(5, {
      channel: 'bot_f1',
      text: '<b>День 2.</b> Пять минут под музыку — и день засчитан 💪',
      schedule_day: 2,
      schedule_time: '10:00',
      segment: 'inactive_yesterday',
      status: 'scheduled',
      button_type: 'web_app',
      button_text: 'Зайти в мой ритм',
      deliveries: { recipients: 41, delivered: 39, failed: 2, blocked: 2, pending: 0 },
    }),
    demoPost(6, {
      channel: 'bot_f1',
      text: 'Скидка на первый месяц — до пятницы.',
      publish_at: at(-50),
      status: 'published',
      published_at: at(-50),
      selling: true,
      button_type: 'url',
      button_text: 'Тарифы',
      button_url: 'https://ritmritm.ru/tariffs',
      deliveries: { recipients: 128, delivered: 125, failed: 3, blocked: 3, pending: 0 },
    }),
  ]
}

function demoSurvey(): SurveyRow[] {
  const at = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString()
  return [
    { tg_user_id: 5550101, user_id: 'd1', email: 'anna@example.com', funnel: 'trial3d', point: 3, score: 9,
      answers: { nps: '9', often: 'Каждый день', improve: 'Больше музыки 80-х' }, answered_at: at(1) },
    { tg_user_id: 5550102, user_id: 'd2', email: 'olga@example.com', funnel: 'trial20', point: 3, score: 6,
      answers: { nps: '6', often: 'Раз в неделю и реже', improve: null }, answered_at: at(2) },
    { tg_user_id: 5550103, user_id: 'd3', email: 'irina@example.com', funnel: 'trial20', point: 7, score: 10,
      answers: { nps: '10', often: 'Несколько раз в неделю', improve: 'Всё нравится!' }, answered_at: at(3) },
  ]
}

/** YYYY-MM-DD по времени браузера → границы суток в мс. */
const dayStart = (date: string) => Date.parse(`${date}T00:00:00`)

export function createDemoAdminApi(): AdminApi {
  const people = demoFunnelPeople()
  const DEMO_TOKEN = 'demo-admin'
  const posts = demoPosts()
  let nextPostId = posts.length + 1

  const findPost = (id: number) => {
    const post = posts.find((p) => p.id === id)
    if (!post) throw new ApiError(404, 'NOT_FOUND', 'Пост не найден')
    return post
  }
  const editable = (id: number) => {
    const post = findPost(id)
    if (post.status === 'published' || post.status === 'sending') {
      throw new ApiError(409, 'POST_CONFLICT', 'Пост уже опубликован или отправляется прямо сейчас — его не изменить')
    }
    return post
  }
  const save = (next: ChannelPost) => {
    const post = withLengths(next)
    posts[posts.findIndex((p) => p.id === post.id)] = post
    return post
  }
  const checkInput = (input: PostInput, media: ChannelPost['media_type']) => {
    const limit = media === 'none' ? TEXT_LIMIT : CAPTION_LIMIT
    const length = visibleLength(input.text)
    if (media === 'none' && !input.text.trim()) throw new ApiError(422, 'POST_INVALID', 'Пустой пост: нужен текст или картинка/ролик')
    if (length > limit) throw new ApiError(422, 'POST_INVALID', `Длина текста — ${length} символов, Telegram принимает до ${limit}`)
    if (input.button_type === 'web_app' && !isBot(input.channel)) {
      throw new ApiError(422, 'POST_INVALID', 'Кнопка «открыть приложение» работает только в личных сообщениях бота')
    }
    if (input.button_type === 'url' && !input.button_text !== !input.button_url) {
      throw new ApiError(422, 'POST_INVALID', 'У кнопки нужны и надпись, и ссылка — или ни того, ни другого')
    }
  }
  /** Поля ввода → поля поста, как их сохранил бы бэкенд. */
  const normalize = (input: PostInput): Partial<ChannelPost> => {
    const bot = isBot(input.channel)
    const template = bot && input.schedule_day ? input.schedule_day : null
    return {
      ...input,
      publish_at: template ? null : input.publish_at,
      schedule_day: template,
      schedule_time: template ? (input.schedule_time ?? null) : null,
      segment: bot ? (input.segment ?? 'all') : 'all',
      selling: bot ? !!input.selling : false,
      button_text:
        input.button_type === 'none' ? null : input.button_type === 'web_app' ? input.button_text || 'Зайти в мой ритм' : input.button_text,
      button_url: input.button_type === 'none' ? null : input.button_url,
    }
  }
  const survey = demoSurvey()
  const channelReady = (channel: PostChannelKey) => {
    if (channel === 'f2') {
      throw new ApiError(409, 'POST_CONFLICT', 'Канал «Мой ритм! 2» не подключён: задайте POST_CHANNEL_F2_ID в .env сервера (docs/POSTS.md)')
    }
  }

  const check = (token: string) => {
    if (token !== DEMO_TOKEN) throw new ApiError(401, 'UNAUTHORIZED', 'Нужно войти')
  }

  const inPeriod = (p: FunnelUser, period: Period) => {
    const at = Date.parse(p.registered_at)
    if (period.from && at < dayStart(period.from)) return false
    if (period.to && at >= dayStart(period.to) + DAY_MS) return false
    return true
  }

  const csvCell = (value: unknown) => {
    const text = value === null || value === undefined ? '' : String(value)
    return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }

  return {
    isDemo: true,

    async login(email, password) {
      // Как и вход человека в демо: паролей нет, хватает похожих на правду.
      if (!email.includes('@') || password.length < MIN_PASSWORD) {
        throw new ApiError(401, 'UNAUTHORIZED', 'Неверная почта или пароль')
      }
      return DEMO_TOKEN
    },

    async summary(token, period) {
      check(token)
      return DEMO_FUNNEL_TABLE.map((f): FunnelSummary => {
        const all = people.filter((p) => p.funnel === f.funnel)
        const mine = all.filter((p) => inPeriod(p, period))
        // Визиты и старты бота — в той же доле, что и регистрации за период.
        const share = all.length ? mine.length / all.length : 0
        const visitors = Math.round(f.visitors * share)
        const botStarts = Math.round(f.botStarts * share)
        const paid = mine.filter((p) => p.paid)
        // Плашку «Открой все 40» видят те, у кого открыты не все движения:
        // в демо — те, кто начал шагать; нажимает примерно каждый шестой.
        const bannerSeen = mine.filter((p) => p.active_days > 0).length
        const bannerClicked = Math.round(bannerSeen / 6)
        return {
          funnel: f.funnel,
          token: f.token,
          bot_link: `https://t.me/ritmritm_bot?start=${f.token}`,
          visitors,
          bot_starts: botStarts,
          registered: mine.length,
          email_verified: mine.filter((p) => p.email_verified).length,
          started: mine.filter((p) => p.active_days > 0).length,
          // Предложение челленджа — через три дня; увидели его те, кто после
          // этого заходил. У челленджа нет конца — expired null, как у бэкенда.
          reached_offer:
            f.funnel === 'trial20'
              ? mine.filter(
                  (p) =>
                    Date.now() - Date.parse(p.registered_at) > CHALLENGE_OFFER_DAYS * DAY_MS &&
                    p.active_days > 2,
                ).length
              : null,
          expired:
            f.funnel === 'trial3d'
              ? mine.filter((p) => Date.now() - Date.parse(p.registered_at) > TRIAL_DAYS * DAY_MS).length
              : null,
          paid_users: paid.length,
          revenue: paid.reduce((sum, p) => sum + (p.paid_amount ?? 0), 0),
          currency: 'RUB',
          banner_seen: bannerSeen,
          banner_clicked: bannerClicked,
          banner_click_share: bannerSeen ? bannerClicked / bannerSeen : null,
          // По письмам: люди — по своей метке, заходы и старты — долей от общих.
          sources: DEMO_SOURCES.map(({ source, part }) => {
            const own = mine.filter((p) => demoSourceOf(p) === source)
            return {
              source,
              visits: Math.round(visitors * part),
              bot_starts: Math.round(botStarts * part),
              registrations: own.length,
              paid: own.filter((p) => p.paid).length,
            }
          }),
          letter_links: ['m1', 'm2', 'm3'].map((mark) => ({
            mark,
            bot_url: `https://t.me/ritmritm_bot?start=${f.token}_${mark}`,
            site_url: `https://ritmritm.ru/go/${f.token}_${mark}`,
          })),
        }
      })
    },

    async users(token, q: UsersQuery) {
      check(token)
      const key = q.sort
      const list = people
        .filter((p) => p.funnel === q.funnel)
        .sort((a, b) =>
          key === 'registered_at'
            ? Date.parse(b.registered_at) - Date.parse(a.registered_at)
            : (b[key] as number) - (a[key] as number),
        )
      const start = (q.page - 1) * q.per_page
      return { items: list.slice(start, start + q.per_page), total: list.length, page: q.page, per_page: q.per_page }
    },

    async usersCsv(token, funnel) {
      check(token)
      const head = ['email', 'telegram', 'registered_at', 'email_verified', 'active_days', 'total_seconds', 'total_steps', 'workouts', 'last_activity_at', 'paid', 'tariff', 'paid_amount']
      const rows = people
        .filter((p) => p.funnel === funnel)
        .map((p) =>
          [p.email, p.telegram_username, p.registered_at, p.email_verified, p.active_days, p.total_seconds, p.total_steps, p.workouts, p.last_activity_at, p.paid, p.tariff, p.paid_amount]
            .map(csvCell)
            .join(','),
        )
      // BOM — чтобы Excel сразу открыл кириллицу правильно.
      return new Blob(['\ufeff' + [head.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' })
    },

    async behavior(token, period) {
      check(token)
      // Выдуманные, но правдоподобные цифры: регистрации — из людей демо за
      // период, остальное — доли от них. «Без воронки» в демо пуста, чтобы
      // было видно, как выглядит «нет данных».
      const column = (funnel: BehaviorGroup, pace: number): BehaviorColumn => {
        const registered =
          funnel === 'none' ? 0 : people.filter((p) => p.funnel === funnel && inPeriod(p, period)).length
        const part = (x: number) => Math.round(registered * x)
        const share = (returned: number, users: number) => (users ? Math.round((returned / users) * 1e4) / 1e4 : null)
        const retention = [1, 3, 7, 14, 21].map((day, i) => {
          const users = part(1 - i * 0.12)
          const returned = Math.round(users * pace * (0.62 - i * 0.1))
          return { day, users, returned, share: share(returned, users) }
        })
        const empty = registered === 0
        const week2Users = part(0.6)
        const week2Returned = Math.round(week2Users * pace * 0.4)
        return {
          funnel,
          registered,
          active_days_7: { window: 7, users: part(0.8), mean: empty ? null : 2.6 * pace, median: empty ? null : 2 },
          active_days_21: { window: 21, users: part(0.4), mean: empty ? null : 6.1 * pace, median: empty ? null : 5 },
          retention,
          returned_week2: { users: week2Users, returned: week2Returned, share: share(week2Returned, week2Users) },
          active_days: part(4 * pace),
          sessions_per_active_day: empty ? null : 1.3,
          session_minutes: empty ? null : Math.round(14 * pace * 100) / 100,
          minutes_per_active_day: empty ? null : Math.round(18.2 * pace * 100) / 100,
          steps_per_active_day: empty ? null : Math.round(1650 * pace),
        }
      }
      return {
        date_from: period.from ?? null,
        date_to: period.to ?? null,
        active_day_min_seconds: 60,
        session_gap_seconds: 1800,
        window_days: 21,
        funnels: [column('trial3d', 0.8), column('trial20', 1.1), column('none', 1)],
      }
    },

    async postChannels(token) {
      check(token)
      return {
        channels: [
          { key: 'f1', kind: 'channel', title: 'Мой ритм! 1', note: 'воронка 1 — 3 дня', configured: true, chat_id: -1001000000001 },
          // Второй канал в демо «не подключён» — чтобы было видно, как это выглядит.
          { key: 'f2', kind: 'channel', title: 'Мой ритм! 2', note: 'воронка 2 — челлендж 21 день', configured: false, chat_id: null },
          { key: 'bot_f1', kind: 'bot', title: DEMO_CHANNEL_TITLES.bot_f1, note: 'личные сообщения людям воронки 1', configured: true, chat_id: null },
          { key: 'bot_f2', kind: 'bot', title: DEMO_CHANNEL_TITLES.bot_f2, note: 'личные сообщения людям воронки 2', configured: true, chat_id: null },
        ],
        preview_configured: true,
        bot_configured: true,
      }
    },

    async posts(token, channel) {
      check(token)
      return posts
        .filter((p) => p.channel === channel)
        .sort((a, b) => (a.publish_at ? Date.parse(a.publish_at) : Infinity) - (b.publish_at ? Date.parse(b.publish_at) : Infinity) || a.id - b.id)
    },

    async createPost(token, input) {
      check(token)
      checkInput(input, 'none')
      const post = demoPost(nextPostId++, { ...normalize(input), channel: input.channel, text: input.text })
      posts.push(post)
      return post
    },

    async updatePost(token, id, input) {
      check(token)
      const post = editable(id)
      checkInput(input, post.media_type)
      return save({ ...post, ...normalize(input), updated_at: new Date().toISOString() })
    },

    async deletePost(token, id) {
      check(token)
      const post = findPost(id)
      if (post.status !== 'draft' && post.status !== 'cancelled') {
        throw new ApiError(409, 'POST_CONFLICT', 'Удалить можно только черновик или отменённый пост — сначала отмените')
      }
      posts.splice(posts.indexOf(post), 1)
    },

    async uploadPostMedia(token, id, file) {
      check(token)
      const post = editable(id)
      const kind = file.type === 'video/mp4' ? 'video' : file.type === 'image/gif' ? 'animation' : 'photo'
      if (visibleLength(post.text) > CAPTION_LIMIT) {
        throw new ApiError(422, 'POST_INVALID', `Длина подписи к картинке или ролику — ${visibleLength(post.text)} символов, Telegram принимает до ${CAPTION_LIMIT}`)
      }
      return save({ ...post, media_type: kind })
    },

    async deletePostMedia(token, id) {
      check(token)
      return save({ ...editable(id), media_type: 'none' })
    },

    async schedulePost(token, id) {
      check(token)
      const post = editable(id)
      if (post.schedule_day) return save({ ...post, status: 'scheduled', error: null })
      if (!post.publish_at) throw new ApiError(422, 'POST_INVALID', 'Не задано время публикации')
      if (Date.parse(post.publish_at) < Date.now() - 60_000) {
        throw new ApiError(422, 'POST_INVALID', 'Время публикации уже прошло: поставьте новое или нажмите «Опубликовать сейчас»')
      }
      channelReady(post.channel)
      return save({ ...post, status: 'scheduled', error: null })
    },

    async cancelPost(token, id) {
      check(token)
      const post = findPost(id)
      if (post.status !== 'scheduled') throw new ApiError(409, 'POST_CONFLICT', 'Отменить можно только запланированный пост')
      return save({ ...post, status: 'cancelled' })
    },

    async publishPostNow(token, id) {
      check(token)
      const post = editable(id)
      channelReady(post.channel)
      const now = new Date().toISOString()
      if (isBot(post.channel)) {
        if (post.schedule_day) {
          throw new ApiError(409, 'POST_CONFLICT', 'Пост «день N» уходит каждому в его день — сразу его не отправить')
        }
        return save({ ...post, status: 'scheduled', publish_at: now, error: null })
      }
      return save({ ...post, status: 'published', published_at: now, telegram_message_id: 100 + post.id, error: null })
    },

    async previewPost(token, id) {
      check(token)
      findPost(id)
    },

    async postAudience(token, channel, segment, selling) {
      check(token)
      const base = channel === 'bot_f1' ? 140 : 95
      const share = { all: 1, registered_idle: 0.2, active_yesterday: 0.35, inactive_yesterday: 0.45, unpaid: 0.8 }[segment]
      return Math.round(base * share * (selling ? 0.85 : 1))
    },

    async survey(token, q) {
      check(token)
      const items = survey.filter(
        (r) =>
          (!q.funnel || (q.funnel === 'organic' ? r.funnel === null : r.funnel === q.funnel)) &&
          (!q.point || r.point === q.point),
      )
      const stats = (rows: SurveyRow[]) => {
        const scores = rows.map((r) => r.score).filter((s): s is number => s !== null)
        const nps = scores.length
          ? Math.round(((scores.filter((s) => s >= 9).length - scores.filter((s) => s <= 6).length) * 1000) / scores.length) / 10
          : null
        return {
          responses: rows.length,
          scores: scores.length,
          avg_score: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : null,
          nps,
        }
      }
      const funnels = [...new Set(items.map((r) => r.funnel))]
      const data: SurveyData = {
        questions: [
          { key: 'nps', text: 'Насколько вероятно, что вы порекомендуете «Мой ритм» друзьям?' },
          { key: 'often', text: 'Как часто вы тренируетесь с «Моим ритмом»?' },
          { key: 'improve', text: 'Что нам улучшить в первую очередь?' },
        ],
        summary: funnels.map((funnel) => ({ funnel, ...stats(items.filter((r) => r.funnel === funnel)) })),
        total: stats(items),
        items,
      }
      return data
    },

    async surveyCsv(token, q) {
      const data = await this.survey(token, q)
      const keys = data.questions.map((x) => x.key)
      const rows = data.items.map((r) =>
        [r.answered_at, r.email, r.tg_user_id, r.funnel ?? 'органический', r.point, ...keys.map((k) => r.answers[k])]
          .map(csvCell)
          .join(';'),
      )
      const head = ['Дата', 'Почта', 'Telegram id', 'Воронка', 'День опроса', ...keys].join(';')
      return new Blob(['\ufeff' + [head, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' })
    },

    async paymentProblems(token, q) {
      check(token)
      return demoPaymentsPage(q)
    },

    async grantPayment(token, id, input) {
      check(token)
      return demoGrantPayment(id, input)
    },
  }
}

/* ——— Оплаты без доступа (раздел «Оплаты») ———
   Состояние — на весь модуль, а не внутри createDemoAdminApi: демо-админка
   собирается заново на каждый вызов (lazyDemoAdminApi), и выданный доступ
   иначе пропадал бы при следующей загрузке списка. */

type PaymentProblem = import('./admin').PaymentProblem
type PaymentProblems = import('./admin').PaymentProblems
type PaymentProblemsQuery = import('./admin').PaymentProblemsQuery
type PaymentGrantInput = import('./admin').PaymentGrantInput
type PaymentGrantResult = import('./admin').PaymentGrantResult

const DEMO_PAYMENT_TARIFFS = TARIFFS.map((t) => ({ code: t.code, name: t.name }))
const demoTariffOf = (code: string) => DEMO_PAYMENT_TARIFFS.find((t) => t.code === code) ?? null
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString()

type PaymentFields = Partial<PaymentProblem> & Pick<PaymentProblem, 'id' | 'received_at' | 'status'>

const paymentRow = (fields: PaymentFields): PaymentProblem => ({
  detail: null,
  order_id: null,
  order_number: null,
  email: null,
  offer_id: null,
  offer_title: null,
  tariff: null,
  amount: null,
  currency: 'RUB',
  user: null,
  access: null,
  can_grant: true,
  ...fields,
})

/** По строке на каждый случай раздела: всё, что владелец увидит в бою. */
function demoPaymentProblems(): PaymentProblem[] {
  return [
    paymentRow({
      id: 'demo-pay-1', received_at: hoursAgo(3), status: 'unmatched_user',
      detail: 'не нашли человека: почта «marina.k@mail.ru», gc_user_id «302118», метка «»',
      order_id: '897313536', order_number: '5501', email: 'marina.k@mail.ru',
      offer_id: '5001', offer_title: 'Мой ритм — 1 месяц', tariff: demoTariffOf('month'), amount: 390,
    }),
    paymentRow({
      id: 'demo-pay-2', received_at: hoursAgo(20), status: 'unknown_offer',
      detail: 'оффер 7002 «Мой ритм — 3 месяца (рассрочка)» не привязан ни к одному тарифу',
      order_id: '897400012', order_number: '5507', email: 'olga@example.com',
      offer_id: '7002', offer_title: 'Мой ритм — 3 месяца (рассрочка)', amount: 790,
      user: { id: 'demo-user-olga', email: 'olga@example.com', email_verified: true },
    }),
    paymentRow({
      id: 'demo-pay-3', received_at: hoursAgo(30), status: 'error',
      detail: 'в запросе нет ID заказа: добавьте параметр order_id с подстановкой {object.id} в действие «Вызвать URL»',
      order_number: '5512', email: 'irina@yandex.ru', offer_id: '5003', offer_title: 'Мой ритм — 6 месяцев',
      tariff: demoTariffOf('half'), amount: 1390, can_grant: false,
      user: { id: 'demo-user-irina', email: 'irina@yandex.ru', email_verified: false },
    }),
    paymentRow({
      id: 'demo-pay-4', received_at: hoursAgo(50), status: 'unmatched_user',
      detail: 'не нашли человека: почта «elena.s@bk.ru», gc_user_id «302540», метка «»',
      order_id: '897288800', order_number: '5490', email: 'elena.s@bk.ru',
      offer_id: '5004', offer_title: 'Мой ритм — 12 месяцев', tariff: demoTariffOf('year'), amount: 1990,
      access: {
        user_email: 'elena.smirnova@gmail.com',
        paid_until: new Date(Date.now() + 360 * DAY_MS).toISOString(),
        source: 'reconcile',
      },
      can_grant: false,
    }),
  ]
}

/** Чужие оплаты общего аккаунта GetCourse: видны только по чипу «Показать чужие». */
function demoForeignPayments(): PaymentProblem[] {
  const foreign = (id: string, hours: number, order: string, email: string) =>
    paymentRow({
      id, received_at: hoursAgo(hours), status: 'unknown_offer',
      detail: 'оффер 3301 «Абонемент в онлайн-клуб «Шагай дома»» не привязан ни к одному тарифу',
      order_id: order, email, offer_id: '3301', offer_title: 'Абонемент в онлайн-клуб «Шагай дома»', amount: 9990,
    })
  return [foreign('demo-pay-f1', 6, '897350001', 'tatiana@mail.ru'), foreign('demo-pay-f2', 26, '897350002', 'natasha@bk.ru')]
}

let demoPayments: { ours: PaymentProblem[]; foreign: PaymentProblem[] } | null = null

const demoPaymentState = () => (demoPayments ??= { ours: demoPaymentProblems(), foreign: demoForeignPayments() })

function demoPaymentsPage(q: PaymentProblemsQuery): PaymentProblems {
  const state = demoPaymentState()
  const inPeriod = (p: PaymentProblem) => {
    const at = Date.parse(p.received_at)
    if (q.from && at < dayStart(q.from)) return false
    if (q.to && at >= dayStart(q.to) + DAY_MS) return false
    return true
  }
  const ours = state.ours.filter(inPeriod)
  const foreign = state.foreign.filter(inPeriod)
  const items = (q.foreign ? [...ours, ...foreign] : ours).sort(
    (a, b) => Date.parse(b.received_at) - Date.parse(a.received_at),
  )
  return { items, total: items.length, foreign_hidden: q.foreign ? 0 : foreign.length, tariffs: DEMO_PAYMENT_TARIFFS }
}

/** Ответы и отказы — как у бэкенда; аккаунта в демо нет только у адресов на «net…». */
function demoGrantPayment(id: string, input: PaymentGrantInput): PaymentGrantResult {
  const state = demoPaymentState()
  const list = state.ours.some((p) => p.id === id) ? state.ours : state.foreign
  const index = list.findIndex((p) => p.id === id)
  if (index < 0) throw new ApiError(404, 'PAYMENT_EVENT_NOT_FOUND', 'Такой оплаты нет — обновите список')
  const row = list[index]
  if (row.status === 'processed') throw new ApiError(409, 'PAYMENT_EVENT_RESOLVED', 'Эта оплата уже разобрана')
  if (!row.order_id) {
    throw new ApiError(409, 'ORDER_ID_MISSING', 'В уведомлении нет ID заказа — доступ по нему выдаст сверка с GetCourse')
  }
  if (row.access) {
    throw new ApiError(409, 'ORDER_ALREADY_GRANTED', `По этому заказу доступ уже выдан: ${row.access.user_email}`)
  }
  const email = normalize(input.email)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Проверьте почту аккаунта')
  }
  if (email.startsWith('net')) {
    throw new ApiError(404, 'USER_NOT_FOUND', `Аккаунта с почтой ${email} нет: проверьте адрес или попросите человека зарегистрироваться`)
  }
  if (!row.tariff && !input.tariff_code) {
    throw new ApiError(409, 'TARIFF_REQUIRED', 'Оффер не привязан ни к одному тарифу — выберите тариф')
  }
  const tariff = row.tariff ?? demoTariffOf(input.tariff_code ?? '')
  if (!tariff) throw new ApiError(404, 'TARIFF_NOT_FOUND', 'Такого тарифа нет')

  const days = TARIFFS.find((t) => t.code === tariff.code)?.duration_days ?? 30
  const paidUntil = new Date(Date.now() + days * DAY_MS)
  const next: PaymentProblem = {
    ...row,
    status: 'processed',
    detail: `доступ выдан вручную: demo-admin → ${email}`,
    tariff,
    user: { id: `demo-user-${email}`, email, email_verified: true },
    access: { user_email: email, paid_until: paidUntil.toISOString(), source: 'manual' },
    can_grant: false,
  }
  list[index] = next
  const until = paidUntil.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
  return { message: `Доступ выдан: ${email}, тариф «${tariff.name}», до ${until}`, problem: next }
}
