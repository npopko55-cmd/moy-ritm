/**
 * Четыре карточки тарифов с кнопками оплаты и строкой сообщения под ними.
 *
 * Живут на трёх страницах: тарифы, предложение после 10-й тренировки
 * (/offer) и «Бесплатный доступ истёк» (/trial-ended). Разметка, стили и
 * логика оплаты — одни на всех, чтобы страницы не разошлись.
 *
 * В Telegram Mini App оплаты нет (правила Telegram): кнопка карточки
 * подписана «Оформить на сайте» и открывает тарифы сайта во внешнем
 * браузере. Цены при этом показываются как обычно.
 */

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { ApiError, hasAccess, type Tariff } from '../api/types'
import { useSession } from '../auth/SessionProvider'
import { nextParam } from '../auth/guards'
import { rub } from '../data/tariffs'
import { rememberAccessBefore } from '../lib/payment'
import { cachedTariffs, loadTariffs } from '../lib/tariffs'
import { openTariffsOnSite, useInTelegram } from '../lib/telegram'
import { useResendConfirmation } from '../lib/useResendConfirmation'
import { errorText } from '../screens/Account'
import { Crown } from './Icons'
import './TariffPlans.css'

/** Что показать под кнопками. `verify` рисует ещё и кнопку повторного письма. */
type Note = { kind: 'error' | 'verify'; text: string } | null

type Props = {
  /** Куда вернуть гостя после входа, если он нажал «Выбрать». */
  from?: string
}

export default function TariffPlans({ from = '/tariffs' }: Props) {
  const navigate = useNavigate()
  const { me, access } = useSession()
  const inTelegram = useInTelegram()

  // null — ещё грузим: в это время в карточках стоит скелетон.
  const [tariffs, setTariffs] = useState<Tariff[] | null>(cachedTariffs)
  const [loadError, setLoadError] = useState('')
  const [busyCode, setBusyCode] = useState<string | null>(null)
  const [note, setNote] = useState<Note>(null)
  const resend = useResendConfirmation()

  // Вернулись с GetCourse кнопкой «Назад»: браузер (особенно Safari) достаёт
  // страницу из bfcache ровно такой, какой её оставили, — с «Открываем
  // оплату…» и заблокированными кнопками. Размораживаем их.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setBusyCode(null)
    }
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  }, [])

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

  /**
   * Оплата: ссылка на оффер GetCourse выдаётся персонально, с подставленной
   * почтой и меткой человека, поэтому её нельзя зашить в разметку.
   */
  const choose = async (code: string) => {
    // В мини-апе платить нельзя — тарифы сайта во внешнем браузере.
    if (inTelegram) {
      openTariffsOnSite()
      return
    }
    if (!me) {
      navigate(`/login${nextParam(from)}`)
      return
    }
    if (!me.user.email_verified) {
      setNote({
        kind: 'verify',
        text: 'Сначала подтвердите почту — иначе оплата уедет на несуществующий адрес.',
      })
      return
    }

    setNote(null)
    setBusyCode(code)
    try {
      const { url } = await api.paymentLink(code)
      // Экран «Проверяем оплату» сравнит с этим сроком: при продлении доступ
      // уже есть, и пришедшей оплату покажет только выросшая дата.
      rememberAccessBefore(access)
      // Обычный переход на сторону GetCourse, без всплывающих окон.
      window.location.assign(url)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'EMAIL_NOT_VERIFIED') {
        setNote({
          kind: 'verify',
          text: 'Сначала подтвердите почту — иначе оплата уедет на несуществующий адрес.',
        })
      } else if (e instanceof ApiError && e.code === 'OFFER_NOT_CONFIGURED') {
        setNote({ kind: 'error', text: 'Оплата пока недоступна, напишите в поддержку.' })
      } else {
        setNote({ kind: 'error', text: errorText(e) })
      }
      setBusyCode(null)
    }
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

                <button
                  className="plan__cta"
                  data-tariff={t.code}
                  onClick={() => void choose(t.code)}
                  disabled={busyCode !== null}
                >
                  {busyCode === t.code ? 'Открываем оплату…' : ctaLabel}
                </button>
              </li>
            ))}
      </ul>

      {/* Всё, что нужно сказать про оплату, говорим здесь строкой —
          всплывающих панелей на сайте нет. */}
      {(note || loadError) && (
        <div className={`tariffs__msg ${note?.kind === 'error' || loadError ? 'is-bad' : ''}`}>
          <p>{loadError || note?.text}</p>

          {note?.kind === 'verify' && (
            <>
              <button
                className="tariffs__msg-btn"
                type="button"
                onClick={() => void resend.send()}
                disabled={resend.disabled}
              >
                {resend.label('Отправить письмо ещё раз')}
              </button>
              {resend.ok && <p className="tariffs__msg-ok">{resend.ok}</p>}
              {resend.error && <p className="tariffs__msg-bad">{resend.error}</p>}
            </>
          )}

          {note?.kind === 'error' && (
            <Link className="tariffs__msg-btn" to="/help">
              Написать в поддержку
            </Link>
          )}
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
