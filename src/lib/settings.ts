/**
 * Настройки пользователя, которые хранятся в браузере.
 * Пока это только интервал смены упражнения. Источник истины — профиль на
 * сервере (settings.move_interval_seconds), здесь его кэш: плеер стартует
 * сразу и не ждёт профиля.
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

/**
 * Кнопка звука в плеере: человек выключил музыку прямо в тренировке.
 *
 * Хранится только в браузере и только «выключено»: включение по умолчанию.
 * Настройка «Музыка» в профиле (music_enabled) остаётся главной — кнопка
 * лишь глушит музыку поверх неё, а включение кнопкой включает и её.
 */
const SOUND_OFF_KEY = 'moy-ritm.soundOff'

export function loadSoundOff(): boolean {
  try {
    return localStorage.getItem(SOUND_OFF_KEY) === '1'
  } catch {
    return false
  }
}

export function saveSoundOff(off: boolean): void {
  try {
    if (off) localStorage.setItem(SOUND_OFF_KEY, '1')
    else localStorage.removeItem(SOUND_OFF_KEY)
  } catch {
    /* приватный режим или запрет хранилища — просто не запоминаем */
  }
}
