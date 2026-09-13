/**
 * Последний рубеж: ошибка при отрисовке любого экрана.
 *
 * Без него React снимает всё дерево, и человек видит белый лист без единой
 * кнопки. Вместо этого — обычная служебная страница, как «Проверяем оплату»:
 * карточка на светлом фоне с волнами, без всплывающих окон, и одна кнопка —
 * обновить страницу. Она же лечит самый частый случай: после выкладки
 * вкладка просит кусок кода, которого на сервере уже нет.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react'
import Logo from './Logo'
import WaveBg from './WaveBg'
import './Logo.css'
import '../screens/Account.css'

type Props = { children: ReactNode }
type State = { failed: boolean }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // В консоль — чтобы при разборе было видно, что именно упало.
    console.error(error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <div className="account">
        <WaveBg opacity={0.85} />

        <header className="account__header">
          <Logo />
        </header>

        <main className="account__main">
          <section className="account__card">
            <h1 className="account__title">Что-то пошло не так</h1>
            <p className="account__lead">
              Страница споткнулась. Обновите её — ваши минуты и настройки никуда не делись.
            </p>
            <div className="form__actions">
              <button className="form__submit" type="button" onClick={() => window.location.reload()}>
                Обновить страницу
              </button>
            </div>
          </section>
        </main>
      </div>
    )
  }
}
