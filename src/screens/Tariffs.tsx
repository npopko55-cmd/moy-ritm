import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import LegalLinks from '../components/LegalLinks'
import Logo from '../components/Logo'
import { ExitOffer, OfferBanner, OfferWheel } from '../components/PaywallOffers'
import { SubscriptionPromo } from '../components/SubscriptionPromo'
import TariffPlans from '../components/TariffPlans'
import WaveBg from '../components/WaveBg'
import {
  Clock,
  Close,
  Leaf,
  Phone,
  PlayCircle,
  Shield,
  Smile,
  Bolt,
} from '../components/Icons'
import { hasAccess, type ExitOfferState, type PersonalOffer } from '../api/types'
import { useSession } from '../auth/SessionProvider'
import { track, trackOpenTariffs, trackPayClick } from '../lib/analytics'
import { formatDate } from '../lib/date'
import { useOffers } from '../lib/offers'
import { openPayOnSite, useInTelegram } from '../lib/telegram'
import { RENEW_TITLE_ACCENT, RENEW_TITLE_LEAD } from '../lib/tariffs'
import { EXTRA_MOVES_LABEL } from '../lib/trial'
import '../components/Logo.css'
import './Tariffs.css'

/**
 * Что входит в подписку — строка под заголовком.
 *
 * Первый пункт — сколько движений добавит оплата, числом: так попросил
 * владелец вместо «Все движения без ограничений». «Все новые движения» и
 * «Всё, что появится дальше» он же попросил убрать. Серверный список
 * features страница не выводит — текст пунктов живёт здесь.
 *
 * Пункт о том, что деньги сами не спишутся, владелец убрал 29.09.2026:
 * писать об этом не нужно. Ряд рассчитан на три колонки, поэтому на его
 * месте — доступ, который открывается сам: та же строка с часами, что и в
 * карточке на /pay. Не «сразу»: по оферте обычно это несколько минут,
 * изредка до часа.
 */
const PERKS = [
  { icon: <PlayCircle size={19} />, tone: 'pink', text: `${EXTRA_MOVES_LABEL}\nи больше разнообразия` },
  { icon: <Phone size={19} />, tone: 'blue', text: 'На любом\nустройстве' },
  { icon: <Clock size={19} />, tone: 'pink', text: 'Доступ открывается\nсам после оплаты' },
] as const

/** Нижний ряд: почему это стоит своих денег. */
const FACTS = [
  { icon: <Bolt size={19} />, tone: 'pink', title: 'Больше энергии', text: 'Всего несколько минут в день' },
  { icon: <Smile size={19} />, tone: 'violet', title: 'Движение в удовольствие', text: 'Под любимую музыку' },
  { icon: <Leaf size={19} />, tone: 'green', title: 'Забота о здоровье', text: 'Лёгкий способ быть в хорошей форме' },
  {
    icon: <Shield size={19} />,
    tone: 'blue',
    title: 'Безопасная оплата',
    text: 'Оплата через GetCourse, чек придёт на почту',
  },
] as const

