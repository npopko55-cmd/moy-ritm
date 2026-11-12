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
 *   • почта не подтверждена — платить всё равно можно (с 12.11.2026: из 167
 *     неподтвердивших не купил ни один). Просьба подтвердить осталась только
 *     на случай старого сервера, который ещё отвечает 403 EMAIL_NOT_VERIFIED;
 *   • мини-ап Telegram — оплаты нет по его правилам, кнопка открывает эту же
 *     страницу на сайте.
 *
 * Установленное приложение (экран «Домой», src/lib/standalone.ts): страницу
 * оплаты GetCourse айфон открывает поверх приложения во встроенном браузере.
 * Человек платит там и закрывает его «Готово» — а под ним всё та же /pay со
 * старым профилем, и перезагрузить её нечем. Поэтому ссылки на GetCourse
 * включают ожидание оплаты (markSitePayment → src/lib/sitePayment.ts:
 * профиль перечитывается сам), а как только оплата видна — уводим на
 * /payment/success: он покажет итог и откроет поток.
 *
 * Продамус (checkout вернул provider: 'prodamus', backend/docs/PRODAMUS.md):
 * виджета нет — сразу кнопка «Перейти к оплате» на его форму, с тем же
 * ожиданием оплаты в установленном приложении. Подсказки про VPN нет: она
 * про GetCourse, а в справке Продамуса о VPN ничего нет. Начнутся жалобы —
 * вернуть её одним свойством vpn у PayLink. Форма Продамуса после
 * оплаты возвращает на тот же /payment/success.
 *
 * Незнакомый тариф — обратно на /tariffs. Всплывающих окон нет: всё —
 * блоками на странице.
 */

import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { ApiError, type Access, type Checkout, type CheckoutOffer, type CheckoutTariff } from '../api/types'
import { useSession } from '../auth/SessionProvider'
import GetCourseWidget, { WidgetSkeleton } from '../components/GetCourseWidget'
import { Clock } from '../components/Icons'
import { PAYWALL_TEXT } from '../data/paywall'
import { VPN_HINT } from '../data/support'
import { rub } from '../data/tariffs'
import { rememberPurchase } from '../lib/analytics'
import { plural } from '../lib/date'
import { cachedOffer, useCountdown } from '../lib/offers'
import { paymentArrived, readAccessBefore, rememberAccessBefore } from '../lib/payment'
import { STANDALONE } from '../lib/standalone'
import { cachedTariffs, loadTariffs } from '../lib/tariffs'
import { markSitePayment, openPayOnSite, useInTelegram } from '../lib/telegram'
import { useResendConfirmation } from '../lib/useResendConfirmation'
import { AccountShell, FormError, FormOk, errorText } from './Account'
import './Pay.css'

type Load =
  | { kind: 'loading' }
  | { kind: 'ready'; checkout: Checkout }
  | { kind: 'verify' }
  | { kind: 'missing' }
  | { kind: 'expired'; text: string }
  | { kind: 'error'; text: string; support: boolean }

