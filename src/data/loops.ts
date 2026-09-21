/**
 * Каталог зацикленных роликов с движениями.
 *
 * Файлы лежат в public/loops/ как <id>.mp4 (H.264, 640×640, без звука)
 * и <id>.webp — постер первого кадра на время загрузки ролика.
 * Фон у роликов не вырезается: на светлом фоне сайта было видно обводку
 * по контуру, поэтому ролик целиком показывается в круглой рамке.
 *
 * С 21.09.2026 ролики — 3D-маскот из Higgsfield. Вертикальная генерация
 * лежит на студийном фоне с растворёнными краями, а из неё вырезан отрезок,
 * который повторяется без рывка. Пересборка: scripts/build-loops-v2.py,
 * найденные петли — scripts/loops-v2-manifest.json.
 * duration — длительность одного цикла в секундах.
 */

import { asset } from '../lib/asset'

export type Loop = {
  id: string
  title: string
  duration: number
  /**
   * Шагов в минуту — примерная оценка для счётчика шагов.
   *
   * Считать шаги нам нечем: акселерометра у сайта нет. Поэтому число
   * прикинуто по темпу самого ролика — бег чаще, махи руками почти не
   * «шагают». Отсюда «~» рядом с шагами везде в интерфейсе.
   */
  stepsPerMinute: number
}

