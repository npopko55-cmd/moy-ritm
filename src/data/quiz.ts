/**
 * Квиз «Ваш план на 30 дней» (/quiz, src/screens/Quiz.tsx): вопросы,
 * ответы, фразы загрузок и сборка плана из ответов.
 *
 * Тексты написаны скиллом na-pero (12.11.2026) и стоят здесь дословно —
 * править их тоже через него. Обещаний в килограммах и медицинских обещаний
 * нет намеренно: план говорит только о минутах и потоках, которые правда есть.
 */

export type Goal = 'slim' | 'back' | 'energy'
export type Activity = 'none' | 'some' | 'regular'
export type Minutes = 10 | 20 | 30
export type BackTired = 'often' | 'some' | 'no'

export type QuizAnswers = {
  goal: Goal
  activity: Activity
  minutes: Minutes
  back: BackTired
}

export type QuizKey = keyof QuizAnswers

type Option<K extends QuizKey> = {
  value: QuizAnswers[K]
  label: string
  hint?: string
  /** Фраза загрузки после этого ответа. */
  loading: string
}

export type Question<K extends QuizKey = QuizKey> = {
  key: K
  title: string
  options: Option<K>[]
}

/** Порядок — порядок экранов. Число вопросов берётся отсюда же. */
export const QUESTIONS: [Question<'goal'>, Question<'activity'>, Question<'minutes'>, Question<'back'>] = [
  {
    key: 'goal',
    title: 'Какая у вас цель?',
    options: [
      {
        value: 'slim',
        label: 'Стать стройнее',
        hint: 'Больше движения каждый день',
        loading: 'Отлично: лёгкое кардио под музыку можно включать хоть каждый день',
      },
      {
        value: 'back',
        label: 'Спина и осанка',
        hint: 'Размять спину, держать осанку',
        loading: 'Отлично: для спины и осанки есть отдельный поток «Размять спину»',
      },
      {
        value: 'energy',
        label: 'Бодрость и энергия',
        hint: 'Взбодриться среди дня',
        loading: 'Отлично: подвигались под музыку и вернулись к делам с новыми силами',
      },
    ],
  },
  {
    key: 'activity',
    title: 'Сколько вы двигаетесь сейчас?',
    options: [
      {
        value: 'none',
        label: 'Почти не двигаюсь',
        hint: 'В основном сижу',
        loading: 'Начнём мягко: движения простые, героиня показывает каждое',
      },
      {
        value: 'some',
        label: 'Иногда',
        hint: 'Бывает прогулка или зарядка',
        loading: 'Хорошо: эфир можно включать в любую свободную минуту',
      },
      {
        value: 'regular',
        label: 'Регулярно',
        hint: 'Занимаюсь несколько раз в неделю',
        loading: 'Здорово: эфир легко добавить к тому, что вы уже делаете',
      },
    ],
  },
  {
    key: 'minutes',
    title: 'Сколько минут в день готовы двигаться?',
    // Мысль владельца: неважно, сколько у вас времени, даже 10 минут в день
    // идут в дело. Честно — через минуты, которые считает сайт.
    options: [
      {
        value: 10,
        label: '10 минут',
        loading: 'Даже 10 минут в день идут в зачёт: сайт считает каждую минуту движения',
      },
      {
        value: 20,
        label: '20 минут',
        loading: '20 минут наберутся и по 3 минуты между делами: эфир идёт без начала и конца',
      },
      {
        value: 30,
        label: '30 минут',
        loading: 'Полчаса можно по кусочку, а в занятый день сайт засчитает и 10 минут',
      },
    ],
  },
  {
    key: 'back',
    title: 'Бывает, что к вечеру устаёт спина или затекает шея?',
    options: [
      {
        value: 'often',
        label: 'Часто',
        hint: 'Почти каждый день',
        loading: 'Учтём: в плане будет поток «Размять спину» для спины и осанки',
      },
      {
        value: 'some',
        label: 'Иногда',
        hint: 'После долгого дня',
        loading: 'Учтём: «Размять спину» можно включить, когда к вечеру устала спина',
      },
      {
        value: 'no',
        label: 'Нет',
        loading: 'Хорошо, что спина не устаёт. План почти готов',
      },
    ],
  },
]

export const QUIZ_TEXT = {
  pageTitle: 'План на 30 дней · Мой ритм',
  intro: 'Ответьте на 4 вопроса, и соберём план на 30 дней.',
  progress: (n: number, total: number) => `Вопрос ${n} из ${total}`,
  back: 'Назад',
  loadingFinal: 'Собираем ваш план…',
  planTitle: 'Ваш план на 30 дней',
  planSubtitle: 'Собрали по вашим ответам. Начать можно сегодня.',
  goalLabel: 'Цель',
  streamsLabel: 'Потоки',
  minutesLabel: 'Минут в день',
  scaleTitle: 'Минут в день по неделям',
  total: (n: number) => `По плану за 30 дней наберётся около ${n} минут движения.`,
  cta: 'Начать: 3 дня за 1 ₽',
  ctaNote: 'Потом 490 ₽ в месяц, отменить можно в один клик.',
  restart: 'Пройти заново',
  extraBadge: 'Дополнительный поток',
  extraReason: 'Добавили по вашему ответу про спину и шею',
} as const

