/**
 * Каталог зацикленных роликов с движениями.
 *
 * Файлы лежат в public/loops/ как <id>.mp4 (H.264, 640×640, без звука)
 * и <id>.webp — постер первого кадра на время загрузки ролика.
 * Фон у роликов не вырезается: на светлом фоне сайта было видно обводку
 * по контуру, поэтому ролик целиком показывается в круглой рамке.
 * Пересборка: scripts/build-loops.sh
 * duration — длительность одного цикла в секундах.
 */

import { asset } from '../lib/asset'

export type Loop = {
  id: string
  title: string
  duration: number
}

export const LOOPS: Record<string, Loop> = {
  'run-in-place': { id: 'run-in-place', title: 'Бег на месте', duration: 1.75 },
  'run-in-place-2': { id: 'run-in-place-2', title: 'Бег на месте', duration: 2.333 },
  jog: { id: 'jog', title: 'Бег трусцой', duration: 1.667 },
  'high-knees': { id: 'high-knees', title: 'Высокие колени', duration: 3.625 },
  'arm-swings': { id: 'arm-swings', title: 'Махи руками', duration: 1.667 },
  'side-steps': { id: 'side-steps', title: 'Приставные шаги', duration: 1.708 },
  'jumps-arms-up': { id: 'jumps-arms-up', title: 'Прыжки, руки вверх', duration: 1.667 },
  'jumping-jacks': { id: 'jumping-jacks', title: 'Прыжки, руки над головой', duration: 1.833 },
  'arms-to-sides': { id: 'arms-to-sides', title: 'Руки в стороны', duration: 1.667 },
  'arms-up': { id: 'arms-up', title: 'Руки вверх', duration: 2.667 },
  'arms-to-shoulders': { id: 'arms-to-shoulders', title: 'Руки к плечам', duration: 1.625 },
  'dance-steps': { id: 'dance-steps', title: 'Танцевальные шаги', duration: 3.292 },
  punches: { id: 'punches', title: 'Удары руками', duration: 1.75 },
  'steps-with-arms': { id: 'steps-with-arms', title: 'Шаги с руками', duration: 1.667 },
}

/** Сколько секунд крутится одно движение, прежде чем сменится следующим. */
export const SECONDS_PER_MOVE = 30

export function loopSrc(id: string): string {
  return asset(`loops/${id}.mp4`)
}

/** Первый кадр ролика: показывается, пока видео ещё не готово играть. */
export function loopPoster(id: string): string {
  return asset(`loops/${id}.webp`)
}