export default function Pay() {
  const { code = '' } = useParams()
  const { me, access, reload } = useSession()
  const inTelegram = useInTelegram()
  const [tariffs, setTariffs] = useState(cachedTariffs)
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

  // Срок доступа до оплаты — для «Проверяем оплату». В ref: его обновление
  // не должно заново запрашивать оплату.
  const accessNow = useRef(access)
  accessNow.current = access

  // Карточка тарифа — из витрины: она нужна и там, где checkout не зовём
  // (мини-ап). Витрина не ответила — хватит checkout.
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
    // В мини-апе платить нельзя. Неподтверждённая почта оплате не мешает
    // (с 12.11.2026): checkout зовём всем вошедшим.
    if (inTelegram) return

    let alive = true
    setLoad({ kind: 'loading' })
    api.paymentCheckout(code).then(
      (checkout) => {
        if (!alive) return
        // Нажатие «Перейти к оплате» внутри формы GetCourse отсюда не видно,
        // поэтому срок доступа запоминаем, как только показываем оплату.
        rememberAccessBefore(accessNow.current)
        rememberPayProvider(checkout.provider ?? 'getcourse')
        // Код и цена — для цели purchase на «Оплата прошла» (src/lib/analytics.ts).
        rememberPurchase(checkout.tariff.code, checkout.tariff.price)
        setLoad({ kind: 'ready', checkout })
      },
      (e: unknown) => {
        if (!alive) return
        if (e instanceof ApiError && e.code === 'EMAIL_NOT_VERIFIED') {
          // Так отвечает только сервер старше 12.11.2026 — до его обновления
          // показываем прежнюю просьбу подтвердить почту.
          setLoad({ kind: 'verify' })
          void reload()
        } else if (e instanceof ApiError && (e.code === 'TARIFF_NOT_FOUND' || e.status === 422)) {
          setLoad({ kind: 'missing' })
        } else if (e instanceof ApiError && e.code === 'OFFER_EXPIRED') {
          // Персональное предложение кончилось (или его не было): цену держит
          // сервер, по старой ссылке скидку не оплатить.
          setLoad({ kind: 'expired', text: e.message || PAYWALL_TEXT.payOfferExpired })
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
  }, [code, inTelegram, attempt, reload])

  // Установленное приложение: вернулись со страницы GetCourse, профиль
  // перечитался (src/lib/sitePayment.ts), и оплата видна — на «Проверяем
  // оплату», он покажет итог и уведёт в поток. Только если срок доступа до
  // оплаты запомнен (отсюда уходили платить или хотя бы видели оплату): без
  // записи paymentArrived считает оплатой любой доступ, и подписчик, открывший
  // /pay продлить, улетал бы отсюда сразу. В браузере GetCourse и так
  // возвращает на /payment/success.
  if (STANDALONE) {
    const before = readAccessBefore()
    if (before && paymentArrived(access, before)) return <Navigate to="/payment/success" replace />
  }

  const known = tariffs?.find((t) => t.code === code)
  // Скрытого тарифа персонального предложения на витрине нет: его код знает
  // ответ checkout или последнее состояние предложений (src/lib/offers.ts).
  const offer = cachedOffer()
  const offerCode = offer?.tariff_code === code
  const waiting = !inTelegram && (load.kind === 'loading' || load.kind === 'ready' || load.kind === 'expired')
  if (load.kind === 'missing' || (tariffs && !known && !offerCode && !waiting)) {
    return <Navigate to="/tariffs" replace />
  }

  const card: CheckoutTariff | undefined =
    load.kind === 'ready'
      ? load.checkout.tariff
      : (known ??
        (offer && offerCode
          ? {
              code: offer.tariff_code,
              name: offer.name,
              price: offer.price,
              currency: offer.currency,
              duration_days: offer.duration_days,
              per_month: offer.duration_days >= 28 ? Math.round(offer.price / 12) : offer.price,
            }
          : undefined))
  const cardOffer: CheckoutOffer | undefined =
    load.kind === 'ready'
      ? load.checkout.offer
      : offer && offerCode
        ? { kind: offer.kind, price: offer.price, base_price: offer.base_price, expires_at: offer.expires_at }
        : undefined

  let payment
  if (inTelegram) {
    payment = <InTelegram code={code} email={me?.user.email ?? ''} />
  } else if (load.kind === 'expired') {
    payment = (
      <div className="checkout__msg is-bad">
        <p>{load.text}</p>
        <Link className="checkout__msg-btn" to="/tariffs">
          {PAYWALL_TEXT.payOfferBack}
        </Link>
      </div>
    )
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
  } else if (load.kind === 'ready' && load.checkout.provider === 'prodamus') {
    payment = (
      <PayLink
        url={load.checkout.page_url}
        provider="prodamus"
        note="Откроется защищённая страница оплаты Продамуса — почта там уже подставлена. После оплаты вы вернётесь на сайт."
        vpn="none"
      />
    )
  } else if (load.kind === 'ready') {
    // Имя из профиля — в форму GetCourse вдобавок к почте с сервера.
    const name = me?.user.name?.trim() ?? ''
    const prefill = withName(load.checkout.prefill, name)
    const page_url = pageWithName(load.checkout.page_url, name)
    const { widget } = load.checkout
    payment = widget ? (
      <GetCourseWidget
        widget={widget}
        prefill={prefill}
        fallback={
          <PayLink
            url={page_url}
            note="Форма оплаты не загрузилась. Оплатить можно на странице GetCourse — почта там уже подставлена."
            vpn="loud"
          />
        }
        backup={
          <p className="checkout__backup">
            Форма не отвечает?{' '}
            <a href={page_url} onClick={() => leaveToPay(access)}>
              Оплатить на странице GetCourse
            </a>
          </p>
        }
        note={<p className="checkout__vpn">{VPN_HINT}</p>}
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
        {card ? <TariffCard tariff={card} offer={load.kind === 'expired' ? undefined : cardOffer} /> : <TariffCardSkeleton />}

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

/*
 * Что форма GetCourse спрашивает и что мы подставляем (правка тестировщицы
 * 04.11.2026: «не спрашивать данные, мы их уже знаем»). Своих полей у этой
 * страницы нет: имя, почту и телефон спрашивает форма GetCourse в чужом
 * iframe, и спрятать её поля отсюда нельзя — только заполнить. Почту и метки
 * кладёт в prefill сервер (sv[email]); имя, если оно есть в профиле,
 * добавляем здесь. Телефона в профиле нет — его форма спросит, пока поле не
 * уберут или не сделают необязательным в настройках виджета.
 *
 * Поле имени у виджета и у страницы оффера называется по-разному (боевые
 * формы прочитаны 05.11.2026): у всех четырёх виджетов —
 * formParams[first_name], его заполняет sv[first_name]; у страницы оффера
 * (запасной путь и мини-ап) — formParams[full_name], его заполняет
 * sv[full_name]. Что прислал сервер, не перекрываем: начнёт он сам слать
 * имя — останется его значение.
 */
const WIDGET_NAME_PARAM = 'sv[first_name]'
const PAGE_NAME_PARAM = 'sv[full_name]'

function withName(prefill: Record<string, string>, name: string): Record<string, string> {
  return name ? { [WIDGET_NAME_PARAM]: name, ...prefill } : prefill
}

/** Адрес страницы оффера с именем — тем же видом, что sv[email] у сервера. */
function pageWithName(url: string, name: string): string {
  if (!name) return url
  try {
    const parsed = new URL(url)
    if (parsed.searchParams.has(PAGE_NAME_PARAM)) return url
    const param = `${PAGE_NAME_PARAM}=${encodeURIComponent(name)}`
    parsed.search = parsed.search ? `${parsed.search}&${param}` : `?${param}`
    return parsed.toString()
  } catch {
    return url
  }
}

/**
 * Выбранный тариф: название, цена, цена месяца и срок, когда откроется доступ.
 * Строку о разовой оплате владелец убрал 29.09.2026.
 */
function TariffCard({ tariff, offer }: { tariff: CheckoutTariff; offer?: CheckoutOffer }) {
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
        <p className="checkout__price">
          {/* Персональное предложение: зачёркнута обычная цена того же срока. */}
          {offer?.base_price ? <s className="checkout__was">{rub(offer.base_price)}</s> : null}
          {rub(tariff.price)}
        </p>
      </div>
      <p className="checkout__per">{per}</p>
      {offer?.expires_at && <OfferLeft expiresAt={offer.expires_at} />}
      <ul className="checkout__terms">
        <li>
          <Clock size={16} />
          Доступ откроется сам, обычно за несколько минут
        </li>
      </ul>
    </div>
  )
}

/**
 * Сколько ещё действует цена предложения — честный отсчёт по часам сервера.
 * Заказ, открытый до конца срока, оплатить можно и чуть позже: сервер
 * принимает оплату по уже созданной ссылке.
 */
function OfferLeft({ expiresAt }: { expiresAt: string }) {
  const { left, done } = useCountdown(expiresAt)
  if (done) return null
  return <p className="checkout__offer-left">{PAYWALL_TEXT.payOfferUntil(left)}</p>
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
      </ul>
    </div>
  )
}

/**
 * Уход на страницу оплаты GetCourse или Продамуса. Срок доступа до оплаты —
 * для «Проверяем оплату». В установленном приложении ещё и включаем ожидание
 * оплаты: айфон откроет страницу оплаты поверх приложения, и вернувшегося
 * после «Готово» встретит эта же страница — профиль перечитается сам
 * (src/lib/sitePayment.ts).
 */
function leaveToPay(access: Access | null, provider: PayProvider = 'getcourse'): void {
  rememberAccessBefore(access)
  rememberPayProvider(provider)
  if (STANDALONE) markSitePayment()
}

type PayProvider = 'getcourse' | 'prodamus'

/**
 * Через кого ушли платить — для текста «Пока не видим оплату» на
 * /payment/success: про «GetCourse задерживает уведомление» Продамусу
 * говорить неправильно. Ключ и чтение — в PaymentSuccess.tsx (readPayProvider),
 * держать одинаковыми. Хранилище недоступно — экран покажет текст GetCourse,
 * как раньше.
 */
const PAY_PROVIDER_KEY = 'moyritm:pay-provider'

function rememberPayProvider(provider: PayProvider): void {
  try {
    if (provider === 'prodamus') sessionStorage.setItem(PAY_PROVIDER_KEY, provider)
    else sessionStorage.removeItem(PAY_PROVIDER_KEY)
  } catch {
    // Приватный режим без хранилища — не беда, см. выше.
  }
}

/**
 * Переход на страницу оплаты — обычной ссылкой в этой же вкладке. У GetCourse
 * без виджета это единственный путь, с виджетом — запасной; у Продамуса —
 * всегда. Под кнопкой — подсказка про VPN (только GetCourse): в запасном
 * блоке (форма не пришла) заметнее.
 */
function PayLink({
  url,
  note,
  vpn = 'quiet',
  provider = 'getcourse',
}: {
  url: string
  note: string
  vpn?: 'quiet' | 'loud' | 'none'
  provider?: PayProvider
}) {
  const { access } = useSession()
  return (
    <div className="checkout__link">
      <p className="checkout__note">{note}</p>
      <a className="form__submit" href={url} onClick={() => leaveToPay(access, provider)}>
        Перейти к оплате
      </a>
      {vpn !== 'none' && (
        <p className={`checkout__vpn ${vpn === 'loud' ? 'is-loud' : ''}`}>{VPN_HINT}</p>
      )}
    </div>
  )
}

/**
 * Почта не подтверждена, а сервер (старше 12.11.2026) не пускает платить.
 * Новый сервер так не отвечает — блок останется до выкладки бэкенда, потом
 * его можно удалить вместе с kind: 'verify'.
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

/**
 * Мини-ап Telegram: оплаты внутри нет, открываем эту страницу на сайте.
 * Во внешнем браузере человек ещё не вошёл — подсказываем, что входить той же
 * почтой и паролем: иначе он заводил второй аккаунт или бросал оплату.
 */
function InTelegram({ code, email }: { code: string; email: string }) {
  return (
    <div className="checkout__link">
      <p className="checkout__note">
        В Telegram оплата не работает — таковы его правила. Оформите доступ на сайте: этот тариф
        откроется сразу.
      </p>
      <p className="checkout__login">
        Войдите на сайте той же почтой и паролем{email ? <>: <b>{email}</b></> : null}
      </p>
      <button className="form__submit" type="button" onClick={() => openPayOnSite(code)}>
        Оформить на сайте
      </button>
    </div>
  )
}
