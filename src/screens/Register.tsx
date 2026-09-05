/**
 * Регистрация.
 *
 * Ответ бэкенда на занятую почту дословно совпадает с ответом на новую —
 * иначе по форме перебором узнают, кто у нас зарегистрирован. Поэтому
 * экрана «такая почта уже занята» здесь нет и быть не может: человек с
 * существующим аккаунтом получит письмо «у тебя уже есть аккаунт».
 *
 * Кнопки «Отправить письмо ещё раз» на экране «Проверьте почту» нет:
 * POST /auth/resend-confirmation требует токен, а сразу после регистрации
 * человек ещё не вошёл. Она живёт там, где действительно нужна — на
 * странице тарифов, где неподтверждённая почта мешает оплатить.
 */

import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, IS_DEMO } from '../api/client'
import { useSession } from '../auth/SessionProvider'
import {
  AccountShell,
  Field,
  Form,
  FormError,
  FormOk,
  MIN_PASSWORD,
  errorText,
  isEmail,
  passwordProblem,
} from './Account'

/** Часовой пояс браузера. Без него «сегодня» в статистике считается неверно. */
const browserTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
  } catch {
    return undefined
  }
}

export default function Register() {
  const [params] = useSearchParams()
  const next = params.get('next')
  const loginNext = next ? `?next=${encodeURIComponent(next)}` : ''
  const { me } = useSession()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [name, setName] = useState('')
  const [bad, setBad] = useState({ email: '', password: '', repeat: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const [resend, setResend] = useState({ ok: '', error: '', busy: false })

  const submit = async () => {
    const problems = {
      email: isEmail(email) ? '' : 'Похоже, в адресе опечатка',
      password: passwordProblem(password),
      repeat: password === repeat ? '' : 'Пароли не совпадают',
    }
    setBad(problems)
    setError('')
    if (problems.email || problems.password || problems.repeat) return

    setBusy(true)
    try {
      await api.register({
        email: email.trim(),
        password,
        name: name.trim() || undefined,
        timezone: browserTimezone(),
      })
      setDone(true)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const sendAgain = async () => {
    setResend({ ok: '', error: '', busy: true })
    try {
      const res = await api.resendConfirmation()
      setResend({ ok: res.message, error: '', busy: false })
    } catch (e) {
      setResend({ ok: '', error: errorText(e), busy: false })
    }
  }

  if (done) {
    return (
      <AccountShell
        title="Проверьте почту"
        lead={
          IS_DEMO
            ? 'В демо-режиме писем нет: почта подтверждена сразу, можно входить.'
            : `Мы отправили письмо на ${email.trim()}. Перейдите по ссылке из него — без подтверждения нельзя оплатить доступ и восстановить пароль.`
        }
      >
        <div className="form__actions">
          <Link className="form__submit" to={`/login${loginNext}`}>
            Войти
          </Link>

          {/* Повторную отправку письма умеет только вошедший: ручка требует
              токен. Если человек уже вошёл — кнопка здесь, если нет — она
              ждёт его на странице тарифов. */}
          {!IS_DEMO && me && !me.user.email_verified && (
            <button
              className="form__second"
              type="button"
              onClick={() => void sendAgain()}
              disabled={resend.busy}
            >
              {resend.busy ? 'Отправляем…' : 'Отправить письмо ещё раз'}
            </button>
          )}
          <FormOk>{resend.ok}</FormOk>
          <FormError>{resend.error}</FormError>
        </div>

        {!IS_DEMO && !me && (
          <p className="account__demo">
            Письмо не пришло? Войдите — на странице тарифов будет кнопка «Отправить письмо ещё
            раз».
          </p>
        )}

        <nav className="account__links">
          <Link to={`/login${loginNext}`}>Войти</Link>
          <Link to="/tariffs">К тарифам</Link>
        </nav>
      </AccountShell>
    )
  }

  return (
    <AccountShell title="Регистрация" lead="Почта и пароль — всё, что нужно для начала.">
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
          autoComplete="new-password"
          error={bad.password}
          hint={`Не короче ${MIN_PASSWORD} символов`}
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
        <Field
          label="Имя"
          value={name}
          onChange={setName}
          autoComplete="given-name"
          hint="Необязательно — так письма будут теплее"
          disabled={busy}
        />

        <div className="form__actions">
          <button className="form__submit" type="submit" disabled={busy}>
            {busy ? 'Создаём…' : 'Зарегистрироваться'}
          </button>
          <FormError>{error}</FormError>
        </div>
      </Form>

      <nav className="account__links">
        <Link to={`/login${loginNext}`}>Уже есть аккаунт</Link>
        <Link to="/forgot-password">Забыли пароль?</Link>
      </nav>

      {IS_DEMO && (
        <p className="account__demo">Демо-режим: данные хранятся только в этом браузере.</p>
      )}
    </AccountShell>
  )
}
