/**
 * Аналитика тестовых воронок — страница для владельца, не для людей.
 *
 * Ссылок на неё в интерфейсе нет, поисковикам она закрыта (noindex здесь и
 * Disallow в robots.txt). Вход — почта и пароль администратора; токен живёт
 * в sessionStorage и к пользовательской сессии отношения не имеет
 * (src/api/admin.ts). Истёк — снова форма входа.
 *
 * Что на странице:
 *   • период сводки: всё время, 7 дней, 30 дней или свои даты. Старты бота
 *     и визиты считаются по дате события, остальные шаги — люди,
 *     зарегистрированные в период, в их состоянии на сегодня;
 *   • две воронки рядом — «3 дня» и «Челлендж 21 день»: шаги от старта бота до
 *     оплаты, под каждой цифрой — процент от предыдущего шага, и ссылки с
 *     кнопкой «Скопировать»: главная — для канала, через бота, под ней —
 *     прямая на сайт (/go/<токен>). Бот не настроен — одна прямая;
 *   • таблица людей выбранной воронки с сортировкой и страницами, и она же —
 *     CSV-файлом.
 *
 * Второй раздел — /admin/posts, посты в Telegram-каналы воронок и рассылки
 * ботом (AdminPosts.tsx), третий — /admin/behavior, поведение людей по
 * воронкам (AdminBehavior.tsx), четвёртый — /admin/survey, ответы на опрос в
 * боте (AdminSurvey.tsx), пятый — /admin/payments, оплаты из GetCourse, по
 * которым доступ не открылся сам, и выдача доступа руками (AdminPayments.tsx).
 * Разделы переключаются чипами вверху страницы; вход общий.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  adminApi,
  adminSignedOut,
  forgetAdminToken,
  readAdminToken,
  saveAdminToken,
  type FunnelSummary,
  type FunnelUser,
  type FunnelUserTariff,
  type FunnelUsersPage,
  type Period,
  type UsersSort,
} from '../api/admin'
import { IS_DEMO } from '../api/client'
import type { Funnel } from '../api/types'
import { rub } from '../data/tariffs'
import { AccountShell, Field, Form, FormError, errorText, isEmail } from './Account'
import AdminBehavior from './AdminBehavior'
import AdminPayments from './AdminPayments'
import AdminPosts from './AdminPosts'
import AdminSurvey from './AdminSurvey'
import PageShell, { Card } from './Page'
import './Admin.css'

/** Адрес ссылок входа — боевой сайт, откуда бы ни открыли админку. */
const SITE = 'https://ritmritm.ru'

const FUNNELS: { funnel: Funnel; title: string }[] = [
  { funnel: 'trial3d', title: '3 дня' },
  { funnel: 'trial20', title: 'Челлендж 21 день' },
]

type PeriodKind = 'all' | '7' | '30' | 'custom'

const PERIODS: { kind: PeriodKind; label: string }[] = [
  { kind: 'all', label: 'Всё время' },
  { kind: '7', label: '7 дней' },
  { kind: '30', label: '30 дней' },
  { kind: 'custom', label: 'Свои даты' },
]

const SORTS: { sort: UsersSort; label: string }[] = [
  { sort: 'registered_at', label: 'Дата регистрации' },
  { sort: 'total_seconds', label: 'Минуты' },
  { sort: 'active_days', label: 'Дни' },
]

const PER_PAGE = 20

/* ——— Форматирование ——— */

/** Локальная дата браузера — «2026-09-22». */
function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function periodOf(kind: PeriodKind, from: string, to: string): Period {
  if (kind === 'all') return {}
  if (kind === 'custom') return { from: from || undefined, to: to || undefined }
  const start = new Date()
  start.setDate(start.getDate() - (Number(kind) - 1))
  return { from: ymd(start), to: ymd(new Date()) }
}

const num = (n: number) => n.toLocaleString('ru-RU')

const money = (value: number, currency: string) =>
  currency === 'RUB' ? rub(value) : `${num(value)} ${currency}`

const dateText = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

const dateTimeText = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'

/** Секунды → «3 ч 12 мин» / «45 мин». */
function hoursMinutes(seconds: number): string {
  const total = Math.floor(Math.max(0, seconds) / 60)
  const h = Math.floor(total / 60)
  const m = total % 60
  return h ? `${h} ч ${m} мин` : `${m} мин`
}

function tariffName(t: FunnelUserTariff): string {
  if (!t) return ''
  return typeof t === 'string' ? t : t.name || t.code || ''
}

