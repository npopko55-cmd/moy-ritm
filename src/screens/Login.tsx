/**
 * Вход. Параметр next возвращает туда, откуда человека увели.
 *
 * Пришёл с регистрации, где почта оказалась занятой, — почта уже в поле
 * (состояние перехода, src/screens/Account.tsx), и курсор сразу в пароле.
 */

import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { IS_DEMO } from '../api/client'
import { safeNext } from '../auth/guards'
import { useSession } from '../auth/SessionProvider'
import VkLogin from '../components/VkLogin'
import { cameFromMiniApp } from '../lib/telegram'
import {
  AccountShell,
  Field,
  Form,
  FormError,
  OFFLINE_WAITING,
  Waiting,
  emailFromState,
  errorText,
  isEmail,
} from './Account'

export default function Login() {
  const [params] = useSearchParams()
  const next = safeNext(params.get('next')) ?? '/'
  const navigate = useNavigate()
  const location = useLocation()
  const { me, loading, offline, signIn } = useSession()

  // Почта пришла готовой — фокус сразу в пароль. Считается один раз, при открытии.
  const [prefilled] = useState(() => emailFromState(location.state))
  // Сайт открыли из мини-апа кнопкой «Оформить на сайте»: аккаунт у человека
  // уже есть, в Telegram. Подсказываем входить им, а не заводить второй.
  const [fromMiniApp] = useState(cameFromMiniApp)
  const [email, setEmail] = useState(prefilled)
  const [password, setPassword] = useState('')
  const [bad, setBad] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (loading) return <Waiting text={offline ? OFFLINE_WAITING : undefined} />
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
    <AccountShell
      title="Вход"
      lead={fromMiniApp ? 'Та же почта и пароль, что в Telegram.' : 'Почта и пароль — и снова в поток.'}
    >
      <VkLogin next={next} />
      <Form onSubmit={submit}>
        <Field
          label="Почта"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          placeholder="you@example.com"
          error={bad.email}
          autoFocus={!prefilled}
          disabled={busy}
        />
        <Field
          label="Пароль"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          error={bad.password}
          autoFocus={Boolean(prefilled)}
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
