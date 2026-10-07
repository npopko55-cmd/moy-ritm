/**
 * Окно регистрации гостя посреди тренировки (заказ Димы 06.10.2026).
 *
 * Полное — на 2:30 движения: героиня на фиолетово-розовом фоне, три пункта
 * и «Попробовать 3 дня бесплатно →». Короткое — повторы: вопрос, строка и
 * «Попробовать бесплатно» / «Продолжить без регистрации». Тексты — Димины,
 * дословно, на «ты».
 *
 * Пока окно открыто, тренировка на паузе — это решает плеер. Здесь только
 * вид и клавиатура: фокус в окне и по кругу внутри, Esc — как крестик.
 * Крестик и «Продолжить без регистрации» — касание: плеер в том же
 * обработчике снимает паузу и разблокирует медиа (continueFlow).
 *
 * Кнопка «Попробовать» остаётся видна без прокрутки на любой высоте: она в
 * нижней полосе окна, а прокручивается, если уж не влезло, только середина.
 */

import { useEffect, useId, useRef } from 'react'
import type { GuestPromptKind } from '../api/types'
import { asset } from '../lib/asset'
import { Bars, Close, InfinityMark, Shield, Sparkle } from './Icons'
import './GuestPrompt.css'

type Props = {
  kind: GuestPromptKind
  /** Крестик, Esc и «Продолжить без регистрации» — тренировка идёт дальше. */
  onClose(): void
  /** «Попробовать…» — на регистрацию. */
  onCta(): void
}

const PERKS = [
  {
    icon: <Sparkle size={20} />,
    tone: 'pink',
    title: 'Открой все движения',
    text: 'Больше разнообразия, чтобы каждый заход был интересным.',
  },
  {
    icon: <Bars size={20} />,
    tone: 'violet',
    title: 'Сохраняй и отслеживай свой прогресс',
    text: 'Время тренировок и шаги — всё будет храниться в твоем аккаунте.',
  },
  {
    icon: <InfinityMark size={22} />,
    tone: 'orange',
    title: 'Тренируйся сколько хочешь',
    text: 'Без ограничений по времени и упражнений',
  },
]

export default function GuestPrompt({ kind, onClose, onCta }: Props) {
  const titleId = useId()
  const sheet = useRef<HTMLDivElement>(null)
  const cta = useRef<HTMLButtonElement>(null)
  const full = kind === 'full'

  // Фокус — на главную кнопку; страница под окном не прокручивается.
  useEffect(() => {
    cta.current?.focus({ preventScroll: true })
    const root = document.documentElement
    const before = root.style.overflow
    root.style.overflow = 'hidden'
    return () => {
      root.style.overflow = before
    }
  }, [])

  // Esc — как крестик; Tab ходит по кругу внутри окна.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !sheet.current) return
      const items = [...sheet.current.querySelectorAll<HTMLElement>('button, a[href]')]
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      const at = document.activeElement
      if (e.shiftKey && (at === first || !sheet.current.contains(at))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (at === last || !sheet.current.contains(at))) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="gp" role="presentation">
      <div
        ref={sheet}
        className={`gp__sheet gp__sheet--${kind}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="gp__hero">
          <img className="gp__heroine" src={asset('/mascot/warmup-poster.webp')} alt="" />
          <button
            type="button"
            className="gp__close"
            onClick={onClose}
            aria-label="Закрыть и продолжить тренировку"
          >
            <Close size={20} />
          </button>
        </div>

        <div className="gp__body">
          {full ? (
            <>
              <h2 id={titleId} className="gp__title">
                Продолжай двигаться в своём ритме ⚡️
              </h2>
              <p className="gp__lead">
                Открой полный доступ к «Моему ритму» на{' '}
                <span className="gp__pill">3 дня бесплатно</span> после регистрации!
              </p>
              <ul className="gp__perks">
                {PERKS.map((p) => (
                  <li key={p.title} className="gp__perk">
                    <span className={`gp__icon gp__icon--${p.tone}`}>{p.icon}</span>
                    <span className="gp__perk-text">
                      <strong>{p.title}</strong>
                      <span>{p.text}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="gp__plate">
                <Shield size={18} />
                <span>
                  <span className="gp__phrase">Без привязки карты ·</span>{' '}
                  <span className="gp__phrase">Без автосписаний</span>
                </span>
              </p>
            </>
          ) : (
            <>
              <h2 id={titleId} className="gp__title">
                Тебе нравится этот ритм? 🔥
              </h2>
              <p className="gp__lead">Открой все движения и продолжай тренировку без ограничений.</p>
              <p className="gp__plate">
                <Shield size={18} />
                <span>
                  <span className="gp__phrase">3 дня бесплатно ·</span>{' '}
                  <span className="gp__phrase">Без привязки карты ·</span>{' '}
                  <span className="gp__phrase">Без автосписаний</span>
                </span>
              </p>
            </>
          )}
        </div>

        <div className="gp__foot">
          <button ref={cta} type="button" className="btn btn--pink-lg gp__cta" onClick={onCta}>
            {full ? 'Попробовать 3 дня бесплатно →' : 'Попробовать бесплатно'}
          </button>
          {!full && (
            <button type="button" className="gp__skip" onClick={onClose}>
              Продолжить без регистрации
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