/** Процент от предыдущего шага. Предыдущий ноль — считать не от чего. */
function share(value: number, prev: number | null): string {
  if (prev === null) return ''
  if (prev <= 0) return '—'
  return `${Math.round((value / prev) * 100)}% от предыдущего`
}

/**
 * Доля нажавших «Открыть» от видевших плашку — как её посчитал бэкенд
 * (0…1). Никто не видел — «—». Поля нет (старый бэкенд) — null: строка
 * тогда пустая, как и две над ней.
 */
function bannerShare(data: FunnelSummary): string | null {
  if (data.banner_seen === undefined) return null
  const value =
    data.banner_click_share ?? (data.banner_seen > 0 ? (data.banner_clicked ?? 0) / data.banner_seen : null)
  return value === null ? '—' : `${Math.round(value * 100)}%`
}

/** Админке не место в поиске: noindex, пока страница открыта. */
function useNoindex(): void {
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])
}

/* ——— Страница ——— */

type Section = 'funnels' | 'posts' | 'behavior' | 'survey' | 'payments'

const SECTIONS: { section: Section; path: string; label: string; title: string; lead: string }[] = [
  {
    section: 'funnels',
    path: '/admin',
    label: 'Аналитика воронок',
    title: 'Аналитика воронок',
    lead: 'Две тестовые группы запуска через Telegram: кто пришёл по ссылке, дошёл до тренировки и оплатил.',
  },
  {
    section: 'posts',
    path: '/admin/posts',
    label: 'Посты',
    title: 'Посты и рассылки',
    lead: 'Рассылки ботом людям воронки и посты в Telegram-каналы по расписанию. Время — московское.',
  },
  {
    section: 'behavior',
    path: '/admin/behavior',
    label: 'Поведение',
    title: 'Поведение по воронкам',
    lead: 'Как двигаются люди из разных воронок в первые три недели: сколько дней занимаются, возвращаются ли и сколько длится заход.',
  },
  {
    section: 'survey',
    path: '/admin/survey',
    label: 'Опрос',
    title: 'Опрос в боте',
    lead: 'Ответы на опрос через 3, 7 и 21 день после регистрации: NPS по воронкам и что пишут люди.',
  },
  {
    section: 'payments',
    path: '/admin/payments',
    label: 'Оплаты',
    title: 'Оплаты без доступа',
    lead: 'Кто заплатил, а доступ сам не открылся: почта в заказе не совпала с аккаунтом или оффер не привязан к тарифу. Здесь же доступ выдаётся руками.',
  },
]

function useSection(): Section {
  const { pathname } = useLocation()
  const path = pathname.replace(/\/+$/, '')
  return SECTIONS.find((s) => s.path === path)?.section ?? 'funnels'
}

export default function Admin() {
  useNoindex()
  const [token, setToken] = useState<string | null>(readAdminToken)
  const [expired, setExpired] = useState(false)

  const signOut = useCallback((why?: 'expired') => {
    forgetAdminToken()
    setToken(null)
    setExpired(why === 'expired')
  }, [])

  if (!token) {
    return (
      <AdminLogin
        expired={expired}
        onSignedIn={(next) => {
          saveAdminToken(next)
          setExpired(false)
          setToken(next)
        }}
      />
    )
  }
  return <Dashboard token={token} onSignOut={signOut} />
}

function AdminLogin({ expired, onSignedIn }: { expired: boolean; onSignedIn(token: string): void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!isEmail(email) || !password) {
      setError('Введите почту и пароль администратора')
      return
    }
    setBusy(true)
    setError('')
    try {
      onSignedIn(await adminApi.login(email.trim(), password))
    } catch (e) {
      setError(
        adminSignedOut(e)
          ? 'Неверная почта или пароль — или у этой учётной записи нет прав администратора'
          : errorText(e),
      )
      setBusy(false)
    }
  }

  return (
    <AccountShell
      title="Админка «Моего ритма»"
      lead={expired ? 'Сессия администратора закончилась — войдите ещё раз.' : 'Вход для администратора.'}
    >
      <Form onSubmit={() => void submit()}>
        <Field
          label="Почта"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="username"
          autoFocus
          disabled={busy}
        />
        <Field
          label="Пароль"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          disabled={busy}
        />
        <div className="form__actions">
          <button className="form__submit" type="submit" disabled={busy}>
            {busy ? 'Входим…' : 'Войти'}
          </button>
          <FormError>{error}</FormError>
        </div>
      </Form>

      {IS_DEMO && (
        <p className="account__demo">
          Демо-режим: подойдут любая почта и пароль от 8 символов, цифры выдуманные.
        </p>
      )}
    </AccountShell>
  )
}

