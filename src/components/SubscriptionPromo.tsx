/**
 * Подписка через Продамус на чужих экранах: плашка над тарифами и строки в
 * профиле («Доступ»). Сам экран подписки — src/screens/Subscription.tsx.
 *
 * Пока подписка на сервере выключена, GET /subscription отдаёт пустое
 * состояние — ни плашки, ни строк нет, экраны выглядят как раньше. Ошибка
 * запроса тоже прячет блок: подписка — дополнение, ломать из-за неё тарифы
 * и профиль нельзя.
 *
 * ТЕКСТ: на вычитку — все тексты ниже черновые.
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { SubscriptionState } from '../api/types'
import { useSession } from '../auth/SessionProvider'
import { rub } from '../data/tariffs'
import { formatDate, plural } from '../lib/date'
import { Row } from '../screens/Page'
import './SubscriptionPromo.css'

/** Состояние подписки вошедшего; гостю и при ошибке — null. */
export function useSubscriptionState(): SubscriptionState | null {
  const { me } = useSession()
  const userId = me?.user.id
  const [state, setState] = useState<SubscriptionState | null>(null)
  useEffect(() => {
    if (!userId) {
      setState(null)
      return
    }
    let alive = true
    api.subscriptionState().then(
      (s) => {
        if (alive) setState(s)
      },
      () => {
        if (alive) setState(null)
      },
    )
    return () => {
      alive = false
    }
  }, [userId])
  return state
}

/** Подписка продлится сама — «Продлить» разовым тарифом таким не нужно. */
export const renewsItself = (state: SubscriptionState | null): boolean =>
  state?.subscription?.status === 'trial' || state?.subscription?.status === 'active'

/** Плашка над карточками тарифов: пробный за 1 ₽, подписка или «год». */
export function SubscriptionPromo() {
  const state = useSubscriptionState()
  if (!state) return null

  if (state.upsell) {
    const u = state.upsell
    return (
      <Link className="subpromo subpromo--year" to="/subscription">
        <b>Год за {rub(u.price)} вместо {rub(u.monthly_total)}</b>
        <span>Экономия {u.saving_percent}% — оплаченный месяц сохранится</span>
      </Link>
    )
  }
  if (renewsItself(state)) {
    return (
      <Link className="subpromo subpromo--quiet" to="/subscription">
        <b>У вас подписка — доступ продлится сам</b>
        <span>Управлять подпиской</span>
      </Link>
    )
  }
  const offer = state.offer
  if (!offer) return null
  const price = rub(offer.tariff.price)
  if (offer.trial) {
    return (
      <Link className="subpromo" to="/subscription">
        <b>
          {plural(offer.trial.days, 'день', 'дня', 'дней')} за {rub(offer.trial.price)}
        </b>
        <span>Потом {price} в месяц, отменить — в один клик</span>
      </Link>
    )
  }
  return (
    <Link className="subpromo" to="/subscription">
      <b>Подписка {price} в месяц</b>
      <span>Продлевается сама, отменить — в один клик</span>
    </Link>
  )
}

/** Строки подписки в карточке «Доступ» профиля. */
export function SubscriptionRows({ state }: { state: SubscriptionState | null }) {
  if (!state) return null
  const sub = state.subscription
  const rows = []

  if (sub) {
    let hint: string
    switch (sub.status) {
      case 'trial':
        hint = sub.next_payment_at
          ? `Пробные дни. ${formatDate(sub.next_payment_at)} — списание ${rub(sub.price)}`
          : 'Идут пробные дни'
        break
      case 'active':
        hint = sub.next_payment_at
          ? `${rub(sub.price)} в месяц, следующее списание ${formatDate(sub.next_payment_at)}`
          : `${rub(sub.price)} в месяц`
        break
      case 'past_due':
        hint = 'Не получилось списать оплату — попробуем ещё раз'
        break
      case 'canceled':
        hint = 'Отменена, списаний больше не будет'
        break
      default:
        hint = 'Закончилась'
    }
    rows.push(
      <Row key="sub" label="Подписка" hint={hint}>
        <Link className="page__btn" to="/subscription">
          {sub.can_cancel ? 'Управлять' : 'Подробнее'}
        </Link>
      </Row>,
    )
  }
  if (state.upsell) {
    rows.push(
      <Row
        key="year"
        label={`Год за ${rub(state.upsell.price)}`}
        hint={`Экономия ${state.upsell.saving_percent}% против помесячной оплаты`}
      >
        <Link className="page__btn page__btn--pink" to="/subscription">
          Перейти
        </Link>
      </Row>,
    )
  } else if (state.offer && !sub?.can_cancel) {
    const trial = state.offer.trial
    rows.push(
      <Row
        key="offer"
        label={
          trial
            ? `${plural(trial.days, 'день', 'дня', 'дней')} за ${rub(trial.price)}`
            : `Подписка ${rub(state.offer.tariff.price)} в месяц`
        }
        hint={
          trial
            ? `Потом ${rub(state.offer.tariff.price)} в месяц, отменить — в один клик`
            : 'Продлевается сама, отменить — в один клик'
        }
      >
        <Link className="page__btn page__btn--pink" to="/subscription">
          {trial ? 'Попробовать' : 'Оформить'}
        </Link>
      </Row>,
    )
  }
  return <>{rows}</>
}
