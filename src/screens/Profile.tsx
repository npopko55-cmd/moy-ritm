/**
 * Профиль (раздел 5.1 архитектуры).
 *
 * Одна страница на всё, что человек может про себя изменить: имя, почта,
 * пароль, устройства и удаление аккаунта. Всё, что требует подтверждения,
 * раскрывается строкой прямо в карточке — окон поверх страницы на сайте нет.
 *
 * Формы объявлены на верхнем уровне файла, а не внутри Profile: иначе при
 * каждой перерисовке страницы они пересоздавались бы и теряли набранное.
 */

import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, IS_DEMO } from '../api/client'
import type { Me, SessionRow } from '../api/types'
import { useSession } from '../auth/SessionProvider'
import { days, formatDate, formatWhen, pluralWord, toMinutes } from '../lib/date'
import {
  errorText,
  Field,
  Form,
  FormError,
  FormOk,
  isEmail,
  passwordProblem,
  Waiting,
} from './Account'
import PageShell, { Card, Note, Row } from './Page'
import './Account.css'
import './Profile.css'

/** «iPhone · Safari» из строки браузера: сервер отдаёт её как есть. */
function deviceName(ua: string | null): string {
  if (!ua) return 'Неизвестное устройство'
  const os = /iPhone/i.test(ua)
    ? 'iPhone'
    : /iPad/i.test(ua)
      ? 'iPad'
      : /Android/i.test(ua)
        ? 'Android'
        : /Macintosh|Mac OS X/i.test(ua)
          ? 'Mac'
          : /Windows/i.test(ua)
            ? 'Windows'
            : /Linux/i.test(ua)
              ? 'Linux'
              : 'Устройство'
  // Порядок важен: Edge и Яндекс представляются и Chrome тоже.
  const browser = /Edg\//i.test(ua)
    ? 'Edge'
    : /YaBrowser/i.test(ua)
      ? 'Яндекс Браузер'
      : /OPR\/|Opera/i.test(ua)
        ? 'Opera'
        : /Firefox\//i.test(ua)
          ? 'Firefox'
          : /Chrome\//i.test(ua)
            ? 'Chrome'
            : /Safari\//i.test(ua)
              ? 'Safari'
              : 'браузер'
  return `${os} · ${browser}`
}

/** Какой блок раскрыт: одновременно бывает только один. */
type Open = '' | 'email' | 'password' | 'delete'

