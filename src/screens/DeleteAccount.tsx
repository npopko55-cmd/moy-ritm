/**
 * Удаление аккаунта по ссылке из письма: /delete-account?token=…
 *
 * Ссылка одноразовая и живёт час, поэтому запрос уходит ровно один раз: в
 * StrictMode эффекты прогоняются дважды, и второй вызов сжёг бы токен,
 * показав «ссылка не подошла» на успешном удалении.
 *
 * Входа ручка не требует — письмо часто открывают на телефоне, где человек
 * не залогинен. Но если он всё-таки вошёл в этом браузере, сессию гасим:
 * аккаунта, в котором он сидит, больше нет.
 */

import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { useSession } from '../auth/SessionProvider'
import { AccountShell, errorText } from './Account'

type State = 'work' | 'ok' | 'fail'

export default function DeleteAccount() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const { me, signOut } = useSession()

  const [state, setState] = useState<State>(token ? 'work' : 'fail')
  const [message, setMessage] = useState(
    token ? '' : 'В ссылке нет кода подтверждения. Откройте её из письма целиком',
  )
  const sent = useRef(false)

  useEffect(() => {
    if (!token || sent.current) return
    sent.current = true

    void (async () => {
      try {
        await api.deleteAccountConfirm(token)
        setState('ok')
      } catch (e) {
        setState('fail')
        setMessage(errorText(e))
      }
    })()
  }, [token])

  // Гасим сессию после успеха, а не внутри запроса: сначала ответ, потом
  // выход, иначе экран мигнёт входом.
  useEffect(() => {
    if (state === 'ok' && me) void signOut()
  }, [state, me, signOut])

  if (state === 'work') return <AccountShell title="Удаляем аккаунт…" />

  return (
    <AccountShell
      title={state === 'ok' ? 'Аккаунт удалён' : 'Не получилось'}
      lead={
        state === 'ok'
          ? 'Имя, настройки и статистика тренировок удалены. Почта освободилась — на неё можно зарегистрироваться заново. Записи об оплатах остались обезличенными: это финансовые документы.'
          : message
      }
    >
      <nav className="account__links">
        <Link to="/">На главную</Link>
        {state !== 'ok' && <Link to="/login">Войти</Link>}
      </nav>
    </AccountShell>
  )
}
