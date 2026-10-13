/**
 * Выбор периода в разделах админки: всё время, 7 дней, 30 дней или свои
 * даты. Общий для «Общей статистики», «Аналитики воронок» и «Поведения»,
 * чтобы «7 дней» везде значило одно и то же: сегодня и шесть дней до него
 * (по часам браузера; сервер считает даты по Москве, включительно).
 */

import { useState } from 'react'
import type { Period } from '../api/admin'

export type PeriodKind = 'all' | '7' | '30' | 'custom'

export const PERIODS: { kind: PeriodKind; label: string }[] = [
  { kind: 'all', label: 'Всё время' },
  { kind: '7', label: '7 дней' },
  { kind: '30', label: '30 дней' },
  { kind: 'custom', label: 'Свои даты' },
]

/** Локальная дата браузера — «2026-09-22». */
export function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function periodOf(kind: PeriodKind, from: string, to: string): Period {
  if (kind === 'all') return {}
  if (kind === 'custom') return { from: from || undefined, to: to || undefined }
  const start = new Date()
  start.setDate(start.getDate() - (Number(kind) - 1))
  return { from: ymd(start), to: ymd(new Date()) }
}

/** Выбранный период раздела: чипы, свои даты и готовый `period` для запроса. */
export function usePeriod(initial: PeriodKind = 'all') {
  const [kind, setKind] = useState<PeriodKind>(initial)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  return { kind, setKind, from, setFrom, to, setTo, period: periodOf(kind, from, to) }
}

export type PeriodState = ReturnType<typeof usePeriod>

/** Чипы периода и, когда выбраны свои даты, два поля «С … по …». */
export function PeriodChoice({ state }: { state: PeriodState }) {
  const { kind, setKind, from, setFrom, to, setTo } = state
  return (
    <>
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
    </>
  )
}
