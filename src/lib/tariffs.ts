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
