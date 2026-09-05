/**
 * «Мой прогресс» (раздел 5.3 архитектуры).
 *
 * Весь экран — один запрос GET /stats/progress. Календарь листается тем же
 * запросом с другим месяцем; график недель — тренд «сейчас» и вместе с
 * календарём не листается, так и написано в docs/STATS.md.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import type { StatsProgress } from '../api/types'
import { useSession } from '../auth/SessionProvider'
import { flowTarget } from '../auth/guards'
import { days, formatDay, formatMonth, parseLocalDate, pluralWord, toMinutes } from '../lib/date'
import { errorText } from './Account'
import PageShell, { Card } from './Page'
import './Progress.css'

/** Месяц соседний: «2026-09» + 1 → «2026-10». */
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Сегодня в поясе человека, а не в поясе его браузера. */
function todayIn(timezone: string): string {
  try {
    // sv-SE печатает дату как «2026-09-05» — ровно в том виде, в каком
    // локальные даты приходят с бэкенда.
    return new Intl.DateTimeFormat('sv-SE', { timeZone: timezone }).format(new Date())
  } catch {
    const d = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  }
}

/** Насколько плотно закрашен день: ноль — пусто, дальше четыре ступени. */
function level(seconds: number): number {
  const m = toMinutes(seconds)
  if (m <= 0) return 0
  if (m < 10) return 1
  if (m < 20) return 2
  if (m < 40) return 3
  return 4
}

/** «12 мин» или «1 ч 05 мин» — рекорды бывают длинными. */
function duration(seconds: number): string {
  const total = toMinutes(seconds)
  if (total < 60) return `${total} мин`
  return `${Math.floor(total / 60)} ч ${String(total % 60).padStart(2, '0')} мин`
}

const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']

export default function Progress() {
  const navigate = useNavigate()
  const { me, access } = useSession()

  // «Сегодня» и «текущий месяц» считаем в поясе профиля, а не браузера:
  // иначе у человека, улетевшего на восток, календарь начнётся не с того дня.
  const today = todayIn(me?.user.timezone ?? '')
  /** Дальше этого месяца листать некуда: будущего в статистике нет. */
  const maxMonth = today.slice(0, 7)

  const [month, setMonth] = useState(maxMonth)
  const [data, setData] = useState<StatsProgress | null>(null)
  const [failed, setFailed] = useState('')

  useEffect(() => {
    let alive = true
    setFailed('')
    void (async () => {
      try {
        const next = await api.statsProgress(month)
        if (alive) setData(next)
      } catch (e) {
        if (alive) setFailed(errorText(e, 'Не получилось загрузить прогресс'))
      }
    })()
    return () => {
      alive = false
    }
  }, [month])

  if (failed) {
    return (
      <PageShell title="Мой прогресс" wide>
        <Card text={failed} />
      </PageShell>
    )
  }

  if (!data) {
    return (
      <PageShell title="Мой прогресс" wide>
        <Card text="Загружаем…" />
      </PageShell>
    )
  }

  // Ни одного дня с движением за всё время: показывать нечего.
  const never = !data.records.best_day
  if (never) {
    return (
      <PageShell title="Мой прогресс" wide>
        <Card>
          <div className="page__empty">
            <p>Пока пусто — начни первую тренировку, и здесь появятся дни, минуты и рекорды.</p>
            <button
              className="btn btn--pink-lg"
              onClick={() => navigate(flowTarget(Boolean(me), access))}
            >
              Влиться в поток
            </button>
          </div>
        </Card>
      </PageShell>
    )
  }

  // Пустые клетки перед первым числом: неделя начинается с понедельника.
  const first = data.days[0]
  const offset = first ? (parseLocalDate(first.local_date).getDay() + 6) % 7 : 0
  const weekTop = Math.max(1, ...data.weeks.map((w) => toMinutes(w.seconds)))
  const canForward = month < maxMonth

  return (
    <PageShell title="Мой прогресс" lead="Дни, минуты и рекорды — всё из ваших тренировок." wide>
      <Card>
        <div className="calendar__top">
          <button
            className="calendar__arrow"
            aria-label="Предыдущий месяц"
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            ←
          </button>
          <h2 className="calendar__month">{formatMonth(data.month)}</h2>
          <button
            className="calendar__arrow"
            aria-label="Следующий месяц"
            disabled={!canForward}
            onClick={() => canForward && setMonth(shiftMonth(month, 1))}
          >
            →
          </button>
        </div>

        <div className="calendar">
          {WEEKDAYS.map((d) => (
            <span key={d} className="calendar__wd">
              {d}
            </span>
          ))}
          {Array.from({ length: offset }, (_, i) => (
            <span key={`pad-${i}`} className="calendar__pad" />
          ))}
          {data.days.map((d) => (
            <span
              key={d.local_date}
              className={`calendar__day is-l${level(d.seconds)} ${d.local_date === today ? 'is-today' : ''}`}
              title={`${formatDay(d.local_date)} — ${toMinutes(d.seconds)} мин`}
            >
              {parseLocalDate(d.local_date).getDate()}
            </span>
          ))}
        </div>

        <ul className="month-totals">
          <li>
            <strong>{toMinutes(data.totals.seconds)}</strong>
            <span>
              {pluralWord(toMinutes(data.totals.seconds), 'минута', 'минуты', 'минут')} за месяц
            </span>
          </li>
          <li>
            <strong>{data.totals.workouts}</strong>
            <span>
              {pluralWord(data.totals.workouts, 'тренировка', 'тренировки', 'тренировок')}
            </span>
          </li>
          <li>
            <strong>{data.totals.days_active}</strong>
            <span>
              {pluralWord(data.totals.days_active, 'день', 'дня', 'дней')} с движением
            </span>
          </li>
        </ul>
      </Card>

      <Card title="Минуты по неделям" text="Последние двенадцать недель, считая от текущей.">
        <div className="bars">
          {data.weeks.map((w, i) => (
            <div key={w.week_start} className="bars__col">
              <span className="bars__value">{toMinutes(w.seconds) || ''}</span>
              <div
                className={`bars__bar ${i === data.weeks.length - 1 ? 'is-now' : ''}`}
                style={{ height: `${Math.round((toMinutes(w.seconds) / weekTop) * 100)}%` }}
              />
              <span className="bars__label">
                {parseLocalDate(w.week_start).toLocaleDateString('ru-RU', {
                  day: 'numeric',
                  month: 'numeric',
                })}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Рекорды" text="За всё время, а не за показанный месяц.">
        <ul className="records">
          <li className="records__item">
            <strong>{duration(data.records.longest_workout_seconds)}</strong>
            <span>самая длинная тренировка</span>
          </li>
          <li className="records__item">
            <strong>{days(data.records.longest_streak_days)}</strong>
            <span>самая длинная серия</span>
          </li>
          <li className="records__item">
            <strong>{data.records.best_day ? duration(data.records.best_day.seconds) : '—'}</strong>
            <span>
              лучший день
              {data.records.best_day ? `, ${formatDay(data.records.best_day.local_date)}` : ''}
            </span>
          </li>
          <li className="records__item">
            <strong>
              {data.records.best_week ? duration(data.records.best_week.seconds) : '—'}
            </strong>
            <span>
              лучшая неделя
              {data.records.best_week
                ? `, с ${formatDay(data.records.best_week.week_start)}`
                : ''}
            </span>
          </li>
        </ul>
      </Card>

      {data.totals.seconds === 0 && (
        <p className="page__lead">В этом месяце вы ещё не двигались — но рекорды никуда не делись.</p>
      )}
    </PageShell>
  )
}
