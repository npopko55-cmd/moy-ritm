/**
 * Колода: случайная выдача без повторов.
 *
 * Элементы тасуются и выдаются по одному, пока не выйдут все; после этого
 * колода тасуется заново, причём первый элемент новой колоды не повторяет
 * последний показанный — иначе на стыке одно и то же шло бы два раза подряд.
 *
 * Раньше так выдавались мотивационные фразы над кругом; 14.10.2026 их
 * заменил ряд потоков, и фраз больше нет. Движения в плеере с 24.09.2026
 * идут по кругу — createRotation ниже: пересдача с новым тасованием
 * возвращала недавнее движение слишком рано. Сама createDeck сейчас нигде
 * не вызывается; оставлена как общий механизм, удалить её можно смело.
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

/** Поменять местами два элемента списка. */
function swapAt<T>(list: T[], a: number, b: number): void {
  const tmp = list[a]
  list[a] = list[b]
  list[b] = tmp
}

/**
 * Разнос семейств (spreadByFamily): сколько обменов пробовать на каждый ещё
 * не показанный элемент в одном заходе поиска. На полном каталоге (39
 * движений) это почти шесть тысяч обменов, около миллисекунды на заход
 * (замер на маке 09.10.2026: 3,5 мс в среднем и 10 мс в худшем случае на
 * всю сборку круга, она бывает раз при открытии плеера). Меньше нельзя: при
 * 60–100 на элемент соседей одного вида выходило больше, чем без семейств.
 */
const SPREAD_STEPS_PER_ITEM = 150

/**
 * Допуски к идеалу семейства (см. spreadByFamily): насколько мест ближе
 * идеала похожие стоят без штрафа неравномерности (SPREAD_SLACK) и с какого
 * отставания это уже теснота (больше SPREAD_SLACK_CROWDED). На полном
 * каталоге без тесноты из семейства в пять движений в любых 10 подряд не
 * больше двух, в любых 20 — не больше трёх: это и есть граница жалобы.
 */
const SPREAD_SLACK = 1
const SPREAD_SLACK_CROWDED = 3

/**
 * «Нагрев» поиска — насколько охотно он берёт обмен, от которого
 * неравномерность выросла (как при отжиге: так поиск выбирается из ямок, где
 * любой одиночный обмен хуже). Тесноту и вид нагрев не трогает. Остывает до
 * нуля к последней пятой части попыток.
 */
const SPREAD_HEAT = 10

/**
 * Сколько раз самое большее начинать поиск заново с другой раскладки по
 * видам (см. конец spreadByFamily).
 */
const SPREAD_ROUNDS = 5

/**
 * Порядок ещё не показанных, в котором члены одного семейства стоят по кругу
 * как можно дальше друг от друга и равномерно, а соседи — по возможности
 * разного вида (09.10.2026).
 *
 * Зачем. Вид разводит только соседей и не знает, что движения похожи: у
 * подписчицы при смене раз в 30 секунд за 10 минут прошёл 21 кусок, все
 * движения разные, но четыре из них — скрещивания рук, «через одно опять»
 * (жалоба 09.10.2026). Семейство — это такие похожие со стороны движения
 * (family в src/data/loops.ts).
 *
 * Как. Круг — это `items` (их порядок мы и выбираем), а за ними `tail` — уже
 * показанные, от давних к свежим: ровно так круг пойдёт дальше и потом
 * повторится тем же порядком. Поэтому расстояние между похожими меряем по
 * кругу, через стык. Идеал для семейства из k членов на круге длины n —
 * между любым членом и j-м следующим за ним не меньше floor(j·n/k) мест:
 * семейство разложено с шагом n/k, и в любых идущих подряд его не больше,
 * чем позволяет его доля в наборе. Недостающие места штрафуются в квадрате
 * (два похожих рядом намного хуже, чем «на одно место ближе»), а сами
 * штрафы идут строго по старшинству — любой старший важнее всех младших:
 *   1) теснота — похожие ближе идеала больше чем на SPREAD_SLACK_CROWDED мест;
 *   2) соседи одного вида (и с тем, что показано прямо перед кругом, `before`);
 *   3) неравномерность — ближе идеала больше чем на SPREAD_SLACK мест.
 * Семейства важнее вида, но вид важнее точной равномерности: требование
 * «ровно через n/k» выше вида ломало его — соседей одного вида выходило
 * в восемь раз больше, чем без семейств (замер 09.10.2026).
 *
 * Начинаем с раскладки по видам (spreadByKind) и улучшаем её обменами: два
 * случайных места среди `items` меняем местами и оставляем обмен, если
 * штраф не вырос (равный тоже — чтобы поиск не застревал на ровном месте);
 * неравномерность в начале поиска иногда разрешаем и ухудшить (SPREAD_HEAT).
 * Стоп — когда штрафа нет совсем или кончились попытки. Если теснота
 * осталась или соседей одного вида стало больше, чем в исходной раскладке,
 * — заново с другой раскладкой по видам, до SPREAD_ROUNDS раз, и берём
 * лучший итог. Всё на переданном random, поэтому порядок по-прежнему
 * воспроизводим.
 *
 * Замер на полном каталоге, 500 разных random (09.10.2026): из одного
 * семейства в любых 10 подряд по кругу — не больше двух, в любых 20 — не
 * больше трёх (у «рук вверх» из шести — четыре: шесть на 39 мест в 20 подряд
 * иначе не уложить). Без семейств было до пяти-шести в 10 подряд. Соседей
 * одного вида — 0,44 пары на круг против 0,47 без семейств.
 */
