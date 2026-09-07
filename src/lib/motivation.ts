/**
 * Выбор мотивационной фразы по времени в движении.
 * У каждого яруса своя «колода»: фразы тасуются и выдаются по одной,
 * так что все они успевают показаться до первого повтора.
 *
 * Сама колода живёт в src/lib/deck.ts — той же механикой плеер выдаёт
 * движения. Здесь остаётся только выбор яруса.
 *
 * random вынесен в параметр, чтобы поведение можно было проверить детерминированно.
 */

import { MOTIVATION_TIERS } from '../data/motivation'
import { createDeck } from './deck'

export type MotivationPicker = {
  /** Следующая фраза для текущего времени в движении, секунды. */
  next(seconds: number): string
  /** Индекс яруса, из которого была выдана последняя фраза. */
  tier(): number
}

/** Индекс яруса по секундам в движении. Отрицательные и NaN считаем за начало. */
export function tierIndex(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0
  let index = 0
  for (let i = 1; i < MOTIVATION_TIERS.length; i++) {
    if (seconds >= MOTIVATION_TIERS[i].from) index = i
  }
  return index
}

export function createMotivationPicker(random: () => number = Math.random): MotivationPicker {
  let current = 0
  let last: string | undefined

  // Колода на ярус. «Последняя показанная» — общая: при переходе между
  // ярусами повтор на стыке заметен так же, как внутри одного яруса.
  const decks = MOTIVATION_TIERS.map((tier) =>
    createDeck(tier.phrases, { random, lastShown: () => last }),
  )

  return {
    next(seconds: number): string {
      current = tierIndex(seconds)
      last = decks[current].next() ?? last
      return last ?? ''
    },
    tier(): number {
      return current
    },
  }
}
