/**
 * «Забыли пароль».
 *
 * Ответ всегда одинаковый, есть такая почта или нет: иначе форма
 * превращается в проверялку «кто у вас зарегистрирован».
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { AccountShell, Field, Form, FormError, errorText, isEmail } from './Account'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
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
        <Link to="/login">Вспомнил пароль</Link>
        <Link to="/register">Регистрация</Link>
      </nav>
    </AccountShell>
  )
}
