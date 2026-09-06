/**
 * Правдоподобная история за 30 дней для демо-сайта.
 *
 * Нужна ровно для одного: показать «Мой прогресс» во всей красе там, где
 * бэкенда нет и цифры взять неоткуда. Открывается скрытой командой
 * `/progress?demo=fill` — экран отправляет эти куски обычным `sendChunks`,
 * и дальше всё считается тем же кодом, что и настоящая тренировка.
 *
 * Куски детерминированные: и набор дней, и `client_chunk_id` зависят только
 * от календарной даты. Поэтому повторный вызов ничего не удваивает — демо
 * отбрасывает знакомые идентификаторы, как повтор после обрыва сети.
 */

import type { Chunk } from '../api/types'
import { stepsFor } from '../data/loops'
import { getStream } from '../data/streams'

/** Сколько дней истории строим, считая сегодняшний. */
const DAYS = 30

/**
 * Дни без движения — отступы от сегодня.
 *
 * Расставлены так, чтобы самая длинная серия вышла шестидневной: тогда пять
 * наград получены, а «Неделя в ритме» стоит на 6/7 — и на странице видно оба
 * вида карточки, с датой и с полоской прогресса.
 */
const REST_DAYS = new Set([27, 26, 20, 19, 13, 12, 6])

/** Из каких потоков состоит история. Кардио и танцы — чаще остальных. */
const FLOWS = ['cardio', 'cardio', 'dance', 'office', 'cardio', 'back', 'dance', '60plus']

/** Во сколько начинаются заходы: утро, день, вечер. */
const HOURS = [8, 13, 20]

/** Линейный конгруэнтный генератор: одно зерно — одна и та же история. */
function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

/** «2026-09-06» по локальному времени браузера. */
function localDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * Куски за последние тридцать дней.
 *
 * Один заход — это несколько кусков подряд по 30–60 секунд, как их закрывает
 * настоящий плеер. Поэтому из них честно складываются и тренировки, и серии,
 * и рекорд самой длинной тренировки, и награды.
 */
export function demoHistoryChunks(): Chunk[] {
  const rnd = random(20260906)
  const chunks: Chunk[] = []

  for (let ago = DAYS - 1; ago >= 0; ago -= 1) {
    if (REST_DAYS.has(ago)) continue

    const day = new Date()
    day.setHours(0, 0, 0, 0)
    day.setDate(day.getDate() - ago)
    const date = localDate(day)

    // Сегодня — один короткий заход: человек только начал, и карточка
    // «Сегодня» на прогрессе выглядит как в начале дня, а не как итог.
    // Раз в неделю — длинный заход: из него берётся рекорд.
    const long = ago % 7 === 3
    const workouts = ago === 0 ? 1 : 1 + (rnd() < (long ? 0.35 : 0.45) ? 1 : 0)

    for (let w = 0; w < workouts; w += 1) {
      const stream = getStream(FLOWS[(ago + w) % FLOWS.length])
      const hour = HOURS[(w + (ago % 2)) % HOURS.length]
      const start = new Date(day)
      start.setHours(hour, Math.floor(rnd() * 40), 0, 0)

      // Длина захода в кусках по 30 секунд: обычный — 3–8 минут,
      // длинный — 11–14, сегодняшний — ровно девять минут.
      const pieces = ago === 0 ? 18 : long && w === 0 ? 22 + Math.floor(rnd() * 7) : 6 + Math.floor(rnd() * 11)

      let at = start.getTime()
      for (let c = 0; c < pieces; c += 1) {
        const move = stream.loops[c % stream.loops.length]
        const seconds = 30
        chunks.push({
          client_chunk_id: `demo-fill-${date}-${w}-${c}`,
          stream_code: stream.id,
          move_id: move.id,
          started_at: new Date(at).toISOString(),
          duration_seconds: seconds,
          steps: stepsFor(move.id, seconds),
        })
        at += seconds * 1000
      }
    }
  }

  return chunks
}
