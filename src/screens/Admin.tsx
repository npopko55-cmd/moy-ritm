/**
 * Админка «Моего ритма» — страница для владельца, не для людей.
 *
 * Ссылок на неё в интерфейсе нет, поисковикам она закрыта (noindex здесь и
 * Disallow в robots.txt). Вход — почта и пароль администратора; токен живёт
 * в sessionStorage и к пользовательской сессии отношения не имеет
 * (src/api/admin.ts). Истёк — снова форма входа.
 *
 * С 22.10.2026 (созвон: Никита — «сделай в админке одно единое окно, где
 * выведешь всё необходимое; тесты по воронкам скрой») разделов три:
 *
 *   • /admin — «Аналитика» (AdminAnalytics.tsx): итоги, воронка шагов,
 *     экономика, возвращаемость по когортам, поведение, каналы, по дням и
 *     люди — сверху вниз на одной странице;
 *   • /admin/payments — оплаты из GetCourse, по которым доступ не открылся
 *     сам, и выдача доступа руками (AdminPayments.tsx) — рабочий инструмент;
 *   • /admin/posts — посты в Telegram-каналы и рассылки ботом (AdminPosts.tsx).
 *
 * Прежние разделы «Аналитика воронок», «Поведение» и «Опрос» из меню убраны,
 * их адреса ведут на /admin (src/App.tsx). Код страниц остался:
 * AdminFunnels.tsx, AdminBehavior.tsx, AdminSurvey.tsx и AdminOverview.tsx
 * больше нигде не подключены — их можно удалить, когда станет ясно, что они
 * не понадобятся. Разделы переключаются чипами вверху страницы; вход общий.
 */

import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { adminApi, adminSignedOut, forgetAdminToken, readAdminToken, saveAdminToken } from '../api/admin'
import { IS_DEMO } from '../api/client'
import { AccountShell, Field, Form, FormError, errorText, isEmail } from './Account'
import AdminAnalytics from './AdminAnalytics'
import AdminPayments from './AdminPayments'
import AdminPosts from './AdminPosts'
import PageShell from './Page'
import './Admin.css'

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

type Section = 'analytics' | 'payments' | 'posts'

const SECTIONS: { section: Section; path: string; label: string; title: string; lead: string }[] = [
  {
    section: 'analytics',
    path: '/admin',
    label: 'Аналитика',
    title: 'Аналитика',
    lead: 'Всё в одном окне: откуда приходят люди, где отваливаются, возвращаются ли, когда и сколько занимаются и сколько это приносит.',
  },
  {
    section: 'payments',
    path: '/admin/payments',
    label: 'Оплаты',
    title: 'Оплаты без доступа',
    lead: 'Кто заплатил, а доступ сам не открылся: почта в заказе не совпала с аккаунтом или оффер не привязан к тарифу. Здесь же доступ выдаётся руками.',
  },
  {
    section: 'posts',
    path: '/admin/posts',
    label: 'Посты',
    title: 'Посты и рассылки',
    lead: 'Рассылки ботом людям воронки и посты в Telegram-каналы по расписанию. Время — московское.',
  },
]

function useSection(): Section {
  const { pathname } = useLocation()
  const path = pathname.replace(/\/+$/, '')
  return SECTIONS.find((s) => s.path === path)?.section ?? 'analytics'
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
      ) : section === 'payments' ? (
        <AdminPayments token={token} fail={fail} />
      ) : (
        <AdminAnalytics token={token} fail={fail} />
      )}
    </PageShell>
  )
}
