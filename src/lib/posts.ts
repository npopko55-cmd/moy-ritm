/**
 * Посты в Telegram-каналы: счётчик лимита и время по Москве.
 *
 * Счётчик — подсказка, решает бэкенд: он же отклонит битую разметку. Но
 * считают они одинаково — видимый текст без тегов, с раскрытыми &amp; и
 * прочими, в единицах UTF-16 (длина строки JS), как считает сам Telegram.
 */

/** Теги, которые понимает Telegram HTML, — для подсказки под полем. */
export const POST_TAGS_HINT =
  '<b>жирный</b>, <i>курсив</i>, <u>подчёркнутый</u>, <s>зачёркнутый</s>, <a href="https://…">ссылка</a>, <code>код</code>'

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"' }

/** Видимый текст поста: без тегов, с раскрытыми &lt; &amp; &#…; */
export function visibleText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
      if (name[0] === '#') {
        const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
        return Number.isFinite(code) ? String.fromCodePoint(code) : whole
      }
      return ENTITIES[name.toLowerCase()] ?? whole
    })
}

/** Длина так, как её считает Telegram: эмодзи — за два. */
export const visibleLength = (html: string): number => visibleText(html).length

export const TEXT_LIMIT = 4096
export const CAPTION_LIMIT = 1024

/*
 * Время по Москве. В Москве с 2014 года нет перехода на летнее время, поэтому
 * смещение постоянное: +03:00. Поле формы — «YYYY-MM-DDTHH:mm» без пояса,
 * и понимаем мы его всегда как московское, где бы ни сидел администратор.
 */

const MOSCOW_OFFSET = '+03:00'
const MOSCOW_MS = 3 * 60 * 60 * 1000

/** ISO → значение поля datetime-local по Москве. */
export function toMoscowInput(iso: string | null): string {
  if (!iso) return ''
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return ''
  // Сдвигаем на три часа и читаем как UTC — получаем московские цифры.
  return new Date(ms + MOSCOW_MS).toISOString().slice(0, 16)
}

/** Значение поля (московское) → ISO со смещением для бэкенда. Пусто — null. */
export function fromMoscowInput(value: string): string | null {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00${MOSCOW_OFFSET}` : null
}

/** «23.09.2026, 10:00 МСК». */
export function formatMoscow(iso: string | null): string {
  const value = toMoscowInput(iso)
  if (!value) return ''
  const [date, time] = value.split('T')
  const [y, m, d] = date.split('-')
  return `${d}.${m}.${y}, ${time} МСК`
}
