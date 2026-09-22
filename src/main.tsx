import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { reloadOnce } from './lib/chunkReload'
import { screenWaiting } from './lib/screens'
import { startTelegram } from './lib/telegram'
import './styles/global.css'

// Открыты внутри Telegram — подключаем его скрипт и настраиваем мини-ап.
// Обычному посетителю ничего не качается (src/lib/telegram.ts).
startTelegram()

// Вкладка, открытая до выкладки, просит кусок кода, которого уже нет, —
// одна перезагрузка вместо страницы ошибки (src/lib/chunkReload.ts). Только
// когда этот код ждёт экран: сбой фоновой предзагрузки на моргнувшей сети
// страницу не перезагружает. preventDefault — только если перезагрузка
// пошла, иначе ошибка дойдёт до ErrorBoundary.
window.addEventListener('vite:preloadError', (event) => {
  if (screenWaiting() && reloadOnce()) event.preventDefault()
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      {/* Упал любой экран — служебная страница с кнопкой «Обновить», а не белый лист. */}
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>,
)

// Сервис-воркер только в собранном виде: в разработке он бы подсовывал
// старые файлы вместо горячей замены. Регистрируем после load, чтобы не
// отбирать канал у первой отрисовки. Не получилось — и не надо.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const base = import.meta.env.BASE_URL
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => undefined)
  })
}
