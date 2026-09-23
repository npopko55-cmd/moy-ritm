/**
 * Виджет оплаты GetCourse, встроенный в страницу /pay/<тариф>.
 *
 * Как устроен скрипт виджета (боевой, прочитан 23.09.2026): находит себя по
 * id (`getElementById`), ставит родителю `overflow:hidden`, вставляет перед
 * собой iframe формы и удаляет себя. Адрес iframe — это
 * `…/pl/lite/widget/widget?` + `location.search` нашей страницы, поэтому
 * почта (`sv[email]`) и метки должны лежать в адресе ДО запуска. Высота
 * iframe сначала 0 px: форма присылает её через postMessage, и скрипт ставит
 * её и iframe, и родителю.
 *
 * Сам скрипт запускается по DOMContentLoaded — у одностраничного сайта оно
 * давно прошло — или по событию `StartWidget<id>`. Поэтому после загрузки
 * запускаем его сами: функцией `startWidget<id>`, которую он объявляет, а
 * если её нет — событием. Функция лучше события: каждый заход на страницу
 * добавляет ещё одного слушателя события, и со второго захода виджет
 * запускался бы дважды.
 *
 * Отсюда и разметка: скрипту — свой пустой div, его высоту и overflow виджет
 * меняет сам; скелет и запасная кнопка стоят рядом, а не внутри.
 *
 * Тег <script> создаётся через DOM с двумя атрибутами из ответа сервера, а
 * не вставкой HTML: сервер хранит только адрес и id, проверенные при вводе.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { CheckoutWidget } from '../api/types'
import './GetCourseWidget.css'

/** Сколько ждём форму, прежде чем предложить страницу оплаты GetCourse. */
const WAIT_MS = 10_000

const SCRIPT_PATH = '/pl/lite/widget/script'
const ELEMENT_ID = /^[A-Za-z0-9_-]{1,64}$/

type Stage = 'loading' | 'ready' | 'failed'

type Props = {
  widget: CheckoutWidget
  /** Почта и метки: виджет читает их из адреса страницы. */
  prefill: Record<string, string>
  /** Что показать, если форма не появилась: переход на страницу оплаты. */
  fallback: ReactNode
}

export default function GetCourseWidget({ widget, prefill, fallback }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const [stage, setStage] = useState<Stage>('loading')
  const { src, element_id: id } = widget
  // Строкой, а не объектом: новый объект с теми же данными не должен
  // перезапускать виджет.
  const query = prefillQuery(prefill)

  useEffect(() => {
    const box = host.current
    if (!box) return
    setStage('loading')
    // Сервер проверяет адрес при вводе; здесь — вторая, грубая проверка.
    if (!trusted(src, id)) {
      setStage('failed')
      return
    }

    let alive = true
    // Форма, пришедшая уже после запасной кнопки, тоже покажется, но кнопку
    // не уберёт: человек мог как раз тянуться к ней.
    const finish = (next: 'ready' | 'failed') => {
      if (alive) setStage((now) => (now === 'loading' ? next : now))
    }

    // Почта и метки — в адрес страницы, до запуска виджета. replaceState
    // запроса не делает, почта на наш сервер не уходит, а при уходе со
    // страницы адрес сменится сам. Состояние истории сохраняем: в нём ключ,
    // по которому роутер узнаёт эту запись.
    const { pathname, hash } = window.location
    window.history.replaceState(window.history.state, '', `${pathname}?${query}${hash}`)

    // Готово — когда у iframe появилась высота. Одного появления мало: он
    // вставляется с высотой 0 и растёт, когда форма нарисуется.
    const timer = window.setTimeout(() => finish('failed'), WAIT_MS)
    const observer = new MutationObserver(() => {
      const frame = box.querySelector('iframe')
      if (!frame || frame.offsetHeight === 0) return
      finish('ready')
      observer.disconnect()
      window.clearTimeout(timer)
    })
    observer.observe(box, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style'],
    })

    const script = document.createElement('script')
    script.id = id
    script.src = src
    script.async = true
    script.onload = () => {
      // Страница ещё грузится — виджет запустится сам, по DOMContentLoaded.
      if (!alive || document.readyState === 'loading') return
      try {
        const start = (window as unknown as Record<string, unknown>)[`startWidget${id}`]
        if (typeof start === 'function') start()
        else document.dispatchEvent(new Event(`StartWidget${id}`))
      } catch {
        finish('failed')
      }
    }
    script.onerror = () => finish('failed')
    box.appendChild(script)

    return () => {
      alive = false
      window.clearTimeout(timer)
      observer.disconnect()
      // Следующий запуск начинается с чистого места: без старого iframe и
      // без высоты, которую виджет поставил контейнеру.
      box.textContent = ''
      box.removeAttribute('style')
    }
  }, [src, id, query])

  return (
    <div className="gcw">
      {/* Место виджета: сюда встаёт скрипт, а вместо него — iframe формы. */}
      <div ref={host} className="gcw__host" />

      {stage === 'loading' && <WidgetSkeleton />}
      {stage === 'failed' && fallback}
    </div>
  )
}

/**
 * Скелет формы на время загрузки: три поля, строка согласия и кнопка —
 * примерно той же высоты, что и форма, чтобы страница не прыгала. Им же
 * страница оплаты закрывает место, пока ждёт ответа сервера.
 */
export function WidgetSkeleton() {
  return (
    <div className="gcw__skeleton" role="status">
      <span className="gcw__sk gcw__sk--field" />
      <span className="gcw__sk gcw__sk--field" />
      <span className="gcw__sk gcw__sk--field" />
      <span className="gcw__sk gcw__sk--line" />
      <span className="gcw__sk gcw__sk--button" />
      <span className="gcw__loading">Загружаем форму оплаты…</span>
    </div>
  )
}

/** sv[email]=…&utm_source=…: скобки читаемыми, значения закодированными. */
function prefillQuery(prefill: Record<string, string>): string {
  return Object.entries(prefill)
    .map(([key, value]) => {
      const name = encodeURIComponent(key).replace(/%5B/gi, '[').replace(/%5D/gi, ']')
      return `${name}=${encodeURIComponent(value)}`
    })
    .join('&')
}

/** https и путь скрипта виджета; id — только то, что годится для атрибута. */
function trusted(src: string, id: string): boolean {
  if (!ELEMENT_ID.test(id)) return false
  try {
    const url = new URL(src)
    return url.protocol === 'https:' && url.pathname === SCRIPT_PATH
  } catch {
    return false
  }
}
