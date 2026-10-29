/**
 * Четыре карточки тарифов с кнопками оплаты и строкой сообщения под ними,
 * а у гостя trial3d перед ними — пятая, «3 дня бесплатно» (FreePlan ниже).
 *
 * Живут на трёх страницах: тарифы, предложение после 10-й тренировки
 * (/offer) и «Бесплатный доступ истёк» (/trial-ended). Разметка, стили и
 * логика выбора — одни на всех, чтобы страницы не разошлись.
 *
 * «Выбрать» ведёт на страницу оплаты /pay/<тариф>: там карточка тарифа и
 * встроенная форма GetCourse. Невошедшего она сама отправит на вход и вернёт
 * обратно, неподтверждённую почту попросит подтвердить.
 *
 * Гость с гостевой ссылки /play/ (владелец, 21.10.2026) приходит сюда из
 * плеера, и аккаунта у него нет — вход ему тупик. Поэтому его «Выбрать»
 * ведёт на регистрацию, а после неё — на ту же /pay/<тариф> (next). Первой
 * карточкой у него — «3 дня бесплатно», если регистрация их правда даст
 * (knownGuestTrialToken / loadGuestTrialToken в src/lib/guest.ts): она ведёт
 * на регистрацию и обратно в плеер, как раньше кнопки гостя в плеере.
 * Вошедшему бесплатной карточки нет никогда — поэтому на /offer и
 * /trial-ended, куда попадают только вошедшие, её и не бывает.
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
import { nextParam } from '../auth/guards'
import { useSession } from '../auth/SessionProvider'
import { rub } from '../data/tariffs'
import { saveFunnelToken } from '../lib/funnel'
import {
  GUEST_REGISTER_PATH,
  knownGuestTrialToken,
  loadGuestTrialToken,
  savedGuestToken,
} from '../lib/guest'
import { cachedTariffs, loadTariffs } from '../lib/tariffs'
import { openPayOnSite, useInTelegram } from '../lib/telegram'
import { errorText } from '../screens/Account'
import { Crown } from './Icons'
import './TariffPlans.css'

export default function TariffPlans() {
  const navigate = useNavigate()
  const { me, access, loading } = useSession()
  const inTelegram = useInTelegram()

  // Невошедший — только когда это известно. Пока сессия грузится, me ещё
  // null и у вошедшего: бесплатная карточка мигнула бы, а «Выбрать» увело бы
  // его на регистрацию.
  const signedOut = !loading && !me

  // Токен гостя trial3d — или null, тогда бесплатной карточки нет. Из плеера
  // ответ guest-bootstrap уже в памяти — карточка стоит с первого кадра;
  // после перезагрузки она появится, когда придёт ответ.
  const [trialToken, setTrialToken] = useState<string | null>(knownGuestTrialToken)

  useEffect(() => {
    if (!signedOut) return
    let alive = true
    void loadGuestTrialToken().then((token) => {
      if (alive) setTrialToken(token)
    })
    return () => {
      alive = false
    }
  }, [signedOut])

  const freePlan = signedOut && trialToken !== null

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
    // Гость с токеном воронки: аккаунта нет — на регистрацию, потом оплата.
    // Токен уже запомнен — его прочитает регистрация.
    else if (signedOut && savedGuestToken()) navigate(`/register${nextParam(`/pay/${code}`)}`)
    else navigate(`/pay/${code}`)
  }

  // «Попробовать бесплатно»: регистрация с токеном воронки и обратно в
  // плеер — тот же адрес, что был у кнопок гостя в плеере. Токен пишем
  // ещё раз: между плеером и этим нажатием его могла стереть другая ссылка.
  const tryFree = () => {
    if (!trialToken) return
    saveFunnelToken(trialToken, true)
    navigate(GUEST_REGISTER_PATH)
  }

  const ctaLabel = inTelegram ? 'Оформить на сайте' : hasAccess(access) ? 'Продлить' : 'Выбрать'

  return (
    <>
      <ul className={`tariffs__plans ${freePlan ? 'has-free' : ''}`}>
        {/* Бесплатная — первой: цены ей не нужны, ждать их она не будет. */}
        {freePlan && <FreePlan onTry={tryFree} />}
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

      {/* Мини-ап: оплата — на сайте, во внешнем браузере, где человек ещё не
          вошёл. Без подсказки он заводил там второй аккаунт или бросал оплату. */}
      {inTelegram && me && (
        <p className="tariffs__site-login">
          Оплата — на сайте. Войдите там той же почтой и паролем: <b>{me.user.email}</b>
        </p>
      )}

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
 * Что даёт регистрация гостя trial3d — только то, что правда откроется:
 * все движения на TRIAL3D_DAYS суток (TRIAL3D_EXERCISES = 0 на бэкенде),
 * минуты копятся в аккаунт (и гостевые туда же), аккаунт — с любого
 * устройства. «Все потоки» не пишем: поток один.
 */
const FREE_POINTS = ['Все движения', 'Прогресс сохраняется', 'На любом устройстве'] as const

/**
 * «3 дня бесплатно» — та же карточка, что у платных, и те же классы: цена
 * «0 ₽», под ней срок вместо «/ месяц», экономии нет — на её месте тот же
 * разделитель. Своё у неё — спокойный фиолетовый тон (не ярче «6 месяцев»
 * с короной и залитой кнопкой) и строка пунктов. На широком экране она
 * лежит полосой над четырьмя платными (TariffPlans.css, .plan--free).
 */
function FreePlan({ onTry }: { onTry(): void }) {
  return (
    <li className="plan plan--free">
      <h2 className="plan__name">3 дня бесплатно</h2>
      <p className="plan__price">{rub(0)}</p>
      <p className="plan__per">3 дня</p>
      <span className="plan__rule" aria-hidden="true" />
      <p className="plan__note">Без привязки карты и автосписаний</p>
      <ul className="plan__points">
        {FREE_POINTS.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <button className="plan__cta" type="button" data-tariff="free" onClick={onTry}>
        Попробовать бесплатно
      </button>
    </li>
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
