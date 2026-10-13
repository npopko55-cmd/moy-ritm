/**
 * Раздел админки «Поведение» — /admin/behavior.
 *
 * Сравнивает, как двигаются люди из разных воронок в первые три недели после
 * регистрации: какой онбординг лучше приучает возвращаться. Три колонки —
 * «3 дня», «Челлендж» (21 день) и «Без воронки», строки — метрики,
 * под каждой короткая подсказка, как она считается. Все правила подсчёта —
 * на сервере (раздел 10 docs/STATS.md бэкенда); здесь только показ.
 *
 * Период — даты регистрации, как у сводки воронок. Всплывающих окон нет:
 * всё на странице.
 *
 * С 09.10.2026 справа от трёх колонок — гостевые ссылки /play/ по меткам
 * («3 дня · dima-blog»): люди, зарегистрировавшиеся гостем по ссылке. Они же
 * входят в колонку своей воронки — об этом строка под таблицей.
 */

import { useEffect, useState } from 'react'
import { adminApi, type BehaviorColumn, type BehaviorGroup, type BehaviorReport } from '../api/admin'
import { PeriodChoice, usePeriod } from './AdminPeriod'
import { Card } from './Page'

type Fail = (e: unknown, show: (text: string) => void) => void

const COLUMNS: { group: BehaviorGroup; title: string; note?: string }[] = [
  { group: 'trial3d', title: '3 дня' },
  { group: 'trial20', title: 'Челлендж', note: '21 день' },
  { group: 'none', title: 'Без воронки' },
]

/** Подпись воронки в заголовке колонки гостевой ссылки. */
const FUNNEL_TITLES: Record<string, string> = { trial3d: '3 дня', trial20: 'Челлендж' }

/* ——— Форматирование ——— */

const NO_DATA = 'нет данных'

const decimal = (n: number, digits = 1) =>
  n.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: digits })

const percent = (share: number) => `${decimal(share * 100, share < 0.1 ? 1 : 0)}%`

/** Ячейка: главное число и мелкая строка под ним. `null` — нет данных. */
type Cell = { value: string; sub?: string } | null

type Metric = {
  label: string
  hint: string
  cell(c: BehaviorColumn): Cell
}

function activeDays(d: BehaviorColumn['active_days_7']): Cell {
  if (!d.users || d.mean === null) return null
  const median = d.median === null ? '' : ` · медиана ${decimal(d.median)}`
  return { value: decimal(d.mean), sub: `в среднем${median} · из ${d.users} чел.` }
}

function shareCell(returned: number, users: number, share: number | null): Cell {
  if (!users || share === null) return null
  return { value: percent(share), sub: `${returned} из ${users}` }
}

const perDay = (value: number | null, format: (n: number) => string): Cell =>
  value === null ? null : { value: format(value) }

function metrics(report: BehaviorReport): { title: string; rows: Metric[] }[] {
  const minMinutes = Math.round(report.active_day_min_seconds / 60)
  const gapMinutes = Math.round(report.session_gap_seconds / 60)
  const w = report.window_days
  return [
    {
      title: 'Сколько дней двигаются',
      rows: [
        {
          label: 'Активных дней за первую неделю',
          hint: `День, когда человек двигался от ${minMinutes} мин за день. Дни 0–6 после регистрации; считаются только те, у кого эта неделя уже прошла.`,
          cell: (c) => activeDays(c.active_days_7),
        },
        {
          label: `Активных дней за первые ${w} день`,
          hint: `То же за дни 0–${w - 1}; только те, у кого эти три недели уже прошли целиком.`,
          cell: (c) => activeDays(c.active_days_21),
        },
        {
          label: 'Вернулись через неделю',
          hint: 'Был хотя бы один активный день с 7-го по 13-й день после регистрации.',
          cell: (c) => shareCell(c.returned_week2.returned, c.returned_week2.users, c.returned_week2.share),
        },
      ],
    },
    {
      title: 'Удержание по дням',
      rows: [1, 3, 7, 14, 21].map((day) => ({
        label: `День ${day}`,
        hint:
          day === 1
            ? `Доля тех, кто двигался (от ${minMinutes} мин) на следующий день после регистрации. День 0 — сама регистрация, по часам человека. Считаются только те, у кого этот день уже закончился.`
            : `Доля тех, кто двигался на ${day}-й день после регистрации.`,
        cell: (c) => {
          const r = c.retention.find((x) => x.day === day)
          return r ? shareCell(r.returned, r.users, r.share) : null
        },
      })),
    },
    {
      title: `Активный день (первые ${w} день)`,
      rows: [
        {
          label: 'Заходов в день',
          hint: `Сколько раз за активный день человек садился заниматься. Паузы меньше ${gapMinutes} минут — это один заход.`,
          cell: (c) => perDay(c.sessions_per_active_day, (n) => decimal(n, 2)),
        },
        {
          label: 'Длина захода',
          hint: 'Минут движения за один заход, в среднем.',
          cell: (c) => perDay(c.session_minutes, (n) => `${decimal(n)} мин`),
        },
        {
          label: 'Минут в день',
          hint: 'Минут движения за активный день, в среднем.',
          cell: (c) => perDay(c.minutes_per_active_day, (n) => `${decimal(n)} мин`),
        },
        {
          label: 'Шагов в день',
          hint: 'Шагов за активный день, в среднем (оценка плеера).',
          cell: (c) => perDay(c.steps_per_active_day, (n) => `~${decimal(n, 0)}`),
        },
      ],
    },
  ]
}