export default function Profile() {
  const navigate = useNavigate()
  const { me, setMe, reload, signOut } = useSession()

  const [open, setOpen] = useState<Open>('')
  const [rows, setRows] = useState<SessionRow[] | null>(null)
  const [rowsError, setRowsError] = useState('')

  const loadSessions = useCallback(async () => {
    try {
      setRows((await api.getSessions()).items)
      setRowsError('')
    } catch (e) {
      setRows([])
      setRowsError(errorText(e, 'Не получилось загрузить список устройств'))
    }
  }, [])

  useEffect(() => {
    void loadSessions()
    // Итоги и срок доступа могли измениться с тех пор, как приложение
    // открылось: после тренировки минут больше, после оплаты — дней.
    void reload()
  }, [loadSessions, reload])

  if (!me) return <Waiting />

  const { user, access, totals } = me
  const paidUntil = formatDate(access.paid_until)

  const leaveEverywhere = async () => {
    try {
      await api.logoutAll()
    } finally {
      // Профиль перечитываем: сервер отозвал все сессии, и его 401 сам
      // погасит состояние входа.
      await reload()
      navigate('/login', { replace: true })
    }
  }

  const leaveDevice = async (row: SessionRow) => {
    if (row.current) {
      await signOut()
      navigate('/', { replace: true })
      return
    }
    try {
      await api.deleteSession(row.id)
    } catch (e) {
      setRowsError(errorText(e))
    }
    await loadSessions()
  }

  const leave = async () => {
    await signOut()
    navigate('/', { replace: true })
  }

  return (
    <PageShell title="Профиль" lead={user.email}>
      <Card title="Кто вы">
        <NameRow me={me} setMe={setMe} />

        <Row
          label="Почта"
          hint={user.email_verified ? user.email : `${user.email} — не подтверждена`}
        >
          <button className="page__btn" onClick={() => setOpen(open === 'email' ? '' : 'email')}>
            {open === 'email' ? 'Отменить' : 'Сменить почту'}
          </button>
        </Row>

        {open === 'email' && <EmailForm />}
      </Card>

      <Card title="Доступ">
        {access.status === 'none' ? (
          <Row label="Доступа нет" hint="Тренировки открываются после оплаты.">
            <Link className="page__btn page__btn--pink" to="/tariffs">
              Выбрать тариф
            </Link>
          </Row>
        ) : (
          <Row
            label={access.tariff?.name ?? 'Доступ к тренировкам'}
            hint={
              access.status === 'expired'
                ? `Закончился ${paidUntil}`
                : `Оплачено до ${paidUntil}${access.days_left ? ` — осталось ${days(access.days_left)}` : ''}`
            }
          >
            <Link className="page__btn page__btn--pink" to="/tariffs">
              Продлить
            </Link>
          </Row>
        )}
      </Card>

      <Card title="Итоги">
        <ul className="totals">
          <li className="totals__item">
            <strong>{toMinutes(totals.total_seconds)}</strong>
            <span>{pluralWord(toMinutes(totals.total_seconds), 'минута', 'минуты', 'минут')} в движении</span>
          </li>
          <li className="totals__item">
            <strong>{totals.total_workouts}</strong>
            <span>
              {pluralWord(totals.total_workouts, 'тренировка', 'тренировки', 'тренировок')}
            </span>
          </li>
          <li className="totals__item">
            <strong>{totals.current_streak_days}</strong>
            <span>дней подряд сейчас</span>
          </li>
          <li className="totals__item">
            <strong>{totals.longest_streak_days}</strong>
            <span>лучшая серия дней</span>
          </li>
        </ul>
        <Link className="page__link" to="/progress">
          Мой прогресс →
        </Link>
      </Card>

      <Card title="Пароль">
        <Row
          label="Пароль от аккаунта"
          hint="Смена пароля оставит вас здесь и выкинет остальные устройства."
        >
          <button
            className="page__btn"
            onClick={() => setOpen(open === 'password' ? '' : 'password')}
          >
            {open === 'password' ? 'Отменить' : 'Сменить пароль'}
          </button>
        </Row>
        {open === 'password' && <PasswordForm onDone={loadSessions} />}
      </Card>

      <Card
        title="Устройства"
        text="Здесь видно, где вы вошли. Незнакомое устройство — сразу выходите."
      >
        {rows === null ? (
          <p className="page__card-text">Загружаем…</p>
        ) : rows.length === 0 ? (
          <p className="page__card-text">Список пуст.</p>
        ) : (
          <ul className="devices">
            {rows.map((row) => (
              <li key={row.id} className="devices__row">
                <div className="devices__text">
                  <span className="devices__name">
                    {deviceName(row.user_agent)}
                    {row.current && <span className="devices__badge">это устройство</span>}
                  </span>
                  <span className="devices__meta">
                    {formatWhen(row.issued_at)}
                    {row.ip ? ` · ${row.ip}` : ''}
                  </span>
                </div>
                <button className="page__btn" onClick={() => void leaveDevice(row)}>
                  Выйти
                </button>
              </li>
            ))}
          </ul>
        )}
        {rowsError && <Note kind="bad">{rowsError}</Note>}

        <div className="profile__buttons">
          <button className="page__btn" onClick={() => void leaveEverywhere()}>
            Выйти на всех устройствах
          </button>
          <button className="page__btn" onClick={() => void leave()}>
            Выйти
          </button>
        </div>
      </Card>

      <Card title="Удаление аккаунта">
        <Row
          label="Удалить аккаунт"
          hint="Статистика тренировок удалится, записи об оплатах останутся обезличенными."
        >
          <button
            className="page__btn page__btn--danger"
            onClick={() => setOpen(open === 'delete' ? '' : 'delete')}
          >
            {open === 'delete' ? 'Отменить' : 'Удалить аккаунт'}
          </button>
        </Row>
        {open === 'delete' && <DeleteForm email={user.email} onCancel={() => setOpen('')} />}
      </Card>
    </PageShell>
  )
}

