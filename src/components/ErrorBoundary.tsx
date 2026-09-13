/**
 * Последний рубеж: ошибка при отрисовке любого экрана.
 *
 * Без него React снимает всё дерево, и человек видит белый лист без единой
 * кнопки. Вместо этого — обычная служебная страница, как «Проверяем оплату»:
 * карточка на светлом фоне с волнами, без всплывающих окон, и одна кнопка —
 * обновить страницу.
 *
 * Самый частый случай — после выкладки вкладка просит кусок кода, которого
 * на сервере уже нет, — лечится сам: одна автоматическая перезагрузка
 * (src/lib/chunkReload.ts). Страница ошибки тогда не показывается вовсе.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react'
import Logo from './Logo'
import WaveBg from './WaveBg'
import { isChunkLoadError, mayReload, reloadOnce } from '../lib/chunkReload'
import './Logo.css'
import '../screens/Account.css'

type Props = { children: ReactNode }
/** reloading — не скачался кусок кода, и страница сейчас перезагрузится. */
type State = { failed: boolean; reloading: boolean }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, reloading: false }

  static getDerivedStateFromError(error: unknown): State {
    return { failed: true, reloading: isChunkLoadError(error) && mayReload() }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (isChunkLoadError(error) && reloadOnce()) return
    // Перезагрузиться не вышло (уже перезагружались минуту назад) — обычная страница ошибки.
    if (this.state.reloading) this.setState({ reloading: false })
    // В консоль — чтобы при разборе было видно, что именно упало.
    console.error(error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    // Перезагрузка уже идёт — пустой фон, как при подгрузке экрана.
    if (this.state.reloading) return null

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
