/**
 * Подписка /subscription (backend/docs/PRODAMUS.md, «Подписка»): оформление,
 * состояние, отмена в один клик и предложение «перейди на год».
 *
 * Что на экране, по GET /subscription:
 *   • подписка живая (trial, active, past_due) — цена, когда следующее
 *     списание, до какого числа доступ и кнопка «Отменить подписку». Одно
 *     нажатие — и отказ принят (376-ФЗ: отказ онлайн, после него списывать
 *     нельзя). Сервер фиксирует отмену сразу, до ответа Продамуса;
 *   • после второго оплаченного месяца — плашка года (upsell): разовая оплата
 *     года, после неё месячная подписка отменяется сама;
 *   • подписки нет, а оформить можно (offer) — карточка подписки и, если
 *     положен, пробный «3 дня за 1 ₽». Согласие на автосписание — отдельная
 *     галочка, по умолчанию НЕ отмечена (69-ФЗ); пока не отмечена, кнопка
 *     оплаты неактивна. Человеку из новой воронки (card_trial_only) — сразу
 *     пробный, без выбора;
 *   • ничего из этого — подписка выключена: ведём на обычные тарифы.
 *
 * Оплата — на форме Продамуса по подписанной ссылке; возвращает он на
 * /payment/success (тот же экран «Проверяем оплату»), «назад» — сюда.
 *
 * ТЕКСТ: на вычитку — все тексты экрана черновые, список —
 * scratchpad/plan/texts-payments.md.
 */

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { ApiError, type SubscriptionState } from '../api/types'
import { useSession } from '../auth/SessionProvider'
import { rub } from '../data/tariffs'
import { formatDate, plural } from '../lib/date'
import { rememberAccessBefore } from '../lib/payment'
import { STANDALONE } from '../lib/standalone'
import { markSitePayment, useInTelegram } from '../lib/telegram'
import { AccountShell, FormError, Waiting, errorText } from './Account'
import './Pay.css'
import './Subscription.css'

/** Тот же ключ, что у Pay.tsx и PaymentSuccess.tsx: текст «Пока не видим оплату». */
const PAY_PROVIDER_KEY = 'moyritm:pay-provider'

/** Уход на форму Продамуса: запомнить срок доступа для «Проверяем оплату». */
function leaveToProdamus(access: Parameters<typeof rememberAccessBefore>[0], url: string): void {
  rememberAccessBefore(access)
  try {
    sessionStorage.setItem(PAY_PROVIDER_KEY, 'prodamus')
  } catch {
    // Без хранилища «Проверяем оплату» покажет текст GetCourse — не беда.
  }
  if (STANDALONE) markSitePayment()
  window.location.assign(url)
}

export default function Subscription() {
  const { access, reload } = useSession()
  const inTelegram = useInTelegram()
  const [state, setState] = useState<SubscriptionState | null>(null)
  const [loadError, setLoadError] = useState('')

  const load = useCallback(() => {
    setLoadError('')
    api.subscriptionState().then(setState, (e: unknown) => setLoadError(errorText(e)))
  }, [])
  useEffect(load, [load])

  let body
  if (loadError) {
    body = (
      <div className="checkout__msg is-bad">
        <p>{loadError}</p>
        <button className="checkout__msg-btn" type="button" onClick={load}>
          Попробовать ещё раз
        </button>
      </div>
    )
  } else if (!state) {
    body = <Waiting />
  } else {
    const live = state.subscription?.can_cancel ?? false
    body = (
      <>
        {state.subscription && (
          <Current
            state={state}
            onCanceled={(next) => {
              setState(next)
              void reload()
            }}
          />
        )}
        {live && state.upsell && <Upsell upsell={state.upsell} />}
        {!live && state.offer && (
          <Offer state={state} inTelegram={inTelegram} access={access} />
        )}
        {!state.subscription && !state.offer && (
          <div className="checkout__msg">
            {/* ТЕКСТ: на вычитку */}
            <p>Подписка пока недоступна. Доступ можно оплатить на срок.</p>
            <Link className="checkout__msg-btn" to="/tariffs">
              К тарифам
            </Link>
          </div>
        )}
      </>
    )
  }

  // ТЕКСТ: на вычитку
  return (
    <AccountShell title="Подписка">
      <div className="checkout sub">{body}</div>
    </AccountShell>
  )
}

