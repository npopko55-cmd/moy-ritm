/**
 * Выбор мотивационной фразы по времени в движении.
 * У каждого яруса своя «колода»: фразы тасуются и выдаются по одной,
 * так что все они успевают показаться до первого повтора.
 *
 * random вынесен в параметр, чтобы поведение можно было проверить детерминированно.
 */

import { MOTIVATION_TIERS } from '../data/motivation'

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
  const decks: string[][] = MOTIVATION_TIERS.map(() => [])
  const cursors: number[] = MOTIVATION_TIERS.map(() => 0)
  let current = 0
  let last: string | null = null

  // Фишер–Йейтс на переданном random.
  const shuffle = (source: readonly string[]): string[] => {
    const deck = source.slice()
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      const tmp = deck[i]
      deck[i] = deck[j]
      deck[j] = tmp
    }
    return deck
  }

  // Новая колода яруса; её первая фраза не должна повторить последнюю показанную.
  const refill = (tier: number): string[] => {
    const deck = shuffle(MOTIVATION_TIERS[tier].phrases)
    if (deck.length > 1 && deck[0] === last) {
      const tmp = deck[0]
      deck[0] = deck[1]
      deck[1] = tmp
    }
    return deck
  }

  return {
    next(seconds: number): string {
      current = tierIndex(seconds)
      if (MOTIVATION_TIERS[current].phrases.length === 0) return last ?? ''
      if (cursors[current] >= decks[current].length) {
        decks[current] = refill(current)
        cursors[current] = 0
      }
      last = decks[current][cursors[current]++]
      return last
    },
    tier(): number {
      return current
    },
  }
}
