/**
 * «Отправить письмо ещё раз» — повторное письмо для подтверждения почты.
 *
 * Кнопка живёт в трёх местах: плашка на главной, сообщение на тарифах и
 * строка «Почта» в профиле. Логика у всех одна, поэтому она здесь, а вид
 * каждый экран рисует сам.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { useSession } from '../auth/SessionProvider'
import { errorText } from '../screens/Account'

/**
 * Сколько после успешной отправки кнопка стоит неактивной. Сервер и сам
 * ограничивает частоту, но лишние нажатия лучше не пускать до него.
 */
const COOLDOWN_MS = 60_000

export type ResendConfirmation = {
  busy: boolean
  /** Ответ сервера после успешной отправки. */
  ok: string
  error: string
  /** Письмо только что ушло: идёт минута, в которую повторять незачем. */
  sent: boolean
  send: () => Promise<void>
}

export function useResendConfirmation(): ResendConfirmation {
  const { reload } = useSession()
  const [state, setState] = useState({ busy: false, ok: '', error: '' })
  const [sent, setSent] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const send = useCallback(async () => {
    setState({ busy: true, ok: '', error: '' })
    try {
      const res = await api.resendConfirmation()
      setState({ busy: false, ok: res.message, error: '' })
      setSent(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setSent(false), COOLDOWN_MS)
      // Перечитываем профиль: почту могли подтвердить в соседней вкладке,
      // пока человек был здесь. В демо кнопка подтверждает её сама — строка
      // про подтверждение пропадает сразу.
      await reload()
    } catch (e) {
      setState({ busy: false, ok: '', error: errorText(e) })
    }
  }, [reload])

  return { ...state, sent, send }
}