export const LOOPS: Record<string, Loop> = {
  'walk-in-place': { id: 'walk-in-place', title: 'Ходьба на месте', duration: 1.875, stepsPerMinute: 110 },
  'arms-up': { id: 'arms-up', title: 'Руки вверх', duration: 1.917, stepsPerMinute: 60 },
  'knee-lifts': { id: 'knee-lifts', title: 'Подъёмы колен', duration: 3.333, stepsPerMinute: 120 },
  punches: { id: 'punches', title: 'Удары руками', duration: 1.917, stepsPerMinute: 60 },
  'side-steps': { id: 'side-steps', title: 'Приставные шаги', duration: 3.125, stepsPerMinute: 110 },
  'diagonal-swings': { id: 'diagonal-swings', title: 'Махи по диагонали', duration: 1.833, stepsPerMinute: 40 },
  'step-out-arms': { id: 'step-out-arms', title: 'Шаг в сторону, руки врозь', duration: 1.833, stepsPerMinute: 100 },
  'run-in-place': { id: 'run-in-place', title: 'Бег на месте', duration: 3.75, stepsPerMinute: 150 },
  'punches-up': { id: 'punches-up', title: 'Удары вверх', duration: 1.958, stepsPerMinute: 60 },
  'side-step-reach': { id: 'side-step-reach', title: 'Шаг в сторону, рука вверх', duration: 3.5, stepsPerMinute: 100 },
  'knee-to-elbow': { id: 'knee-to-elbow', title: 'Колено к локтю', duration: 1.833, stepsPerMinute: 110 },
  'arm-crosses': { id: 'arm-crosses', title: 'Скрещивания рук', duration: 1.917, stepsPerMinute: 40 },
  'step-arm-swing': { id: 'step-arm-swing', title: 'Шаг с махом руки', duration: 1.875, stepsPerMinute: 100 },
  'dance-steps': { id: 'dance-steps', title: 'Танцевальные шаги', duration: 1.958, stepsPerMinute: 110 },
  'overhead-press': { id: 'overhead-press', title: 'Жим руками вверх', duration: 1.792, stepsPerMinute: 60 },
  'boxer-steps': { id: 'boxer-steps', title: 'Шаги в стойке боксёра', duration: 1.875, stepsPerMinute: 100 },
  jog: { id: 'jog', title: 'Бег трусцой', duration: 1.792, stepsPerMinute: 140 },
  'elbow-raises': { id: 'elbow-raises', title: 'Локти вверх по очереди', duration: 1.75, stepsPerMinute: 60 },
  'arm-scissors': { id: 'arm-scissors', title: 'Ножницы руками', duration: 1.917, stepsPerMinute: 100 },
  twist: { id: 'twist', title: 'Твист', duration: 1.958, stepsPerMinute: 100 },
  'chest-crosses': { id: 'chest-crosses', title: 'Руки крест-накрест', duration: 3.542, stepsPerMinute: 40 },
  'step-clap': { id: 'step-clap', title: 'Шаг в сторону с хлопком', duration: 3.75, stepsPerMinute: 100 },
  'jumping-jacks': { id: 'jumping-jacks', title: 'Прыжки, руки вверх', duration: 3.708, stepsPerMinute: 120 },
  'boxer-bounce': { id: 'boxer-bounce', title: 'Стойка боксёра', duration: 1.75, stepsPerMinute: 80 },
  'chest-crosses-steps': { id: 'chest-crosses-steps', title: 'Крест-накрест с шагом', duration: 1.75, stepsPerMinute: 100 },
  'squat-steps': { id: 'squat-steps', title: 'Шаги в полуприседе', duration: 1.792, stepsPerMinute: 100 },
  'jazz-hands': { id: 'jazz-hands', title: 'Джазовые руки', duration: 1.75, stepsPerMinute: 40 },
  'steps-reach-up': { id: 'steps-reach-up', title: 'Шаги с рукой вверх', duration: 1.792, stepsPerMinute: 100 },
  'side-knee-crunch': { id: 'side-knee-crunch', title: 'Колено к локтю сбоку', duration: 1.833, stepsPerMinute: 110 },
  'side-pushes': { id: 'side-pushes', title: 'Толчки в стороны', duration: 1.917, stepsPerMinute: 80 },
  'step-arm-out': { id: 'step-arm-out', title: 'Шаг, рука в сторону', duration: 2, stepsPerMinute: 100 },
  march: { id: 'march', title: 'Шаг на месте', duration: 1.917, stepsPerMinute: 110 },
  'alternate-reach': { id: 'alternate-reach', title: 'Руки вверх по очереди', duration: 3.5, stepsPerMinute: 60 },
  'arm-crosses-steps': { id: 'arm-crosses-steps', title: 'Скрещивания рук с шагом', duration: 1.75, stepsPerMinute: 100 },
  'twist-knee': { id: 'twist-knee', title: 'Скручивания с коленом', duration: 1.75, stepsPerMinute: 110 },
  'arms-to-shoulders': { id: 'arms-to-shoulders', title: 'Руки к плечам', duration: 1.875, stepsPerMinute: 60 },
  'step-out-bent-arms': { id: 'step-out-bent-arms', title: 'Шаги врозь, руки согнуты', duration: 1.875, stepsPerMinute: 100 },
  'light-jog': { id: 'light-jog', title: 'Лёгкий бег', duration: 3.833, stepsPerMinute: 140 },
  'arm-swings-clap': { id: 'arm-swings-clap', title: 'Махи руками с хлопком', duration: 1.375, stepsPerMinute: 40 },
  'side-lunges': { id: 'side-lunges', title: 'Выпады в стороны', duration: 1.75, stepsPerMinute: 80 },
  'low-crosses': { id: 'low-crosses', title: 'Скрещивания рук внизу', duration: 1.875, stepsPerMinute: 40 },
  'steps-arm-swings': { id: 'steps-arm-swings', title: 'Шаги с махами рук', duration: 1.792, stepsPerMinute: 110 },
  'diagonal-punches': { id: 'diagonal-punches', title: 'Удары по диагонали', duration: 1.75, stepsPerMinute: 60 },
  'twist-steps': { id: 'twist-steps', title: 'Скручивания с шагом', duration: 2, stepsPerMinute: 100 },
  'arms-up-steps': { id: 'arms-up-steps', title: 'Руки вверх с шагом', duration: 3.75, stepsPerMinute: 80 },
}

/**
 * Оценка шагов за столько-то секунд этого движения.
 *
 * Живёт рядом с каталогом, а не в chunks.ts: и очередь кусков, и плеер, и
 * заполнение демо-истории считают шаги одинаково, а импорт chunks.ts тянет
 * за собой весь клиент API.
 */
export function stepsFor(moveId: string, seconds: number): number {
  const perMinute = LOOPS[moveId]?.stepsPerMinute ?? 0
  return Math.round((Math.max(0, seconds) * perMinute) / 60)
}

/**
 * Шагов в секунду этого движения — для счётчиков, которые тикают ежесекундно.
 *
 * Округлять каждую секунду нельзя: у танцевальных шагов это 110/60 ≈ 1.83, и
 * восемь округлённых секунд дали бы 16 шагов вместо 15. Поэтому копится
 * дробное число, а округление остаётся на показ.
 */
export function stepRate(moveId: string): number {
  return (LOOPS[moveId]?.stepsPerMinute ?? 0) / 60
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