export const GOAL_PLAN: Record<Goal, { title: string; text: string }> = {
  slim: {
    title: 'Больше движения каждый день',
    text: 'Шаги и простые движения под музыку, а сайт считает каждую минуту.',
  },
  back: {
    title: 'Спина и осанка каждый день',
    text: 'Поток «Размять спину»: простые движения для спины и осанки под музыку.',
  },
  energy: {
    title: 'Бодрость среди дня',
    text: 'Подвигались под музыку между делами и вернулись к ним с новыми силами.',
  },
}

/** Потоки плана — те же, что в переключателе плеера (src/data/streamSwitcher.ts). */
export type PlanStreamId = 'cardio' | 'back'

export const PLAN_STREAMS: Record<PlanStreamId, { title: string; text: string }> = {
  cardio: { title: 'Подвигаться', text: 'Лёгкое кардио: шаги и простые движения' },
  back: { title: 'Размять спину', text: 'Простые движения для спины и осанки' },
}

export const MINUTES_PLAN: Record<Minutes, { title: string; text: string }> = {
  10: { title: '10 минут', text: 'Хоть разом, хоть по 3 минуты между делами' },
  20: { title: '20 минут', text: 'Например, 10 утром и 10 вечером' },
  30: { title: '30 минут', text: 'Полчаса вечером или частями за день' },
}

export const WEEK_NAMES = ['Привыкаем', 'Входим в ритм', 'Держим ритм', 'Ваш ритм'] as const

export const PACE_NOTE: Record<Activity, string> = {
  none: 'Первая неделя мягче: начнём с малого и прибавим постепенно.',
  some: 'С первой недели двигаетесь в своём темпе.',
  regular: 'С первой недели идёте по полному плану.',
}

/**
 * Доля выбранных минут по неделям. Кто сейчас почти не двигается, входит
 * мягко; кто двигается иногда — чуть мягче только первую неделю; кто
 * регулярно — сразу по плану. Больше выбранного план не просит никогда.
 */
const RAMP: Record<Activity, readonly [number, number, number, number]> = {
  none: [0.5, 0.7, 0.85, 1],
  some: [0.8, 1, 1, 1],
  regular: [1, 1, 1, 1],
}

/** Дней в каждой «неделе» 30-дневного плана: последняя добирает до 30. */
const WEEK_DAYS = [7, 7, 7, 9] as const

export type Plan = {
  goal: { title: string; text: string }
  streams: { id: PlanStreamId; title: string; text: string; extra: boolean }[]
  minutes: { value: Minutes; title: string; text: string }
  /** Минут в день по плану на каждой из четырёх недель. */
  weeks: { name: string; minutes: number }[]
  paceNote: string
  /** Минут движения за 30 дней по плану, округлено до десятков. */
  total: number
}

export function buildPlan(a: QuizAnswers): Plan {
  const main: PlanStreamId = a.goal === 'back' ? 'back' : 'cardio'
  const streams: Plan['streams'] = [{ id: main, ...PLAN_STREAMS[main], extra: false }]
  // Спина устаёт, а цель не спина, — «Размять спину» вторым потоком.
  if (main !== 'back' && a.back !== 'no') streams.push({ id: 'back', ...PLAN_STREAMS.back, extra: true })

  const weeks = RAMP[a.activity].map((share, i) => ({
    name: WEEK_NAMES[i],
    minutes: Math.max(5, Math.round(a.minutes * share)),
  }))
  const raw = weeks.reduce((sum, w, i) => sum + w.minutes * WEEK_DAYS[i], 0)

  return {
    goal: GOAL_PLAN[a.goal],
    streams,
    minutes: { value: a.minutes, ...MINUTES_PLAN[a.minutes] },
    weeks,
    paceNote: PACE_NOTE[a.activity],
    total: Math.round(raw / 10) * 10,
  }
}

/** Ответы из хранилища — только если все четыре на месте и правильного вида. */
export function parseAnswers(raw: unknown): QuizAnswers | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const ok = QUESTIONS.every((q) => q.options.some((o) => o.value === r[q.key]))
  if (!ok) return null
  return {
    goal: r.goal as Goal,
    activity: r.activity as Activity,
    minutes: r.minutes as Minutes,
    back: r.back as BackTired,
  }
}
