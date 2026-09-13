/**
 * Тарифы с сервера — один запрос на открытую страницу.
 *
 * Их берёт страница тарифов и блок разблокировки («от … в месяц»). Блок
 * показывается в плеере и на каждом экране паузы, поэтому ответ кэшируется:
 * лишних запросов на каждый показ быть не должно.
 */

import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Tariff } from '../api/types'

let cached: Tariff[] | null = null
let pending: Promise<Tariff[]> | null = null
/** Блок разблокировки уже пробовал загрузить: после неудачи сам не повторяет. */
let tried = false

export function loadTariffs(): Promise<Tariff[]> {
  tried = true
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

/** Самая низкая цена месяца среди тарифов; пустой список — null. */
function lowestPerMonth(list: Tariff[] | null): number | null {
  const prices = (list ?? []).map((t) => t.per_month).filter((p) => p > 0)
  return prices.length ? Math.min(...prices) : null
}

/**
 * «От … в месяц» по тарифам сервера. Пока ответа нет (или он не пришёл) —
 * запасное значение из локальных данных.
 */
export function useFromPrice(fallback: number): number {
  const [price, setPrice] = useState(() => lowestPerMonth(cached) ?? fallback)
  useEffect(() => {
    if (cached) return
    const job = pending ?? (tried ? null : loadTariffs())
    if (!job) return
    let alive = true
    job.then(
      (list) => {
        const lowest = lowestPerMonth(list)
        if (alive && lowest) setPrice(lowest)
      },
      () => undefined,
    )
    return () => {
      alive = false
    }
  }, [])
  return price
}
