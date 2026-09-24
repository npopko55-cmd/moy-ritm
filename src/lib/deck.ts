/**
 * Колода: случайная выдача без повторов.
 *
 * Элементы тасуются и выдаются по одному, пока не выйдут все; после этого
 * колода тасуется заново, причём первый элемент новой колоды не повторяет
 * последний показанный — иначе на стыке одно и то же шло бы два раза подряд.
 *
 * Так выдаются мотивационные фразы (src/lib/motivation.ts). Движения в
 * плеере с 24.09.2026 идут по кругу — createRotation ниже: пересдача с
 * новым тасованием возвращала недавнее движение слишком рано.
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

/**
 * Круг: без повторов, пока не выйдут все, а дальше — тем же порядком.
 *
 * Так выдаются движения в плеере. Колода выше на каждом новом круге
 * тасуется заново, и на стыке кругов недавнее движение возвращалось через
 * одно-два: при пяти открытых выходило «3, 1, 3», «4, 0, 4» — человек видел,
 * что крутятся три одних и тех же, а остальные будто пропали (жалоба
 * заказчика 23.09.2026). Здесь следующим всегда идёт то, что показывали
 * дольше всех назад: сначала все ещё не показанные (в случайном порядке),
 * потом — по кругу в том же порядке. Любое движение возвращается только
 * после всех остальных открытых.
 *
 * dealt — уже выданное раньше, по порядку. По нему считается, что и когда
 * показывали, поэтому круг переживает и возвращение в заход, и смену
 * набора: открылось больше движений — сначала пойдут новые, а не повтор
 * первых пяти; стало меньше — круг идёт только по оставшимся.
 */
export function createRotation<T>(
  source: readonly T[],
  options: { random?: () => number; dealt?: readonly T[] } = {},
): Deck<T> {
  const random = options.random ?? Math.random
  // Порядок для ещё не показанных — перемешанный один раз.
  const order = source.slice()
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const tmp = order[i]
    order[i] = order[j]
    order[j] = tmp
  }
  // Когда элемент показывали последний раз: номер выдачи, -1 — ни разу.
  const shownAt = new Map<T, number>()
  let count = 0
  let own: T | undefined
  for (const card of options.dealt ?? []) {
    shownAt.set(card, count++)
    own = card
  }

  return {
    next(): T | undefined {
      let best: T | undefined
      let bestAt = Infinity
      for (const card of order) {
        const at = shownAt.get(card) ?? -1
        if (at < bestAt) {
          best = card
          bestAt = at
        }
      }
      if (best === undefined) return undefined
      shownAt.set(best, count++)
      own = best
      return best
    },
    last: () => own,
  }
}
