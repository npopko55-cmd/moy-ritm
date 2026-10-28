/**
 * Ряд потоков над кругом плеера — вместо мотивационных фраз (макет Димы
 * 14.10.2026). Данные — src/data/streamSwitcher.ts.
 *
 * Активная пилюля — поток, который играет сейчас: розово-оранжевая, текст
 * белый. Неактивные — белые, приглушённые, с пометкой «скоро». Нажатие на
 * них ничего не переключает: под рядом на пару секунд появляется строка
 * «Этот поток скоро откроем». Это строка в ряду, а не окно — всплывающих
 * окон в продукте нет. Она же — aria-live: экранный диктор её прочтёт.
 *
 * Включённый поток (enabled: true) зовёт onOpen с id потока, а куда вести —
 * решает плеер: у вошедшего это сразу тренировка нового потока, без отсчёта.
 *
 * Где ряд стоит и какой он высоты, решает Player.css (.stage__top): от его
 * высоты считается размер круга. Здесь — только сами пилюли.
 */

import { useEffect, useRef, useState } from 'react'
import { STREAM_SWITCHES, type StreamSwitch } from '../data/streamSwitcher'
import './StreamSwitcher.css'

/** Сколько висит строка «Этот поток скоро откроем». */
const HINT_MS = 2600

type Props = {
  /** id потока, который играет сейчас (stream.id в плеере). */
  current: string
  /** Нажали включённый поток, отличный от текущего. */
  onOpen: (streamId: string) => void
}

export default function StreamSwitcher({ current, onOpen }: Props) {
  const [hint, setHint] = useState(false)
  const timer = useRef<number | null>(null)

  // Ушли из плеера, пока строка на экране, — таймер больше не нужен.
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )

  /** Строка «скоро» — на HINT_MS; повторное нажатие продлевает её заново. */
  const showSoon = () => {
    setHint(true)
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = null
      setHint(false)
    }, HINT_MS)
  }

  const press = (item: StreamSwitch) => {
    // Текущий поток и так играет: нажатие на него ничего не делает.
    if (item.streamId === current) return
    if (!item.enabled || !item.streamId) {
      showSoon()
      return
    }
    onOpen(item.streamId)
  }

  return (
    <nav className="streams" aria-label="Потоки">
      {/* Ряд прокручивается вбок, когда пилюлям не хватает ширины: на
          телефоне всегда, на узком ноутбуке — иногда. Полосы прокрутки не
          видно, на телефоне край последней пилюли подсказывает, что ряд
          листается. */}
      <div className="streams__row">
        {STREAM_SWITCHES.map((item) => {
          const active = item.streamId === current
          const soon = !item.enabled || !item.streamId
          return (
            <button
              key={item.key}
              type="button"
              className={`streams__pill${active ? ' is-active' : ''}${soon ? ' is-soon' : ''}`}
              // Активный — «текущий» для диктора; неактивный — «недоступен»,
              // но не disabled: нажатие должно дойти и показать строку «скоро».
              aria-current={active ? 'true' : undefined}
              aria-disabled={soon ? true : undefined}
              onClick={() => press(item)}
            >
              <span className="streams__emoji" aria-hidden="true">
                {item.emoji}
              </span>
              <span className="streams__text">
                <strong>{item.title}</strong>
                <span>{item.subtitle}</span>
              </span>
              {soon && <span className="streams__soon">скоро</span>}
            </button>
          )
        })}
      </div>

      {/* Элемент живёт всегда, меняется только текст: aria-live озвучивает
          изменения в уже существующем элементе, а не появление нового. */}
      <p className={`streams__hint${hint ? ' is-on' : ''}`} aria-live="polite">
        {hint ? 'Этот поток скоро откроем' : ''}
      </p>
    </nav>
  )
}
