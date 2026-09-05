/**
 * Тарифы подписки.
 *
 * Форма записи повторяет ответ бэкенда на GET /api/v1/tariffs, поэтому
 * страницу можно будет переключить на API одной строкой. Пока бэкенда нет,
 * данные статичны и живут здесь.
 *
 * per_month и savings не вбиты руками, а считаются от цены: месяц стоит
 * 590 ₽, значит выгода — это 590 × месяцев минус цена пакета.
 */

export type TariffCode = 'month' | 'quarter' | 'half' | 'year'

export type Tariff = {
  code: TariffCode
  name: string
  duration_days: 30 | 90 | 180 | 365
  price: number
  currency: 'RUB'
  /** Цена месяца внутри пакета, округлённая вверх: 1490 / 3 → 497. */
  per_month: number
  /** Сколько экономит пакет против помесячной оплаты. У месяца выгоды нет. */
  savings?: number
  /** Подпись на бейдже скидки в углу карточки. */
  discount_label?: string
  note: string
  is_recommended: boolean
}

/** Помесячная цена — база, от которой считается выгода пакетов. */
const MONTH_PRICE = 590

/** Месяцев в тарифе: год считаем как 12 месяцев, а не как 365 / 30. */
const monthsOf = (days: number) => Math.round(days / 30.4)

const make = (
  code: TariffCode,
  name: string,
  duration_days: Tariff['duration_days'],
  price: number,
  note: string,
  extra: { discount_label?: string; is_recommended?: boolean } = {},
): Tariff => {
  const months = monthsOf(duration_days)
  const full = MONTH_PRICE * months
  return {
    code,
    name,
    duration_days,
    price,
    currency: 'RUB',
    per_month: Math.round(price / months),
    savings: full > price ? full - price : undefined,
    note,
    is_recommended: false,
    ...extra,
  }
}

export const TARIFFS: Tariff[] = [
  make('month', '1 месяц', 30, 590, 'Попробовать всё'),
  make('quarter', '3 месяца', 90, 1490, 'Комфортный старт', { discount_label: '−15%' }),
  make('half', '6 месяцев', 180, 2490, 'Больше движения. Больше результата.', {
    is_recommended: true,
  }),
  make('year', '12 месяцев', 365, 3990, 'Максимальная выгода и стабильный результат', {
    discount_label: '−30%',
  }),
]

/** Разряды по-русски: 3990 → «3 990 ₽» (пробел неразрывный, чтобы не рвалось). */
export const rub = (value: number) => `${value.toLocaleString('ru-RU')} ₽`
