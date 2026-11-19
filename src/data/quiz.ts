/**
 * Квиз «Ваш план на 30 дней» (/quiz, src/screens/Quiz.tsx): вопросы,
 * ответы, фразы загрузок и сборка плана из ответов.
 *
 * Тексты написаны скиллом na-pero (12.11.2026, переписаны им же 19.11.2026,
 * таблица «было → стало» — _1119/quiz-copy.md) и стоят здесь дословно —
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
    title: 'Что для вас сейчас главное?',
    options: [
      {
        value: 'slim',
        label: 'Стать стройнее',
        hint: 'Больше двигаться каждый день',
        loading: 'Подойдёт поток «Подвигаться»: шаги и простые движения под музыку, хоть каждый день',
      },
      {
        value: 'back',
        label: 'Спина и осанка',
        hint: 'Размять спину и шею, держать осанку',
        loading: 'Для этого есть поток «Размять спину»: простые движения стоя для спины, шеи и осанки',
      },
      {
        value: 'energy',
        label: 'Взбодриться',
        hint: 'Встряхнуться среди рабочего дня',
        loading: 'Включили музыку, подвигались несколько минут между делами и вернулись к работе',
      },
    ],
  },
  {
    key: 'activity',
    title: 'Как у вас сейчас с движением?',
    options: [
      {
        value: 'none',
        label: 'Почти не двигаюсь',
        hint: 'Большую часть дня сижу',
        loading: 'Начнём мягко: движения простые, и каждое показывают на экране',
      },
      {
        value: 'some',
        label: 'Иногда',
        hint: 'Бывает прогулка или зарядка',
        loading: 'Поток можно включить в любую свободную минуту и выйти, когда нужно',
      },
      {
        value: 'regular',
        label: 'Регулярно',
        hint: 'Несколько раз в неделю',
        loading: 'Поток легко добавить к вашим занятиям, хоть на 3 минуты между делами',
      },
    ],
  },
  {
    key: 'minutes',
    title: 'Сколько минут в день найдётся на движение?',
    // Мысль владельца: неважно, сколько у вас времени, даже 10 минут в день
    // идут в дело. Честно — через минуты, которые считает сайт.
    options: [
      {
        value: 10,
        label: '10 минут',
        loading: 'Каждая минута идёт в зачёт: сайт считает минуты в движении и показывает их по дням',
      },
      {
        value: 20,
        label: '20 минут',
        loading: '20 минут наберутся и по кусочку: поток можно включить на 3 минуты и выйти',
      },
      {
        value: 30,
        label: '30 минут',
        loading: 'Полчаса можно набрать частями за день, сайт посчитает каждую минуту',
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
        loading: 'Учтём в плане: поток «Размять спину» для спины, шеи и осанки',
      },
      {
        value: 'some',
        label: 'Иногда',
        hint: 'После долгого дня',
        loading: 'Учтём: «Размять спину» можно включать в дни, когда устала спина',
      },
      {
        value: 'no',
        label: 'Нет',
        loading: 'Тогда план соберём под вашу цель. Почти готово',
      },
    ],
  },
]

export const QUIZ_TEXT = {
  pageTitle: 'План движения на 30 дней · Мой ритм',
  intro: 'Четыре коротких вопроса, и план на 30 дней готов. Подвигаться под музыку можно сразу после него, без регистрации.',
  progress: (n: number, total: number) => `Вопрос ${n} из ${total}`,
  back: 'Назад',
  loadingFinal: 'Собираем план на 30 дней…',
  planTitle: 'Ваш план на 30 дней',
  planSubtitle: 'Собрали по вашим ответам. Первый поток можно включить прямо сейчас, без регистрации.',
  goalLabel: 'Цель',
  streamsLabel: 'Что включать',
  minutesLabel: 'В день',
  scaleTitle: 'Минут в день по неделям',
  total: (n: number) => `За 30 дней наберётся около ${n} минут движения.`,
  // Только когда пробный за 1 ₽ включён на сервере (quizCardTrial). Без него
  // подпись кнопки — flowLabel() из src/auth/guards.tsx, как у входа в поток
  // на главной: «Влиться в поток» (Никита 18.11.2026, подпись через na-pero).
  cta: 'Начать: 3 дня за 1 ₽',
  // Только когда пробный за 1 ₽ включён на сервере (quizCardTrial); иначе
  // строки под кнопкой нет. Через na-pero 12.11, на вычитку.
  ctaNote:
    'Сейчас спишем 1 ₽. Через 3 дня и дальше каждый месяц спишем автоматически 490 ₽, пока вы не отмените подписку. Отмена — в профиле, в один клик.',
  // Кнопка плана, пока пробный за 1 ₽ выключен: ведёт сразу в тренировку.
  // Идёт тренировка — «Вернуться в поток» (flowLabel). na-pero, 19.11.2026.
  ctaFree: 'Включить первый поток',
  restart: 'Пройти заново',
  extraBadge: 'Добавили для спины',
  extraReason: 'Вы отметили, что к вечеру устаёт спина или шея',
} as const

export const GOAL_PLAN: Record<Goal, { title: string; text: string }> = {
  slim: {
    title: 'Двигаться больше каждый день',
    text: 'Движения под музыку сменяются сами. Сайт считает минуты в движении и показывает по дням.',
  },
  back: {
    title: 'Разминка для спины каждый день',
    text: 'Дома или в офисе, без переодевания. Движения показаны на экране и сменяются сами.',
  },
  energy: {
    title: 'Взбодриться среди дня',
    text: 'Включаете поток на несколько минут между делами и выходите, когда пора за работу.',
  },
}

/** Потоки плана — те же, что в переключателе плеера (src/data/streamSwitcher.ts). */
export type PlanStreamId = 'cardio' | 'back'

export const PLAN_STREAMS: Record<PlanStreamId, { title: string; text: string }> = {
  cardio: { title: 'Подвигаться', text: 'Лёгкое кардио: шаги и простые движения на месте' },
  back: { title: 'Размять спину', text: 'Простые движения стоя для спины, шеи и осанки' },
}

export const MINUTES_PLAN: Record<Minutes, { title: string; text: string }> = {
  10: { title: '10 минут', text: 'Разом или по 3 минуты между делами' },
  20: { title: '20 минут', text: 'Например, 10 утром и 10 вечером' },
  30: { title: '30 минут', text: 'Целиком вечером или частями за день' },
}

export const WEEK_NAMES = ['Привыкаем', 'Входим в ритм', 'Держим ритм', 'Ваш ритм'] as const

export const PACE_NOTE: Record<Activity, string> = {
  none: 'Первую неделю минут меньше, дальше прибавляем понемногу.',
  some: 'Первую неделю минут чуть меньше, со второй полный план.',
  regular: 'Вы уже двигаетесь, поэтому сразу полный план.',
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
