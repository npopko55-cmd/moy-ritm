/**
 * Админка → «Опрос»: ответы на опрос в боте (docs/BOT.md бэкенда).
 *
 * Бот задаёт вопросы через 3, 7 и 21 день после регистрации: первый —
 * «насколько вероятно, что порекомендуете…» по шкале 0–10, по нему
 * считается NPS (% оценок 9–10 минус % оценок 0–6). Что на странице:
 *   • фильтры воронки и дня опроса;
 *   • сводка: средняя оценка и NPS всего и по воронкам;
 *   • таблица ответов (новые сверху) и она же — CSV-файлом.
 * Всплывающих окон нет.
 */

import { useEffect, useState } from 'react'
import { adminApi, type SurveyData, type SurveyFunnel, type SurveyQuery, type SurveyStats } from '../api/admin'
import { Card } from './Page'
import './AdminBot.css'

type Fail = (e: unknown, show: (text: string) => void) => void

const FUNNELS: { key: SurveyFunnel | ''; label: string }[] = [
  { key: '', label: 'Все' },
  { key: 'trial3d', label: 'Воронка 1 (3 дня)' },
  { key: 'trial20', label: 'Воронка 2 (челлендж)' },
  { key: 'organic', label: 'Без воронки' },
]

const POINTS = [0, 3, 7, 21]

const funnelTitle = (funnel: string | null | undefined) =>
  funnel === 'trial3d' ? 'Воронка 1 (3 дня)' : funnel === 'trial20' ? 'Воронка 2 (челлендж)' : 'Без воронки'

const nps = (value: number | null) => (value === null ? '—' : `${value > 0 ? '+' : ''}${value}`)

function dateTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function AdminSurvey({ token, fail }: { token: string; fail: Fail }) {
  const [funnel, setFunnel] = useState<SurveyFunnel | ''>('')
  const [point, setPoint] = useState(0)
  const [data, setData] = useState<SurveyData | null>(null)
  const [error, setError] = useState('')
  const [csvBusy, setCsvBusy] = useState(false)
  const [csvError, setCsvError] = useState('')

  const q: SurveyQuery = { funnel: funnel || undefined, point: point || undefined }

  useEffect(() => {
    let alive = true
    setData(null)
    setError('')
    adminApi.survey(token, { funnel: funnel || undefined, point: point || undefined }).then(
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
  }, [token, funnel, point, fail])

  const download = async () => {
    setCsvBusy(true)
    setCsvError('')
    try {
      const blob = await adminApi.surveyCsv(token, q)
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = `ritm-opros-${funnel || 'vse'}-${new Date().toISOString().slice(0, 10)}.csv`
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

  const questions = data?.questions ?? []

  return (
    <>
      <Card title="Фильтр">
        <div className="chips">
          {FUNNELS.map((f) => (
            <button
              key={f.key || 'all'}
              type="button"
              className={`chip ${funnel === f.key ? 'is-on' : ''}`}
              onClick={() => setFunnel(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="chips botposts__when survey__points">
          {POINTS.map((p) => (
            <button key={p} type="button" className={`chip ${point === p ? 'is-on' : ''}`} onClick={() => setPoint(p)}>
              {p ? `${p}-й день` : 'Все дни'}
            </button>
          ))}
        </div>
      </Card>

      <Card
        title="NPS"
        text="Индекс NPS — доля оценок 9–10 минус доля оценок 0–6, в процентах: от −100 до +100. Рядом — средняя оценка."
      >
        {!data && !error && <p className="admin__period-note">Загружаем…</p>}
        {error && <p className="page__note is-bad">{error}</p>}
        {data && (
          <div className="survey__stats">
            <Stat title="Всего" stats={data.total} />
            {data.summary.map((s) => (
              <Stat key={s.funnel ?? 'organic'} title={funnelTitle(s.funnel)} stats={s} />
            ))}
          </div>
        )}
      </Card>

      <Card title="Ответы" text="Строка — человек в одном дне опроса. Новые сверху.">
        <div className="admin__tools">
          <button className="page__btn" type="button" onClick={() => void download()} disabled={csvBusy}>
            {csvBusy ? 'Готовим файл…' : 'Скачать ответы (CSV)'}
          </button>
        </div>
        {csvError && <p className="page__note is-bad">{csvError}</p>}

        <div className="admin__scroll">
          <table className="admin__table">
            <thead>
              <tr>
                <th>Когда</th>
                <th>Кто</th>
                <th>Воронка</th>
                <th className="is-num">День</th>
                {questions.map((x) => (
                  <th key={x.key} title={x.text}>
                    {x.key === 'nps' ? 'Оценка 0–10' : x.text}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.items.map((r) => (
                <tr key={`${r.tg_user_id}-${r.point}`}>
                  <td>{dateTime(r.answered_at)}</td>
                  <td>{r.email ?? `Telegram ${r.tg_user_id}`}</td>
                  <td>{funnelTitle(r.funnel)}</td>
                  <td className="is-num">{r.point}</td>
                  {questions.map((x) => (
                    <td key={x.key} className={x.key === 'nps' ? 'is-num' : 'survey__answer'}>
                      {r.answers[x.key] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
              {data && data.items.length === 0 && (
                <tr>
                  <td className="admin__empty" colSpan={4 + questions.length}>
                    Ответов пока нет
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

function Stat({ title, stats }: { title: string; stats: SurveyStats }) {
  return (
    <div className="survey__stat">
      <p className="survey__stat-title">{title}</p>
      <p className="survey__stat-nps">NPS {nps(stats.nps)}</p>
      <p className="survey__stat-note">
        Средняя оценка {stats.avg_score ?? '—'} · оценок {stats.scores} · ответили {stats.responses}
      </p>
    </div>
  )
}
