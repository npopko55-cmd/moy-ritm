/**
 * «Мой прогресс» (раздел 5.3 архитектуры).
 *
 * Дашборд: слева узкое меню кабинета, справа одна большая карточка —
 * показатели, календарь месяца, недели, награды и потоки. Всё содержимое
 * приходит одним запросом GET /stats/progress; календарь листается тем же
 * запросом с другим месяцем, а недели, награды и потоки — это «сейчас» и
 * вместе с календарём не листаются, так и написано в docs/STATS.md.
 *
 * Скрытая команда владельца: `/progress?demo=fill` наполняет демо-режим
 * правдоподобной историей за месяц, чтобы страницу можно было показать
 * во всей красе там, где бэкенда нет. Повторный вызов ничего не удваивает.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { IS_DEMO, api } from '../api/client'
import type { StatsProgress } from '../api/types'
import { useSession } from '../auth/SessionProvider'
import { flowTarget } from '../auth/guards'
import Logo from '../components/Logo'
import WaveBg from '../components/WaveBg'
import {
  Calendar,
  Check,
  Clock,
  Gear,
  Heart,
  Home,
  PlayCircle,
  PulseWave,
  Rocket,
  Sprout,
  Steps,
  Sun,
  User,
} from '../components/Icons'
import { getStream } from '../data/streams'
import { asset } from '../lib/asset'
import {
  formatDate,
  formatDay,
  formatDayShort,
  formatDayShortYear,
  formatMonth,
  parseLocalDate,
  pluralWord,
  toMinutes,
} from '../lib/date'
import { demoHistoryChunks } from '../lib/demoHistory'
import { errorText } from './Account'
import { useBack } from './Page'
import '../components/Logo.css'
import './Progress.css'

/** Ориентир кольца «Сегодня» — полчаса движения. Не цель, просто шкала. */
const DAY_GOAL_MINUTES = 30

/** Сколько недель показываем в графике. */
const WEEKS_SHOWN = 4

const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']

const MENU = [
  { icon: <Home size={19} />, label: 'Главная', to: '/' },
  { icon: <Clock size={19} />, label: 'Мой прогресс', to: '/progress' },
  { icon: <PlayCircle size={19} />, label: 'Потоки', to: '/player/cardio' },
  { icon: <User size={19} />, label: 'Профиль', to: '/profile' },
  { icon: <Gear size={19} />, label: 'Настройки', to: '/settings' },
] as const

/** Своя картинка у каждой награды: коды приходят с сервера, знаки — наши. */
const BADGES: Record<string, ReactNode> = {
  first_step: <Sprout size={22} />,
  lets_go: <Rocket size={22} />,
  twice_a_day: <Sun size={22} />,
  five_days: <Check size={20} />,
  week_rhythm: <Calendar size={22} />,
  ten_days: <Heart size={22} />,
}

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

/** Насколько густо закрашен день календаря: 0 — пусто, дальше три ступени. */
function level(seconds: number): number {
  const m = toMinutes(seconds)
  if (m <= 0) return 0
  if (m < 10) return 1
  if (m < 20) return 2
  return 3
}

/** «6 – 12 авг» — подпись столбика недели. */
function weekRange(weekStart: string): string {
  const end = parseLocalDate(weekStart)
  end.setDate(end.getDate() + 6)
  const p = (n: number) => String(n).padStart(2, '0')
  const endKey = `${end.getFullYear()}-${p(end.getMonth() + 1)}-${p(end.getDate())}`
  const from = parseLocalDate(weekStart)
  // Месяц пишем один раз, когда неделя целиком в нём: подпись и так узкая.
  const same = from.getMonth() === end.getMonth()
  return `${same ? from.getDate() : formatDayShort(weekStart)} – ${formatDayShort(endKey)}`
}

/** «164 мин» и «32 занятия» — в карточке потока. */
const sessionsWord = (n: number) => `${n} ${pluralWord(n, 'занятие', 'занятия', 'занятий')}`

