/**
 * Регистрация.
 *
 * Новая почта — человек создан и сразу вошёл (бэкенд отдаёт те же токены,
 * что и вход), после чего попадает туда, куда шёл (параметр next — например,
 * к оплате со страницы тарифов), а без него — на главную.
 *
 * Занятая почта — прямо в форме: «Эта почта уже зарегистрирована» и ссылки
 * «Войти» и «Забыли пароль?» (бэкенд отвечает 409 EMAIL_TAKEN). Раньше
 * здесь был экран «Проверьте почту», одинаковый для новой и занятой почты, и
 * тестеры принимали его за успешную регистрацию с новым паролем, хотя
 * работал старый. Почту ссылки уносят в состоянии перехода, не в адресе:
 * на входе и в восстановлении поле уже заполнено.
 *
 * Согласие на обработку персональных данных — отдельная галочка, по
 * умолчанию не отмечена (так требует 152-ФЗ). Без неё — ошибка под ней, и
 * запрос не уходит; с ней в запрос идёт personal_data_consent: true.
 * «Согласие» и «политика обработки персональных данных» — ссылки на страницы
 * сайта в этой же вкладке: в мини-апе другой вкладки нет, а новые вкладки на
 * телефоне теряются. Вернувшись назад, человек видит форму такой, какой
 * оставил, — см. черновик ниже.
 *
 * Ниже — вторая галочка, согласие на рекламные сообщения (/ads-consent,
 * 21.10.2026). Закон о рекламе требует его отдельно и не предотмеченным, а
 * регистрация без него обязана проходить: галочка необязательная, ошибки у
 * неё нет, и значение просто уходит полем ads_consent. Подпись — дословно из
 * документа юристов (пункт 2.3): «Хочу получать рекламные сообщения проекта
 * Мой ритм» со ссылкой на сам документ. Дать или снять согласие потом —
 * переключатель в настройках (карточка «Письма»).
 */

import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { IS_DEMO } from '../api/client'
import { ApiError } from '../api/types'
import { safeNext } from '../auth/guards'
import { useSession } from '../auth/SessionProvider'
import VkLogin from '../components/VkLogin'
import { trackRegister } from '../lib/analytics'
import {
  AccountShell,
  Field,
  Form,
  FormError,
  MIN_PASSWORD,
  emailState,
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
type Draft = {
  email: string
  password: string
  repeat: string
  name: string
  consent: boolean
  /** Согласие на рекламные сообщения — необязательное, по умолчанию пусто. */
  ads: boolean
}
const EMPTY_DRAFT: Draft = {
  email: '',
  password: '',
  repeat: '',
  name: '',
  consent: false,
  ads: false,
}
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
  const { signUp } = useSession()

  const [email, setEmail] = useState(draft.email)
  const [password, setPassword] = useState(draft.password)
  const [repeat, setRepeat] = useState(draft.repeat)
  const [name, setName] = useState(draft.name)
  const [consent, setConsent] = useState(draft.consent)
  const [ads, setAds] = useState(draft.ads)
  const [bad, setBad] = useState({ email: '', password: '', repeat: '', consent: '' })
  const [error, setError] = useState('')
  /** Почта, на которую аккаунт уже есть: под кнопкой — дорога ко входу. */
  const [taken, setTaken] = useState('')
  const takenRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    draft = { email, password, repeat, name, consent, ads }
  }, [email, password, repeat, name, consent, ads])

  // Сообщение встаёт под кнопкой, а на телефоне кнопка — у нижнего края
  // экрана: без прокрутки ссылки «Войти» и «Забыли пароль?» остались бы за
  // краем, и человек решил бы, что ничего не произошло.
  useEffect(() => {
    if (taken) takenRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [taken])

  const changeEmail = (value: string) => {
    setEmail(value)
    // Исправил адрес — «уже зарегистрирована» к новому не относится.
    setTaken('')
  }

  const submit = async () => {
    const problems = {
      email: isEmail(email) ? '' : 'Похоже, в адресе опечатка',
      password: passwordProblem(password),
      repeat: password === repeat ? '' : 'Пароли не совпадают',
      consent: consent ? '' : 'Отметьте согласие — без него зарегистрироваться нельзя',
    }
    setBad(problems)
    setError('')
    setTaken('')
    if (problems.email || problems.password || problems.repeat || problems.consent) return

    const address = email.trim()
    setBusy(true)
    try {
      const res = await signUp({
        email: address,
        password,
        name: name.trim() || undefined,
        timezone: browserTimezone(),
        personal_data_consent: true,
        ads_consent: ads,
      })
      draft = EMPTY_DRAFT
      if (res.status === 'registered') {
        // Цель register для счётчиков рекламы: уходит только имя цели. id
        // человека остаётся в браузере — по нему узнаем его first_workout.
        trackRegister(res.user.id)
        // Человек уже вошёл. Шёл куда-то (гость с тарифов к оплате) — туда;
        // иначе главная встретит его своим и плашкой про подтверждение почты.
        navigate(safeNext(next) ?? '/', { replace: true })
        return
      }
      // Так на занятую почту отвечал бэкенд до 28.09 (check_email) — то же,
      // что нынешний 409.
      setTaken(address)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'EMAIL_TAKEN') {
        draft = EMPTY_DRAFT
        setTaken(address)
      } else {
        setError(errorText(e))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <AccountShell title="Регистрация" lead="Почта и пароль — всё, что нужно для начала.">
      <VkLogin next={safeNext(next) ?? '/'} dividerText="или почтой и паролем" />
      <Form onSubmit={submit}>
        <Field
          label="Почта"
          type="email"
          value={email}
          onChange={changeEmail}
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
            Подробнее — в <Link to="/privacy">политике обработки персональных данных</Link>
          </p>
        </div>

        {/* Согласие на рекламу — отдельное и необязательное: не отмечено, без
            ошибки, регистрация проходит и без него. Подпись — из документа
            юристов (пункт 2.3), ссылка ведёт на сам документ. */}
        <div className="consent">
          <label className="consent__row">
            <input
              className="consent__box"
              type="checkbox"
              checked={ads}
              onChange={(e) => setAds(e.target.checked)}
              disabled={busy}
            />
            <span>
              Хочу получать <Link to="/ads-consent">рекламные сообщения</Link> проекта «Мой ритм»
            </span>
          </label>
          <p className="consent__more">
            Необязательно — регистрация пройдёт и без этого. Отказаться можно в любой момент в
            настройках
          </p>
        </div>

        <div className="form__actions">
          <button className="form__submit" type="submit" disabled={busy}>
            {busy ? 'Создаём…' : 'Зарегистрироваться'}
          </button>
          {taken ? (
            // Не «проверьте почту», а прямо: аккаунт есть, вот вход в него.
            <div ref={takenRef} role="alert">
              <p className="form__error">Эта почта уже зарегистрирована.</p>
              <nav className="form__taken-links">
                <Link to={`/login${loginNext}`} state={emailState(taken)}>
                  Войти
                </Link>
                <Link to="/forgot-password" state={emailState(taken)}>
                  Забыли пароль?
                </Link>
              </nav>
            </div>
          ) : (
            <FormError>{error}</FormError>
          )}
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
