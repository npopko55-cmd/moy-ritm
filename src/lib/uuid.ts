/**
 * Случайный UUID версии 4.
 *
 * Сервер принимает идентификатор куска движения только настоящим UUID
 * (uuid.UUID в stats_service.py): всё остальное уходит в rejected, и минуты
 * пропадают молча. crypto.randomUUID есть не везде — его нет в Safari до
 * iOS 15.4, в старых Android-вьюхах и на страницах без https. Раньше запасной
 * путь собирал строку «время-случайное», сервер её браковал, и у таких
 * телефонов не засчитывалось ни минуты, а trial20 не кончался никогда.
 *
 * Запасной путь — те же 16 случайных байт из crypto.getRandomValues (он
 * есть даже там, где нет randomUUID) с битами версии и варианта по RFC 4122.
 * Совсем без crypto — Math.random: для идентификатора куска этого хватает.
 */

export function uuid(): string {
  const c: Crypto | undefined = typeof crypto !== 'undefined' ? crypto : undefined
  if (typeof c?.randomUUID === 'function') return c.randomUUID()

  const bytes = new Uint8Array(16)
  if (typeof c?.getRandomValues === 'function') c.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256)

  bytes[6] = (bytes[6] & 0x0f) | 0x40 // версия 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // вариант RFC 4122

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
