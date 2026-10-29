/**
 * Движения за сегодня — для карточки «Мой ритм сегодня» в плеере.
 *
 * Сервер движений не считает: в сводке дня есть секунды, шаги и тренировки,
 * а куски движения режутся и по минутам, и по паузе, поэтому по ним число
 * движений не восстановить. Считаем здесь, в браузере, тем же правилом, что
 * и «Движений сделано» захода: движение засчитано, когда кольцо замкнулось и
 * плеер сам сменил его на следующее (nextMove в Player.tsx).
 *
 * Счёт — этого устройства и этого человека (вошедший — по id, гость — один
 * на браузер). День — тот же, что у минут: дата в часовом поясе профиля.
 * Наступил новый день — счёт с нуля.
 */

const KEY = 'moy-ritm.dayMoves'

type Saved = { owner: string; day: string; moves: number }

function read(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as Partial<Saved>
    return typeof saved.owner === 'string' && typeof saved.day === 'string' && typeof saved.moves === 'number'
      ? (saved as Saved)
      : null
  } catch {
    return null
  }
}

/** Сколько движений этот человек сделал за день `day` («2026-10-29»). */
export function loadDayMoves(owner: string, day: string): number {
  const saved = read()
  return saved && saved.owner === owner && saved.day === day ? saved.moves : 0
}

/**
 * Засчитать ещё одно движение. Возвращает новый счёт за день.
 *
 * known — счёт, который плеер уже показывает за этот же день: без хранилища
 * (приватный режим) из него и считаем, иначе счёт стоял бы на единице. Из
 * двух берём больший — другая вкладка могла досчитать своё.
 */
export function addDayMove(owner: string, day: string, known = 0): number {
  const moves = Math.max(loadDayMoves(owner, day), known) + 1
  try {
    localStorage.setItem(KEY, JSON.stringify({ owner, day, moves } satisfies Saved))
  } catch {
    /* приватный режим или запрет хранилища — счёт живёт до перезагрузки */
  }
  return moves
}
