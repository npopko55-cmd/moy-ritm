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

/**
 * Цена самого короткого тарифа: `month`, а если кода такого нет — тариф с
 * наименьшим duration_days. Пустой список — null.
 */
function shortestPrice(list: Tariff[] | null): number | null {
  if (!list?.length) return null
  const shortest =
    list.find((t) => t.code === 'month') ??
    list.reduce((a, b) => (b.duration_days < a.duration_days ? b : a))
  return shortest.price > 0 ? shortest.price : null
}

/**
 * «От … в месяц» — цена самого короткого тарифа с сервера. Пока ответа нет
 * (или он не пришёл) — запасное значение из локальных данных.
 */
export function useFromPrice(fallback: number): number {
  const [price, setPrice] = useState(() => shortestPrice(cached) ?? fallback)
  useEffect(() => {
    if (cached) return
    const job = pending ?? (tried ? null : loadTariffs())
    if (!job) return
    let alive = true
    job.then(
      (list) => {
        const shortest = shortestPrice(list)
        if (alive && shortest) setPrice(shortest)
      },
      () => undefined,
    )
    return () => {
      alive = false
    }
  }, [])
  return price
}
