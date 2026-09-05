/**
 * Подтверждение новой почты: /confirm-new-email?token=…
 *
 * Ссылка приходит на новый адрес, уведомление — на старый. До перехода сюда
 * вход остаётся по старой почте.
 */

import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { useSession } from '../auth/SessionProvider'
import { AccountShell, errorText } from './Account'

type State = 'work' | 'ok' | 'fail'

export default function ConfirmNewEmail() {
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
        const res = await api.confirmNewEmail(token)
        setState('ok')
        setMessage(res.message)
        await reload()
      } catch (e) {
        setState('fail')
        setMessage(errorText(e))
      }
    })()
  }, [token, reload])

  if (state === 'work') return <AccountShell title="Меняем почту…" />

  return (
    <AccountShell
      title={state === 'ok' ? 'Новая почта подтверждена' : 'Не получилось'}
      lead={state === 'ok' ? 'Теперь вход и письма идут на новый адрес.' : message}
    >
      <nav className="account__links">
        {me ? <Link to="/settings">К настройкам</Link> : <Link to="/login">Войти</Link>}
        <Link to="/">На главную</Link>
      </nav>
    </AccountShell>
  )
}
