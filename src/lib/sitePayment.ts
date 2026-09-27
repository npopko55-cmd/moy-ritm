/**
 * Мини-ап ждёт оплату с сайта.
 *
 * Платить в мини-апе нельзя: «Оформить на сайте» открывает сайт во внешнем
 * браузере (openOnSite в src/lib/telegram.ts), и человек возвращается в
 * Telegram уже с оплатой. Профиль мини-ап и так перечитывает при возвращении
 * (src/lib/appReturn.ts), но не чаще раза в полминуты и только если
 * Telegram сообщил о возвращении — а вьюха бывает «на виду» всё это время.
 *
 * Поэтому WATCH_MS после ухода на сайт, пока мини-ап на виду и развёрнут,
 * профиль (а с ним и доступ) перечитывается каждые POLL_MS и по первому
 * касанию после возвращения: оплатил — и тренировка тут же открывает все
 * движения, без перезапуска мини-апа. Оплата пришла — ждать перестаём.
 * Вне мини-апа ничего не делает.
 */

import { useEffect, type MutableRefObject } from 'react'
import type { Me } from '../api/types'
import { hasAccess } from '../api/types'
import { paymentArrived, type AccessBefore } from './payment'
import {
  IN_TELEGRAM,
  forgetSitePayment,
  onSitePayment,
  onTelegramEvent,
  sitePaymentAt,
  telegramActive,
} from './telegram'

/** Сколько ждём оплату после ухода на сайт. */
const WATCH_MS = 15 * 60_000

/** Как часто перечитываем профиль, пока ждём. */
const POLL_MS = 20_000

/** Каким был доступ, когда ушли на сайт: продление — это рост срока, а не сам доступ. */
const BEFORE_KEY = 'moy-ritm.tg.site_pay_before'

function saveBefore(me: Me | null): void {
  const before: AccessBefore = {
    paidUntil: me?.access?.paid_until ?? null,
    had: hasAccess(me?.access ?? null),
    at: Date.now(),
  }
  try {
    sessionStorage.setItem(BEFORE_KEY, JSON.stringify(before))
  } catch {
    /* без записи оплатой считается сам доступ */
  }
}

function readBefore(): AccessBefore | null {
  try {
    const raw = sessionStorage.getItem(BEFORE_KEY)
    return raw ? (JSON.parse(raw) as AccessBefore) : null
  } catch {
    return null
  }
}

function waiting(): boolean {
  const at = sitePaymentAt()
  return at !== null && Date.now() - at < WATCH_MS
}

/**
 * Ожидание оплаты — в SessionProvider: `reload` перечитывает профиль,
 * `meRef` — кто сейчас вошёл (гостю перечитывать нечего).
 */
export function useSitePaymentWatch(
  reload: () => Promise<Me | null>,
  meRef: MutableRefObject<Me | null>,
): void {
  useEffect(() => {
    if (!IN_TELEGRAM) return
    /** Первое касание после возвращения — повод проверить сразу. */
    let armed = true
    let busy = false

    const check = () => {
      if (busy || !meRef.current || !waiting()) return
      if (document.visibilityState === 'hidden' || !telegramActive()) return
      busy = true
      void reload().then((me) => {
        busy = false
        if (me && paymentArrived(me.access, readBefore())) forgetSitePayment()
      })
    }

    const onTouch = () => {
      if (!armed || !waiting()) return
      armed = false
      check()
    }

    const rearm = () => {
      if (document.visibilityState !== 'hidden') armed = true
    }

    const timer = window.setInterval(check, POLL_MS)
    // Уход на сайт — в самом касании «Оформить на сайте»: доступ, каким он был.
    const offPay = onSitePayment(() => {
      saveBefore(meRef.current)
      armed = true
    })
    const offActivated = onTelegramEvent('activated', rearm)
    document.addEventListener('visibilitychange', rearm)
    document.addEventListener('pointerdown', onTouch, { capture: true, passive: true })

    return () => {
      window.clearInterval(timer)
      offPay()
      offActivated()
      document.removeEventListener('visibilitychange', rearm)
      document.removeEventListener('pointerdown', onTouch, { capture: true })
    }
  }, [reload, meRef])
}
