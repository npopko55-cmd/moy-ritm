/**
 * Новый пароль по ссылке из письма: /reset-password?token=…
 *
 * Сброс отзывает все сессии, включая текущую, поэтому после успеха ведём на
 * вход, а не в приложение: старый токен уже недействителен.
 */

import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { useSession } from '../auth/SessionProvider'
import {
  AccountShell,
  Field,
  Form,
  FormError,
  MIN_PASSWORD,
  errorText,
  passwordProblem,
} from './Account'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const { signOut } = useSession()

  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [bad, setBad] = useState({ password: '', repeat: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const submit = async () => {
    const problems = {
      password: passwordProblem(password),
      repeat: password === repeat ? '' : 'Пароли не совпадают',
    }
    setBad(problems)
    setError('')
    if (problems.password || problems.repeat) return

    setBusy(true)
    try {
      await api.resetPassword(token, password)
      // Сессии отозваны сервером — гасим и своё состояние, чтобы шапка не
      // показывала вошедшего с уже мёртвым токеном.
      await signOut().catch(() => undefined)
      setDone(true)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  if (!token) {
    return (
      <AccountShell
        title="Ссылка не подошла"
        lead="В адресе нет кода. Откройте ссылку из письма целиком или запросите новую."
      >
        <nav className="account__links">
          <Link to="/forgot-password">Прислать ссылку заново</Link>
          <Link to="/login">Войти</Link>
        </nav>
      </AccountShell>
    )
  }

  if (done) {
    return (
      <AccountShell
        title="Пароль изменён"
        lead="Все устройства вышли из аккаунта — так надёжнее. Войдите с новым паролем."
      >
        <nav className="account__links">
          <Link to="/login">Войти</Link>
          <Link to="/">На главную</Link>
        </nav>
      </AccountShell>
    )
  }

  return (
    <AccountShell title="Новый пароль" lead="Придумайте пароль, который не жалко запомнить.">
      <Form onSubmit={submit}>
        <Field
          label="Новый пароль"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          error={bad.password}
          hint={`Не короче ${MIN_PASSWORD} символов`}
          autoFocus
          disabled={busy}
        />
        <Field
          label="Пароль ещё раз"
          type="password"
          value={repeat}
          onChange={setRepeat}
          autoComplete="new-password"
          error={bad.repeat}
          disabled={busy}
        />

        <div className="form__actions">
          <button className="form__submit" type="submit" disabled={busy}>
            {busy ? 'Сохраняем…' : 'Задать пароль'}
          </button>
          <FormError>{error}</FormError>
        </div>
      </Form>

      <nav className="account__links">
        <Link to="/forgot-password">Прислать ссылку заново</Link>
        <Link to="/login">Войти</Link>
      </nav>
    </AccountShell>
  )
}
