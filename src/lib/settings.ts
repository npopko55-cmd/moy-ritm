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

/*
 * 19.11.2026: по умолчанию везде 15 с. В старом ключе moy-ritm.moveInterval у
 * многих осталось 30 — прежнее умолчание, которое человек сам не выбирал, и
 * гость видел подсвеченным «30 сек». Поэтому ключ новый (.v2), а старый при
 * первом чтении удаляется и не читается. В .v2 пишется только выбор человека
 * (клик в плеере или в «Настройках») и значение из профиля вошедшего — в базе
 * у всех, кто не выбирал сам, 15.
 */
const KEY = 'moy-ritm.moveInterval.v2'
const OLD_KEY = 'moy-ritm.moveInterval'

export function loadMoveInterval(): number {
  try {
    localStorage.removeItem(OLD_KEY)
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
 * Номер последней правки настроек в этой вкладке.
 *
 * Правка — действие человека: переключатель в «Настройках» или кнопка звука
 * в плеере, которая включила выключенную «Музыку». Каждая правка берёт новый
 * номер, и ответ сервера на неё ложится в профиль, только если после неё
 * правок не было. Иначе ответ, пришедший позже, откатывал более свежую
 * правку: человек выключал музыку в «Настройках» и сразу шёл в тренировку,
 * кнопка звука включала её, а через пару секунд доходил ответ на то
 * выключение — и музыка замолкала.
 */
let settingsRevision = 0

/** Новая правка настроек: её номер. */
export function bumpSettingsRevision(): number {
  settingsRevision += 1
  return settingsRevision
}

/** Номер последней правки — сравнить со своим, когда пришёл ответ. */
export function currentSettingsRevision(): number {
  return settingsRevision
}
