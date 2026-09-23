/**
 * Регистрация.
 *
 * Новая почта — человек создан и сразу вошёл (бэкенд отдаёт те же токены,
 * что и вход), после чего попадает туда, куда шёл (параметр next — например,
 * к оплате со страницы тарифов), а без него — на главную.
 *
 * Занятая почта — ответ бэкенда дословно совпадает с обычным «проверьте
 * почту», иначе по форме перебором узнают, кто у нас зарегистрирован.
 * Только в этом случае и остаётся экран ожидания письма.
 *
 * Согласие на обработку персональных данных — отдельная галочка, по
 * умолчанию не отмечена (так требует 152-ФЗ). Без неё — ошибка под ней, и
 * запрос не уходит; с ней в запрос идёт personal_data_consent: true.
 * «Согласие» и «политика конфиденциальности» — ссылки на страницы сайта в
 * этой же вкладке: в мини-апе другой вкладки нет, а новые вкладки на
 * телефоне теряются. Вернувшись назад, человек видит форму такой, какой
 * оставил, — см. черновик ниже.
 */

import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, IS_DEMO } from '../api/client'
import { safeNext } from '../auth/guards'
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

/**
 * Черновик формы — в памяти страницы, не в хранилище. Человек ушёл прочитать
 * согласие или политику и вернулся — поля, пароль и галочка на месте. Только
 * до перезагрузки: на диск пароль не попадает. После отправки черновик
 * стирается.
 */
type Draft = { email: string; password: string; repeat: string; name: string; consent: boolean }
const EMPTY_DRAFT: Draft = { email: '', password: '', repeat: '', name: '', consent: false }
let draft: Draft = EMPTY_DRAFT

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
  const navigate = useNavigate()
  const next = params.get('next')
  const loginNext = next ? `?next=${encodeURIComponent(next)}` : ''
  const { me, signUp } = useSession()

  const [email, setEmail] = useState(draft.email)
  const [password, setPassword] = useState(draft.password)
  const [repeat, setRepeat] = useState(draft.repeat)
  const [name, setName] = useState(draft.name)
  const [consent, setConsent] = useState(draft.consent)
  const [bad, setBad] = useState({ email: '', password: '', repeat: '', consent: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const [resend, setResend] = useState({ ok: '', error: '', busy: false })

  useEffect(() => {
    draft = { email, password, repeat, name, consent }
  }, [email, password, repeat, name, consent])

  const submit = async () => {
    const problems = {
      email: isEmail(email) ? '' : 'Похоже, в адресе опечатка',
      password: passwordProblem(password),
      repeat: password === repeat ? '' : 'Пароли не совпадают',
      consent: consent ? '' : 'Отметьте согласие — без него зарегистрироваться нельзя',
    }
    setBad(problems)
    setError('')
    if (problems.email || problems.password || problems.repeat || problems.consent) return

    setBusy(true)
    try {
      const res = await signUp({
        email: email.trim(),
        password,
        name: name.trim() || undefined,
        timezone: browserTimezone(),
        personal_data_consent: true,
      })
      draft = EMPTY_DRAFT
      if (res.status === 'registered') {
        // Человек уже вошёл. Шёл куда-то (гость с тарифов к оплате) — туда;
        // иначе главная встретит его своим и плашкой про подтверждение почты.
        navigate(safeNext(next) ?? '/', { replace: true })
        return
      }
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
            ? 'В демо-режиме писем нет — просто войдите с этой почтой.'
            : `Мы отправили письмо на ${email.trim()}. Перейдите по ссылке из него — без подтверждения нельзя оплатить доступ.`
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

        {/* Кнопка «Войти» выше — здесь только боковые дороги. */}
        <nav className="account__links">
          <Link to="/tariffs">К тарифам</Link>
          <Link to="/forgot-password">Забыли пароль?</Link>
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

        {/* Согласие — отдельной галочкой, по умолчанию не отмечено. Ссылка
            внутри подписи галочку не переключает: это свой элемент. */}
        <div className={`consent ${bad.consent ? 'is-bad' : ''}`}>
          <label className="consent__row">
            <input
              className="consent__box"
              type="checkbox"
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked)
                if (e.target.checked) setBad((b) => ({ ...b, consent: '' }))
              }}
              disabled={busy}
              aria-invalid={bad.consent ? true : undefined}
              aria-describedby={bad.consent ? 'consent-note' : undefined}
            />
            <span>
              Я даю <Link to="/consent">согласие</Link> на обработку персональных данных
            </span>
          </label>
          {bad.consent && (
            <p id="consent-note" className="field__note is-bad">
              {bad.consent}
            </p>
          )}
          <p className="consent__more">
            Подробнее — в <Link to="/privacy">политике конфиденциальности</Link>
          </p>
        </div>

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
