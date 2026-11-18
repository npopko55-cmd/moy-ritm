/**
 * Пробный «3 дня за 1 ₽» вместо бесплатных трёх дней (с 18.11.2026).
 *
 * Тексты «за 1 ₽» в окнах гостя, блоке плеера и на тарифах показываются,
 * только когда сервер говорит card_trial_only (CARD_TRIAL_ONLY и пробный с
 * картой включены, GET /funnel/guest-config): тогда регистрация бесплатных
 * дней больше не даёт, и «3 дня бесплатно» было бы неправдой. Пока флаг
 * выключен — всё как раньше, «3 дня бесплатно». Тексты — через na-pero
 * (_meeting-1118/REPORT.md, задача 1).
 */

import { useEffect, useState } from 'react'
import { api } from '../api/client'

let only: Promise<boolean> | null = null

/** Один запрос за жизнь страницы; ошибка или старый сервер — выключено. */
export function cardTrialOnly(): Promise<boolean> {
  only ??= api.guestConfig().then(
    (c) => c.card_trial === true && c.card_trial_only === true,
    () => false,
  )
  return only
}

/** Для экранов: false, пока ответа нет, — показываем прежние тексты. */
export function useCardTrialOnly(): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    let alive = true
    void cardTrialOnly().then((value) => {
      if (alive) setOn(value)
    })
    return () => {
      alive = false
    }
  }, [])
  return on
}

/** Тексты «за 1 ₽» — дословно из подготовленных через na-pero. */
export const CARD_TRIAL_TEXT = {
  nudgeLead: 'Пробные 3 дня за 1 ₽, дальше 490 ₽ в месяц. Отменить подписку можно в профиле в один клик.',
  nudgeCta: 'Попробовать 3 дня за 1 ₽',
  fullLead: 'Привяжите карту и занимайтесь 3 дня за 1 ₽. Дальше 490 ₽ в месяц, отменить подписку можно в профиле в один клик.',
  fullPlate: 'Подписка продлевается автоматически, отмена в профиле',
  fullCta: 'Продолжить за 1 ₽',
  shortPlate: '3 дня за 1 ₽, потом 490 ₽ в месяц',
  shortCta: 'Попробовать за 1 ₽',
  unlockCta: 'Открыть всё на 3 дня за 1 ₽',
  unlockNote: 'Дальше 490 ₽ в месяц, отмена в профиле в один клик',
} as const
