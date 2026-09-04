/**
 * Каталог зацикленных роликов с движениями.
 *
 * Файлы лежат в public/loops/ в двух форматах с прозрачным фоном:
 *   <id>.webm — VP9 + альфа (Chrome, Firefox, Edge)
 *   <id>.mp4  — HEVC + альфа (Safari)
 * Оба собираются скриптом scripts/build-loops.sh из исходников в
 * «ЛУПЫ ГОТОВЫЕ/Один цикл». duration — длительность одного цикла в секундах,
 * взята из ffprobe исходника.
 */

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

/** Safari не умеет альфу в WebM, поэтому ему отдаём HEVC в mp4. */
const isSafari =
  typeof navigator !== 'undefined' &&
  /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent)

export function loopSrc(id: string): string {
  return isSafari ? `/loops/${id}.mp4` : `/loops/${id}.webm`
}
