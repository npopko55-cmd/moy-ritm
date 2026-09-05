/**
 * Оболочка страниц кабинета: настройки, профиль, прогресс, помощь.
 *
 * Композиция та же, что была у «Настроек»: волны, логотип, кнопка возврата
 * и одна колонка по центру. Всплывающих окон нет нигде — подтверждения
 * живут строкой внутри карточки, а не поверх страницы.
 */

import type { ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { getStream } from '../data/streams'
import Logo from '../components/Logo'
import WaveBg from '../components/WaveBg'
import '../components/Logo.css'
import './Page.css'

/** Из какого потока пришли — чтобы «К тренировке» вернуло в ту же. */
type FromState = { from?: string } | null

/** Куда вернуться с этой страницы: в плеер, если пришли оттуда. */
export function useBack(): { label: string; go: () => void; fromPlayer: boolean } {
  const navigate = useNavigate()
  const { state } = useLocation() as { state: FromState }
  if (state?.from) {
    const stream = getStream(state.from)
    return { label: '← К тренировке', go: () => navigate(`/player/${stream.id}`), fromPlayer: true }
  }
  return { label: '← На главную', go: () => navigate('/'), fromPlayer: false }
}

type Props = {
  title: string
  lead?: ReactNode
  /** Верхняя правая кнопка. Не передали — считаем сами по истории перехода. */
  back?: { label: string; go: () => void }
  /** Шире 760 px: «Мой прогресс» с календарём и графиком. */
  wide?: boolean
  children: ReactNode
}

export default function PageShell({ title, lead, back, wide, children }: Props) {
  const fallback = useBack()
  const exit = back ?? fallback

  return (
    <div className="page">
      <WaveBg opacity={0.85} />

      <header className="page__header">
        <Link to="/" aria-label="На главную">
          <Logo />
        </Link>
        <button className="btn btn--ghost" onClick={exit.go}>
          {exit.label}
        </button>
      </header>

      <main className={`page__main ${wide ? 'page__main--wide' : ''}`}>
        <h1 className="page__title">{title}</h1>
        {lead && <p className="page__lead">{lead}</p>}
        {children}
      </main>
    </div>
  )
}

/** Карточка-раздел. Всё содержимое страниц кабинета лежит в таких. */
export function Card({
  title,
  text,
  children,
}: {
  title?: string
  text?: ReactNode
  children?: ReactNode
}) {
  return (
    <section className="page__card">
      {title && <h2 className="page__card-title">{title}</h2>}
      {text && <p className="page__card-text">{text}</p>}
      {children}
    </section>
  )
}

/** Строка «название — значение» с местом под кнопку справа. */
export function Row({
  label,
  hint,
  children,
}: {
  label: string
  hint?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="page__row">
      <div className="page__row-text">
        <span className="page__row-label">{label}</span>
        {hint && <span className="page__row-hint">{hint}</span>}
      </div>
      {children && <div className="page__row-side">{children}</div>}
    </div>
  )
}

/** Короткий ответ рядом с настройкой: «Сохранено» или что пошло не так. */
export function Note({ kind, children }: { kind: 'ok' | 'bad'; children: ReactNode }) {
  return children ? (
    <p className={`page__note ${kind === 'bad' ? 'is-bad' : ''}`} role={kind === 'bad' ? 'alert' : undefined}>
      {children}
    </p>
  ) : null
}
