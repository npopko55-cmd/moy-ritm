/**
 * Потоки тренировок. id совпадают с теми, что создаёт бэкенд в app/seed.py,
 * чтобы экран можно было переключить с локальных данных на API без правок.
 *
 * cover — фотография для карточки в левом сайдбаре: положите файл
 * public/streams/<id>.png (человек, вырезанный по контуру, вертикальный кадр).
 */

import { asset } from '../lib/asset'
import { LOOPS, type Loop } from './loops'

export type Stream = {
  id: string
  title: string
  subtitle: string
  theme: 'cardio' | 'back' | 'office' | 'dance' | 'senior'
  cover: string
  loops: Loop[]
}

const pick = (...ids: string[]): Loop[] => ids.map((id) => LOOPS[id])

export const STREAMS: Stream[] = [
  {
    id: 'cardio',
    title: 'Кардио',
    subtitle: 'энергия и жиросжигание',
    theme: 'cardio',
    cover: asset('streams/cardio.png'),
    loops: pick('high-knees', 'jumping-jacks', 'punches', 'run-in-place', 'jumps-arms-up', 'jog'),
  },
  {
    id: 'back',
    title: 'Спина',
    subtitle: 'здоровая осанка и сильная спина',
    theme: 'back',
    cover: asset('streams/back.png'),
    loops: pick('arms-to-sides', 'arms-up', 'arm-swings', 'arms-to-shoulders'),
  },
  {
    id: 'office',
    title: 'Офис',
    subtitle: 'разминка для работы',
    theme: 'office',
    cover: asset('streams/office.png'),
    loops: pick('arms-to-shoulders', 'arms-to-sides', 'arm-swings', 'steps-with-arms'),
  },
  {
    id: 'dance',
    title: 'Танцы',
    subtitle: 'движение в удовольствие',
    theme: 'dance',
    cover: asset('streams/dance.png'),
    loops: pick('dance-steps', 'side-steps', 'steps-with-arms', 'arms-up'),
  },
  {
    id: '60plus',
    title: '60+',
    subtitle: 'мягкие тренировки для здоровья',
    theme: 'senior',
    cover: asset('streams/60plus.png'),
    loops: pick('steps-with-arms', 'arms-to-shoulders', 'arm-swings', 'side-steps'),
  },
]

export const getStream = (id?: string): Stream =>
  STREAMS.find((s) => s.id === id) ?? STREAMS[0]

/** Те же фразы, что отдаёт бэкенд на GET /api/v1/motivation. */
export const MOTIVATION = [
  'Вот это ты разошелся! 🔥',
  'Отличный темп!',
  'Так держать!',
  'Еще немного — и готово!',
  'Каждый шаг приближает тебя к цели! 🏃',
  'Ритм твоей жизни — в твоих руках!',
  'Прекрасная тренировка! 💪',
]

/** Трек, который показывается в шапке плеера. */
export const CURRENT_TRACK = { title: 'Good Vibes', artist: 'The Motion' }
