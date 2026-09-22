/**
 * Связка с Telegram, которой нужен роутер: системная кнопка «Назад».
 *
 * Вне мини-апа ничего не рисует и ничего не качает. Остальное — готовность,
 * разворот, цвета, запрет свайпа — делается один раз при запуске
 * (startTelegram в main.tsx), роутер для этого не нужен.
 */

import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { IN_TELEGRAM, syncBackButton } from '../lib/telegram'

export default function TelegramBridge() {
  return IN_TELEGRAM ? <BackButtonSync /> : null
}

function BackButtonSync() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  useEffect(() => {
    const back = () => {
      // Номер записи в истории ведёт сам роутер (history.state.idx). Ноль —
      // мини-ап открыли прямо на этой странице, назад по истории некуда:
      // уводим на главную, а не из приложения.
      const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
      if (idx > 0) navigate(-1)
      else navigate('/', { replace: true })
    }
    return syncBackButton(pathname !== '/', back)
  }, [pathname, navigate])

  return null
}