/** Имя правится прямо в строке: сохраняем по Enter и по уходу из поля. */
function NameRow({ me, setMe }: { me: Me; setMe: (me: Me) => void }) {
  const saved = me.user.name ?? ''
  const [value, setValue] = useState(saved)
  const [state, setState] = useState<'' | 'ok' | 'bad'>('')
  const [text, setText] = useState('')

  const save = async () => {
    const name = value.trim()
    if (name === saved) return
    try {
      setMe(await api.patchMe({ name: name || null }))
      setState('ok')
      setText('Сохранено')
    } catch (e) {
      setValue(saved)
      setState('bad')
      setText(errorText(e))
    }
  }

  return (
    <>
      <Row label="Имя" hint="Как к вам обращаться. Можно оставить пустым.">
        <input
          className="profile__name"
          value={value}
          maxLength={100}
          placeholder="Имя"
          aria-label="Имя"
          onChange={(e) => {
            setValue(e.target.value)
            setState('')
          }}
          onBlur={() => void save()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />
      </Row>
      {state && <Note kind={state === 'ok' ? 'ok' : 'bad'}>{text}</Note>}
    </>
  )
}

function EmailForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [bad, setBad] = useState('')
  const [ok, setOk] = useState('')

  const submit = async () => {
    const next = email.trim()
    if (!isEmail(next)) return setBad('Проверьте адрес: похоже, в нём опечатка')
    if (!password) return setBad('Введите текущий пароль')
    setBusy(true)
    setBad('')
    try {
      await api.changeEmail(next, password)
      setOk(
        `Письмо отправлено на ${next}. Перейдите по ссылке из него — до этого вход остаётся по старому адресу`,
      )
      setPassword('')
    } catch (e) {
      setBad(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  if (ok) return <FormOk>{ok}</FormOk>

  return (
    <Form onSubmit={submit}>
      <Field
        label="Новая почта"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        placeholder="you@example.com"
        autoFocus
      />
      <Field
        label="Текущий пароль"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
      />
      <div className="form__actions">
        <button className="form__submit" type="submit" disabled={busy}>
          {busy ? 'Отправляем…' : 'Отправить письмо'}
        </button>
      </div>
      <FormError>{bad}</FormError>
    </Form>
  )
}

function PasswordForm({ onDone }: { onDone: () => Promise<void> }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [bad, setBad] = useState('')
  const [ok, setOk] = useState('')

  const submit = async () => {
    const problem = passwordProblem(next)
    if (!current) return setBad('Введите текущий пароль')
    if (problem) return setBad(problem)
    if (next !== again) return setBad('Пароли не совпадают')
    setBusy(true)
    setBad('')
    try {
      await api.changePassword(current, next)
      setOk('Пароль изменён. Остальные устройства вышли из аккаунта')
      setCurrent('')
      setNext('')
      setAgain('')
      // Список устройств после этого другой: там осталось только это.
      await onDone()
    } catch (e) {
      setBad(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  if (ok) return <FormOk>{ok}</FormOk>

  return (
    <Form onSubmit={submit}>
      <Field
        label="Текущий пароль"
        type="password"
        value={current}
        onChange={setCurrent}
        autoComplete="current-password"
        autoFocus
      />
      <Field
        label="Новый пароль"
        type="password"
        value={next}
        onChange={setNext}
        autoComplete="new-password"
        hint="Не короче 8 символов"
      />
      <Field
        label="Повторите новый"
        type="password"
        value={again}
        onChange={setAgain}
        autoComplete="new-password"
      />
      <div className="form__actions">
        <button className="form__submit" type="submit" disabled={busy}>
          {busy ? 'Меняем…' : 'Сменить пароль'}
        </button>
      </div>
      <FormError>{bad}</FormError>
    </Form>
  )
}

function DeleteForm({ email, onCancel }: { email: string; onCancel: () => void }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [bad, setBad] = useState('')
  const [ok, setOk] = useState('')

  const submit = async () => {
    if (!password) return setBad('Введите текущий пароль')
    setBusy(true)
    setBad('')
    try {
      await api.deleteAccountRequest(password)
      setOk(`Письмо отправлено на ${email}. Ссылка в нём работает час и только один раз`)
    } catch (e) {
      setBad(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  if (ok) {
    return (
      <>
        <FormOk>{ok}</FormOk>
        {/* В демо-режиме письма слать нечем, поэтому отдаём ссылку сразу:
            иначе сценарий удаления на GitHub Pages не прокликать. */}
        {IS_DEMO && (
          <p className="profile__demo">
            Демо-режим: письма нет,{' '}
            <Link className="page__link" to="/delete-account?token=demo">
              откройте страницу подтверждения
            </Link>
          </p>
        )}
      </>
    )
  }

  return (
    <div className="profile__danger">
      <p className="profile__warn">
        Удалятся имя, настройки и вся статистика тренировок. Почта освободится — на неё можно будет
        зарегистрироваться заново. Записи об оплатах останутся обезличенными: это финансовые
        документы.
      </p>
      <Form onSubmit={submit}>
        <Field
          label="Текущий пароль"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          autoFocus
        />
        <div className="profile__buttons">
          <button className="page__btn" type="button" onClick={onCancel}>
            Отменить
          </button>
          <button className="page__btn page__btn--danger" type="submit" disabled={busy}>
            {busy ? 'Отправляем…' : 'Прислать письмо для удаления'}
          </button>
        </div>
        <FormError>{bad}</FormError>
      </Form>
    </div>
  )
}
