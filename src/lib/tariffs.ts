/**
 * Тарифы с сервера — один запрос на открытую страницу.
 *
 * Их берут страница тарифов и оплата. Плашка разблокировки в плеере и на
 * паузе грузит их заранее: «Открыть» ведёт на тарифы, и страница открывается
 * уже с ними. Плашка показывается на каждом экране паузы, поэтому ответ
 * кэшируется: лишних запросов на каждый показ быть не должно.
 */

import { api } from '../api/client'
import type { Tariff } from '../api/types'

let cached: Tariff[] | null = null
let pending: Promise<Tariff[]> | null = null

export function loadTariffs(): Promise<Tariff[]> {
  if (cached) return Promise.resolve(cached)
  pending ??= api
    .getTariffs()
    .then((list) => {
      cached = list
      return list
    })
    .finally(() => {
      pending = null
    })
  return pending
}

export const cachedTariffs = (): Tariff[] | null => cached

/**
 * Заголовок продления — дословно правка тестировщицы (04.11.2026). Им
 * встречают на тарифах того, у кого доступ есть, кончается или в grace, и
 * он же — заголовок плашки «Продлить» в плеере (RenewUnlock в
 * src/components/Unlock.tsx). Кто ещё не покупал, видит прежний заголовок.
 * На тарифах он в две строки, вторая — акцентом, как «движений!» у прежнего:
 * отсюда две части.
 */
export const RENEW_TITLE_LEAD = 'Продли доступ'
export const RENEW_TITLE_ACCENT = 'к ритму'
export const RENEW_TITLE = `${RENEW_TITLE_LEAD} ${RENEW_TITLE_ACCENT}`
