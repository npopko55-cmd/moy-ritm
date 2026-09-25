/**
 * Оболочка страниц кабинета: настройки, профиль, помощь и служебные
 * страницы (документы, предложение тарифов, конец пробного периода).
 *
 * Композиция та же, что была у «Настроек»: волны, логотип, кнопка возврата
 * и одна колонка по центру. Всплывающих окон нет нигде — подтверждения
 * живут строкой внутри карточки, а не поверх страницы.
 *
 * Страницы-вкладки (`tab`) вместо кнопки возврата показывают вошедшему
 * панель вкладок (src/components/TabBar.tsx): на десктопе — списком под
 * логотипом, ниже 1180 px — внизу экрана. Гостю на «Помощи» вкладки ни к
 * чему — у него прежняя кнопка «← На главную».
 */

import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { homeTarget, useFlowStart } from '../auth/guards'
import { useSession } from '../auth/SessionProvider'
import { useFlow } from '../flow/FlowSession'
import { unlockMedia } from '../media/unlock'
import Logo from '../components/Logo'
import TabBar, { type Tab } from '../components/TabBar'
import WaveBg from '../components/WaveBg'
import '../components/Logo.css'
import './Page.css'

/**
 * Что для этого человека «главная».
 *
 * Для вошедшего — тренировка, всегда на паузе (homeTarget в
 * src/auth/guards.tsx). Лендинг ему уже ничего не рассказывает, он всё это
 * прочитал до регистрации. Для гостя главная прежняя — лендинг.
 */
export function useHome(): string {
  const { me } = useSession()
  const { session: flow } = useFlow()
  return homeTarget(Boolean(me), flow)
}

/**
 * Кнопка возврата страниц без вкладок: «← На главную».
 *
 * Для вошедшего главная — тренировка, поэтому переход идёт через
 * useFlowStart: касание заодно разблокирует ролики и музыку.
 */
export function useBack(): { label: string; go: () => void } {
  const navigate = useNavigate()
  const goFlow = useFlowStart()
  const { me } = useSession()
  const home = useHome()
  return { label: '← На главную', go: () => (me ? goFlow(home) : navigate(home)) }
}

type Props = {
  title: string
  lead?: ReactNode
  /** Кнопка возврата слева. Не передали — «← На главную». */
  back?: { label: string; go: () => void }
  /** Шире 760 px: «Мой прогресс» с календарём и графиком. */
  wide?: boolean
  /** Страница — вкладка приложения: вошедшему вместо кнопки возврата панель вкладок. */
  tab?: Tab
  children: ReactNode
}

export default function PageShell({ title, lead, back, wide, tab, children }: Props) {
  const fallback = useBack()
  const exit = back ?? fallback
  const home = useHome()
  const { me } = useSession()
  const current = me ? tab : undefined

  return (
    <div className={`page ${current ? 'page--tabs' : ''}`}>
      <WaveBg opacity={0.85} />

      {/* Логотип и кнопка возврата стоят вместе у левого края: справа кнопку
          не находили — глаз ищет выход там же, где знак. На страницах-вкладках
          вместо кнопки — панель вкладок: «← К тренировке» стала бы её дублем. */}
      <header className="page__header">
        <Link
          to={home}
          aria-label="На главную"
          // Вошедшего логотип ведёт в тренировку — разблокируем медиа в касании.
          onClick={() => {
            if (home !== '/') unlockMedia()
          }}
        >
          <Logo />
        </Link>
        {current ? (
          <TabBar current={current} dock />
        ) : (
          <button className="btn btn--ghost" onClick={exit.go}>
            {exit.label}
          </button>
        )}
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