/** Текущая подписка: что с ней, когда спишем, кнопка отмены. */
function Current({
  state,
  onCanceled,
}: {
  state: SubscriptionState
  onCanceled: (next: SubscriptionState) => void
}) {
  const sub = state.subscription!
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')

  const cancel = async () => {
    setBusy(true)
    setError('')
    try {
      const res = await api.subscriptionCancel()
      onCanceled(res.state)
      // ТЕКСТ: на вычитку
      setNote('Подписка отменена. Больше списаний не будет — письмо с подтверждением уже на почте.')
    } catch (e) {
      if (e instanceof ApiError && e.code === 'NO_SUBSCRIPTION') {
        // Уже отменена (например, во второй вкладке) — просто покажем это.
        onCanceled({ ...state, subscription: { ...sub, status: 'canceled', can_cancel: false } })
      } else {
        setError(errorText(e, 'Не получилось отменить. Попробуйте ещё раз'))
      }
    } finally {
      setBusy(false)
    }
  }

  // ТЕКСТ: на вычитку — строки состояния ниже
  const price = `${rub(sub.price)} в месяц`
  let status: string
  let detail: string | null = null
  switch (sub.status) {
    case 'trial':
      status = 'Идут пробные дни'
      detail = sub.next_payment_at
        ? `${formatDate(sub.next_payment_at)} спишем ${rub(sub.price)} и продлим доступ на месяц.`
        : null
      break
    case 'active':
      status = `Подписка активна · ${price}`
      detail = sub.next_payment_at ? `Следующее списание — ${formatDate(sub.next_payment_at)}.` : null
      break
    case 'past_due':
      status = 'Не получилось списать оплату'
      detail = 'Платёжная система попробует ещё раз. Проверьте, что на карте хватает денег.'
      break
    case 'canceled':
      status = 'Подписка отменена'
      detail = 'Списаний больше не будет.'
      break
    default:
      status = 'Подписка закончилась'
  }

  return (
    <section className={`checkout__tariff sub__current ${sub.payment_failed ? 'is-bad' : ''}`}>
      <h2 className="checkout__name">{status}</h2>
      {detail && <p className="checkout__per">{detail}</p>}
      {sub.paid_until && (
        <p className="checkout__per">Доступ открыт до {formatDate(sub.paid_until)}.</p>
      )}
      {sub.can_cancel && (
        <button className="sub__cancel" type="button" onClick={() => void cancel()} disabled={busy}>
          {busy ? 'Отменяем…' : 'Отменить подписку'}
        </button>
      )}
      {note && <p className="sub__note">{note}</p>}
      <FormError>{error}</FormError>
    </section>
  )
}

/** «Перейди на год»: экономия против двенадцати месяцев подписки. */
function Upsell({ upsell }: { upsell: NonNullable<SubscriptionState['upsell']> }) {
  const { access } = useSession()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const go = async () => {
    setBusy(true)
    setError('')
    try {
      const { page_url } = await api.subscriptionUpgrade()
      leaveToProdamus(access, page_url)
    } catch (e) {
      setError(errorText(e))
      setBusy(false)
    }
  }

  // ТЕКСТ: на вычитку
  return (
    <section className="sub__upsell">
      <h2 className="sub__upsell-title">
        Год за {rub(upsell.price)} — экономия {upsell.saving_percent}%
      </h2>
      <p>
        {upsell.months} месяцев подписки стоят {rub(upsell.monthly_total)}. Перейдите на год —
        оплаченный месяц сохранится, а подписка отменится сама.
      </p>
      <button className="form__submit" type="button" onClick={() => void go()} disabled={busy}>
        {busy ? 'Открываем оплату…' : `Перейти на год за ${rub(upsell.price)}`}
      </button>
      <FormError>{error}</FormError>
    </section>
  )
}

