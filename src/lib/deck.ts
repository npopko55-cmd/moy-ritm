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

/** Фишер–Йейтс на переданном random: новая перемешанная копия. */
function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}

/**
 * Случайный порядок, в котором соседи — разного вида, если так вообще можно
 * разложить. `after` — вид того, что показано прямо перед первым.
 *
 * На каждом шаге берём случайный вид, отличный от предыдущего, с весом по
 * тому, сколько его осталось, — но только если после этого раскладка ещё
 * возможна: вид, которого осталось больше половины, иначе в конце шёл бы
 * подряд. Нельзя иначе — ставим подряд, как есть.
 */
function spreadByKind<T>(
  items: readonly T[],
  kindOf: (item: T) => string,
  random: () => number,
  after?: string,
): T[] {
  const groups = new Map<string, T[]>()
  for (const item of shuffled(items, random)) {
    const kind = kindOf(item)
    const group = groups.get(kind)
    if (group) group.push(item)
    else groups.set(kind, [item])
  }

  /**
   * Можно ли, взяв сейчас элемент вида `taken`, разложить остальные `left`
   * без соседей одного вида. Первым в остатке не может идти `taken`, поэтому
   * его хватит на floor(left / 2) мест, любого другого — на ceil(left / 2).
   */
  const possible = (left: number, taken: string): boolean => {
    for (const [kind, group] of groups) {
      const count = kind === taken ? group.length - 1 : group.length
      const limit = kind === taken ? Math.floor(left / 2) : Math.ceil(left / 2)
      if (count > limit) return false
    }
    return true
  }

  const out: T[] = []
  let prev = after
  while (out.length < items.length) {
    const left = items.length - out.length
    const options: [string, T[]][] = []
    for (const [kind, group] of groups) {
      if (group.length === 0 || kind === prev) continue
      if (possible(left - 1, kind)) options.push([kind, group])
    }
    // Разложить без соседей одного вида уже нельзя — берём самый большой вид.
    const pool = options.length
      ? options
      : [...groups].filter(([, group]) => group.length > 0).sort((a, b) => b[1].length - a[1].length).slice(0, 1)
    const total = pool.reduce((sum, [, group]) => sum + group.length, 0)
    let pick = random() * total
    let chosen = pool[pool.length - 1]
    for (const option of pool) {
      pick -= option[1].length
      if (pick < 0) {
        chosen = option
        break
      }
    }
    out.push(chosen[1].pop() as T)
    prev = chosen[0]
  }
  return out
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
 *
 * kind — вид элемента. С ним ещё не показанные идут так, чтобы соседи были
 * разного вида: у движений это шаги, ноги и руки (src/data/loops.ts). Почти
 * половина каталога — шаги с разными руками, и в чисто случайном порядке
 * они шли по два-три подряд: тестер видел, что «через каждые три упражнения
 * дублируется упражнение шагов вперёд» (27.09.2026). Порядок первого круга
 * повторяется и дальше, поэтому разнесённые виды остаются разнесёнными.
 */
export function createRotation<T>(
  source: readonly T[],
  options: { random?: () => number; dealt?: readonly T[]; kind?: (item: T) => string } = {},
): Deck<T> {
  const random = options.random ?? Math.random
  // Когда элемент показывали последний раз: номер выдачи, -1 — ни разу.
  const shownAt = new Map<T, number>()
  let count = 0
  let own: T | undefined
  for (const card of options.dealt ?? []) {
    shownAt.set(card, count++)
    own = card
  }
  // Порядок для ещё не показанных — перемешанный один раз. Показанные идут
  // по давности, их место в этом списке ничего не решает.
  const unseen = source.filter((card) => !shownAt.has(card))
  const seen = source.filter((card) => shownAt.has(card))
  const kindOf = options.kind
  const order = [
    ...(kindOf
      ? spreadByKind(unseen, kindOf, random, own === undefined ? undefined : kindOf(own))
      : shuffled(unseen, random)),
    ...seen,
  ]

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
