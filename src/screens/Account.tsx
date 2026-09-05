/**
 * Общая оболочка экранов учётной записи: вход, регистрация, подтверждение
 * почты, восстановление пароля.
 *
 * Композиция та же, что у «Настроек» и «Тарифов»: карточка по центру
 * светлого фона с волнами. Всплывающих окон нет нигде — владелец их
 * запретил, поэтому и ошибки живут строкой под полем, а не в модалке.
 */

import { useId, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../api/types'
import Logo from '../components/Logo'
import WaveBg from '../components/WaveBg'
import '../components/Logo.css'
import './Account.css'

export const MIN_PASSWORD = 8
export const MAX_PASSWORD = 128

/** «через 12 минут» / «через 40 секунд» — как человек и говорит. */
export function retryText(seconds?: number): string {
  if (!seconds || seconds < 1) return 'чуть позже'
  if (seconds < 90) return `через ${seconds} сек`
  return `через ${Math.ceil(seconds / 60)} мин`
}

/**
 * Текст ошибки для строки под кнопкой.
 *
 * Опираемся на `code`, а не на сообщение: тексты бэкенда будут меняться.
 * Там, где менять нечего, показываем его сообщение — оно написано для
 * человека и уже по-русски.
 */
export function errorText(e: unknown, fallback = 'Не получилось. Попробуйте ещё раз'): string {
  if (!(e instanceof ApiError)) return fallback
  switch (e.code) {
    case 'NETWORK':
      return e.message
    case 'LOGIN_TEMPORARILY_BLOCKED':
      return `Слишком много попыток входа. Попробуйте ${retryText(e.retry_after)}`
    case 'RATE_LIMIT_EXCEEDED':
      return `Слишком часто. Попробуйте ${retryText(e.retry_after)}`
    case 'INVALID_TOKEN':
      return 'Ссылка не подошла: она одноразовая и живёт недолго. Запросите новую'
    default:
      return e.message || fallback
  }
}

/** Проверка почты нарочно мягкая: строгую всё равно делает сервер. */
export const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim())

/** Что не так с паролем. Пустая строка — всё в порядке. */
export function passwordProblem(value: string): string {
  if (value.length < MIN_PASSWORD) return `Пароль должен быть не короче ${MIN_PASSWORD} символов`
  if (value.length > MAX_PASSWORD) return `Пароль длиннее ${MAX_PASSWORD} символов`
  return ''
}

type ShellProps = {
  title: string
  lead?: ReactNode
  /** Может не быть: на экранах ожидания в карточке только заголовок. */
  children?: ReactNode
}

export function AccountShell({ title, lead, children }: ShellProps) {
  return (
    <div className="account">
      <WaveBg opacity={0.85} />

      <header className="account__header">
        <Link to="/" aria-label="На главную">
          <Logo />
        </Link>
        <Link className="btn btn--ghost" to="/">
          На главную
        </Link>
      </header>

      <main className="account__main">
        <section className="account__card">
          <h1 className="account__title">{title}</h1>
          {lead && <p className="account__lead">{lead}</p>}
          {children}
        </section>
      </main>
    </div>
  )
}

type FieldProps = {
  label: string
  type?: 'text' | 'email' | 'password'
  value: string
  onChange: (value: string) => void
  autoComplete?: string
  placeholder?: string
  error?: string
  hint?: string
  autoFocus?: boolean
  disabled?: boolean
}

export function Field({
  label,
  type = 'text',
  value,
  onChange,
  autoComplete,
  placeholder,
  error,
  hint,
  autoFocus,
  disabled,
}: FieldProps) {
  const id = useId()
  const [shown, setShown] = useState(false)
  const isPassword = type === 'password'

  return (
    <div className={`field ${isPassword ? 'field--password' : ''} ${error ? 'is-bad' : ''}`}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>

      <div className="field__box">
        <input
          id={id}
          className="field__input"
          type={isPassword && shown ? 'text' : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          autoFocus={autoFocus}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${id}-note` : undefined}
          maxLength={isPassword ? MAX_PASSWORD : 254}
        />
        {isPassword && (
          <button
            type="button"
            className="field__toggle"
            onClick={() => setShown((s) => !s)}
            aria-pressed={shown}
          >
            {shown ? 'Скрыть' : 'Показать'}
          </button>
        )}
      </div>

      {(error || hint) && (
        <p id={`${id}-note`} className={`field__note ${error ? 'is-bad' : ''}`}>
          {error || hint}
        </p>
      )}
    </div>
  )
}

/** Ошибка всей формы — строкой под кнопкой, а не окном поверх страницы. */
export function FormError({ children }: { children: ReactNode }) {
  return children ? (
    <p className="form__error" role="alert">
      {children}
    </p>
  ) : null
}

/** Подтверждение отправки: тем же местом, что и ошибка, только зелёным. */
export function FormOk({ children }: { children: ReactNode }) {
  return children ? <p className="form__ok">{children}</p> : null
}

type FormProps = {
  onSubmit: () => void
  children: ReactNode
}

/** Enter отправляет форму — за это отвечает сам <form>, не обработчики. */
export function Form({ onSubmit, children }: FormProps) {
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSubmit()
  }
  return (
    <form className="form" onSubmit={submit} noValidate>
      {children}
    </form>
  )
}

/** Пока приложение выясняет, вошёл ли человек. Секунда-две при первом заходе. */
export function Waiting({ text = 'Секунду…' }: { text?: string }) {
  return (
    <div className="account account--waiting">
      <WaveBg opacity={0.85} />
      <p className="account__waiting">{text}</p>
    </div>
  )
}
