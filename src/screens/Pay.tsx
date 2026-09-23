/**
 * Страница оплаты /pay/<тариф>: карточка выбранного тарифа и под ней
 * встроенная форма GetCourse.
 *
 * Сюда ведёт «Выбрать» на тарифах, на /offer и /trial-ended, а из мини-апа —
 * «Оформить на сайте» во внешнем браузере. Гостя RequireAuth отправит на
 * вход с next=/pay/<тариф> и вернёт сюда же.
 *
 * Что под карточкой (POST /payments/checkout):
 *   • виджет GetCourse, если он заведён у оффера; не появился за 10 секунд —
 *     кнопка на страницу оплаты GetCourse (src/components/GetCourseWidget.tsx);
 *   • виджета нет — сразу эта кнопка, как было до виджета;
 *   • почта не подтверждена — просьба подтвердить и повторное письмо: без
 *     подтверждения чек и доступ уехали бы на чужой адрес;
 *   • мини-ап Telegram — оплаты нет по его правилам, кнопка открывает эту же
 *     страницу на сайте.
 *
 * Незнакомый тариф — обратно на /tariffs. Всплывающих окон нет: всё —
 * блоками на странице.
 */

import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { ApiError, type Checkout, type CheckoutTariff } from '../api/types'
import { useSession } from '../auth/SessionProvider'
import GetCourseWidget, { WidgetSkeleton } from '../components/GetCourseWidget'
import { Clock, Shield } from '../components/Icons'
import { rub } from '../data/tariffs'
import { plural } from '../lib/date'
import { rememberAccessBefore } from '../lib/payment'
import { cachedTariffs, loadTariffs } from '../lib/tariffs'
import { openPayOnSite, useInTelegram } from '../lib/telegram'
import { useResendConfirmation } from '../lib/useResendConfirmation'
import { AccountShell, FormError, FormOk, errorText } from './Account'
import './Pay.css'

type Load =
  | { kind: 'loading' }
  | { kind: 'ready'; checkout: Checkout }
  | { kind: 'verify' }
  | { kind: 'missing' }
  | { kind: 'error'; text: string; support: boolean }

export default function Pay() {
  const { code = '' } = useParams()
  const { me, access, reload } = useSession()
  const inTelegram = useInTelegram()
  // RequireAuth пускает сюда только вошедших, так что профиль есть.
  const verified = me?.user.email_verified !== false

  const [tariffs, setTariffs] = useState(cachedTariffs)
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

  // Срок доступа до оплаты — для «Проверяем оплату». В ref: его обновление
  // не должно заново запрашивать оплату.
  const accessNow = useRef(access)
  accessNow.current = access

  // Карточка тарифа — из витрины: она нужна и там, где checkout не зовём
  // (мини-ап, неподтверждённая почта). Витрина не ответила — хватит checkout.
  useEffect(() => {
    let alive = true
    loadTariffs().then(
      (list) => {
        if (alive) setTariffs(list)
      },
      () => undefined,
    )
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    // В мини-апе платить нельзя, а без подтверждённой почты сервер ответит
    // 403 — спрашивать незачем. Почту подтвердили (профиль перечитывается
    // при возврате в приложение) — эффект сработает снова.
    if (inTelegram) return
    if (!verified) {
      setLoad({ kind: 'verify' })
      return
    }

    let alive = true
    setLoad({ kind: 'loading' })
    api.paymentCheckout(code).then(
      (checkout) => {
        if (!alive) return
        // Нажатие «Перейти к оплате» внутри формы GetCourse отсюда не видно,
        // поэтому срок доступа запоминаем, как только показываем оплату.
        rememberAccessBefore(accessNow.current)
        setLoad({ kind: 'ready', checkout })
      },
      (e: unknown) => {
        if (!alive) return
        if (e instanceof ApiError && e.code === 'EMAIL_NOT_VERIFIED') {
          // Профиль в памяти устарел — перечитываем, заодно и для шапки.
          setLoad({ kind: 'verify' })
          void reload()
        } else if (e instanceof ApiError && (e.code === 'TARIFF_NOT_FOUND' || e.status === 422)) {
          setLoad({ kind: 'missing' })
        } else if (e instanceof ApiError && e.code === 'OFFER_NOT_CONFIGURED') {
          setLoad({
            kind: 'error',
            text: 'Оплата этого тарифа пока недоступна. Напишите в поддержку — поможем оформить доступ.',
            support: true,
          })
        } else {
          setLoad({
            kind: 'error',
            text: errorText(e, 'Не получилось открыть оплату. Попробуйте ещё раз'),
            support: false,
          })
        }
      },
    )
    return () => {
      alive = false
    }
  }, [code, inTelegram, verified, attempt, reload])

  const known = tariffs?.find((t) => t.code === code)
  if (load.kind === 'missing' || (tariffs && !known)) return <Navigate to="/tariffs" replace />

  const card: CheckoutTariff | undefined = load.kind === 'ready' ? load.checkout.tariff : known

  let payment
  if (inTelegram) {
    payment = <InTelegram code={code} />
  } else if (load.kind === 'verify') {
    payment = <VerifyEmail email={me?.user.email ?? ''} />
  } else if (load.kind === 'error') {
    payment = (
      <div className="checkout__msg is-bad">
        <p>{load.text}</p>
        {load.support ? (
          <Link className="checkout__msg-btn" to="/help">
            Написать в поддержку
          </Link>
        ) : (
          <button className="checkout__msg-btn" type="button" onClick={() => setAttempt((n) => n + 1)}>
            Попробовать ещё раз
          </button>
        )}
      </div>
    )
  } else if (load.kind === 'ready') {
    const { widget, prefill, page_url } = load.checkout
    payment = widget ? (
      <GetCourseWidget
        widget={widget}
        prefill={prefill}
        fallback={
          <PayLink
            url={page_url}
            note="Форма оплаты не загрузилась. Оплатить можно на странице GetCourse — почта там уже подставлена."
          />
        }
      />
    ) : (
      <PayLink
        url={page_url}
        note="Откроется страница оплаты GetCourse — почта там уже подставлена. После оплаты вы вернётесь на сайт."
      />
    )
  } else {
    // Пока не знаем, будет ли виджет, — скелет его размера: так страница не
    // прыгает, когда он начнёт грузиться.
    payment = <WidgetSkeleton />
  }

  return (
    <AccountShell title="Оплата доступа">
      <div className="checkout">
        {card ? <TariffCard tariff={card} /> : <TariffCardSkeleton />}

        <Link className="checkout__back" to="/tariffs">
          ← Другой тариф
        </Link>

        <section className="checkout__pay" aria-label="Оплата">
          {payment}
        </section>

        <p className="checkout__oferta">
          Оплачивая доступ, вы принимаете условия <Link to="/oferta">публичной оферты</Link>
        </p>
      </div>
    </AccountShell>
  )
}