type Fail = (e: unknown, show: (text: string) => void) => void

function Dashboard({ token, onSignOut }: { token: string; onSignOut(why?: 'expired'): void }) {
  // Отказ по токену — снова форма входа; остальное — строкой на месте.
  const fail = useCallback<Fail>(
    (e, show) => {
      if (adminSignedOut(e)) onSignOut('expired')
      else show(errorText(e))
    },
    [onSignOut],
  )

  const section = useSection()
  const navigate = useNavigate()
  const meta = SECTIONS.find((s) => s.section === section) ?? SECTIONS[0]

  return (
    <PageShell title={meta.title} lead={meta.lead} back={{ label: 'Выйти', go: () => onSignOut() }} wide>
      <nav className="chips admin__sections" aria-label="Разделы админки">
        {SECTIONS.map((s) => (
          <button
            key={s.section}
            type="button"
            className={`chip ${section === s.section ? 'is-on' : ''}`}
            aria-current={section === s.section ? 'page' : undefined}
            onClick={() => navigate(s.path)}
          >
            {s.label}
          </button>
        ))}
      </nav>
      {section === 'posts' ? (
        <AdminPosts token={token} fail={fail} />
      ) : section === 'behavior' ? (
        <AdminBehavior token={token} fail={fail} />
      ) : section === 'survey' ? (
        <AdminSurvey token={token} fail={fail} />
      ) : section === 'payments' ? (
        <AdminPayments token={token} fail={fail} />
      ) : (
        <Funnels token={token} fail={fail} />
      )}
    </PageShell>
  )
}

/* ——— Аналитика воронок ——— */

function Funnels({ token, fail }: { token: string; fail: Fail }) {
  const [kind, setKind] = useState<PeriodKind>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const period = periodOf(kind, from, to)

  const [summary, setSummary] = useState<FunnelSummary[] | null>(null)
  const [summaryError, setSummaryError] = useState('')

  useEffect(() => {
    // Свои даты — ждём обе.
    if (kind === 'custom' && (!from || !to)) return
    let alive = true
    setSummaryError('')
    adminApi.summary(token, { from: period.from, to: period.to }).then(
      (list) => {
        if (alive) setSummary(list)
      },
      (e) => {
        if (alive) fail(e, setSummaryError)
      },
    )
    return () => {
      alive = false
    }
  }, [token, kind, from, to, period.from, period.to, fail])

  return (
    <>
      <Card title="Период">
        <div className="chips">
          {PERIODS.map((p) => (
            <button
              key={p.kind}
              type="button"
              className={`chip ${kind === p.kind ? 'is-on' : ''}`}
              onClick={() => setKind(p.kind)}
            >
              {p.label}
            </button>
          ))}
        </div>
        {kind === 'custom' && (
          <div className="admin__dates">
            <label>
              С
              <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label>
              по
              <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
        )}
        <p className="admin__period-note">
          Старты бота, визиты и плашка «Открой все 40» — по дате события. Остальное — люди,
          зарегистрированные в этот период, и их состояние на сегодня.
        </p>
        {summaryError && <p className="page__note is-bad">{summaryError}</p>}
      </Card>

      <div className="admin__funnels">
        {FUNNELS.map((f) => (
          <FunnelColumn
            key={f.funnel}
            funnel={f.funnel}
            title={f.title}
            loading={summary === null}
            data={summary?.find((s) => s.funnel === f.funnel) ?? null}
          />
        ))}
      </div>

      <People token={token} fail={fail} />
    </>
  )
}

/* ——— Колонка воронки ——— */

type ColumnProps = { funnel: Funnel; title: string; data: FunnelSummary | null; loading: boolean }

