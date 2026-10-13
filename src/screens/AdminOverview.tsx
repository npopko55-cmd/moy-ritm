/**
 * Раздел админки «Общая статистика» — /admin, главная страница админки.
 *
 * Вопрос владельца (Дима, 13.10.2026): сколько людей заходит в день,
 * сколько регистраций по дням, сколько тренировок. Всё по сайту целиком, а
 * не по воронкам: сверху итоги за период, ниже таблица по дням с полоской
 * заходов, чтобы глазом видеть динамику. Правила подсчёта — на сервере
 * (app/services/site_stats_service.py бэкенда); здесь только показ.
 *
 * Заходы сайт начал считать с выкладки счётчика (src/lib/funnel.ts,
 * reportSiteVisit) — раньше прямые заходы не считались нигде. Об этом
 * честно говорит строка под итогами.
 */

import { useEffect, useState } from 'react'
import { adminApi, type Overview } from '../api/admin'
import { PeriodChoice, usePeriod } from './AdminPeriod'
import { Card } from './Page'

type Fail = (e: unknown, show: (text: string) => void) => void

const num = (n: number) => n.toLocaleString('ru-RU')

/** «2026-10-13» → Date той же даты в поясе браузера (без сдвига на UTC). */
function dayDate(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** «13.10.2026». */
const dayText = (day: string) =>
  dayDate(day).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })

/** «пн». */
const weekday = (day: string) => dayDate(day).toLocaleDateString('ru-RU', { weekday: 'short' })

/** Минуты → «3 ч 12 мин»; меньше часа — пусто: цифра и так видна. */
function hoursText(minutes: number): string {
  if (minutes < 60) return ''
  return `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`
}

export default function AdminOverview({ token, fail }: { token: string; fail: Fail }) {
  const choice = usePeriod()
  const { kind, from, to, period } = choice

  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    // Свои даты — ждём обе.
    if (kind === 'custom' && (!from || !to)) return
    let alive = true
    setError('')
    setData(null)
    adminApi.overview(token, { from: period.from, to: period.to }).then(
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
  }, [token, kind, from, to, period.from, period.to, fail])

  const t = data?.totals
  const tiles: { label: string; value: number | undefined; sub?: string }[] = [
    { label: 'Заходы на сайт', value: t?.visits, sub: 'разных браузеров' },
    { label: 'Гости начали тренировку', value: t?.guests, sub: 'без регистрации' },
    {
      label: 'Регистрации',
      value: t?.registered,
      sub: t ? `из них по ссылкам воронок — ${num(t.registered_by_funnel)}` : undefined,
    },
    { label: 'Занимались', value: t?.active_users, sub: 'разных людей с движением' },
    {
      label: 'Тренировки',
      value: t?.workouts,
      sub: t ? `засчитанные, от минуты; начато всего — ${num(t.workouts_started)}` : undefined,
    },
    { label: 'Минуты движения', value: t?.minutes, sub: t ? hoursText(t.minutes) : undefined },
  ]

  // Полоска заходов — от самого людного дня периода.
  const maxVisits = Math.max(1, ...(data?.days ?? []).map((d) => d.visits))

  return (
    <>
      <Card title="Период">
        <PeriodChoice state={choice} />
        {error && <p className="page__note is-bad">{error}</p>}
      </Card>

      <Card title="Итоги за период">
        <div className="overview__tiles">
          {tiles.map((tile) => (
            <div key={tile.label} className="overview__tile">
              <span className="admin__step-label">{tile.label}</span>
              <span className="admin__step-value">{tile.value === undefined ? '…' : num(tile.value)}</span>
              {tile.sub && <span className="admin__step-pct">{tile.sub}</span>}
            </div>
          ))}
        </div>
        <p className="admin__period-note">
          {data?.visits_since
            ? `Заходы считаются с ${dayText(data.visits_since)} — уникальные браузеры в день; за период — разные браузеры за весь период, не сумма дней. `
            : data
              ? 'Заходы начнут считаться после выкладки. '
              : ''}
          Регистрации — без удалённых аккаунтов и админа. Даты — по Москве; у тренировок — по
          часовому поясу человека.
        </p>
      </Card>

      <Card title="По дням">
        <div className="admin__scroll">
          <table className="admin__table overview__table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Заходы</th>
                <th className="is-num">Гости</th>
                <th className="is-num">Регистрации</th>
                <th className="is-num">Занимались</th>
                <th className="is-num">Тренировки</th>
                <th className="is-num">Минуты</th>
              </tr>
            </thead>
            <tbody>
              {data?.days.map((d) => (
                <tr key={d.day}>
                  <td>
                    {dayText(d.day)} <span className="overview__weekday">{weekday(d.day)}</span>
                  </td>
                  <td className="overview__visits">
                    <span className="overview__bar" aria-hidden="true">
                      <span style={{ width: `${(d.visits / maxVisits) * 100}%` }} />
                    </span>
                    {num(d.visits)}
                  </td>
                  <td className="is-num">{num(d.guests)}</td>
                  <td className="is-num">
                    {num(d.registered)}
                    {d.registered_by_funnel > 0 && (
                      <span className="admin__cell-pct">по воронкам — {num(d.registered_by_funnel)}</span>
                    )}
                  </td>
                  <td className="is-num">{num(d.active_users)}</td>
                  <td className="is-num">{num(d.workouts)}</td>
                  <td className="is-num">{num(d.minutes)}</td>
                </tr>
              ))}
              {data && data.days.length === 0 && (
                <tr>
                  <td className="admin__empty" colSpan={7}>
                    За эти даты данных нет
                  </td>
                </tr>
              )}
              {!data && !error && (
                <tr>
                  <td className="admin__empty" colSpan={7}>
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
