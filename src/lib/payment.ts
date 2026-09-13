/**
 * Каким был доступ до ухода на оплату.
 *
 * При продлении доступ уже есть, и «Проверяем оплату» не может судить по
 * одному hasAccess: экран сразу писал «Оплата прошла, доступ до …» со старой
 * датой и уводил в поток, хотя GetCourse ещё ничего не прислал. Поэтому
 * перед уходом на оплату запоминаем paid_until, а оплату считаем пришедшей,
 * только когда дата выросла или доступ появился впервые.
 *
 * Хранилище — sessionStorage: GetCourse возвращает человека в ту же вкладку.
 * Вернулся в другую — записи нет, и экран судит по-старому.
 */

import { hasAccess, type Access } from '../api/types'

const KEY = 'moy-ritm.payment.before'

/** Запись старше суток — уже не про эту оплату. */
const MAX_AGE_MS = 24 * 60 * 60_000

export type AccessBefore = { paidUntil: string | null; had: boolean; at: number }

export function rememberAccessBefore(access: Access | null): void {
  try {
    const before: AccessBefore = {
      paidUntil: access?.paid_until ?? null,
      had: hasAccess(access),
      at: Date.now(),
    }
    sessionStorage.setItem(KEY, JSON.stringify(before))
  } catch {
    /* приватный режим — экран оплаты судит по-старому */
  }
}

export function readAccessBefore(): AccessBefore | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    const before = raw ? (JSON.parse(raw) as AccessBefore) : null
    if (!before || typeof before.at !== 'number' || Date.now() - before.at > MAX_AGE_MS) return null
    return before
  } catch {
    return null
  }
}

export function forgetAccessBefore(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* нечего забывать */
  }
}

/** Пришла ли оплата: доступ появился или его срок вырос. */
export function paymentArrived(access: Access | null | undefined, before: AccessBefore | null): boolean {
  if (!hasAccess(access)) return false
  // Что было до оплаты, не знаем или доступа не было — хватает самого доступа.
  if (!before || !before.had || !before.paidUntil) return true
  if (!access?.paid_until) return false
  return Date.parse(access.paid_until) > Date.parse(before.paidUntil)
}
