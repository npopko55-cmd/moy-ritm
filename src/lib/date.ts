/**
 * Печать дат и сроков доступа.
 *
 * Бэкенд отдаёт ISO 8601 с явным смещением («2026-10-05T10:00:00+00:00»),
 * а показываем мы в часовом поясе браузера: «до 5 октября» и «до 4 октября»
 * — это одна и та же метка времени для Алматы и Лиссабона.
 */

/**
 * «5 октября 2026». Пустая или битая строка — пустой результат.
 *
 * Хвост « г.» браузер добавляет сам, а у нас после даты обычно стоит точка
 * или запятая — получалось «2026 г..». Убираем.
 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return ''
  return new Date(ms)
    .toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    .replace(/\s*г\.$/, '')
}

/** «день», «дня», «дней» — только слово, без числа. */
export function pluralWord(count: number, one: string, few: string, many: string): string {
  const n = Math.abs(count) % 100
  const tail = n % 10
  if (n > 10 && n < 20) return many
  if (tail > 1 && tail < 5) return few
  if (tail === 1) return one
  return many
}

/** «1 день», «2 дня», «5 дней» — иначе строка читается как машинная. */
export const plural = (count: number, one: string, few: string, many: string): string =>
  `${count} ${pluralWord(count, one, few, many)}`

export const days = (count: number) => plural(count, 'день', 'дня', 'дней')
export const minutes = (count: number) => plural(count, 'минута', 'минуты', 'минут')

/** Секунды → целые минуты. Всё, что меньше минуты, — это ноль минут. */
export const toMinutes = (seconds: number) => Math.floor(Math.max(0, seconds) / 60)

/** «2026-09-05» → Date в часовом поясе браузера, а не в UTC. */
export function parseLocalDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']

/** «пн» по локальной дате вида «2026-09-05». */
export const weekdayShort = (localDate: string) => WEEKDAYS[parseLocalDate(localDate).getDay()]

/** «5 октября» — без года: в календаре и рекордах он только мешает. */
export function formatDay(localDate: string): string {
  return parseLocalDate(localDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

/** «сентябрь 2026» с большой буквы — заголовок календаря. */
export function formatMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const text = new Date(y, (m || 1) - 1, 1).toLocaleDateString('ru-RU', {
    month: 'long',
    year: 'numeric',
  })
  return (text.charAt(0).toUpperCase() + text.slice(1)).replace(/\s*г\.$/, '')
}

/** «5 сентября, 19:40» — когда вошли с устройства. */
export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return ''
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return ''
  return new Date(ms).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}