/* ——— Раздел ——— */

export default function AdminBehavior({ token, fail }: { token: string; fail: Fail }) {
  const choice = usePeriod()
  const { kind, from, to, period } = choice

  const [report, setReport] = useState<BehaviorReport | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    // Свои даты — ждём обе.
    if (kind === 'custom' && (!from || !to)) return
    let alive = true
    setError('')
    adminApi.behavior(token, { from: period.from, to: period.to }).then(
      (next) => {
        if (alive) setReport(next)
      },
      (e) => {
        if (alive) fail(e, setError)
      },
    )
    return () => {
      alive = false
    }
  }, [token, kind, from, to, period.from, period.to, fail])

  // Колонки воронок — всегда; гостевые ссылки — сколько прислал сервер
  // (только те, по которым за период кто-то зарегистрировался).
  const columns: ColumnData[] = [
    ...COLUMNS.map((c) => ({
      key: c.group,
      title: c.title,
      note: c.note,
      data: report?.funnels.find((f) => f.funnel === c.group) ?? null,
    })),
    ...(report?.guest_links ?? []).map((g) => ({
      key: `${g.funnel}:${g.source}`,
      title: `${FUNNEL_TITLES[g.funnel] ?? g.funnel} · ${g.source || 'без метки'}`,
      note: 'гостевая ссылка',
      data: g,
    })),
  ]
  const hasGuestLinks = columns.length > COLUMNS.length

  return (
    <>
      <Card title="Период регистрации">
        <PeriodChoice state={choice} />
        <p className="admin__period-note">
          Люди, зарегистрированные в этот период, и что они делали в первые три недели после
          регистрации. Удалённые аккаунты не считаются.
        </p>
        {error && <p className="page__note is-bad">{error}</p>}
      </Card>

      <Card title="Поведение по воронкам">
        <div className="admin__scroll">
          <table className="admin__table behavior__table">
            <thead>
              <tr>
                <th>Метрика</th>
                {columns.map((c) => (
                  <th key={c.key} className="is-num">
                    {c.title}
                    {c.note && <span className="behavior__col-note">{c.note}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="behavior__label">
                  Зарегистрировались
                  <span className="behavior__hint">Сколько человек пришло за период.</span>
                </td>
                {columns.map((c) => (
                  <td key={c.key} className="is-num">
                    <span className="behavior__value">
                      {report ? c.data?.registered.toLocaleString('ru-RU') ?? '0' : '…'}
                    </span>
                  </td>
                ))}
              </tr>
              {report &&
                metrics(report).map((block) => (
                  <BehaviorBlock key={block.title} title={block.title} rows={block.rows} columns={columns} />
                ))}
              {!report && !error && (
                <tr>
                  <td className="admin__empty" colSpan={columns.length + 1}>
                    Загружаем…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {hasGuestLinks && (
          <p className="admin__period-note">
            «· метка» — гостевые ссылки /play/: люди, зарегистрировавшиеся гостем по этой ссылке. Они
            же входят в колонку своей воронки.
          </p>
        )}
      </Card>
    </>
  )
}

type ColumnData = { key: string; title: string; note?: string; data: BehaviorColumn | null }

function BehaviorBlock({ title, rows, columns }: { title: string; rows: Metric[]; columns: ColumnData[] }) {
  return (
    <>
      <tr className="behavior__section">
        <th colSpan={columns.length + 1} scope="colgroup">
          {title}
        </th>
      </tr>
      {rows.map((m) => (
        <tr key={m.label}>
          <td className="behavior__label">
            {m.label}
            <span className="behavior__hint">{m.hint}</span>
          </td>
          {columns.map((c) => {
            const cell = c.data && c.data.registered > 0 ? m.cell(c.data) : null
            return (
              <td key={c.key} className="is-num">
                {cell ? (
                  <>
                    <span className="behavior__value">{cell.value}</span>
                    {cell.sub && <span className="behavior__sub">{cell.sub}</span>}
                  </>
                ) : (
                  <span className="behavior__none">{NO_DATA}</span>
                )}
              </td>
            )
          })}
        </tr>
      ))}
    </>
  )
}
