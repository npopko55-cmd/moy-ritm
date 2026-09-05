/**
 * Подтверждение почты по ссылке из письма: /confirm-email?token=…
 *
 * Ссылка одноразовая, поэтому запрос уходит ровно один раз: в StrictMode
 * эффекты прогоняются дважды, и второй вызов сжёг бы токен, показав
 * «ссылка не подошла» на успешном подтверждении.
 */

import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { useSession } from '../auth/SessionProvider'
import { AccountShell, errorText } from './Account'

type State = 'work' | 'ok' | 'fail'

export default function ConfirmEmail() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const { me, reload } = useSession()

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
        const res = await api.confirmEmail(token)
        setState('ok')
        setMessage(res.message)
        // Вошедшему обновляем профиль: email_verified должен стать true
        // без перезагрузки страницы.
        await reload()
      } catch (e) {
        setState('fail')
        setMessage(errorText(e))
      }
    })()
  }, [token, reload])

  if (state === 'work') return <AccountShell title="Подтверждаем почту…" />

  return (
    <AccountShell
      title={state === 'ok' ? 'Почта подтверждена' : 'Не получилось'}
      lead={
        state === 'ok'
          ? 'Теперь можно оплатить доступ и восстановить пароль, если он потеряется.'
          : message
      }
    >
      <nav className="account__links">
        {me ? <Link to="/tariffs">К тарифам</Link> : <Link to="/login">Войти</Link>}
        <Link to="/">На главную</Link>
      </nav>
    </AccountShell>
  )
}
