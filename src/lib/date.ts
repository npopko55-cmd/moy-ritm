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

/** «1 день», «2 дня», «5 дней» — иначе строка читается как машинная. */
export function plural(count: number, one: string, few: string, many: string): string {
  const n = Math.abs(count) % 100
  const tail = n % 10
  if (n > 10 && n < 20) return `${count} ${many}`
  if (tail > 1 && tail < 5) return `${count} ${few}`
  if (tail === 1) return `${count} ${one}`
  return `${count} ${many}`
}

export const days = (count: number) => plural(count, 'день', 'дня', 'дней')
