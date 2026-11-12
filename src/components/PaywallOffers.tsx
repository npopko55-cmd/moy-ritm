/**
 * Персональные предложения на экране тарифов (решения владельца 12.11.2026,
 * backend/app/services/offer_service.py):
 *
 *   • OfferBanner — действующее предложение над тарифами: цена, честная
 *     зачёркнутая (обычная цена того же срока), отсчёт до конца по часам
 *     сервера и кнопка оплаты. Срок вышел — карточка уходит, цена обычная;
 *   • OfferWheel — колесо при первом заходе: приз выбирает сервер, колесо
 *     лишь подаёт его. Все сектора одинаковые — других призов нет, и про
 *     шансы не пишем ничего;
 *   • ExitOffer — окно при уходе с тарифов без оплаты (один раз): новое
 *     предложение или напоминание о действующем.
 *
 * Тексты — src/data/paywall.ts. Окна — единственные всплывающие на тарифах:
 * их попросил владелец; закрываются крестиком, кнопкой и Escape.
 */

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ExitOfferState, PersonalOffer } from '../api/types'
import { PAYWALL_TEXT as T } from '../data/paywall'
import { rub } from '../data/tariffs'
import { track } from '../lib/analytics'
import { useCountdown } from '../lib/offers'
import { Close } from './Icons'
import './PaywallOffers.css'

/** Действующее предложение над тарифами. */
export function OfferBanner({
  offer,
  onTake,
  onExpired,
}: {
  offer: PersonalOffer
  onTake(offer: PersonalOffer): void
  onExpired(): void
}) {
  const { left, done } = useCountdown(offer.expires_at)

  useEffect(() => {
    if (done) onExpired()
  }, [done, onExpired])

  if (done) return null
  return (
    <section className={`offer offer--${offer.kind}`} aria-label={T.offerTitle[offer.kind]}>
      <div className="offer__body">
        <p className="offer__title">{T.offerTitle[offer.kind]}</p>
        <p className="offer__price">
          <b>{rub(offer.price)}</b>
          {offer.base_price ? <s>{rub(offer.base_price)}</s> : null}
          {offer.saving_percent ? <span className="offer__badge">−{offer.saving_percent}%</span> : null}
        </p>
        <p className="offer__term">
          {T.offerTerm(offer.duration_days)} · {T.perWeek(offer.per_week)}
        </p>
      </div>
      <div className="offer__side">
        <p className="offer__left" role="timer" aria-live="off">
          {T.offerLeft(left)}
        </p>
        <button className="offer__cta" type="button" onClick={() => onTake(offer)}>
          {T.offerCta(offer.price)}
        </button>
      </div>
    </section>
  )
}

