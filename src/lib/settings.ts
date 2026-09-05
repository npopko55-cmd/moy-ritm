/**
 * Настройки пользователя, которые хранятся в браузере.
 * Пока это только интервал смены упражнения; при появлении бэкенда
 * значение переедет в профиль пользователя, а здесь останется кэш.
 */

import { SECONDS_PER_MOVE } from '../data/loops'

export const MOVE_INTERVALS = [
  { seconds: 15, label: '15 сек' },
  { seconds: 30, label: '30 сек' },
  { seconds: 60, label: '1 мин' },
  { seconds: 120, label: '2 мин' },
] as const

const KEY = 'moy-ritm.moveInterval'

export function loadMoveInterval(): number {
  try {
    const v = Number(localStorage.getItem(KEY))
    return MOVE_INTERVALS.some((i) => i.seconds === v) ? v : SECONDS_PER_MOVE
  } catch {
    return SECONDS_PER_MOVE
  }
}

export function saveMoveInterval(seconds: number): void {
  try {
    localStorage.setItem(KEY, String(seconds))
  } catch {
    /* приватный режим или запрет хранилища — просто не запоминаем */
  }
}
