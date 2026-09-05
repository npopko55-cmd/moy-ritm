/** Вход. Параметр next возвращает туда, откуда человека увели. */

import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { IS_DEMO } from '../api/client'
import { useSession } from '../auth/SessionProvider'
import { AccountShell, Field, Form, FormError, Waiting, errorText, isEmail } from './Account'

export default function Login() {
  const [params] = useSearchParams()
  const next = params.get('next') || '/'
  const navigate = useNavigate()
  const { me, loading, signIn } = useSession()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [bad, setBad] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (loading) return <Waiting />
  // Уже вошёл — незачем показывать форму: сразу туда, куда шёл.
  if (me) return <Navigate to={next} replace />

  const submit = async () => {
    const problems = {
      email: isEmail(email) ? '' : 'Похоже, в адресе опечатка',
      password: password ? '' : 'Введите пароль',
    }
    setBad(problems)
    setError('')
    if (problems.email || problems.password) return

    setBusy(true)
    try {
      await signIn(email.trim(), password)
      navigate(next, { replace: true })
    } catch (e) {
      setError(errorText(e, 'Неверная почта или пароль'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AccountShell title="Вход" lead="Почта и пароль — и снова в поток.">
      <Form onSubmit={submit}>
        <Field
          label="Почта"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          placeholder="you@example.com"
          error={bad.email}
          autoFocus
          disabled={busy}
        />
        <Field
          label="Пароль"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          error={bad.password}
          disabled={busy}
        />

        <div className="form__actions">
          <button className="form__submit" type="submit" disabled={busy}>
            {busy ? 'Входим…' : 'Войти'}
          </button>
          <FormError>{error}</FormError>
        </div>
      </Form>

      <nav className="account__links">
        <Link to="/forgot-password">Забыли пароль?</Link>
        <Link to={`/register${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}>
          Регистрация
        </Link>
      </nav>

      {IS_DEMO && (
        <p className="account__demo">Демо-режим: данные хранятся только в этом браузере.</p>
      )}
    </AccountShell>
  )
}