/** Окно поверх тарифов: затемнение, карточка, крестик, Escape. */
function Sheet({
  labelledBy,
  onClose,
  children,
}: {
  labelledBy: string
  onClose(): void
  children: React.ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Escape окна не должен дойти до страницы: там он уводит с тарифов.
        e.stopImmediatePropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    box.current?.querySelector<HTMLElement>('button')?.focus()
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  // В body, а не внутри страницы: у детей .tariffs своё position (Tariffs.css),
  // и окно встало бы в поток страницы.
  return createPortal(
    <div className="pwo" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pwo__card" role="dialog" aria-modal="true" aria-labelledby={labelledBy} ref={box}>
        <button className="pwo__close" type="button" onClick={onClose} aria-label="Закрыть">
          <Close size={18} />
        </button>
        {children}
      </div>
    </div>,
    document.body,
  )
}

const SECTORS = 8
/** Оборотов до остановки — чтобы вращение было видно, но недолго. */
const TURNS = 5
const SPIN_MS = 3200

/**
 * Колесо. Сектор приза — верхний: колесо всегда останавливается на нём,
 * потому что приз один и его уже выбрал сервер. Анимацию упрощаем для тех,
 * кто просил меньше движения: колесо просто встаёт на место.
 */
export function OfferWheel({
  onSpin,
  onSkip,
  onTake,
}: {
  onSpin(): Promise<PersonalOffer | null>
  onSkip(): void
  onTake(offer: PersonalOffer): void
}) {
  const titleId = useId()
  const [stage, setStage] = useState<'idle' | 'spinning' | 'won'>('idle')
  const [prize, setPrize] = useState<PersonalOffer | null>(null)
  const [turn, setTurn] = useState(0)

  const spin = async () => {
    if (stage !== 'idle') return
    setStage('spinning')
    track('wheel_spin')
    // Колесо начинает крутиться сразу, ответ сервера приходит по дороге.
    setTurn(TURNS * 360 + 360 / SECTORS / 2)
    const [offer] = await Promise.all([onSpin(), new Promise((r) => window.setTimeout(r, SPIN_MS))])
    if (!offer) {
      onSkip()
      return
    }
    setPrize(offer)
    setStage('won')
  }

  const hours = prize ? Math.max(1, Math.round((Date.parse(prize.expires_at) - Date.now()) / 3_600_000)) : 0

  return (
    <Sheet labelledBy={titleId} onClose={onSkip}>
      {stage !== 'won' ? (
        <>
          <h2 className="pwo__title" id={titleId}>
            {T.wheelTitle}
          </h2>
          <p className="pwo__lead">{T.wheelLead}</p>
          <div className="wheel" aria-hidden="true">
            <span className="wheel__pointer" />
            <div className="wheel__disc" style={{ transform: `rotate(${turn}deg)` }}>
              {Array.from({ length: SECTORS }, (_, i) => (
                <span key={i} className="wheel__label" style={{ transform: `rotate(${(i + 0.5) * (360 / SECTORS)}deg)` }}>
                  <span>{T.wheelSector}</span>
                </span>
              ))}
            </div>
            <span className="wheel__hub" />
          </div>
          <button className="pwo__cta" type="button" onClick={() => void spin()} disabled={stage !== 'idle'}>
            {stage === 'spinning' ? T.wheelSpinning : T.wheelSpin}
          </button>
          <button className="pwo__second" type="button" onClick={onSkip} disabled={stage !== 'idle'}>
            {T.wheelSkip}
          </button>
        </>
      ) : (
        prize && (
          <>
            <h2 className="pwo__title" id={titleId}>
              {T.wheelWonTitle}
            </h2>
            <PrizePrice offer={prize} />
            <p className="pwo__lead">{T.wheelWonHours(hours)}</p>
            <button className="pwo__cta" type="button" onClick={() => onTake(prize)}>
              {T.wheelTake}
            </button>
            <button className="pwo__second" type="button" onClick={onSkip}>
              {T.wheelLater}
            </button>
          </>
        )
      )}
    </Sheet>
  )
}

function PrizePrice({ offer }: { offer: PersonalOffer }) {
  return (
    <p className="pwo__price">
      <b>{rub(offer.price)}</b>
      {offer.base_price ? <s>{rub(offer.base_price)}</s> : null}
      <span className="pwo__term">{T.offerTerm(offer.duration_days)}</span>
    </p>
  )
}

/** Окно при уходе с тарифов: новое предложение или напоминание о действующем. */
export function ExitOffer({
  state,
  onTake,
  onLeave,
}: {
  state: ExitOfferState
  onTake(offer: PersonalOffer): void
  onLeave(): void
}) {
  const titleId = useId()
  const offer = state.offer
  const { left } = useCountdown(offer?.expires_at)

  useEffect(() => {
    track('exit_offer_shown', undefined, { mode: state.mode })
  }, [state.mode])

  if (!offer) return null
  const hours = Math.max(1, Math.round((Date.parse(offer.expires_at) - Date.parse(state.server_time)) / 3_600_000))
  return (
    <Sheet labelledBy={titleId} onClose={onLeave}>
      <h2 className="pwo__title" id={titleId}>
        {state.mode === 'new' ? T.exitNewTitle : T.exitReminderTitle}
      </h2>
      <PrizePrice offer={offer} />
      <p className="pwo__lead">{state.mode === 'new' ? T.exitNewLead(hours) : T.offerLeft(left)}</p>
      <button className="pwo__cta" type="button" onClick={() => onTake(offer)}>
        {T.exitTake}
      </button>
      <button className="pwo__second" type="button" onClick={onLeave}>
        {T.exitLeave}
      </button>
    </Sheet>
  )
}