export default function Tariffs() {
  const navigate = useNavigate()
  const { key } = useLocation()
  const { me, access } = useSession()
  const inTelegram = useInTelegram()

  // Открыли тарифы — цель для Метрики и VK Ads, один раз на открытие.
  useEffect(() => {
    trackOpenTariffs()
  }, [])

  // Персональные предложения (src/lib/offers.ts) — только вошедшему: срок и
  // цену держит сервер. Гостю и при выключенных на сервере — пусто.
  const offers = useOffers(Boolean(me))
  const [exitState, setExitState] = useState<ExitOfferState | null>(null)
  const leaving = useRef(false)
  // Окно ухода открыл крестик или Escape (тогда «уйти» уводит со страницы)
  // или курсор, ушедший за верх окна (тогда «уйти» просто закрывает окно).
  const exitByClose = useRef(false)

  // Колесо открыто, пока его не закрыли: после вращения сервер уже отвечает
  // wheel: false, а окно должно показать приз.
  const [wheelOpen, setWheelOpen] = useState(false)
  useEffect(() => {
    if (offers.state?.wheel) setWheelOpen(true)
  }, [offers.state?.wheel])

  // Владелец не хотел всплывающих окон, поэтому тарифы — страница, а не
  // модалка. Окна здесь — только колесо и предложение при уходе: их он
  // попросил 12.11.2026. Крестик и Escape ведут туда, откуда пришли; при
  // прямом заходе истории нет (ключ 'default') — тогда на главную.
  const goBack = useCallback(
    () => (key === 'default' ? navigate('/') : navigate(-1)),
    [key, navigate],
  )

  // Уход с тарифов без оплаты: один раз сервер покажет предложение (новое
  // или напоминание о действующем). Нечего показать — просто уходим.
  const close = useCallback(async () => {
    if (!offers.state?.exit || leaving.current) return goBack()
    leaving.current = true
    exitByClose.current = true
    const state = await offers.leave()
    if (state?.offer) setExitState(state)
    else goBack()
  }, [offers, goBack])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  // На компьютере уход — это и курсор, ушедший за верх окна (к вкладкам и
  // адресной строке). Только пока предложение при уходе вообще положено.
  useEffect(() => {
    if (!offers.state?.exit) return
    const onOut = (e: MouseEvent) => {
      if (e.relatedTarget === null && e.clientY <= 0 && !leaving.current) {
        leaving.current = true
        void offers.leave().then((state) => {
          if (state?.offer) setExitState(state)
        })
      }
    }
    document.addEventListener('mouseout', onOut)
    return () => document.removeEventListener('mouseout', onOut)
  }, [offers])

  // Оплата по предложению: та же страница оплаты, что у обычных тарифов, но
  // с кодом скрытого тарифа — сервер пустит туда только с этим предложением.
  const take = useCallback(
    (offer: PersonalOffer) => {
      track('offer_accept', undefined, { kind: offer.kind })
      trackPayClick()
      if (inTelegram) openPayOnSite(offer.tariff_code)
      else navigate(`/pay/${offer.tariff_code}`)
    },
    [inTelegram, navigate],
  )

  const spin = useCallback(async () => (await offers.spin())?.offer ?? null, [offers])

  const paid = hasAccess(access)
  const offer = offers.state?.offer ?? null

  return (
    <div className="tariffs">
      <WaveBg opacity={0.85} />

      <div className="tariffs__card">
        <button className="tariffs__close" onClick={() => void close()} aria-label="Закрыть и вернуться">
          <Close size={20} />
        </button>

        {/* Строка состояния доступа. Её нет у того, кто ни разу не платил и
            пришёл сюда сам: показывать нечего. */}
        {paid && access?.paid_until && (
          <p className="tariffs__access">
            Доступ до {formatDate(access.paid_until)}
            {access.tariff && ` · тариф ${access.tariff.name}`}
          </p>
        )}

        <header className="tariffs__head">
          <div className="tariffs__intro">
            <Logo />

            {/* Доступ есть, кончается или идёт grace — это продление: сюда
                ведёт и «Продлить» из плеера. Заголовок — правка тестировщицы
                (04.11.2026), RENEW_TITLE. Кто ещё не покупал (и у кого доступ
                уже совсем истёк — status expired), видит прежний. */}
            {paid ? (
              <h1 className="tariffs__title">
                {RENEW_TITLE_LEAD}
                <br />
                <span className="tariffs__title-accent">{RENEW_TITLE_ACCENT}</span>
              </h1>
            ) : (
              <h1 className="tariffs__title">
                Откройте больше
                <br />
                <span className="tariffs__title-accent">движений!</span>
              </h1>
            )}

            <p className="tariffs__lead">Все движения и всё новое — сразу ваши.</p>
          </div>

        </header>

        <ul className="tariffs__perks">
          {PERKS.map((p) => (
            <li key={p.text} className="perk">
              <span className={`perk__icon perk__icon--${p.tone}`}>{p.icon}</span>
              <span className="perk__text">{p.text}</span>
            </li>
          ))}
        </ul>

        {/* Подписка Продамуса (пробный за 1 ₽, месяц с автопродлением, год
            для подписчика) — плашкой над карточками; выключена — пусто. */}
        <SubscriptionPromo />

        {/* Действующее персональное предложение: цена, честная зачёркнутая
            и настоящий отсчёт. Срок вышел — карточка уходит, цены обычные. */}
        {offer && <OfferBanner offer={offer} onTake={take} onExpired={offers.refresh} />}

        {/* Карточки, оплата и строка сообщения — общий компонент: те же
            карточки стоят на /offer и /trial-ended. */}
        <TariffPlans />

        <ul className="tariffs__facts">
          {FACTS.map((f) => (
            <li key={f.title} className="fact">
              <span className={`fact__icon fact__icon--${f.tone}`}>{f.icon}</span>
              <span className="fact__body">
                <span className="fact__title">{f.title}</span>
                <span className="fact__text">{f.text}</span>
              </span>
            </li>
          ))}
        </ul>

        <p className="tariffs__hand tariffs__hand--footer">Движение — это забота о себе ♡</p>

        {/* Подвал с документами — последней строкой карточки. */}
        <LegalLinks className="tariffs__legal" />
      </div>

      {wheelOpen && !exitState && (
        <OfferWheel
          onSpin={spin}
          onSkip={() => {
            setWheelOpen(false)
            offers.skipWheel()
          }}
          onTake={take}
        />
      )}
      {exitState && (
        <ExitOffer
          state={exitState}
          onTake={take}
          onLeave={() => {
            setExitState(null)
            if (exitByClose.current) goBack()
          }}
        />
      )}
    </div>
  )
}
