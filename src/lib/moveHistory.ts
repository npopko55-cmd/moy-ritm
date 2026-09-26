/**
 * Недавние движения на этом устройстве — сквозной круг между тренировками.
 *
 * Внутри тренировки движения идут по кругу (createRotation в
 * src/lib/deck.ts): любое возвращается только после всех остальных
 * открытых. Но каждая новая тренировка начинала круг заново, со случайного
 * порядка, и на коротких заходах одни и те же движения шли из тренировки в
 * тренировку, а до других дело не доходило (жалоба тестеров «упражнения
 * часто повторяются», 26.09.2026). Теперь плеер запоминает, какие движения
 * человек делал, и новая тренировка продолжает круг с тех, что давно не
 * показывали.
 *
 * Храним идентификаторы по порядку показа, последние HISTORY_LIMIT: при
 * сорока движениях это три полных круга. Набор открытых движений бывает
 * разный (5 бесплатных, 10 у челленджа, все), поэтому история — по id, а
 * движения не из текущего набора просто пропускаются. Хранилище недоступно
 * (приватный режим, запрет) — круг, как раньше, начинается со случайного
 * порядка.
 */

const KEY = 'moy-ritm.moveHistory'

/** Сколько последних показов помнить. */
export const HISTORY_LIMIT = 120

function load(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    const list: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(list)) return []
    return list.filter((id): id is string => typeof id === 'string').slice(-HISTORY_LIMIT)
  } catch {
    return []
  }
}

/**
 * Недавно показанные движения из этого набора — по порядку показа, от
 * давних к свежим: ровно так их ждёт `dealt` у createRotation. Незнакомые
 * набору id пропускаются.
 */
export function recentMoves<T extends { id: string }>(moves: readonly T[]): T[] {
  const byId = new Map(moves.map((move) => [move.id, move]))
  return load().flatMap((id) => {
    const move = byId.get(id)
    return move ? [move] : []
  })
}

/** Движение показано в тренировке: в конец истории, старое — прочь сверх лимита. */
export function rememberMove(id: string): void {
  try {
    const list = load()
    list.push(id)
    localStorage.setItem(KEY, JSON.stringify(list.slice(-HISTORY_LIMIT)))
  } catch {
    /* приватный режим или полное хранилище — круг просто начнётся заново */
  }
}