/** Выбранный тариф: название, цена, цена месяца и срок, условия оплаты. */
function TariffCard({ tariff }: { tariff: CheckoutTariff }) {
  const days = plural(tariff.duration_days, 'день', 'дня', 'дней')
  // У месяца цена месяца — та же цена, повторять её незачем.
  const per =
    tariff.per_month !== tariff.price
      ? `≈ ${rub(tariff.per_month)} в месяц · доступ на ${days}`
      : `Доступ на ${days}`
  return (
    <div className="checkout__tariff">
      <div className="checkout__row">
        <h2 className="checkout__name">{tariff.name}</h2>
        <p className="checkout__price">{rub(tariff.price)}</p>
      </div>
      <p className="checkout__per">{per}</p>
      <ul className="checkout__terms">
        <li>
          <Shield size={16} />
          Разовая оплата, без автосписаний
        </li>
        <li>
          <Clock size={16} />
          Доступ откроется сам, обычно за несколько минут
        </li>
      </ul>
    </div>
  )
}

/** Карточка на время загрузки — той же высоты, что и настоящая. */
function TariffCardSkeleton() {
  return (
    <div className="checkout__tariff is-skeleton" aria-hidden="true">
      <div className="checkout__row">
        <span className="checkout__sk checkout__sk--name" />
        <span className="checkout__sk checkout__sk--price" />
      </div>
      <span className="checkout__sk checkout__sk--per" />
      <ul className="checkout__terms">
        <li>
          <span className="checkout__sk checkout__sk--term" />
        </li>
        <li>
          <span className="checkout__sk checkout__sk--term" />
        </li>
      </ul>
    </div>
  )
}

/**
 * Переход на страницу оплаты GetCourse — обычной ссылкой в этой же вкладке:
 * без виджета это единственный путь, с виджетом — запасной.
 */
function PayLink({ url, note }: { url: string; note: string }) {
  const { access } = useSession()
  return (
    <div className="checkout__link">
      <p className="checkout__note">{note}</p>
      <a className="form__submit" href={url} onClick={() => rememberAccessBefore(access)}>
        Перейти к оплате
      </a>
    </div>
  )
}

/**
 * Почта не подтверждена — оплатить нельзя: чек и доступ уехали бы на адрес,
 * которым человек, возможно, не владеет. Как только почта подтверждена,
 * страница сама покажет форму оплаты.
 */
function VerifyEmail({ email }: { email: string }) {
  const { reload } = useSession()
  const resend = useResendConfirmation()
  const [checking, setChecking] = useState(false)
  const [notYet, setNotYet] = useState('')

  // Профиль перечитывается и сам, при возврате в приложение, но не чаще раза
  // в полминуты. Кнопка — для тех, кто вернулся быстрее.
  const recheck = async () => {
    setChecking(true)
    setNotYet('')
    const fresh = await reload()
    setChecking(false)
    if (fresh && !fresh.user.email_verified) {
      setNotYet('Подтверждения пока не видим. Откройте ссылку из последнего письма.')
    }
  }

  return (
    <div className="checkout__msg">
      <h2 className="checkout__msg-title">Подтвердите почту, чтобы оплатить</h2>
      <p>
        Мы отправили письмо со ссылкой на {email || 'вашу почту'}. Без подтверждения чек и доступ
        уехали бы на адрес, которым вы, возможно, не владеете.
      </p>
      <p className="checkout__msg-hint">Письма нет во «Входящих» — загляните в «Спам».</p>

      <button
        className="checkout__msg-btn"
        type="button"
        onClick={() => void resend.send()}
        disabled={resend.disabled}
      >
        {resend.label('Отправить письмо ещё раз')}
      </button>
      <FormOk>{resend.ok}</FormOk>
      <FormError>{resend.error}</FormError>

      <button className="checkout__msg-link" type="button" onClick={() => void recheck()} disabled={checking}>
        {checking ? 'Проверяем…' : 'Почта подтверждена — продолжить'}
      </button>
      <FormError>{notYet}</FormError>
    </div>
  )
}

/** Мини-ап Telegram: оплаты внутри нет, открываем эту страницу на сайте. */
function InTelegram({ code }: { code: string }) {
  return (
    <div className="checkout__link">
      <p className="checkout__note">
        В Telegram оплата не работает — таковы его правила. Оформите доступ на сайте: этот тариф
        откроется сразу.
      </p>
      <button className="form__submit" type="button" onClick={() => openPayOnSite(code)}>
        Оформить на сайте
      </button>
    </div>
  )
}
