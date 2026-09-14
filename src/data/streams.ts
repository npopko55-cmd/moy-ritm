/**
 * Потоки тренировок. id совпадают с теми, что создаёт бэкенд в app/seed.py,
 * чтобы экран можно было переключить с локальных данных на API без правок.
 *
 * cover — фотография для карточки в левом сайдбаре: положите файл
 * public/streams/<id>.png (человек, вырезанный по контуру, вертикальный кадр).
 */

import type { FreeTier } from '../api/types'
import { asset } from '../lib/asset'
import { plural } from '../lib/date'
import { LOOPS, type Loop } from './loops'

export type Stream = {
  id: string
  title: string
  subtitle: string
  theme: 'cardio' | 'back' | 'office' | 'dance' | 'senior'
  cover: string
  loops: Loop[]
  /**
   * Поток скрыт в интерфейсе: своего контента под него пока нет.
   *
   * Решение владельца от 11.09.2026: выбор потоков убран отовсюду, потому
   * что роликов хватает ровно на один поток — кардио. Остальные не удалены,
   * чтобы не ломать ни ссылки, ни историю занятий: они просто нигде не
   * показываются. Появятся свои ролики — снимите флаг.
   */
  hidden?: boolean
}

const pick = (...ids: string[]): Loop[] => ids.map((id) => LOOPS[id])

/**
 * Бесплатный уровень по умолчанию — одна константа на весь фронтенд.
 *
 * Настоящее правило приходит с сервера в bootstrap.free_tier, но плеер
 * стартует, не дожидаясь ответа: если бы до него мы считали, что открыто всё,
 * у человека без доступа на секунду мелькали бы закрытые движения. Страница
 * тарифов bootstrap не запрашивает и считает «+N движений» по этому же числу,
 * а демо отдаёт его как ответ сервера.
 */
export const DEFAULT_FREE_TIER: FreeTier = { stream_code: 'cardio', exercise_limit: 5 }

/**
 * Весь каталог движений в постоянном порядке.
 *
 * Первые пять — намеренно самые разные: из них собирается бесплатный
 * уровень (bootstrap.free_tier.exercise_limit), и человек без доступа
 * должен увидеть не пять почти одинаковых махов руками.
 */
export const ALL_MOVES: Loop[] = pick(
  'run-in-place',
  'high-knees',
  'jumping-jacks',
  'side-steps',
  'dance-steps',
  'jog',
  'run-in-place-2',
  'jumps-arms-up',
  'punches',
  'steps-with-arms',
  'arm-swings',
  'arms-to-sides',
  'arms-up',
  'arms-to-shoulders',
)

/*
 * Временно: пока нет отдельных роликов по потокам, в каждом потоке
 * крутится весь каталог — заказчик просил «догрузить всё, что есть».
 * У «Спины», «Офиса», «Танцев» и «60+» это те же файлы, что у «Кардио»,
 * поэтому с 11.09.2026 они помечены hidden и в интерфейс не попадают.
 * Когда появятся свои ролики, у каждого потока снова будет свой список.
 */
export const STREAMS: Stream[] = [
  {
    id: 'cardio',
    title: 'Кардио',
    subtitle: 'энергия и жиросжигание',
    theme: 'cardio',
    cover: asset('streams/cardio.jpg'),
    loops: ALL_MOVES,
  },
  {
    id: 'back',
    title: 'Спина',
    subtitle: 'здоровая осанка и сильная спина',
    theme: 'back',
    cover: asset('streams/back.jpg'),
    loops: ALL_MOVES,
    hidden: true,
  },
  {
    id: 'office',
    title: 'Офис',
    subtitle: 'разминка для работы',
    theme: 'office',
    cover: asset('streams/office.jpg'),
    loops: ALL_MOVES,
    hidden: true,
  },
  {
    id: 'dance',
    title: 'Танцы',
    subtitle: 'движение в удовольствие',
    theme: 'dance',
    cover: asset('streams/dance.jpg'),
    loops: ALL_MOVES,
    hidden: true,
  },
  {
    id: '60plus',
    title: '60+',
    subtitle: 'мягкие тренировки для здоровья',
    theme: 'senior',
    cover: asset('streams/60plus.jpg'),
    loops: ALL_MOVES,
    hidden: true,
  },
]

/**
 * Потоки, которые видит человек. Сейчас в списке только «Кардио»: под
 * остальные нет своего контента, см. hidden в типе Stream.
 */
export const VISIBLE_STREAMS: Stream[] = STREAMS.filter((s) => !s.hidden)

/**
 * «+9 движений» — сколько движений оплата добавит к бесплатным. Первый пункт
 * того, что входит в подписку, на странице тарифов и в демо-ответе
 * GET /tariffs. Число не пишется руками: появятся новые ролики в каталоге —
 * вырастет само.
 */
export const EXTRA_MOVES_LABEL = `+${plural(
  ALL_MOVES.length - DEFAULT_FREE_TIER.exercise_limit,
  'движение',
  'движения',
  'движений',
)}`

/**
 * Поток по умолчанию. С него начинается тренировка, в него же молча уводят
 * ссылки на скрытые потоки: ломать старые адреса /start/:id и /player/:id
 * не нужно, а показывать по ним нечего.
 */
export const DEFAULT_STREAM: Stream = VISIBLE_STREAMS[0]

/** Поток по идентификатору. Скрытый и незнакомый — это поток по умолчанию. */
export const getStream = (id?: string): Stream =>
  VISIBLE_STREAMS.find((s) => s.id === id) ?? DEFAULT_STREAM

// Мотивационные фразы переехали в src/data/motivation.ts: там они разбиты
// по ярусам времени в движении. Плоский список, который отдаёт бэкенд на
// GET /api/v1/motivation, устарел — фронт его больше не читает.
