import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { reloadOnce } from './lib/chunkReload'
import { reportSiteVisit } from './lib/funnel'
import { catchInstallPrompt } from './lib/install'
import { screenWaiting } from './lib/screens'
import { applyStandaloneLook } from './lib/standalone'
import { startTelegram } from './lib/telegram'
import './styles/global.css'

// Открыты внутри Telegram — подключаем его скрипт и настраиваем мини-ап.
// Обычному посетителю ничего не качается (src/lib/telegram.ts).
startTelegram()

// Открыты как приложение с экрана «Домой» — полоса с часами белая, а не
// розовая, ещё до первой отрисовки (src/lib/standalone.ts).
applyStandaloneLook()

// Предложение Chrome «Установить приложение» приходит один раз вскоре после
// загрузки — ловим его сразу, чтобы кнопка в настройках («Приложение на
// телефоне») могла его показать и через минуту (src/lib/install.ts).
catchInstallPrompt()

// Вкладка, открытая до выкладки, просит кусок кода, которого уже нет, —
// одна перезагрузка вместо страницы ошибки (src/lib/chunkReload.ts). Только
// когда этот код ждёт экран: сбой фоновой предзагрузки на моргнувшей сети
// страницу не перезагружает. preventDefault — только если перезагрузка
// пошла, иначе ошибка дойдёт до ErrorBoundary.
window.addEventListener('vite:preloadError', (event) => {
  if (screenWaiting() && reloadOnce()) event.preventDefault()
})

// Сторож запуска в index.html ждёт этого флага: код дошёл до отрисовки,
// белого экрана из-за недокачанного куска нет. React рисует не сразу, а
// медленный телефон не должен успеть принять пустой #root за сбой.
window.__moyRitmBooted = true

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

// Заход на сайт для общей статистики админки: отрисовка ответа не ждёт, раз
// в сутки на браузер, ошибки глушатся (src/lib/funnel.ts).
reportSiteVisit()

// Сервис-воркер только в собранном виде: в разработке он бы подсовывал
// старые файлы вместо горячей замены. Регистрируем после load, чтобы не
// отбирать канал у первой отрисовки. Не получилось — и не надо.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const base = import.meta.env.BASE_URL
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => undefined)
  })
}
