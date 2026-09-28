/**
 * Раздел админки «Оплаты» — /admin/payments.
 *
 * Оплаты из GetCourse, по которым доступ не открылся сам: человека не нашли
 * по почте из заказа, оффер не привязан к тарифу или уведомление не
 * разобралось. Здесь же доступ выдаётся руками: заказ привязывается к
 * аккаунту по почте, с которой человек зарегистрирован, а действие
 * попадает в журнал администратора (правила — на бэкенде, docs/GETCOURSE.md).
 *
 * Аккаунт GetCourse общий с другими продуктами владельца, и чужие оплаты
 * (оффер не наш, человека у нас нет) по умолчанию скрыты — их число видно на
 * чипе, показать можно одним нажатием. Всплывающих окон нет: форма выдачи и
 * её итог живут строкой в таблице.
 */

import { useEffect, useState } from 'react'
import {
  adminApi,
  type PaymentProblem,
  type PaymentProblems,
  type PaymentTariff,
  type Period,
} from '../api/admin'
import { rub } from '../data/tariffs'
import { isEmail } from './Account'
import { Card } from './Page'
import './AdminPayments.css'

type Fail = (e: unknown, show: (text: string) => void) => void

type PeriodKind = '7' | '30' | 'all' | 'custom'

const PERIODS: { kind: PeriodKind; label: string }[] = [
  { kind: '7', label: '7 дней' },
  { kind: '30', label: '30 дней' },
  { kind: 'all', label: 'Всё время' },
  { kind: 'custom', label: 'Свои даты' },
]

/** Локальная дата браузера — «2026-09-28». */
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

/* ——— Форматирование ——— */

const STATUS_TEXT: Record<PaymentProblem['status'], string> = {
  unmatched_user: 'Человек не найден',
  unknown_offer: 'Оффер не привязан',
  error: 'Ошибка разбора',
  processed: 'Разобрано',
}

function dateTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function dateOnly(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function money(amount: number | null, currency: string | null): string {
  if (amount === null) return '—'
  return !currency || currency === 'RUB' ? rub(amount) : `${amount.toLocaleString('ru-RU')} ${currency}`
}

/* ——— Раздел ——— */

export default function AdminPayments({ token, fail }: { token: string; fail: Fail }) {
  const [kind, setKind] = useState<PeriodKind>('30')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [foreign, setForeign] = useState(false)
  const [data, setData] = useState<PaymentProblems | null>(null)
  const [error, setError] = useState('')
  const period = periodOf(kind, from, to)

  useEffect(() => {
    // Свои даты — ждём обе.
    if (kind === 'custom' && (!from || !to)) return
    let alive = true
    setData(null)
    setError('')
    adminApi.paymentProblems(token, { from: period.from, to: period.to, foreign }).then(
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
  }, [token, kind, from, to, period.from, period.to, foreign, fail])

  // Выдали доступ — строка меняется на ту, что вернул сервер, остальные не трогаем.
  const replace = (next: PaymentProblem) =>
    setData((d) => d && { ...d, items: d.items.map((p) => (p.id === next.id ? next : p)) })

  const hidden = data?.foreign_hidden ?? 0

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
        <div className="chips payments__foreign">
          <button type="button" className={`chip ${foreign ? 'is-on' : ''}`} onClick={() => setForeign((v) => !v)}>
            {foreign ? 'Скрыть чужие оплаты' : `Показать чужие оплаты${data ? ` (${hidden})` : ''}`}
          </button>
        </div>
        <p className="admin__period-note">
          Дата — когда GetCourse сообщил об оплате. Чужие оплаты — заказы других продуктов общего
          аккаунта GetCourse: оффер не привязан к нашим тарифам, и человека с такой почтой у нас нет.
        </p>
      </Card>

      <Card
        title="Оплаты без доступа"
        text="Сюда попадает оплата, по которой доступ не открылся сам: человека не нашли по почте из заказа, оффер не привязан к тарифу или уведомление GetCourse не разобралось. Чтобы выдать доступ, впишите почту аккаунта, с которой человек зарегистрирован: заказ привяжется к нему, а действие попадёт в журнал администратора."
      >
        {error && <p className="page__note is-bad">{error}</p>}
        <div className="admin__scroll">
          <table className="admin__table payments__table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Заказ</th>
                <th>Почта в GetCourse</th>
                <th>Оффер</th>
                <th className="is-num">Сумма</th>
                <th>Статус</th>
                <th>Аккаунт</th>
                <th>Действие</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((p) => (
                <ProblemRow key={p.id} problem={p} tariffs={data.tariffs} token={token} fail={fail} onGranted={replace} />
              ))}
              {data && data.items.length === 0 && (
                <tr>
                  <td className="admin__empty" colSpan={8}>
                    За этот период оплат без доступа нет
                  </td>
                </tr>
              )}
              {!data && !error && (
                <tr>
                  <td className="admin__empty" colSpan={8}>
                    Загружаем…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}

/* ——— Строка оплаты ——— */

type RowProps = {
  problem: PaymentProblem
  tariffs: PaymentTariff[]
  token: string
  fail: Fail
  onGranted(next: PaymentProblem): void
}

function ProblemRow({ problem: p, tariffs, token, fail, onGranted }: RowProps) {
  return (
    <tr>
      <td>{dateTime(p.received_at)}</td>
      <td>
        {p.order_id ?? '—'}
        {p.order_number && <span className="payments__sub">№ {p.order_number}</span>}
      </td>
      <td>{p.email ?? '—'}</td>
      <td className="payments__wrap">
        {p.offer_title || (p.offer_id ? `ID ${p.offer_id}` : '—')}
        <span className="payments__sub">{p.tariff ? `тариф «${p.tariff.name}»` : 'не привязан к тарифу'}</span>
      </td>
      <td className="is-num">{money(p.amount, p.currency)}</td>
      <td className="payments__wrap">
        <span className={`payments__status is-${p.status}`}>{STATUS_TEXT[p.status]}</span>
        {(p.status === 'error' || p.status === 'processed') && p.detail && (
          <span className="payments__sub">{p.detail}</span>
        )}
      </td>
      <td>
        {p.user ? (
          <>
            {p.user.email}
            {!p.user.email_verified && <span className="payments__sub">почта не подтверждена</span>}
          </>
        ) : (
          <span className="payments__none">не найден</span>
        )}
      </td>
      <td className="payments__action">
        <Action problem={p} tariffs={tariffs} token={token} fail={fail} onGranted={onGranted} />
      </td>
    </tr>
  )
}

/** Что можно сделать с оплатой: выдать доступ или объяснить, почему нечего. */
function Action({ problem: p, tariffs, token, fail, onGranted }: RowProps) {
  const [email, setEmail] = useState(p.user?.email ?? p.email ?? '')
  const [tariff, setTariff] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  // Итог выдачи — зелёной строкой на месте формы; строка уже с новым статусом.
  if (done) return <p className="page__note payments__result">{done}</p>

  if (p.access) {
    return (
      <span className="payments__muted">
        Доступ уже выдан: {p.access.user_email} до {dateOnly(p.access.paid_until)}
      </span>
    )
  }

  if (!p.can_grant) {
    return (
      <span className="payments__muted">
        {p.order_id ? 'Выдать отсюда нельзя' : 'Нет ID заказа — доступ выдаст сверка с GetCourse'}
      </span>
    )
  }

  const submit = async () => {
    if (!isEmail(email)) {
      setError('Впишите почту аккаунта, с которой человек зарегистрирован')
      return
    }
    if (!p.tariff && !tariff) {
      setError('Оффер не привязан ни к одному тарифу — выберите тариф')
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await adminApi.grantPayment(token, p.id, {
        email: email.trim(),
        tariff_code: p.tariff ? null : tariff,
      })
      setDone(res.message)
      onGranted(res.problem)
    } catch (e) {
      // 401/403 — снова форма входа, остальное — строкой под формой.
      fail(e, setError)
      setBusy(false)
    }
  }

  return (
    <form
      className="payments__form"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <div className="payments__fields">
        <input
          className="payments__input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="почта аккаунта"
          aria-label="Почта аккаунта"
          disabled={busy}
        />
        {!p.tariff && (
          <select
            className="payments__input payments__select"
            value={tariff}
            onChange={(e) => setTariff(e.target.value)}
            aria-label="Тариф"
            disabled={busy}
          >
            <option value="">Тариф…</option>
            {tariffs.map((t) => (
              <option key={t.code} value={t.code}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        <button className="page__btn payments__btn" type="submit" disabled={busy}>
          {busy ? 'Выдаём…' : 'Выдать доступ'}
        </button>
      </div>
      {error && <p className="page__note is-bad">{error}</p>}
    </form>
  )
}
