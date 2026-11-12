/**
 * Баннер выбора про счётчики (с 12.11.2026): Яндекс Метрика и пиксель VK Ads.
 *
 * Политика сайта (src/data/legal.ts, раздел 7, п. 7.3–7.5) обещает: счётчики
 * не грузятся, пока человек не выбрал сам. Поэтому две равные кнопки
 * («Принять» и «Отклонить» выглядят одинаково), а закрытия без выбора нет:
 * крестик или молчание согласием не считаются. Выбор пишет setAnalyticsConsent
 * (src/lib/analytics.ts), здесь — только показ и версия согласия.
 *
 * Когда не показываем:
 *   • в сборке нет id ни одного счётчика — спрашивать не о чем;
 *   • выбор уже сделан для текущей версии (CONSENT_VERSION: поменяли состав
 *     счётчиков или цели — подняли версию, баннер спросит заново, а до ответа
 *     счётчики выключены);
 *   • админка;
 *   • тренировка (плеер, отсчёт, гостевой плеер): внизу там управление, а
 *     тесного места под карточку нет. Баннер встретит человека на ближайшей
 *     странице без тренировки; пока он не ответил, счётчики молчат.
 *
 * Изменить выбор можно строкой «Настройки cookies» в подвале
 * (src/components/LegalLinks.tsx): она зовёт openCookieSettings().
 */

import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { analyticsConfigured, analyticsConsent, setAnalyticsConsent } from '../lib/analytics'
import './ConsentBanner.css'

/** Версия согласия: поднять, когда меняется состав счётчиков или их цели. */
const CONSENT_VERSION = '1'
const VERSION_KEY = 'moy-ritm.analytics.consent-version'
const REOPEN_EVENT = 'moy-ritm:cookie-settings'

/** Выбор сделан, а записать его некуда (приватный режим): помним до перезагрузки. */
let answeredInMemory = false

function savedVersion(): string | null {
  try {
    return localStorage.getItem(VERSION_KEY)
  } catch {
    return null
  }
}

/** Нужно ли спросить: выбора нет или он сделан для прежней версии. */
function needsChoice(): boolean {
  if (!analyticsConfigured() || answeredInMemory) return false
  return analyticsConsent() === null || savedVersion() !== CONSENT_VERSION
}

/** Строка подвала «Настройки cookies»: снова показать баннер. */
export function openCookieSettings(): void {
  window.dispatchEvent(new Event(REOPEN_EVENT))
}

/** Страницы, где баннера нет: админка и тренировка. */
function hiddenOn(pathname: string): boolean {
  return (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/player/') ||
    pathname.startsWith('/start/') ||
    /^\/play\/[^/]+\/(start|live)$/.test(pathname)
  )
}

export default function ConsentBanner() {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(needsChoice)

  // Выбор прежней версии больше не действует: до ответа счётчики выключены.
  useEffect(() => {
    if (analyticsConsent() !== null && savedVersion() !== CONSENT_VERSION) setAnalyticsConsent(false)
  }, [])

  useEffect(() => {
    const reopen = () => setOpen(true)
    window.addEventListener(REOPEN_EVENT, reopen)
    return () => window.removeEventListener(REOPEN_EVENT, reopen)
  }, [])

  if (!open || !analyticsConfigured() || hiddenOn(pathname)) return null

  const choose = (granted: boolean) => {
    answeredInMemory = true
    try {
      localStorage.setItem(VERSION_KEY, CONSENT_VERSION)
    } catch {
      /* приватный режим — выбор живёт до перезагрузки */
    }
    setAnalyticsConsent(granted)
    setOpen(false)
  }

  return (
    <aside className="cc" role="region" aria-label="Cookies и счётчики">
      <p className="cc__title">Cookies и счётчики</p>
      <p className="cc__lead">
        Счётчики Яндекс Метрики и VK Ads показывают, откуда к нам приходят и какая реклама работает. Включаем их
        только с твоего согласия и не передаём им ни имя, ни почту.{' '}
        <Link to="/privacy" className="cc__link">
          Политика обработки данных
        </Link>
      </p>
      <div className="cc__row">
        <button type="button" className="btn btn--ghost cc__btn" onClick={() => choose(true)}>
          Принять
        </button>
        <button type="button" className="btn btn--ghost cc__btn" onClick={() => choose(false)}>
          Отклонить
        </button>
      </div>
    </aside>
  )
}