function spreadByFamily<T>(
  items: readonly T[],
  tail: readonly T[],
  familyOf: (item: T) => string,
  kindOf: ((item: T) => string) | undefined,
  random: () => number,
  before?: T,
): T[] {
  const afterKind = kindOf && before !== undefined ? kindOf(before) : undefined
  const deal = (): T[] => (kindOf ? spreadByKind(items, kindOf, random, afterKind) : shuffled(items, random))
  const free = items.length
  if (free < 2) return deal()

  const n = free + tail.length
  // Семейства и виды — номерами, чтобы в переборе не звать функции.
  const numbered = (of: (item: T) => string): Map<T, number> => {
    const ids = new Map<string, number>()
    const out = new Map<T, number>()
    for (const item of [...items, ...tail]) {
      const name = of(item)
      let id = ids.get(name)
      if (id === undefined) {
        id = ids.size
        ids.set(name, id)
      }
      out.set(item, id)
    }
    return out
  }
  const famOf = numbered(familyOf)
  const kindNo = kindOf ? numbered(kindOf) : new Map<T, number>()
  // Показанное прямо перед кругом обычно — последний в `tail`, и стык с ним
  // и так считается. Нет его в круге (набор сменился) — пара отдельная.
  let beforeKind = -1
  if (kindOf && before !== undefined && !tail.includes(before)) {
    for (const [item, no] of kindNo) if (kindOf(item) === afterKind) beforeKind = no
  }

  /** Один поиск от раскладки `start`: улучшаем обменами, пока есть попытки. */
  const search = (start: readonly T[]) => {
    const cycle = [...start, ...tail]
    const fam = cycle.map((item) => famOf.get(item) as number)
    const kinds = cycle.map((item) => kindNo.get(item) ?? 0)
    // Где стоят члены каждого семейства — по возрастанию.
    const places: number[][] = []
    fam.forEach((f, at) => {
      if (places[f]) places[f].push(at)
      else places[f] = [at]
    })
    /** Место `from` у семейства f сменилось на `to`: заменить, не нарушив порядка. */
    const move = (f: number, from: number, to: number): void => {
      const at = places[f]
      let i = at.indexOf(from)
      at[i] = to
      for (; i > 0 && at[i - 1] > at[i]; i--) swapAt(at, i - 1, i)
      for (; i < at.length - 1 && at[i + 1] < at[i]; i++) swapAt(at, i, i + 1)
    }

    /** Штраф семейства: [теснота, неравномерность]. */
    const familyCost = (f: number): [number, number] => {
      const at = places[f]
      const k = at.length
      let crowded = 0
      let uneven = 0
      for (let i = 0; i < k; i++) {
        for (let j = 1; j < k; j++) {
          const short = Math.floor((j * n) / k) - ((at[(i + j) % k] - at[i] + n) % n)
          if (short > SPREAD_SLACK_CROWDED) crowded += (short - SPREAD_SLACK_CROWDED) ** 2
          if (short > SPREAD_SLACK) uneven += (short - SPREAD_SLACK) ** 2
        }
      }
      return [crowded, uneven]
    }
    const kindCost = (): number => {
      if (!kindOf) return 0
      let cost = kinds[0] === beforeKind ? 1 : 0
      for (let i = 0; i < n; i++) if (kinds[i] === kinds[(i + 1) % n]) cost++
      return cost
    }
    /**
     * Соседи одного вида только в парах вокруг мест a и b — обмен меняет
     * лишь их, и пересчитывать весь круг на каждой попытке незачем.
     */
    const kindAround = (a: number, b: number): number => {
      if (!kindOf) return 0
      const left = [(a + n - 1) % n, a, (b + n - 1) % n, b]
      let cost = (a === 0 || b === 0) && kinds[0] === beforeKind ? 1 : 0
      left.forEach((i, at) => {
        if (left.indexOf(i) === at && kinds[i] === kinds[(i + 1) % n]) cost++
      })
      return cost
    }
    const swap = (a: number, b: number): void => {
      if (fam[a] !== fam[b]) {
        move(fam[a], a, b)
        move(fam[b], b, a)
      }
      swapAt(cycle, a, b)
      swapAt(fam, a, b)
      swapAt(kinds, a, b)
    }

    const costs = places.map((_, f) => familyCost(f))
    let crowd = costs.reduce((sum, [crowded]) => sum + crowded, 0)
    let uneven = costs.reduce((sum, [, cost]) => sum + cost, 0)
    let kind = kindCost()
    const startKind = kind

    /**
     * Обмен a и b: оставляем, если штраф не вырос — сравнение по старшинству:
     * теснота, потом вид, потом неравномерность (её при нагреве `heat` иногда
     * разрешаем и ухудшить). Иначе — назад.
     */
    const attempt = (a: number, b: number, heat: number): void => {
      const fa = fam[a]
      const fb = fam[b]
      // Тот же элемент или ничего не меняющий обмен — мимо.
      if (a === b || (fa === fb && kinds[a] === kinds[b])) return
      const kindBefore = kindAround(a, b)
      swap(a, b)
      const costA = fa === fb ? costs[fa] : familyCost(fa)
      const costB = fa === fb ? costs[fb] : familyCost(fb)
      const crowdDelta = fa === fb ? 0 : costA[0] + costB[0] - costs[fa][0] - costs[fb][0]
      const unevenDelta = fa === fb ? 0 : costA[1] + costB[1] - costs[fa][1] - costs[fb][1]
      const nextKind = kind - kindBefore + kindAround(a, b)
      const keep =
        crowdDelta !== 0
          ? crowdDelta < 0
          : nextKind !== kind
            ? nextKind < kind
            : unevenDelta <= 0 || (heat > 0 && random() < Math.exp(-unevenDelta / heat))
      if (keep) {
        costs[fa] = costA
        costs[fb] = costB
        crowd += crowdDelta
        uneven += unevenDelta
        kind = nextKind
      } else {
        swap(a, b)
      }
    }

    const steps = SPREAD_STEPS_PER_ITEM * free
    const cool = Math.floor(steps * 0.8)
    for (let step = 0; step < steps && crowd + kind + uneven > 0; step++) {
      const heat = step < cool ? SPREAD_HEAT * (1 - step / cool) : 0
      attempt(Math.floor(random() * free), Math.floor(random() * free), heat)
    }
    return { order: cycle.slice(0, free), crowd, kind, uneven, startKind }
  }

  // Рисунок видов, с которого начали, иногда не даёт убрать тесноту, не
  // поставив рядом два одного вида. Тогда пробуем другую раскладку по видам
  // и берём лучший итог по тому же старшинству.
  let best = search(deal())
  for (let round = 1; round < SPREAD_ROUNDS && (best.crowd > 0 || best.kind > best.startKind); round++) {
    const next = search(deal())
    if (
      next.crowd !== best.crowd
        ? next.crowd < best.crowd
        : next.kind !== best.kind
          ? next.kind < best.kind
          : next.uneven < best.uneven
    ) {
      best = next
    }
  }
  return best.order
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
 *
 * family — семейство: элементы, которые со стороны почти одинаковы (у
 * движений — скрещивания рук, удары, руки вверх…, src/data/loops.ts). С ним
 * ещё не показанные раскладываются так, чтобы члены одного семейства стояли
 * по кругу как можно дальше друг от друга и равномерно, считая и стык, и уже
 * показанные, которые пойдут следом (spreadByFamily выше); вид при этом
 * остаётся младшим правилом. Подписчица видела за 10 минут четыре
 * скрещивания рук, хотя все 21 движение были разными (09.10.2026).
 */
export function createRotation<T>(
  source: readonly T[],
  options: {
    random?: () => number
    dealt?: readonly T[]
    kind?: (item: T) => string
    family?: (item: T) => string
  } = {},
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
  const familyOf = options.family
  // Показанные пойдут после новых — от давних к свежим; для разноса семейств
  // это хвост круга.
  const tail = (): T[] => seen.slice().sort((a, b) => (shownAt.get(a) ?? 0) - (shownAt.get(b) ?? 0))
  const order = [
    ...(familyOf
      ? spreadByFamily(unseen, tail(), familyOf, kindOf, random, own)
      : kindOf
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
