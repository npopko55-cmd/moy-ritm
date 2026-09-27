/**
 * «Забыли пароль».
 *
 * Ответ всегда одинаковый, есть такая почта или нет: иначе форма
 * превращается в проверялку «кто у вас зарегистрирован».
 *
 * Пришёл с регистрации, где почта оказалась занятой, — она уже в поле
 * (состояние перехода, src/screens/Account.tsx).
 */

import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api } from '../api/client'
import {
  AccountShell,
  Field,
  Form,
  FormError,
  emailFromState,
  errorText,
  isEmail,
} from './Account'

export default function ForgotPassword() {
  const location = useLocation()
  const [email, setEmail] = useState(() => emailFromState(location.state))
  const [bad, setBad] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState('')

  const submit = async () => {
    const problem = isEmail(email) ? '' : 'Похоже, в адресе опечатка'
    setBad(problem)
    setError('')
    if (problem) return

    setBusy(true)
    try {
      const res = await api.forgotPassword(email.trim())
      setSent(res.message)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <AccountShell
        title="Письмо отправлено"
        lead={`${sent}. Ссылка работает 30 минут и только один раз.`}
      >
        <nav className="account__links">
          <Link to="/login">Войти</Link>
          <Link to="/">На главную</Link>
        </nav>
      </AccountShell>
    )
  }

  return (
    <AccountShell
      title="Забыли пароль"
      lead="Введите почту — пришлём ссылку, по которой можно задать новый."
    >
      <Form onSubmit={submit}>
        <Field
          label="Почта"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          placeholder="you@example.com"
          error={bad}
          autoFocus
          disabled={busy}
        />

        <div className="form__actions">
          <button className="form__submit" type="submit" disabled={busy}>
            {busy ? 'Отправляем…' : 'Прислать ссылку'}
          </button>
          <FormError>{error}</FormError>
        </div>
      </Form>

      <nav className="account__links">
        <Link to="/login">Вспомнили пароль</Link>
        <Link to="/register">Регистрация</Link>
      </nav>
    </AccountShell>
  )
}
