/**
 * Нижнее меню — пять вкладок приложения: «Тренировка», «Прогресс»,
 * «Профиль», «Настройки», «Помощь».
 *
 * Одна панель на пять экранов, как в обычном приложении: с вкладки на
 * вкладку и обратно на главную — в тренировку. Текущая вкладка подсвечена.
 * Вид панели — здесь и в TabBar.css (список на десктопе, строка на
 * планшете, панель внизу экрана на телефоне, одни знаки в ландшафте), а где
 * она стоит, решает экран: плеер — своей сеткой, страницы кабинета — под
 * логотипом, а ниже 1180 px прижимают её к низу экрана (`dock`).
 *
 * Экраны вне вкладок — лендинг, вход, отсчёт, экран паузы, тарифы, оплата —
 * панели не показывают.
 */

import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { homeTarget } from '../auth/guards'
import { useSession } from '../auth/SessionProvider'
import { useFlow } from '../flow/FlowSession'
import { GUEST_LOGIN_PATH } from '../lib/guest'
import { unlockMedia } from '../media/unlock'
import { Clock, Gear, Home, Question, User } from './Icons'
import './TabBar.css'

export type Tab = 'workout' | 'progress' | 'profile' | 'settings' | 'help' | 'login'

/**
 * Подписи короткие: пять вкладок встают в одну строку и на 320 px. Полное
 * название — в aria-label и в подсказке (title). Домик — только у
 * «Тренировки», на любом экране.
 */
const TABS: { id: Tab; icon: ReactNode; label: string; title: string; to?: string }[] = [
  { id: 'workout', icon: <Home size={19} />, label: 'Тренировка', title: 'Тренировка' },
  { id: 'progress', icon: <Clock size={19} />, label: 'Прогресс', title: 'Мой прогресс', to: '/progress' },
  { id: 'profile', icon: <User size={19} />, label: 'Профиль', title: 'Профиль', to: '/profile' },
  { id: 'settings', icon: <Gear size={19} />, label: 'Настройки', title: 'Настройки', to: '/settings' },
  { id: 'help', icon: <Question size={19} />, label: 'Помощь', title: 'Нужна помощь?', to: '/help' },
]

/**
 * Гость (ссылка /play/): кабинета у него нет — «Прогресс», «Профиль» и
 * «Настройки» требуют входа. Вместо них «Войти»: вход вернёт его в плеер,
 * а набранные гостем минуты перейдут в аккаунт (src/lib/guest.ts).
 */
const GUEST_TABS: typeof TABS = [
  TABS[0],
  { id: 'login', icon: <User size={19} />, label: 'Войти', title: 'Войти или зарегистрироваться', to: GUEST_LOGIN_PATH },
]

type Props = {
  /** Вкладка этого экрана — подсвечена и никуда не уводит. */
  current: Tab
  /** Страницы кабинета: ниже 1180 px панель прижата к низу экрана. */
  dock?: boolean
  /** Класс для раскладки экрана: плеер ставит панель своей сеткой. */
  className?: string
  /** Гость: «Тренировка» и «Войти» вместо вкладок кабинета. */
  guest?: boolean
}

export default function TabBar({ current, dock = false, className = '', guest = false }: Props) {
  const { me } = useSession()
  const { pathname } = useLocation()
  const { session: flow } = useFlow()

  return (
    <ul className={`tabbar ${dock ? 'tabbar--dock' : ''} ${className}`}>
      {(guest ? GUEST_TABS : TABS).map((tab) => {
        const on = tab.id === current
        // «Тренировка» — главная: плеер на паузе, с кнопкой «Играть».
        // У гостя «Тренировка» — его же плеер: главная звала бы на вход.
        const to = tab.to ?? (guest ? pathname : homeTarget(Boolean(me), flow))
        return (
          <li key={tab.id}>
            <Link
              className={`tabbar__item ${on ? 'is-on' : ''}`}
              to={to}
              aria-current={on ? 'page' : undefined}
              aria-label={tab.title}
              title={tab.title}
              onClick={(e) => {
                // Своя вкладка никуда не ведёт — только возвращает
                // прокрученную страницу наверх.
                if (on) {
                  e.preventDefault()
                  window.scrollTo(0, 0)
                  return
                }
                // В тренировку — разблокируем ролики и музыку, пока касание
                // ещё идёт: «Играть» там запустит их уже без отказа.
                if (tab.id === 'workout') unlockMedia()
              }}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
