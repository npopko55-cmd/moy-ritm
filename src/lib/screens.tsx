/**
 * Экраны, которые грузятся по маршруту.
 *
 * Раньше всё приложение было одним файлом, и гость на лендинге качал и
 * разбирал код плеера, прогресса и профиля. Теперь в основном бандле только
 * лендинг и общие провайдеры, остальное — отдельными кусками по требованию.
 *
 * Код отсчёта и плеера подгружаем заранее (см. preloadWorkout): на слабой
 * сети вход в тренировку не должен ждать скачивания скрипта.
 */

import { lazy, useState, type ComponentType } from 'react'

type Loader = () => Promise<{ default: ComponentType }>

/**
 * Ленивый экран, который не мигает, если его код уже скачан.
 *
 * React.lazy на первом показе всегда уходит в ожидание — даже когда модуль
 * давно загружен предзагрузкой. Поэтому уже загруженный экран рисуем
 * напрямую. Выбор делается один раз на показ: переключись он посреди жизни
 * экрана, React пересоздал бы экран вместе с его состоянием.
 */
function screen(load: Loader): { Screen: ComponentType; preload: () => void } {
  let ready: ComponentType | null = null
  let pending: Promise<{ default: ComponentType }> | null = null

  const get = () =>
    (pending ??= load().then(
      (m) => {
        ready = m.default
        return m
      },
      (e) => {
        // Сеть моргнула — следующая попытка должна скачать заново.
        pending = null
        throw e
      },
    ))

  const Lazy = lazy(get)

  function Screen() {
    const [Loaded] = useState(() => ready)
    return Loaded ? <Loaded /> : <Lazy />
  }

  return { Screen, preload: () => void get().catch(() => undefined) }
}

export const countdown = screen(() => import('../screens/Countdown'))
export const player = screen(() => import('../screens/Player'))
export const login = screen(() => import('../screens/Login'))
export const register = screen(() => import('../screens/Register'))
export const confirmEmail = screen(() => import('../screens/ConfirmEmail'))
export const confirmNewEmail = screen(() => import('../screens/ConfirmNewEmail'))
export const forgotPassword = screen(() => import('../screens/ForgotPassword'))
export const resetPassword = screen(() => import('../screens/ResetPassword'))
export const deleteAccount = screen(() => import('../screens/DeleteAccount'))
export const paymentSuccess = screen(() => import('../screens/PaymentSuccess'))
export const tariffs = screen(() => import('../screens/Tariffs'))
export const settings = screen(() => import('../screens/Settings'))
export const profile = screen(() => import('../screens/Profile'))
export const progress = screen(() => import('../screens/Progress'))
export const help = screen(() => import('../screens/Help'))

/** Отсчёт и плеер — заранее, чтобы «Влиться в поток» не ждало скрипта. */
export function preloadWorkout(): void {
  countdown.preload()
  player.preload()
}