export default function Progress() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const back = useBack()
  const { me, access, reload } = useSession()
  const [params] = useSearchParams()

  // «Сегодня» и «текущий месяц» считаем в поясе профиля, а не браузера:
  // иначе у человека, улетевшего на восток, календарь начнётся не с того дня.
  const today = todayIn(me?.user.timezone ?? '')
  /** Дальше этого месяца листать некуда: будущего в статистике нет. */
  const maxMonth = today.slice(0, 7)

  const [month, setMonth] = useState(maxMonth)
  const [data, setData] = useState<StatsProgress | null>(null)
  const [failed, setFailed] = useState('')
  const [filling, setFilling] = useState(false)
  /** Растёт после заливки демо-истории: заставляет перечитать цифры. */
  const [refresh, setRefresh] = useState(0)
  /**
   * Минуты за сегодня запоминаем из текущего месяца: карточка «Сегодня»
   * не должна меняться, когда листают календарь назад.
   */
  const [todaySeconds, setTodaySeconds] = useState(0)

  // Скрытая команда владельца. Куски отправляются обычной ручкой, поэтому
  // дальше всё считается тем же кодом, что и настоящая тренировка.
  const fill = IS_DEMO && params.get('demo') === 'fill'
  useEffect(() => {
    if (!fill) return
    let alive = true
    setFilling(true)
    void (async () => {
      try {
        const all = demoHistoryChunks()
        for (let i = 0; i < all.length; i += 50) {
          await api.sendChunks(all.slice(i, i + 50))
        }
      } catch {
        /* демо не отвечает только когда никто не вошёл — тогда и заливать некуда */
      }
      if (!alive) return
      setFilling(false)
      // Метку из адреса убираем: обновление страницы не должно лить снова.
      navigate(pathname, { replace: true })
      setRefresh((n) => n + 1)
    })()
    return () => {
      alive = false
    }
    // Один заход на одну метку в адресе: params и navigate меняют личность
    // на каждом рендере и перезапустили бы заливку по кругу.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fill])

  // Итоги за всё время лежат в профиле, а он загружен при открытии сайта.
  // После тренировки его нужно перечитать, иначе «Всего в движении» и серия
  // отстанут от календаря на этой же странице.
  useEffect(() => {
    if (fill) return
    void reload()
  }, [fill, refresh, reload])

  useEffect(() => {
    if (fill) return
    let alive = true
    setFailed('')
    void (async () => {
      try {
        const next = await api.statsProgress(month)
        if (!alive) return
        setData(next)
        // Сегодняшний день есть только в сетке текущего месяца.
        const now = next.days.find((d) => d.local_date === today)
        if (now) setTodaySeconds(now.seconds)
      } catch (e) {
        if (alive) setFailed(errorText(e, 'Не получилось загрузить прогресс'))
      }
    })()
    return () => {
      alive = false
    }
  }, [month, refresh, today, fill])

  const totalMinutes = toMinutes(me?.totals.total_seconds ?? 0)
  const totalHours = Math.floor(totalMinutes / 60)
  const streak = me?.totals.current_streak_days ?? 0
  const todayMinutes = toMinutes(todaySeconds)
  const paid = access?.status === 'none' || access?.status === 'expired' ? null : access?.paid_until

  return (
    <div className="dash">
      <WaveBg opacity={0.85} />

      {/* ——— Меню кабинета ——— */}
      <aside className="dash__side">
        <Link className="dash__logo" to="/" aria-label="На главную">
          <Logo />
        </Link>

        {/* Пришли из плеера — оставляем дорогу назад в ту же тренировку. */}
        {back.fromPlayer && (
          <button className="dash__back" onClick={back.go}>
            {back.label}
          </button>
        )}

        <ul className="dash__nav">
          {MENU.map((m) => (
            <li key={m.label}>
              <Link className={`dash__nav-item ${m.to === '/progress' ? 'is-on' : ''}`} to={m.to}>
                {m.icon}
                <span>{m.label}</span>
              </Link>
            </li>
          ))}
        </ul>

        {paid ? (
          <p className="dash__paid">Доступ до {formatDate(paid)}</p>
        ) : (
          <div className="dash__promo">
            <p className="dash__promo-title">Больше движений — больше возможностей!</p>
            <Link className="dash__promo-btn" to="/tariffs">
              Открыть все потоки
            </Link>
          </div>
        )}
      </aside>

      {/* ——— Основная карточка ——— */}
      <main className="dash__main">
        <div className="dash__card">
          <header className="dash__head">
            <div className="dash__intro">
              <h1 className="dash__title">Мой прогресс ♡</h1>
              <p className="dash__lead">
                Каждая минута в движении — это забота о себе.
                <br />
                И ты делаешь это отлично! 💗
              </p>
            </div>

            <div className="dash__visual">
              <div className="dash__blob" />
              <img
                className="dash__photo"
                src={asset('hero/hero.webp')}
                alt="Девушка двигается под музыку"
                decoding="async"
              />
              <p className="dash__hand dash__hand--a">Маленькие шаги — большие результаты!</p>
              <p className="dash__hand dash__hand--b">Ты супер!</p>
            </div>
          </header>

          {failed && <p className="dash__msg">{failed}</p>}
          {filling && <p className="dash__msg">Заполняем демо-историю…</p>}

          {/* ——— Четыре показателя ——— */}
          <ul className="tiles">
            <li className="tile">
              <span className="tile__icon tile__icon--pink">
                <Clock size={19} />
              </span>
              <span className="tile__label">Всего в движении</span>
              <strong className="tile__value">
                {totalMinutes} <i>мин</i>
              </strong>
              <span className="tile__note">
                {totalHours > 0
                  ? `За всё время: ${totalHours} ${pluralWord(totalHours, 'час', 'часа', 'часов')} заботы о себе 💗`
                  : 'Каждая минута идёт в копилку 💗'}
              </span>
            </li>

            <li className="tile">
              <span className="tile__icon tile__icon--orange">
                <PulseWave size={20} />
              </span>
              <span className="tile__label">Текущая серия</span>
              <strong className="tile__value">
                {streak} <i>{pluralWord(streak, 'день', 'дня', 'дней')}</i>
              </strong>
              <span className="tile__note">
                {streak > 0 ? 'Продолжай в том же ритме!' : 'Начни серию сегодня'}
              </span>
            </li>

            <li className="tile">
              <span className="tile__icon tile__icon--green">
                <Sun size={19} />
              </span>
              <span className="tile__label">В среднем в день</span>
              <strong className="tile__value">
                {toMinutes(data?.averages.per_active_day_seconds ?? 0)} <i>мин</i>
              </strong>
              <span className="tile__note">Отличный результат! ⭐</span>
            </li>

            <li className="tile">
              <span className="tile__icon tile__icon--violet">
                <Steps size={19} />
              </span>
              <span className="tile__label">Всего шагов</span>
              {/* «~»: шаги мы оцениваем по темпу движения, а не считаем. */}
              <strong className="tile__value">~{data?.total_steps ?? 0}</strong>
              <span className="tile__note">Шаг за шагом к лучшей тебе!</span>
            </li>
          </ul>

          {/* ——— Календарь и «сегодня» ——— */}
          <div className="dash__cols">
            <section className="cal">
              <header className="cal__top">
                <button
                  className="cal__arrow"
                  aria-label="Предыдущий месяц"
                  onClick={() => setMonth(shiftMonth(month, -1))}
                >
                  ‹
                </button>
                <h2 className="cal__month">{formatMonth(data?.month ?? month)}</h2>
                <button
                  className="cal__arrow"
                  aria-label="Следующий месяц"
                  disabled={month >= maxMonth}
                  onClick={() => month < maxMonth && setMonth(shiftMonth(month, 1))}
                >
                  ›
                </button>
                <button
                  className="cal__now"
                  disabled={month === maxMonth}
                  onClick={() => setMonth(maxMonth)}
                >
                  Сегодня
                </button>
              </header>

              <div className="cal__grid">
                {WEEKDAYS.map((d) => (
                  <span key={d} className="cal__wd">
                    {d}
                  </span>
                ))}
                <MonthGrid month={data?.month ?? month} days={data?.days ?? []} today={today} />
              </div>
            </section>

            <div className="dash__aside">
              <section className="today">
                <h2 className="today__title">Сегодня, {formatDay(today)}</h2>

                <div className="today__ring">
                  <Ring value={todayMinutes / DAY_GOAL_MINUTES} />
                  <span className="today__num">{todayMinutes}</span>
                </div>

                <p className="today__unit">
                  {pluralWord(todayMinutes, 'минута', 'минуты', 'минут')} в движении
                </p>

                <p className="today__note">
                  {todayMinutes > 0
                    ? 'Отличное начало дня! 🎉 Будет время — загляни ещё и набирай минуты.'
                    : 'Сегодня ещё не двигалась — самое время начать'}
                </p>

                <button
                  className="btn btn--pink today__cta"
                  onClick={() => navigate(flowTarget(Boolean(me), access))}
                >
                  Влиться в поток
                </button>
              </section>

              <section className="record">
                <span className="record__label">Твой рекорд</span>
                <strong className="record__value">
                  {toMinutes(data?.records.best_day?.seconds ?? 0)} <i>мин</i>
                </strong>
                <span className="record__note">
                  {data?.records.best_day ? formatDayShortYear(data.records.best_day.local_date) : 'пока не установлен'}
                </span>
              </section>
            </div>
          </div>

          {/* ——— Недели ——— */}
          <section className="dash__block">
            <h2 className="dash__block-title">Твоя активность по неделям</h2>

            <div className="dash__weeks">
              <Weeks weeks={data?.weeks ?? []} />

              <p className="dash__hint">
                <span className="dash__hint-icon">
                  <Sun size={19} />
                </span>
                Больше дней в движении — больше энергии и хорошего настроения! Даже несколько минут
                имеют значение.
              </p>
            </div>
          </section>

          {/* ——— Награды ——— */}
          <section className="dash__block">
            <header className="dash__block-top">
              <h2 className="dash__block-title">
                Мои награды — {(data?.achievements ?? []).filter((a) => a.earned_at).length} из{' '}
                {data?.achievements.length ?? 6} получено
              </h2>
              <a className="dash__more" href="#awards">
                Смотреть все
              </a>
            </header>

            <ul className="awards" id="awards">
              {(data?.achievements ?? []).map((a) => {
                const done = Boolean(a.earned_at)
                const share = a.progress.target
                  ? Math.min(100, (a.progress.current / a.progress.target) * 100)
                  : 0
                return (
                  <li key={a.code} className={`award ${done ? 'is-done' : ''}`}>
                    <span className="award__icon">{BADGES[a.code] ?? <Check size={20} />}</span>
                    <span className="award__title">{a.title}</span>
                    <span className="award__text">{a.description}</span>
                    {done ? (
                      <span className="award__date">
                        {a.earned_local_date ? formatDayShortYear(a.earned_local_date) : 'получена'}
                      </span>
                    ) : (
                      <span className="award__progress">
                        <span className="award__count">
                          {a.progress.current}/{a.progress.target}
                        </span>
                        <span className="award__bar">
                          <span style={{ width: `${share}%` }} />
                        </span>
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>

          {/* ——— Потоки ——— */}
          <section className="dash__block">
            <h2 className="dash__block-title">Твои потоки</h2>

            {data && data.streams.length === 0 ? (
              <p className="dash__empty">Пока пусто — начни первую тренировку</p>
            ) : (
              <ul className="flows">
                {(data?.streams ?? []).map((s) => {
                  const stream = getStream(s.code)
                  return (
                    <li key={s.code} className={`flow flow--${stream.theme}`}>
                      <img className="flow__photo" src={stream.cover} alt="" decoding="async" />
                      {/* Два слоя поверх снимка, как в сайдбаре плеера: цвет
                          потока подменяет собственный цвет фотографии, а
                          затемнение снизу держит читаемость подписи. */}
                      <span className="flow__tint" />
                      <span className="flow__fade" />
                      <span className="flow__body">
                        <span className="flow__title">{stream.title}</span>
                        <span className="flow__nums">
                          <b>{toMinutes(s.seconds)} мин</b>
                          <span>{sessionsWord(s.sessions)}</span>
                        </span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <p className="dash__hand dash__hand--footer">Движение — это забота о себе ♡</p>
        </div>
      </main>
    </div>
  )
}

/**
 * Сетка месяца: дни соседних месяцев показываем серыми, чтобы неделя всегда
 * была полной и числа не «плавали» из месяца в месяц.
 */
function MonthGrid({
  month,
  days,
  today,
}: {
  month: string
  days: StatsProgress['days']
  today: string
}) {
  const [year, mon] = month.split('-').map(Number)
  const length = new Date(year, mon, 0).getDate()
  // Понедельник — первый: getDay() отдаёт воскресенье нулём.
  const offset = (new Date(year, mon - 1, 1).getDay() + 6) % 7
  const prevLength = new Date(year, mon - 1, 0).getDate()
  const tail = (7 - ((offset + length) % 7)) % 7

  const byDate = new Map(days.map((d) => [d.local_date, d]))
  const key = (n: number) => `${month}-${String(n).padStart(2, '0')}`

  return (
    <>
      {Array.from({ length: offset }, (_, i) => (
        <span key={`pre-${i}`} className="cal__day is-out">
          {prevLength - offset + 1 + i}
        </span>
      ))}

      {Array.from({ length }, (_, i) => {
        const date = key(i + 1)
        const seconds = byDate.get(date)?.seconds ?? 0
        const minutes = toMinutes(seconds)
        return (
          <span
            key={date}
            className={`cal__day is-l${level(seconds)} ${date === today ? 'is-today' : ''}`}
            title={`${formatDayShort(date)} — ${minutes} мин`}
          >
            <b>{i + 1}</b>
            {minutes > 0 && <i>{minutes} мин</i>}
          </span>
        )
      })}

      {Array.from({ length: tail }, (_, i) => (
        <span key={`post-${i}`} className="cal__day is-out">
          {i + 1}
        </span>
      ))}
    </>
  )
}

/**
 * Последние четыре недели. У последней завершённой — насколько она вышла
 * лучше или хуже предыдущей: это единственное сравнение на странице, и
 * считать его от текущей, ещё не дожитой недели было бы нечестно.
 */
function Weeks({ weeks }: { weeks: StatsProgress['weeks'] }) {
  const shown = weeks.slice(-WEEKS_SHOWN)
  const top = Math.max(1, ...shown.map((w) => toMinutes(w.seconds)))
  // Предпоследняя из всех двенадцати — последняя завершённая.
  const doneIndex = shown.length - 2
  const prev = weeks[weeks.length - 3]
  const done = weeks[weeks.length - 2]
  // Ноль процентов — не новость, бейдж в этом случае не показываем.
  const raw =
    prev && done && prev.seconds > 0
      ? Math.round(((done.seconds - prev.seconds) / prev.seconds) * 100)
      : 0
  const change = raw === 0 ? null : raw

  return (
    <div className="weeks">
      {shown.map((w, i) => {
        const minutes = toMinutes(w.seconds)
        return (
          <div key={w.week_start} className="weeks__col">
            <span className="weeks__value">{minutes || ''}</span>
            <div
              className={`weeks__bar ${i === shown.length - 1 ? 'is-now' : ''}`}
              style={{ height: `${Math.round((minutes / top) * 100)}%` }}
            >
              {i === doneIndex && change !== null && (
                <span className={`weeks__badge ${change < 0 ? 'is-down' : ''}`}>
                  {change < 0 ? '−' : '+'}
                  {Math.abs(change)}%
                </span>
              )}
            </div>
            <span className="weeks__label">{weekRange(w.week_start)}</span>
          </div>
        )
      })}
    </div>
  )
}

/** Кольцо в карточке «Сегодня». */
function Ring({ value }: { value: number }) {
  const r = 52
  const c = 2 * Math.PI * r
  return (
    <svg className="ring" viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <linearGradient id="ring-today" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ff2d8e" />
          <stop offset="100%" stopColor="#ff7a18" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r={r} fill="none" stroke="#f1f2f5" strokeWidth="10" />
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        stroke="url(#ring-today)"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))}
        transform="rotate(-90 60 60)"
      />
    </svg>
  )
}
