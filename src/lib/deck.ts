/**
 * Колода: случайная выдача без повторов.
 *
 * Элементы тасуются и выдаются по одному, пока не выйдут все; после этого
 * колода тасуется заново, причём первый элемент новой колоды не повторяет
 * последний показанный — иначе на стыке одно и то же шло бы два раза подряд.
 *
 * Так выдаются и мотивационные фразы (src/lib/motivation.ts), и движения
 * в плеере: механика одна, поэтому и код один.
 *
 * random вынесен в параметр, чтобы поведение можно было проверить
 * детерминированно.
 */

export type Deck<T> = {
  /** Следующий элемент. Пустой источник — undefined. */
  next(): T | undefined
  /** Последний выданный элемент; undefined, пока ничего не выдавали. */
  last(): T | undefined
}

export type DeckOptions<T> = {
  random?: () => number
  /**
   * Что считать «последним показанным» при пересдаче.
   *
   * По умолчанию — последний элемент этой же колоды. Мотивационным фразам
   * нужно другое: колод там несколько (по одной на ярус времени), а
   * последняя показанная фраза у них общая.
   */
  lastShown?: () => T | undefined
  /**
   * Что уже выдано до этой колоды, по порядку, — продолжение прерванной
   * выдачи. Так плеер возвращается в начатый заход: колода создаётся заново,
   * но круг не начинает с начала.
   *
   * Круги идут подряд по длине источника, поэтому незаконченный круг — это
   * хвост списка после последней полной длины. Первый круг новой колоды
   * довыдаёт то, чего в этом хвосте ещё не было; последним показанным
   * считается последний элемент списка — повтора на стыке не будет.
   */
  dealt?: readonly T[]
}

export function createDeck<T>(source: readonly T[], options: DeckOptions<T> = {}): Deck<T> {
  const random = options.random ?? Math.random
  let cards: T[] = []
  let cursor = 0
  const dealt = options.dealt ?? []
  let own: T | undefined = dealt[dealt.length - 1]

  // Фишер–Йейтс на переданном random.
  const shuffle = (): T[] => {
    const deck = source.slice()
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      const tmp = deck[i]
      deck[i] = deck[j]
      deck[j] = tmp
    }
    return deck
  }

  const refill = (skip?: ReadonlySet<T>): void => {
    cards = skip ? shuffle().filter((card) => !skip.has(card)) : shuffle()
    const previous = options.lastShown ? options.lastShown() : own
    if (cards.length > 1 && cards[0] === previous) {
      const tmp = cards[0]
      cards[0] = cards[1]
      cards[1] = tmp
    }
    cursor = 0
  }

  // Незаконченный круг прерванной выдачи: довыдаём его остаток.
  if (source.length > 0 && dealt.length % source.length > 0) {
    refill(new Set(dealt.slice(dealt.length - (dealt.length % source.length))))
  }

  return {
    next(): T | undefined {
      if (source.length === 0) return undefined
      if (cursor >= cards.length) refill()
      own = cards[cursor++]
      return own
    },
    last: () => own,
  }
}