function FunnelColumn({ funnel, title, data, loading }: ColumnProps) {
  // Человек приходит из канала в бота, а бот ведёт на сайт: старты бота —
  // первый шаг, визиты — второй.
  const steps: { label: string; value: number | null }[] = [
    { label: 'Старты бота', value: data?.bot_starts ?? null },
    { label: 'Визиты по ссылке', value: data?.visitors ?? null },
    { label: 'Регистрации', value: data?.registered ?? null },
    { label: 'Подтвердили почту', value: data?.email_verified ?? null },
    { label: 'Начали шагать', value: data?.started ?? null },
    // Есть только у trial20: строку оставляем и у «3 дней», чтобы шаги
    // двух колонок стояли друг напротив друга, но без цифры — даже если
    // бэкенд пришлёт там ноль.
    {
      label: 'Дошли до предложения',
      value: funnel === 'trial20' ? (data?.reached_offer ?? (data ? 0 : null)) : null,
    },
    // Только у trial3d: у челленджа конца нет, бэкенд шлёт null — «нет в
    // этой воронке». Старый бэкенд слал там число — его не показываем.
    {
      label: 'Пробный период закончился',
      value: funnel === 'trial3d' ? (data?.expired ?? (data ? 0 : null)) : null,
    },
    { label: 'Оплатили', value: data?.paid_users ?? null },
  ]

  // Процент — от предыдущего шага, который у воронки есть.
  let prev: number | null = null

  // Плашка «Открой все 40». Старый бэкенд полей не шлёт — строки с «—».
  const banner: { label: string; value: string | null }[] = [
    {
      label: 'Видели плашку «Открой все 40»',
      value: data?.banner_seen === undefined ? null : num(data.banner_seen),
    },
    {
      label: 'Нажали «Открыть»',
      value: data?.banner_clicked === undefined ? null : num(data.banner_clicked),
    },
    { label: 'Доля нажавших от видевших', value: data ? bannerShare(data) : null },
  ]

  return (
    <section className="page__card admin__funnel">
      <h2 className="page__card-title">{title}</h2>
      {data?.bot_link ? (
        <>
          <EntryLink label="Ссылка для канала (через бота)" url={data.bot_link} />
          <EntryLink label="Прямая ссылка на сайт" url={siteLink(data.token)} />
        </>
      ) : (
        <EntryLink url={siteLink(data?.token)} />
      )}

      <ol className="admin__steps">
        {steps.map((s) => {
          const pct = s.value === null ? '' : share(s.value, prev)
          if (s.value !== null) prev = s.value
          return (
            <li key={s.label} className={`admin__step ${s.value === null ? 'is-empty' : ''}`}>
              <span className="admin__step-label">{s.label}</span>
              <span className="admin__step-num">
                <span className="admin__step-value">
                  {loading ? '…' : s.value === null ? '—' : num(s.value)}
                </span>
                {!loading && (pct || s.value === null) && (
                  <span className="admin__step-pct">{s.value === null ? 'нет в этой воронке' : pct}</span>
                )}
              </span>
            </li>
          )
        })}
        <li className="admin__step admin__step--money">
          <span className="admin__step-label">Выручка</span>
          <span className="admin__step-num">
            <span className="admin__step-value">
              {loading || !data ? '…' : money(data.revenue, data.currency)}
            </span>
            {data && data.paid_users > 0 && (
              <span className="admin__step-pct">
                {money(Math.round(data.revenue / data.paid_users), data.currency)} на оплатившего
              </span>
            )}
          </span>
        </li>
      </ol>

      {/* Плашка «Открой все 40» в плеере — не шаг воронки, а своя метрика:
          сколько людей её увидели и сколько из них нажали «Открыть».
          Уникальные люди, по дате события, как визиты и старты бота. */}
      <ol className="admin__steps admin__steps--banner">
        {banner.map((row) => (
          <li key={row.label} className={`admin__step ${row.value === null ? 'is-empty' : ''}`}>
            <span className="admin__step-label">{row.label}</span>
            <span className="admin__step-num">
              <span className="admin__step-value">{loading ? '…' : (row.value ?? '—')}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** Прямая ссылка входа на сайт. Токена ещё нет — пусто. */
const siteLink = (token?: string | null) => (token ? `${SITE}/go/${token}` : '')

/** Ссылка в поле только для чтения и кнопка «Скопировать». Подпись — над ней. */
function EntryLink({ url, label }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const field = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(t)
  }, [copied])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      // Буфер обмена недоступен (не https, запрет) — выделяем, копируют руками.
      field.current?.select()
    }
  }

  const input = (
    <div className="admin__link">
      <input
        ref={field}
        className="admin__link-url"
        readOnly
        value={url}
        placeholder="…"
        aria-label={label ?? 'Ссылка входа'}
        onFocus={(e) => e.target.select()}
      />
      <button className="page__btn" type="button" onClick={() => void copy()} disabled={!url}>
        {copied ? 'Скопировано' : 'Скопировать'}
      </button>
    </div>
  )
  if (!label) return input
  return (
    <div className="admin__link-block">
      <p className="admin__link-label">{label}</p>
      {input}
    </div>
  )
}

/* ——— Таблица людей ——— */

function People({ token, fail }: { token: string; fail: Fail }) {
  const [funnel, setFunnel] = useState<Funnel>('trial3d')
  const [sort, setSort] = useState<UsersSort>('registered_at')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<FunnelUsersPage | null>(null)
  const [error, setError] = useState('')
  const [csvBusy, setCsvBusy] = useState(false)
  const [csvError, setCsvError] = useState('')

  useEffect(() => {
    let alive = true
    setError('')
    adminApi.users(token, { funnel, page, per_page: PER_PAGE, sort }).then(
      (next) => {
        if (alive) setData(next)
      },
      (e) => {
        if (alive) fail(e, setError)
      },
    )
    return () => {
      alive = false
    }
  }, [token, funnel, sort, page, fail])

  const pages = data ? Math.max(1, Math.ceil(data.total / (data.per_page || PER_PAGE))) : 1

  const download = async () => {
    setCsvBusy(true)
    setCsvError('')
    try {
      const blob = await adminApi.usersCsv(token, funnel)
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = `ritm-${funnel}-${ymd(new Date())}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.setTimeout(() => URL.revokeObjectURL(href), 1000)
    } catch (e) {
      fail(e, setCsvError)
    } finally {
      setCsvBusy(false)
    }
  }

  return (
    <Card title="Люди" text="Все, кто зарегистрировался по ссылке воронки. Период выше на таблицу не влияет.">
      <div className="admin__tools">
        <div className="chips admin__chips">
          {FUNNELS.map((f) => (
            <button
              key={f.funnel}
              type="button"
              className={`chip ${funnel === f.funnel ? 'is-on' : ''}`}
              onClick={() => {
                setFunnel(f.funnel)
                setPage(1)
              }}
            >
              {f.title}
            </button>
          ))}
        </div>
        <button className="page__btn" type="button" onClick={() => void download()} disabled={csvBusy}>
          {csvBusy ? 'Готовим файл…' : 'Скачать таблицу (CSV)'}
        </button>
      </div>
      {csvError && <p className="page__note is-bad">{csvError}</p>}

      <div className="admin__sort">
        <span>Сортировка:</span>
        {SORTS.map((s) => (
          <button
            key={s.sort}
            type="button"
            className={`admin__sort-btn ${sort === s.sort ? 'is-on' : ''}`}
            onClick={() => {
              setSort(s.sort)
              setPage(1)
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {error && <p className="page__note is-bad">{error}</p>}

      {/* На телефоне таблица прокручивается вбок внутри своей рамки, а не
          вместе со страницей. */}
      <div className="admin__scroll">
        <table className="admin__table">
          <thead>
            <tr>
              <th>Почта</th>
              <th>Telegram</th>
              <th>Регистрация</th>
              <th>Почта подтверждена</th>
              <th className="is-num">Дней шагал</th>
              <th className="is-num">Всего в движении</th>
              <th className="is-num">Шагов</th>
              <th className="is-num">Засчитано тренировок (от 3 мин)</th>
              <th>Последний заход</th>
              <th>Оплата</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((u) => <PersonRow key={u.user_id} user={u} />)}
            {data && data.items.length === 0 && (
              <tr>
                <td className="admin__empty" colSpan={10}>
                  В этой воронке пока никого
                </td>
              </tr>
            )}
            {!data && !error && (
              <tr>
                <td className="admin__empty" colSpan={10}>
                  Загружаем…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data && data.total > 0 && (
        <div className="admin__pager">
          <button
            className="page__btn"
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ← Назад
          </button>
          <span>
            Страница {page} из {pages} · всего {num(data.total)}
          </span>
          <button
            className="page__btn"
            type="button"
            disabled={page >= pages}
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
          >
            Вперёд →
          </button>
        </div>
      )}
    </Card>
  )
}

function PersonRow({ user: u }: { user: FunnelUser }) {
  const tariff = tariffName(u.tariff)
  return (
    <tr>
      <td>{u.email}</td>
      <td>
        {u.telegram_username ? (
          <a href={`https://t.me/${u.telegram_username}`} target="_blank" rel="noreferrer">
            @{u.telegram_username}
          </a>
        ) : (
          '—'
        )}
      </td>
      <td>{dateText(u.registered_at)}</td>
      <td>{u.email_verified ? 'да' : 'нет'}</td>
      <td className="is-num">{num(u.active_days)}</td>
      <td className="is-num">{hoursMinutes(u.total_seconds)}</td>
      <td className="is-num">~{num(u.total_steps)}</td>
      <td className="is-num">{num(u.workouts)}</td>
      <td>{dateTimeText(u.last_activity_at)}</td>
      <td>
        {u.paid
          ? [tariff, u.paid_amount != null ? rub(u.paid_amount) : ''].filter(Boolean).join(' · ') || 'да'
          : '—'}
      </td>
    </tr>
  )
}
