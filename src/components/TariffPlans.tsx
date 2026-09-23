/**
 * Четыре карточки тарифов с кнопками оплаты и строкой сообщения под ними.
 *
 * Живут на трёх страницах: тарифы, предложение после 10-й тренировки
 * (/offer) и «Бесплатный доступ истёк» (/trial-ended). Разметка, стили и
 * логика выбора — одни на всех, чтобы страницы не разошлись.
 *
 * «Выбрать» ведёт на страницу оплаты /pay/<тариф>: там карточка тарифа и
 * встроенная форма GetCourse. Гостя она сама отправит на вход и вернёт
 * обратно, неподтверждённую почту попросит подтвердить.
 *
 * В Telegram Mini App оплаты нет (правила Telegram): кнопка карточки
 * подписана «Оформить на сайте» и открывает страницу оплаты этого тарифа на
 * сайте во внешнем браузере. Цены при этом показываются как обычно.
 *
 * Акцепт оферты — оплата, поэтому прямо под карточками мелкая строка со
 * ссылкой на публичную оферту: на всех трёх страницах одна и та же.
 */

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { hasAccess, type Tariff } from '../api/types'
import { useSession } from '../auth/SessionProvider'
import { rub } from '../data/tariffs'
import { cachedTariffs, loadTariffs } from '../lib/tariffs'
import { openPayOnSite, useInTelegram } from '../lib/telegram'
import { errorText } from '../screens/Account'
import { Crown } from './Icons'
import './TariffPlans.css'

export default function TariffPlans() {
  const navigate = useNavigate()
  const { access } = useSession()
  const inTelegram = useInTelegram()

  // null — ещё грузим: в это время в карточках стоит скелетон.
  const [tariffs, setTariffs] = useState<Tariff[] | null>(cachedTariffs)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const list = await loadTariffs()
        if (alive) setTariffs(list)
      } catch (e) {
        if (alive) {
          setTariffs([])
          setLoadError(errorText(e, 'Не получилось загрузить тарифы'))
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const choose = (code: string) => {
    // В мини-апе платить нельзя — страница оплаты сайта во внешнем браузере.
    if (inTelegram) openPayOnSite(code)
    else navigate(`/pay/${code}`)
  }

  const ctaLabel = inTelegram ? 'Оформить на сайте' : hasAccess(access) ? 'Продлить' : 'Выбрать'

  return (
    <>
      <ul className="tariffs__plans">
        {tariffs === null
          ? [0, 1, 2, 3].map((i) => <PlanSkeleton key={i} />)
          : tariffs.map((t) => (
              <li key={t.code} className={`plan plan--${t.code} ${t.is_recommended ? 'is-top' : ''}`}>
                {t.is_recommended && (
                  <span className="plan__crown">
                    <Crown size={13} />
                    Популярный выбор
                  </span>
                )}
                {t.discount_label && <span className="plan__badge">{t.discount_label}</span>}

                <h2 className="plan__name">{t.name}</h2>
                <p className="plan__price">{rub(t.price)}</p>
                <p className="plan__per">{rub(t.per_month)} / месяц</p>

                {t.savings ? (
                  <span className="plan__save">Экономия {rub(t.savings)}</span>
                ) : (
                  <span className="plan__rule" aria-hidden="true" />
                )}

                <p className="plan__note">{t.note}</p>

                <button className="plan__cta" data-tariff={t.code} onClick={() => choose(t.code)}>
                  {ctaLabel}
                </button>
              </li>
            ))}
      </ul>

      <p className="tariffs__oferta">
        Оплачивая доступ, вы принимаете <Link to="/oferta">условия публичной оферты</Link>
      </p>

      {/* Всплывающих панелей на сайте нет: сбой загрузки — строкой здесь. */}
      {loadError && (
        <div className="tariffs__msg is-bad">
          <p>{loadError}</p>
        </div>
      )}
    </>
  )
}

/**
 * Карточка на время загрузки. Разметка та же, что у настоящей, а текст
 * заменён полосками той же высоты — поэтому раскладка не прыгает, когда
 * приходят цены.
 */
function PlanSkeleton() {
  return (
    <li className="plan is-skeleton" aria-hidden="true">
      <h2 className="plan__name">
        <span className="sk sk--sm" />
      </h2>
      <p className="plan__price">
        <span className="sk sk--md" />
      </p>
      <p className="plan__per">
        <span className="sk sk--sm" />
      </p>
      <span className="plan__rule" />
      <p className="plan__note">
        <span className="sk sk--lg" />
        <span className="sk sk--md" />
      </p>
      <button className="plan__cta" type="button" disabled>
        <span className="sk sk--sm" />
      </button>
    </li>
  )
}