/** Оформление: подписка или пробный, галочка согласия, кнопка оплаты. */
function Offer({
  state,
  inTelegram,
  access,
}: {
  state: SubscriptionState
  inTelegram: boolean
  access: Parameters<typeof rememberAccessBefore>[0]
}) {
  const offer = state.offer!
  const trialOffer = offer.trial
  // Новая воронка: пробный без выбора. Иначе пробный выбран, если положен.
  const [trial, setTrialState] = useState(Boolean(trialOffer))
  // Согласие на автосписание — по умолчанию НЕ отмечено (69-ФЗ).
  const [consent, setConsent] = useState(false)
  // Сменили вариант — текст согласия другой (суммы и сроки), значит и
  // согласие нужно заново: галочка снимается.
  const setTrial = (value: boolean) => {
    if (value !== trial) setConsent(false)
    setTrialState(value)
  }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const price = rub(offer.tariff.price)
  const period = plural(offer.tariff.period_days, 'день', 'дня', 'дней')
  const useTrial = trial && Boolean(trialOffer)

  const pay = async () => {
    if (!consent) return
    setBusy(true)
    setError('')
    try {
      const { page_url } = await api.subscriptionCheckout(useTrial, offer.consent_version)
      leaveToProdamus(access, page_url)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'AUTOPAY_CONSENT_OUTDATED') {
        // ТЕКСТ: на вычитку
        setError('Условия подписки обновились. Обновите страницу и отметьте согласие снова.')
      } else {
        setError(errorText(e, 'Не получилось открыть оплату. Попробуйте ещё раз'))
      }
      setBusy(false)
    }
  }

  // ТЕКСТ: на вычитку — всё ниже
  const consentText = useTrial
    ? `Согласен(на): сейчас спишется ${rub(trialOffer!.price)}, через ${plural(
        trialOffer!.days,
        'день',
        'дня',
        'дней',
      )} — ${price}, дальше ${price} каждые ${period}, пока я не отменю подписку.`
    : `Согласен(на) на автоматическое списание ${price} каждые ${period}, пока я не отменю подписку.`

  return (
    <section className="sub__offer">
      {trialOffer && !state.card_trial_only && (
        <div className="sub__choice" role="radiogroup" aria-label="Как оформить">
          <button
            type="button"
            role="radio"
            aria-checked={trial}
            className={`sub__option ${trial ? 'is-on' : ''}`}
            onClick={() => setTrial(true)}
          >
            <b>
              {plural(trialOffer.days, 'день', 'дня', 'дней')} за {rub(trialOffer.price)}
            </b>
            <span>потом {price} в месяц</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={!trial}
            className={`sub__option ${!trial ? 'is-on' : ''}`}
            onClick={() => setTrial(false)}
          >
            <b>{price} в месяц</b>
            <span>сразу на месяц</span>
          </button>
        </div>
      )}

      <div className="checkout__tariff">
        <div className="checkout__row">
          <h2 className="checkout__name">
            {useTrial
              ? `${plural(trialOffer!.days, 'день', 'дня', 'дней')} за ${rub(trialOffer!.price)}`
              : offer.tariff.name}
          </h2>
          <p className="checkout__price">{useTrial ? rub(trialOffer!.price) : price}</p>
        </div>
        <p className="checkout__per">
          {useTrial
            ? `Все движения открыты. Потом ${price} в месяц — отменить можно в один клик здесь, в профиле.`
            : `Продлевается сама каждые ${period}. Отменить можно в один клик здесь, в профиле.`}
        </p>
      </div>

      {inTelegram ? (
        <p className="checkout__note">
          В Telegram оплата не работает — таковы его правила. Оформите подписку на сайте.
        </p>
      ) : (
        <>
          <div className="consent">
            <label className="consent__row">
              <input
                className="consent__box"
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                disabled={busy}
              />
              <span>
                {consentText} С <Link to="/oferta">условиями подписки</Link> ознакомлен(а).
              </span>
            </label>
          </div>
          <button
            className="form__submit sub__pay"
            type="button"
            onClick={() => void pay()}
            disabled={!consent || busy}
          >
            {busy ? 'Открываем оплату…' : 'Перейти к оплате'}
          </button>
          <p className="checkout__note">
            Откроется защищённая страница оплаты Продамуса. Карта сохранится для следующих списаний.
          </p>
          <FormError>{error}</FormError>
        </>
      )}
    </section>
  )
}
