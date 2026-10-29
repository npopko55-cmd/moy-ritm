/**
 * Главная админки — окно «Аналитика» (/admin).
 *
 * История. 22.10.2026 окно собрали «обо всём»: десять итогов, воронка,
 * тепловые когорты по дням с переключателями, таблица по дням, раскладка по
 * 24 часам, двести человек. 23.10 владелец посмотрел: «как будто юзлес» —
 * таблиц много, а решений по ним не принять. Теперь это короткий экран
 * главных цифр стартапа на стадии «есть ли у продукта спрос и держит ли он
 * людей», примерно на 2–3 экрана ноутбука.
 *
 * Сверху вниз: период → шесть главных цифр и тренд за 30 дней → сколько
 * занимаются по дням (заходы, люди, тренировки, минуты; с 29.10) → каналы →
 * держит ли продукт (когорты по неделям, купили / не купили) → привычка →
 * потоки (как изменилось поведение с «Спиной», с 29.10) → когда покупают
 * (день первой оплаты и пробный trial3d, с 29.10) → деньги и
 * продления → самые активные для интервью с поиском по почте и карточкой
 * человека, которая раскрывается прямо в таблице (всплывающих окон в
 * продукте нет). Кнопка «i» у цифры раскрывает, как она считается.
 *
 * Данные — один запрос на окно (/admin/dashboard), поиск по почте
 * (/admin/dashboard/people) и карточка человека по нажатию. Правила
 * подсчёта — на сервере (docs/STATS.md бэкенда, раздел 12), здесь только
 * показ. Графических библиотек нет: полосы и столбики — блоки с шириной или
 * высотой в процентах.
 */

import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  adminApi,
  type CohortRow,
  type Dashboard,
  type DashboardPeople,
  type DashboardPerson,
  type DayPartKey,
  type Share,
  type StreamCompare,
  type UserActivity,
  type WindowMetrics,
} from '../api/admin'
import { rub } from '../data/tariffs'
import { PeriodChoice, usePeriod } from './AdminPeriod'
import { Card } from './Page'

type Fail = (e: unknown, show: (text: string) => void) => void

/* ——— Форматирование ——— */

const num = (n: number) => n.toLocaleString('ru-RU')

/** Доля 0…1 → «42%»; меньше процента, но не ноль — с десятыми. null — «—». */
function pct(share: number | null | undefined): string {
  if (share === null || share === undefined) return '—'
  const value = share * 100
  if (value > 0 && value < 1) return `${value.toFixed(1).replace('.', ',')}%`
  return `${Math.round(value)}%`
}

/** «21 из 50» — знаменатель рядом с долей всегда: 50% от двух человек и от двухсот — разные вещи. */
const ofText = (s: Share) => `${num(s.count)} из ${num(s.base)}`

/** «2026-10-13» → Date той же даты в поясе браузера (без сдвига на UTC). */
function dayDate(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** «13.10.2026». */
const dayText = (day: string) =>
  dayDate(day).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })

/** «13.10». */
const shortDate = (date: Date) => date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })

const shortDay = (day: string) => shortDate(dayDate(day))

/** «пн». */
const weekday = (day: string) => dayDate(day).toLocaleDateString('ru-RU', { weekday: 'short' })

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

/** Секунды → «8 мин 30 с», «45 с», «1 ч 05 мин». */
function duration(seconds: number | null): string {
  if (seconds === null) return '—'
  const total = Math.round(seconds)
  if (total < 60) return `${total} с`
  const minutes = Math.floor(total / 60)
  if (minutes < 60) return total % 60 ? `${minutes} мин ${total % 60} с` : `${minutes} мин`
  return `${Math.floor(minutes / 60)} ч ${String(minutes % 60).padStart(2, '0')} мин`
}

/** Рубли без копеек: выручка на регистрацию в 83,33 ₽ читается хуже, чем 83 ₽. */
const money = (value: number) => rub(Math.round(value))

/** Дробное число по-русски: 1,4. */
const decimal = (value: number | null) =>
  value === null ? '—' : value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })

const PART_LABELS: Record<DayPartKey, string> = {
  morning: 'Утро',
  day: 'День',
  evening: 'Вечер',
  night: 'Ночь',
}

const PART_HOURS: Record<DayPartKey, string> = {
  morning: '5–11',
  day: '12–16',
  evening: '17–22',
  night: '23–4',
}

const sourceTitle = (source: string) => (source ? source : 'Без метки')

/** Склонение: 1 день, 2 дня, 5 дней. */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

/** Пока окно грузится — одна строка вместо пустых карточек. */
const Loading = () => <p className="admin__letters-note">Загружаем…</p>

/* ——— Экран ——— */

export default function AdminAnalytics({ token, fail }: { token: string; fail: Fail }) {
  const choice = usePeriod()
  const { kind, from, to, period } = choice
  // Свои даты — ждём обе: полпериода серверу не отправляем.
  const ready = kind !== 'custom' || (!!from && !!to)

  const [data, setData] = useState<Dashboard | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!ready) return
    let alive = true
    setError('')
    setData(null)
    adminApi.dashboard(token, { from: period.from, to: period.to }).then(
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
  }, [token, ready, period.from, period.to, fail])

  return (
    <>
      <Card title="Период">
        <PeriodChoice state={choice} />
        <p className="admin__period-note">
          Регистрации и оплаты — по Москве; движение и тренировки — по дню и часовому поясу человека.
          Администратор и удалённые аккаунты не считаются.
        </p>
        {error && <p className="page__note is-bad">{error}</p>}
      </Card>

      <Headline data={data} />
      <Days data={data} />
      <Channels data={data} />
      <Retention data={data} />
      <Habit data={data} />
      <Streams data={data} />
      <Purchases data={data} />
      <MoneyCard data={data} />
      <People data={data} token={token} fail={fail} />
    </>
  )
}

/* ——— Шесть главных цифр и тренд ——— */

type Tile = { label: string; value: string; sub: ReactNode; money?: boolean }

function Headline({ data }: { data: Dashboard | null }) {
  const h = data?.headline
  if (!h) {
    return (
      <Card title="Главное за период">
        <Loading />
      </Card>
    )
  }
  const week = h.active_week
  const tiles: Tile[] = [
    { label: 'Регистрации', value: num(h.registered), sub: 'новых аккаунтов' },
    {
      label: 'Активация',
      value: pct(h.activation.share),
      sub: `в день регистрации позанимались от минуты · ${ofText(h.activation)}`,
    },
    {
      label: 'Возврат на неделе',
      value: pct(h.week_return.share),
      sub: h.week_return.base
        ? `двигались в 1–7-й день после регистрации · ${ofText(h.week_return)}, у кого неделя прошла`
        : 'ни у кого из зарегистрированных неделя ещё не прошла',
    },
    {
      label: 'Оплаты',
      value: money(h.revenue),
      sub: `${num(h.payments)} ${plural(h.payments, 'оплата', 'оплаты', 'оплат')} · ${num(h.paid_users)} ${plural(h.paid_users, 'человек', 'человека', 'человек')}`,
      money: true,
    },
    {
      label: 'Конверсия в оплату',
      value: pct(h.paid_conversion.share),
      sub: `оплатили из зарегистрированных за период (когда угодно) · ${ofText(h.paid_conversion)}`,
    },
    {
      label: 'Активные за неделю',
      value: num(week.users),
      sub: week.users
        ? `в среднем за день ${decimal(week.dau_average)} · липкость ${pct(week.stickiness)} · ${shortDay(week.date_from)}–${shortDay(week.date_to)}`
        : `за ${shortDay(week.date_from)}–${shortDay(week.date_to)} никто не двигался`,
    },
  ]
  return (
    <Card title="Главное за период">
      <div className="analytics__tiles">
        {tiles.map((tile) => (
          <div key={tile.label} className={`overview__tile ${tile.money ? 'admin__step--money' : ''}`}>
            <span className="admin__step-label">{tile.label}</span>
            <span className="admin__step-value">{tile.value}</span>
            <span className="admin__step-pct">{tile.sub}</span>
          </div>
        ))}
      </div>
      <TrendChart data={data} />
      <p className="admin__period-note">
        Оплата — деньги из GetCourse по дате оплаты, без отозванных, пробных и ручных выдач; выручка — в
        рублях. Липкость — сколько из активных за неделю заходят в обычный день: 14% — раз в неделю,
        100% — каждый день.
      </p>
    </Card>
  )
}

/** Столбики по дням: регистрации и оплаты рядом, общая шкала — от самого большого числа за 30 дней. */
function TrendChart({ data }: { data: Dashboard }) {
  const days = data.trend.days
  const top = Math.max(1, ...days.map((d) => Math.max(d.registered, d.payments)))
  const height = (n: number) => `${(n / top) * 100}%`
  const middle = days[Math.floor(days.length / 2)]
  return (
    <div className="analytics__trend-wrap">
      <div className="analytics__trend-head">
        <h3 className="admin__letters-title">
          По дням{' '}
          <span className="analytics__muted">
            {shortDay(data.trend.date_from)}–{shortDay(data.trend.date_to)}
          </span>
        </h3>
        <span className="analytics__legend">
          <span className="analytics__dot is-reg" aria-hidden="true" /> регистрации
          <span className="analytics__dot is-pay" aria-hidden="true" /> оплаты
          <span className="analytics__muted"> · до {num(top)} в день</span>
        </span>
      </div>
      <div className="analytics__trend" role="img" aria-label="Регистрации и оплаты по дням">
        {days.map((d) => (
          <span
            key={d.day}
            className="analytics__trend-day"
            title={`${dayText(d.day)}: регистраций ${num(d.registered)}, оплат ${num(d.payments)}${d.revenue ? ` на ${money(d.revenue)}` : ''}`}
          >
            <span className="analytics__trend-bar is-reg" style={{ height: height(d.registered) }} />
            <span className="analytics__trend-bar is-pay" style={{ height: height(d.payments) }} />
          </span>
        ))}
      </div>
      {days.length > 1 && (
        <div className="analytics__trend-axis" aria-hidden="true">
          <span>{shortDay(days[0].day)}</span>
          {days.length > 6 && <span>{shortDay(middle.day)}</span>}
          <span>{shortDay(days[days.length - 1].day)}</span>
        </div>
      )}
    </div>
  )
}

/* ——— Подсказка (i) ——— */

/**
 * Кнопка «i» рядом с подписью: по нажатию под ней раскрывается, как
 * считается цифра (на телефоне наведения нет), на ноутбуке — ещё и
 * подсказка при наведении. Всплывающих окон в продукте нет.
 */
function Info({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className={`analytics__info ${open ? 'is-open' : ''}`}
        aria-expanded={open}
        aria-label="Как считается"
        title={text}
        onClick={() => setOpen((v) => !v)}
      >
        i
      </button>
      {open && <span className="analytics__tip">{text}</span>}
    </>
  )
}

/* ——— По дням: сколько заходило заниматься ——— */

const DAY_HINTS = {
  visits:
    'Уникальные браузеры, открывшие сайт за сутки по Москве: один браузер — один заход в день, сколько бы раз его ни открывали. Админку не считаем.',
  people:
    'Разные люди, у которых в этот день было движение (хоть кусок тренировки), — по дню в их часовом поясе. Администратор и удалённые не считаются.',
  workouts:
    'Тренировки, начатые в этот день. Тренировка — движение без перерыва больше 30 минут; ушёл на час и вернулся — вторая.',
  minutes: 'Минуты движения всех людей за день, без пауз.',
}

/** Сколько последних дней в таблице, пока не нажали «все дни». */
const DAYS_SHOWN = 14

function Days({ data }: { data: Dashboard | null }) {
  const [all, setAll] = useState(false)
  if (!data) {
    return (
      <Card title="Сколько занимаются по дням">
        <Loading />
      </Card>
    )
  }
  const trend = data.trend
  const top = Math.max(1, ...trend.days.map((d) => d.active_users))
  const newest = [...trend.days].reverse()
  const rows = all ? newest : newest.slice(0, DAYS_SHOWN)
  const middle = trend.days[Math.floor(trend.days.length / 2)]
  // До первого записанного захода — прочерк, а не ноль: тогда заходы не считались.
  const visitsKnown = (day: string) => !!trend.visits_since && day >= trend.visits_since
  return (
    <Card
      title="Сколько занимаются по дням"
      text="Каждый день: сколько браузеров открыли сайт, сколько человек позанимались, сколько тренировок и минут."
    >
      <div className="analytics__trend-wrap">
        <div className="analytics__trend-head">
          <h3 className="admin__letters-title">
            Занимались{' '}
            <span className="analytics__muted">
              {shortDay(trend.date_from)}–{shortDay(trend.date_to)}
            </span>
          </h3>
          <span className="analytics__legend">
            <span className="analytics__dot is-reg" aria-hidden="true" /> человек в день
            <span className="analytics__muted"> · до {num(top)}</span>
          </span>
        </div>
        <div className="analytics__trend" role="img" aria-label="Сколько человек занимались по дням">
          {trend.days.map((d) => (
            <span
              key={d.day}
              className="analytics__trend-day"
              title={`${dayText(d.day)}: занимались ${num(d.active_users)}, тренировок ${num(d.workouts)}, минут ${num(d.minutes)}${visitsKnown(d.day) ? `, заходов ${num(d.visits)}` : ''}`}
            >
              <span className="analytics__trend-bar is-reg is-wide" style={{ height: `${(d.active_users / top) * 100}%` }} />
            </span>
          ))}
        </div>
        {trend.days.length > 1 && (
          <div className="analytics__trend-axis" aria-hidden="true">
            <span>{shortDay(trend.days[0].day)}</span>
            {trend.days.length > 6 && <span>{shortDay(middle.day)}</span>}
            <span>{shortDay(trend.days[trend.days.length - 1].day)}</span>
          </div>
        )}
      </div>

      <div className="admin__scroll analytics__days-wrap">
        <table className="admin__table analytics__days">
          <thead>
            <tr>
              <th>День</th>
              <th className="is-num">
                Заходы на сайт <Info text={DAY_HINTS.visits} />
              </th>
              <th className="is-num">
                Занимались <Info text={DAY_HINTS.people} />
              </th>
              <th className="is-num">
                Тренировок <Info text={DAY_HINTS.workouts} />
              </th>
              <th className="is-num">
                Минут <Info text={DAY_HINTS.minutes} />
              </th>
              <th className="is-num">Регистрации</th>
              <th className="is-num">Оплаты</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.day}>
                <td>
                  {dayText(d.day)} <span className="overview__weekday">{weekday(d.day)}</span>
                </td>
                <td className="is-num">{visitsKnown(d.day) ? num(d.visits) : '—'}</td>
                <td className="is-num">{num(d.active_users)}</td>
                <td className="is-num">{num(d.workouts)}</td>
                <td className="is-num">{num(d.minutes)}</td>
                <td className="is-num">{num(d.registered)}</td>
                <td className="is-num">{d.payments ? `${num(d.payments)} · ${money(d.revenue)}` : '0'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {newest.length > DAYS_SHOWN && (
        <button type="button" className="analytics__more" onClick={() => setAll((v) => !v)}>
          {all ? `Только последние ${DAYS_SHOWN} дней` : `Все ${num(newest.length)} дней`}
        </button>
      )}
      <p className="admin__period-note">
        Последние 30 дней периода, новые сверху. Заходы и регистрации — по Москве; движение и
        тренировки — по дню человека.
        {trend.visits_since ? ` Заходы на сайт считаются с ${dayText(trend.visits_since)}.` : ' Заходов пока нет.'}
      </p>
    </Card>
  )
}

/* ——— Потоки: как изменилось поведение с новым потоком ——— */

const streamName = (code: string, title: string | null) => title ?? code

/** Минуты из секунд, вниз. */
const minutesOf = (seconds: number) => Math.floor(seconds / 60)

/** Изменение «после» к «до»: «+12%», «−5%»; до — ноль или нет данных — «—». */
function change(before: number | null, after: number | null): string {
  if (before === null || after === null || before === 0) return '—'
  const value = Math.round((after / before - 1) * 100)
  return value > 0 ? `+${value}%` : value < 0 ? `−${Math.abs(value)}%` : '0%'
}

type CompareRow = {
  key: keyof WindowMetrics
  label: string
  hint: string
  steps?: boolean
  sub?: boolean
}

function compareRows(newName: string, mainName: string): CompareRow[] {
  return [
    {
      key: 'active_days',
      label: 'Дней с движением',
      hint: 'Сколько дней из окна человек двигался хотя бы раз, в среднем на человека.',
    },
    {
      key: 'minutes',
      label: 'Минут за окно',
      hint: 'Время в движении во всех потоках вместе за всё окно, в среднем на человека.',
    },
    { key: 'main_minutes', label: `из них ${mainName}`, hint: `Минуты потока «${mainName}» на человека.`, sub: true },
    { key: 'new_minutes', label: `из них ${newName}`, hint: `Минуты потока «${newName}» на человека.`, sub: true },
    {
      key: 'minutes_per_active_day',
      label: 'Минут в день занятий',
      hint: 'Все минуты группы, делённые на все её дни с движением: сколько длится обычный день занятий.',
    },
    {
      key: 'steps',
      label: 'Шагов за окно',
      hint: 'Шаги считает только кардио — у движений спины шагов нет. В среднем на человека за окно.',
      steps: true,
    },
    {
      key: 'steps_per_active_day',
      label: 'Шагов в день занятий',
      hint: 'Все шаги группы, делённые на все её дни с движением.',
      steps: true,
    },
  ]
}

function metricText(value: number | null, steps?: boolean): string {
  if (value === null) return '—'
  return steps ? num(Math.round(value)) : decimal(value)
}

function Streams({ data }: { data: Dashboard | null }) {
  const [windowDays, setWindowDays] = useState(7)
  const s = data?.streams
  if (!s) {
    return (
      <Card title="Потоки">
        <Loading />
      </Card>
    )
  }
  const newName = streamName(s.new_code, s.new_title)
  const mainName = streamName(s.main_code, s.main_title)
  const newRow = s.items.find((i) => i.code === s.new_code)
  const a = s.adoption
  const compare = s.compare.find((c) => c.days === windowDays) ?? s.compare[0]
  const dayMax = Math.max(1, ...s.days.map((d) => d.new_seconds + d.main_seconds))
  const launchText = dayText(s.launch)

  return (
    <Card
      title="Потоки"
      text={`Как изменилось поведение с запуском потока «${newName}» ${launchText}: сколько времени там проводят, возвращаются ли и стали ли попробовавшие заниматься больше.`}
    >
      {/* Потоки за период */}
      <div className="admin__scroll">
        <table className="admin__table analytics__streams">
          <thead>
            <tr>
              <th>Поток</th>
              <th className="is-num">
                Минут <Info text="Время в движении в потоке за период, без пауз, все люди вместе." />
              </th>
              <th className="is-num">
                Доля времени <Info text="Минуты потока от всех минут движения за период." />
              </th>
              <th className="is-num">
                Людей <Info text="Разные люди, у которых за период был хоть кусок движения в потоке." />
              </th>
              <th className="is-num">
                Минут на человека <Info text="Минуты потока, делённые на людей потока." />
              </th>
              <th className="is-num">
                Дней занятий <Info text="Пары «человек, день» с движением в потоке: один человек три дня — три." />
              </th>
              <th className="is-num">
                Тренировок{' '}
                <Info text="Тренировки, в которых был хоть кусок этого потока. Перешёл из кардио в спину без перерыва — тренировка есть у обоих. Мелко — сколько из них только в этом потоке." />
              </th>
            </tr>
          </thead>
          <tbody>
            {s.items.map((i) => (
              <tr key={i.code}>
                <td>{streamName(i.code, i.title)}</td>
                <td className="is-num">{num(minutesOf(i.seconds))}</td>
                <td className="is-num">{pct(i.time_share)}</td>
                <td className="is-num">{num(i.people)}</td>
                <td className="is-num">{decimal(i.minutes_per_person)}</td>
                <td className="is-num">{num(i.person_days)}</td>
                <td className="is-num">
                  {num(i.workouts)}
                  <span className="admin__cell-pct">только этот — {num(i.workouts_alone)}</span>
                </td>
              </tr>
            ))}
            {s.items.length > 0 && (
              <tr className="analytics__cohort-sum">
                <td>Все потоки</td>
                <td className="is-num">{num(minutesOf(s.total_seconds))}</td>
                <td className="is-num">100%</td>
                <td className="is-num">{num(s.total_people)}</td>
                <td className="is-num">
                  {s.total_people ? decimal(Math.round((s.total_seconds / 60 / s.total_people) * 10) / 10) : '—'}
                </td>
                <td className="is-num" />
                <td className="is-num">{num(s.total_workouts)}</td>
              </tr>
            )}
            {s.items.length === 0 && (
              <tr>
                <td className="admin__empty" colSpan={7}>
                  За эти даты никто не двигался
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="admin__period-note">
        По дню человека. Потоки видны по сырым кускам движения, а они хранятся 90 дней
        {s.data_since ? ` — данные с ${dayText(s.data_since)}` : ''}.
      </p>

      <div className="analytics__grid">
        {/* Внедрение */}
        <div className="analytics__block">
          <h3 className="admin__letters-title">
            Попробовали поток «{newName}»{' '}
            {a.date_from && a.date_to && (
              <span className="analytics__muted">
                {shortDay(a.date_from)}–{shortDay(a.date_to)}
              </span>
            )}
          </h3>
          {a.date_from === null ? (
            <p className="analytics__muted">Период целиком до запуска {launchText}.</p>
          ) : (
            <dl className="analytics__facts">
              <dt>
                Занимались с запуска{' '}
                <Info text="Разные люди с движением в любом потоке в дни периода начиная с дня запуска." />
              </dt>
              <dd>{num(a.active)}</dd>
              <dt>
                Из них попробовали{' '}
                <Info text={`Хоть раз двигались в потоке «${newName}» в эти дни.`} />
              </dt>
              <dd>
                {pct(a.tried.share)} <span className="analytics__muted">{ofText(a.tried)}</span>
              </dd>
              <dt>
                Вернулись в другой день{' '}
                <Info text={`Из попробовавших — занимались в потоке «${newName}» в двух и больше разных днях. Считаем только тех, кто попробовал раньше последнего дня окна: попробовал сегодня — вернуться ещё не мог.`} />
              </dt>
              <dd>
                {pct(a.repeated.share)} <span className="analytics__muted">{ofText(a.repeated)}</span>
              </dd>
              {newRow && (
                <>
                  <dt>
                    Тренировок с потоком «{newName}»{' '}
                    <Info text={`Тренировки периода, где был хоть кусок потока «${newName}». «Вместе с другим» — человек переключился из другого потока или в другой без перерыва: «${newName}» как добавка, а не замена.`} />
                  </dt>
                  <dd>{num(newRow.workouts)}</dd>
                  <dt className="analytics__sub">только «{newName}»</dt>
                  <dd>{num(newRow.workouts_alone)}</dd>
                  <dt className="analytics__sub">вместе с другим потоком</dt>
                  <dd>{num(newRow.workouts - newRow.workouts_alone)}</dd>
                </>
              )}
            </dl>
          )}
        </div>

        {/* По дням с запуска */}
        <div className="analytics__block">
          <h3 className="admin__letters-title">
            По дням <span className="analytics__muted">с {launchText}</span>
          </h3>
          {s.days.length === 0 ? (
            <p className="analytics__muted">В периоде нет дней после запуска.</p>
          ) : (
            <>
              <span className="analytics__legend">
                <span className="analytics__dot is-reg" aria-hidden="true" /> {newName}
                <span className="analytics__dot is-pay" aria-hidden="true" /> {mainName}
              </span>
              <ul className="analytics__rows">
                {[...s.days].reverse().map((d) => (
                  <li key={d.day} className="analytics__row">
                    <span className="analytics__row-label">
                      {shortDay(d.day)} <span className="overview__weekday">{weekday(d.day)}</span>
                    </span>
                    <span className="analytics__bar analytics__bar--split" aria-hidden="true">
                      <span className="is-new" style={{ width: `${(d.new_seconds / dayMax) * 100}%` }} />
                      <span className="is-main" style={{ width: `${(d.main_seconds / dayMax) * 100}%` }} />
                    </span>
                    <span className="analytics__row-value">
                      {num(minutesOf(d.new_seconds))} / {num(minutesOf(d.main_seconds))} мин
                      <span className="analytics__row-pct">
                        {' '}
                        {num(d.new_people)} / {num(d.main_people)} чел.
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="analytics__muted">
                Минуты и люди: «{newName}» / «{mainName}». Человек может быть в обоих.
              </p>
            </>
          )}
        </div>
      </div>

      {/* До / после */}
      <div className="analytics__compare">
        <div className="analytics__trend-head">
          <h3 className="admin__letters-title">
            Стали ли заниматься больше{' '}
            <Info
              text={`Попробовавшие: окно до первого дня в потоке «${newName}» и такое же окно после; сам день первой пробы не входит никуда. Не пробовавшие — те же окна вокруг дня запуска (${launchText}): так видно, что дал поток, а что — общий тренд. В сравнение идут только те, кто был на сайте всё окно «до» и двигался в нём, и только когда окно «после» уже прошло. От выбранного периода не зависит.`}
            />
          </h3>
          <div className="chips">
            {s.compare.map((c) => (
              <button
                key={c.days}
                type="button"
                className={`chip ${c.days === compare?.days ? 'is-on' : ''}`}
                aria-pressed={c.days === compare?.days}
                onClick={() => setWindowDays(c.days)}
              >
                {c.days} {plural(c.days, 'день', 'дня', 'дней')}
              </button>
            ))}
          </div>
        </div>
        {compare && <CompareTable c={compare} min={s.min_people} newName={newName} mainName={mainName} />}
      </div>
    </Card>
  )
}

function CompareStatus({ c }: { c: StreamCompare }) {
  const t = c.tried
  const parts: string[] = [`Попробовали поток, окно прошло — ${num(t.ready)}`]
  if (t.waiting) {
    parts.push(
      `ещё ждут окна ${num(t.waiting)}${t.next_ready ? ` (первые — ${dayText(t.next_ready)})` : ''}`,
    )
  }
  if (t.no_history) parts.push(`новички, до первой пробы не было ${c.days}-дневного окна — ${num(t.no_history)}`)
  if (t.inactive_before) parts.push(`не двигались ${c.days} дн. до первой пробы — ${num(t.inactive_before)}`)
  const control = `Не пробовали, но занимались до запуска: окно прошло — ${num(c.control.ready)}${c.control.waiting ? `, ждут ${num(c.control.waiting)}${c.control.next_ready ? ` (до ${dayText(c.control.next_ready)})` : ''}` : ''}.`
  return (
    <p className="analytics__muted">
      {parts.join(' · ')}. {control}
    </p>
  )
}

function CompareTable({
  c,
  min,
  newName,
  mainName,
}: {
  c: StreamCompare
  min: number
  newName: string
  mainName: string
}) {
  if (c.tried.ready === 0 && c.control.ready === 0) {
    return (
      <>
        <p className="analytics__note">
          Рано: окно «после» ({c.days} {plural(c.days, 'день', 'дня', 'дней')}) ещё не прошло ни у кого.
        </p>
        <CompareStatus c={c} />
      </>
    )
  }
  const rows = compareRows(newName, mainName)
  return (
    <>
      {!c.enough && (
        <p className="analytics__note">
          Мало данных — выводов не делаем: нужно хотя бы {num(min)} человек с прошедшим окном в каждой
          группе. Цифры ниже — для ориентира, изменение не показываем.
        </p>
      )}
      <div className="admin__scroll">
        <table className="admin__table analytics__compare-table">
          <thead>
            <tr>
              <th rowSpan={2}>На человека за {c.days} {plural(c.days, 'день', 'дня', 'дней')}</th>
              <th colSpan={3} className="is-num">
                Попробовали поток <span className="admin__cell-pct">{num(c.tried.ready)} чел.</span>
              </th>
              <th colSpan={3} className="is-num">
                Не пробовали <span className="admin__cell-pct">{num(c.control.ready)} чел.</span>
              </th>
            </tr>
            <tr>
              <th className="is-num">до</th>
              <th className="is-num">после</th>
              <th className="is-num">изм.</th>
              <th className="is-num">до</th>
              <th className="is-num">после</th>
              <th className="is-num">изм.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={r.sub ? 'analytics__sub-row' : undefined}>
                <td>
                  {r.label} <Info text={r.hint} />
                </td>
                {[c.tried, c.control].map((g, i) => (
                  <Fragment key={i}>
                    <td className="is-num">{metricText(g.before[r.key], r.steps)}</td>
                    <td className="is-num">{metricText(g.after[r.key], r.steps)}</td>
                    <td className="is-num analytics__change">
                      {c.enough ? change(g.before[r.key], g.after[r.key]) : '—'}
                    </td>
                  </Fragment>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CompareStatus c={c} />
      <p className="analytics__muted">
        Это не эксперимент: попробовавшие по определению были активны в день пробы, а среди не
        пробовавших есть и те, кто просто перестал заходить. Смотрите на разницу двух столбцов
        «изм.», а не на одно число.
      </p>
    </>
  )
}

/* ——— Каналы ——— */

/** Ячейка «доля + мелко N из M». База ноль — прочерк. */
function ShareCell({ value }: { value: Share }) {
  return (
    <td className="is-num">
      {pct(value.share)}
      {value.base > 0 && <span className="admin__cell-pct">{ofText(value)}</span>}
    </td>
  )
}

function Channels({ data }: { data: Dashboard | null }) {
  return (
    <Card
      title="Каналы"
      text="Метки ссылок: откуда пришли, начали ли заниматься и заплатили ли. Оплата относится к метке, с которой человек зарегистрировался."
    >
      <div className="admin__scroll">
        <table className="admin__table analytics__channels">
          <thead>
            <tr>
              <th>Метка</th>
              <th className="is-num">Заходы</th>
              <th className="is-num">Гости начали</th>
              <th className="is-num">Регистрации</th>
              <th className="is-num">Активация</th>
              <th className="is-num">Оплатили</th>
              <th className="is-num">Выручка</th>
              <th className="is-num">Регистрация → оплата</th>
            </tr>
          </thead>
          <tbody>
            {data?.channels.map((c) => (
              <tr key={c.source}>
                <td>{sourceTitle(c.source)}</td>
                <td className="is-num">{num(c.visits)}</td>
                <td className="is-num">{num(c.guests)}</td>
                <td className="is-num">{num(c.registered)}</td>
                <ShareCell value={c.activation} />
                <td className="is-num">{num(c.paid.count)}</td>
                <td className="is-num">{c.revenue ? money(c.revenue) : '—'}</td>
                <td className="is-num">{pct(c.paid.share)}</td>
              </tr>
            ))}
            {!data && (
              <tr>
                <td className="admin__empty" colSpan={8}>
                  Загружаем…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="admin__period-note">
        Заходы и гости — по меткам ссылок входа (прямые заходы на сайт метки не несут). «Оплатили» и
        «регистрация → оплата» — из зарегистрированных за период, оплата в любой момент; выручка —
        оплаты за период, в сумме по меткам она равна выручке сверху.
      </p>
    </Card>
  )
}

/* ——— Держит ли продукт ——— */

/** Ячейка возврата: доля с фоном по силе, мелко — «N из M». null — окно ещё ни у кого не прошло. */
function ReturnCell({ value }: { value: Share | null }) {
  if (!value) {
    return (
      <td className="is-num analytics__heat is-future" title="Это окно ещё не прошло ни у кого из недели">
        рано
      </td>
    )
  }
  const strength = Math.round(Math.min(1, value.share ?? 0) * 100)
  return (
    <td
      className={`is-num analytics__heat ${strength >= 55 ? 'is-strong' : ''}`}
      style={{ background: `color-mix(in srgb, var(--pink-500) ${strength}%, var(--white))` }}
    >
      {pct(value.share)}
      <span className="analytics__heat-count">{ofText(value)}</span>
    </td>
  )
}

function CohortLine({ title, row, sum }: { title: ReactNode; row: CohortRow; sum?: boolean }) {
  return (
    <tr className={sum ? 'analytics__cohort-sum' : undefined}>
      <td>{title}</td>
      <td className="is-num">{num(row.size)}</td>
      <ShareCell value={row.activation} />
      {row.returns.map((value, i) => (
        <ReturnCell key={i} value={value} />
      ))}
    </tr>
  )
}

/** «06.10–12.10» по понедельнику недели. */
function weekTitle(monday: string): string {
  const start = dayDate(monday)
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)
  return `${shortDate(start)}–${shortDate(end)}`
}

function Retention({ data }: { data: Dashboard | null }) {
  const c = data?.cohorts
  const columns = 3 + (c?.windows.length ?? 3)
  return (
    <Card
      title="Держит ли продукт"
      text="Люди, зарегистрированные за одну неделю (по их часовому поясу): сколько начали заниматься в первый же день и сколько возвращались потом. «Купили» и «Не купили» — все зарегистрированные за период."
    >
      <div className="admin__scroll">
        <table className="admin__table analytics__cohorts">
          <thead>
            <tr>
              <th>Неделя регистрации</th>
              <th className="is-num">Людей</th>
              <th className="is-num">Активация</th>
              {c?.windows.map((w) => (
                <th key={w.key} className="is-num">
                  {w.label}
                  <span className="admin__cell-pct">
                    дни {w.day_from}–{w.day_to}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {c?.weeks.map((row) => (
              <CohortLine key={row.week} title={row.week ? weekTitle(row.week) : ''} row={row} />
            ))}
            {c && c.weeks.length === 0 && (
              <tr>
                <td className="admin__empty" colSpan={columns}>
                  За эти даты никто не зарегистрировался
                </td>
              </tr>
            )}
            {c && c.weeks.length > 0 && (
              <>
                <CohortLine title="Купили" row={c.bought} sum />
                <CohortLine title="Не купили" row={c.not_bought} sum />
              </>
            )}
            {!c && (
              <tr>
                <td className="admin__empty" colSpan={columns}>
                  Загружаем…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="admin__period-note">
        Вернулся — двигался хотя бы в один день окна после дня регистрации. Доля — только от тех, у
        кого окно уже прошло («из скольких» — мелко); «рано» — не прошло ни у кого.
        {c && c.weeks_total > c.weeks.length
          ? ` Показаны последние ${num(c.weeks.length)} недель из ${num(c.weeks_total)}; строки «Купили» и «Не купили» — по всем.`
          : ''}
      </p>
    </Card>
  )
}

/* ——— Привычка ——— */

/** Строка-полоса: подпись, полоса от максимума, число и доля. */
function BarRow({ label, value, share, max }: { label: string; value: number; share: number | null; max: number }) {
  return (
    <li className="analytics__row">
      <span className="analytics__row-label">{label}</span>
      <span className="analytics__bar" aria-hidden="true">
        <span style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
      </span>
      <span className="analytics__row-value">
        {num(value)} <span className="analytics__row-pct">{pct(share)}</span>
      </span>
    </li>
  )
}

/** «2–3» → «2–3 дня», «4+» → «4 дня и больше». */
function daysLabel(label: string): string {
  if (label.endsWith('+')) {
    const n = Number(label.slice(0, -1))
    return `${n} ${plural(n, 'день', 'дня', 'дней')} и больше`
  }
  const last = Number(/(\d+)\D*$/.exec(label)?.[1] ?? 0)
  return `${label} ${plural(last, 'день', 'дня', 'дней')}`
}

function Habit({ data }: { data: Dashboard | null }) {
  const h = data?.habit
  if (!data || !h) {
    return (
      <Card title="Привычка">
        <Loading />
      </Card>
    )
  }
  const week = data.headline.active_week
  const freqMax = Math.max(1, ...h.frequency.map((b) => b.users))
  const partMax = Math.max(1, ...h.day_parts.map((p) => p.sessions))
  return (
    <Card
      title="Привычка"
      text="Как часто, сколько и когда занимаются люди, которые двигались в выбранный период. Тренировка — движение без перерыва больше 30 минут."
    >
      <div className="analytics__grid">
        <div className="analytics__block">
          <h3 className="admin__letters-title">
            Сколько дней в неделю{' '}
            <span className="analytics__muted">
              {shortDay(week.date_from)}–{shortDay(week.date_to)}
            </span>
          </h3>
          <ul className="analytics__rows">
            {h.frequency.map((b) => (
              <BarRow key={b.label} label={daysLabel(b.label)} value={b.users} share={b.share} max={freqMax} />
            ))}
          </ul>
          <p className="analytics__muted">Из {num(week.users)} активных за неделю.</p>
        </div>

        <div className="analytics__block">
          <h3 className="admin__letters-title">Тренировки</h3>
          <dl className="analytics__facts">
            <dt>Людей с движением за период</dt>
            <dd>{num(h.active_users)}</dd>
            <dt>Тренировок в неделю на человека (медиана)</dt>
            <dd>{decimal(h.workouts_per_week_median)}</dd>
            <dt>Длительность тренировки (медиана)</dt>
            <dd>{duration(h.session_median_seconds)}</dd>
            <dt>Тренировок за период</dt>
            <dd>{num(h.sessions)}</dd>
          </dl>
          <p className="analytics__muted">
            В неделю — только недели, когда человек двигался. Длительность — секунды движения без пауз.
          </p>
        </div>

        <div className="analytics__block">
          <h3 className="admin__letters-title">Время суток</h3>
          <ul className="analytics__rows">
            {h.day_parts.map((p) => (
              <BarRow
                key={p.key}
                label={`${PART_LABELS[p.key]}, ${PART_HOURS[p.key]}`}
                value={p.sessions}
                share={p.share}
                max={partMax}
              />
            ))}
          </ul>
          <p className="analytics__muted">
            Час начала тренировки по часовому поясу человека.
            {h.sessions_since
              ? ` Данные о тренировках — с ${dayText(h.sessions_since)}.`
              : ' Данных о тренировках пока нет.'}
          </p>
        </div>
      </div>
    </Card>
  )
}

/* ——— Когда покупают ——— */

const FUNNEL_TITLES: Record<string, string> = {
  trial3d: 'Пробные 3 дня',
  trial20: 'Челлендж',
  '': 'Без воронки',
}

const funnelTitle = (funnel: string | null) => (funnel === null ? 'Все' : (FUNNEL_TITLES[funnel] ?? funnel))

/** «день 0» → «в день регистрации», «4–7» → «4–7-й день». */
function buyDayLabel(label: string): string {
  if (label === '0') return 'В день регистрации'
  if (label.endsWith('+')) return `${label.slice(0, -1)}-й день и позже`
  return `${label}-й день`
}

/** «2 дня», «6,4 дня» (дробное — всегда «дня»), «5 дней». */
const daysText = (value: number | null) => {
  if (value === null) return '—'
  const rounded = Math.round(value * 10) / 10
  const word = Number.isInteger(rounded) ? plural(rounded, 'день', 'дня', 'дней') : 'дня'
  return `${decimal(rounded)} ${word}`
}

function Purchases({ data }: { data: Dashboard | null }) {
  const [funnel, setFunnel] = useState<string | null>(null)
  const p = data?.purchases
  if (!p) {
    return (
      <Card title="Когда покупают">
        <Loading />
      </Card>
    )
  }
  const options = [p.all, ...p.funnels]
  const shown = options.find((o) => o.funnel === funnel) ?? p.all
  const max = Math.max(1, ...shown.buckets.map((b) => b.people))
  const t = p.trial3d
  return (
    <Card
      title="Когда покупают"
      text="На какой день после регистрации человек впервые заплатил и сколько купили после пробных дней."
    >
      <div className="analytics__grid">
        <div className="analytics__block">
          <h3 className="admin__letters-title">
            День первой оплаты{' '}
            <Info text="Люди, чья первая оплата деньгами пришлась на выбранный период (по дате оплаты, как «Оплаты» сверху). День — от дня регистрации, оба по Москве: 0 — заплатил в день регистрации. Оплата раньше регистрации (ручная привязка старого покупателя) — день 0. Воронка — та, в которой человек сейчас." />
          </h3>
          <div className="chips">
            {options.map((o) => (
              <button
                key={o.funnel ?? 'all'}
                type="button"
                className={`chip ${o.funnel === shown.funnel ? 'is-on' : ''}`}
                aria-pressed={o.funnel === shown.funnel}
                onClick={() => setFunnel(o.funnel)}
              >
                {funnelTitle(o.funnel)} · {num(o.buyers)}
              </button>
            ))}
          </div>
          {shown.buyers === 0 ? (
            <p className="analytics__muted">Впервые за период никто не заплатил.</p>
          ) : (
            <>
              <ul className="analytics__rows">
                {shown.buckets.map((b) => (
                  <BarRow key={b.label} label={buyDayLabel(b.label)} value={b.people} share={b.share} max={max} />
                ))}
              </ul>
              <dl className="analytics__facts analytics__facts--sum">
                <dt>
                  Медиана <Info text="Половина купивших заплатила не позже этого дня после регистрации." />
                </dt>
                <dd>{daysText(shown.median_days)}</dd>
                <dt>
                  В среднем <Info text="Среднее число дней от регистрации до первой оплаты: поздние покупки тянут его вверх сильнее медианы." />
                </dt>
                <dd>{daysText(shown.mean_days)}</dd>
              </dl>
            </>
          )}
        </div>

        <div className="analytics__block">
          <h3 className="admin__letters-title">
            После пробных {num(t.days)} {plural(t.days, 'дня', 'дней', 'дней')}{' '}
            <Info
              text={`Вошедшие в «Пробные ${t.days} дня» за выбранный период (по моменту входа в пробный). Конец пробного — через ${t.days} суток после входа, как у бота и писем. Доли — только от тех, у кого пробный уже кончился: идущий занижал бы «купили после». Купил — первая оплата деньгами; ручная выдача — не покупка.`}
            />
          </h3>
          <dl className="analytics__facts">
            <dt>Вошли в пробный</dt>
            <dd>{num(t.joined)}</dd>
            <dt>Пробный ещё идёт</dt>
            <dd>
              {num(t.running)}{' '}
              {t.running_bought > 0 && <span className="analytics__muted">уже купили {num(t.running_bought)}</span>}
            </dd>
            <dt>Пробный кончился</dt>
            <dd>{num(t.finished)}</dd>
          </dl>
          {t.finished === 0 ? (
            <p className="analytics__muted">Ни у кого из вошедших за период пробный ещё не кончился.</p>
          ) : (
            <>
              <ul className="analytics__rows">
                <BarRow
                  label="Купили во время пробного"
                  value={t.bought_during.count}
                  share={t.bought_during.share}
                  max={t.finished}
                />
                <BarRow
                  label="Купили после пробного"
                  value={t.bought_after.count}
                  share={t.bought_after.share}
                  max={t.finished}
                />
                <BarRow label="Не купили" value={t.not_bought.count} share={t.not_bought.share} max={t.finished} />
              </ul>
              <dl className="analytics__facts analytics__facts--sum">
                <dt>
                  Купившие после — через{' '}
                  <Info text="Медиана: сколько суток прошло от конца пробного до первой оплаты у тех, кто купил после него." />
                </dt>
                <dd>{daysText(t.after_median_days)}</dd>
              </dl>
              <p className="analytics__muted">
                Доли — от {num(t.finished)} закончивших пробный. «Во время» — в том числе заплатившие ещё до входа.
                {t.manual > 0 ? ` Среди не купивших ${num(t.manual)} с доступом, выданным вручную.` : ''}
              </p>
            </>
          )}
        </div>
      </div>
    </Card>
  )
}

/* ——— Деньги и продления ——— */

/** Telegram человека ссылкой — Диме написать перед созвоном. */
function TelegramLink({ username }: { username: string | null }) {
  if (!username) return <>—</>
  return (
    <a href={`https://t.me/${encodeURIComponent(username)}`} target="_blank" rel="noopener noreferrer">
      @{username}
    </a>
  )
}

function MoneyCard({ data }: { data: Dashboard | null }) {
  const m = data?.money
  if (!m) {
    return (
      <Card title="Деньги и продления">
        <Loading />
      </Card>
    )
  }
  const r = m.renewals
  return (
    <Card
      title="Деньги и продления"
      text="Подписка без автосписаний: человек продлевает сам, поэтому важно видеть, у кого доступ вот-вот кончится и как часто продлевают."
    >
      <div className="analytics__grid">
        <div className="analytics__block">
          <h3 className="admin__letters-title">Тарифы за период</h3>
          {m.tariffs.length === 0 ? (
            <p className="analytics__muted">Оплат за период нет.</p>
          ) : (
            <dl className="analytics__facts">
              {m.tariffs.map((t) => (
                <Fragment key={t.tariff ?? ''}>
                  <dt>
                    {t.tariff ?? 'Без тарифа'}{' '}
                    <span className="analytics__muted">
                      {num(t.payments)} {plural(t.payments, 'оплата', 'оплаты', 'оплат')}
                    </span>
                  </dt>
                  <dd>{money(t.revenue)}</dd>
                </Fragment>
              ))}
            </dl>
          )}
          <dl className="analytics__facts analytics__facts--sum">
            <dt>Средний чек</dt>
            <dd>{m.average_check === null ? '—' : money(m.average_check)}</dd>
            <dt>Выручка на одну регистрацию</dt>
            <dd>{m.revenue_per_registration === null ? '—' : money(m.revenue_per_registration)}</dd>
          </dl>
        </div>

        <div className="analytics__block">
          <h3 className="admin__letters-title">
            Продления <span className="analytics__muted">за всё время</span>
          </h3>
          <dl className="analytics__facts">
            <dt>Доступ кончается в ближайшие {num(r.window_days)} дней</dt>
            <dd>{num(r.expiring_total)}</dd>
            <dt>Оплаченных сроков кончилось больше {num(r.grace_days)} дней назад</dt>
            <dd>{num(r.expired)}</dd>
            <dt>Из них продлили</dt>
            <dd>
              {pct(r.renewal_share)} <span className="analytics__muted">{num(r.renewed)}</span>
            </dd>
            <dt>Кончились за последние {num(r.grace_days)} дней — ещё могут продлить</dt>
            <dd>
              {num(r.recent_expired)}{' '}
              {r.recent_renewed > 0 && (
                <span className="analytics__muted">уже продлили {num(r.recent_renewed)}</span>
              )}
            </dd>
          </dl>
          <p className="analytics__muted">
            Продлил — после оплаты срока у человека есть любая следующая оплата, когда угодно: заранее
            или после конца. Сроки, кончившиеся меньше {num(r.grace_days)} дней назад, в долю не
            входят — у человека ещё есть время. Ручные выдачи и пробный доступ не считаются.
          </p>
        </div>
      </div>

      {r.expiring.length > 0 && (
        <div className="admin__scroll analytics__expiring">
          <table className="admin__table">
            <thead>
              <tr>
                <th>Доступ до</th>
                <th>Почта</th>
                <th>Telegram</th>
                <th>Тариф</th>
              </tr>
            </thead>
            <tbody>
              {r.expiring.map((e) => (
                <tr key={e.user_id}>
                  <td>{dateText(e.paid_until)}</td>
                  <td>{e.email}</td>
                  <td>
                    <TelegramLink username={e.telegram_username} />
                  </td>
                  <td>{e.tariff ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {r.expiring_total > r.expiring.length && (
        <p className="admin__period-note">
          Показаны первые {num(r.expiring.length)} из {num(r.expiring_total)} — по дате окончания.
        </p>
      )}
    </Card>
  )
}

/* ——— Самые активные — для интервью ——— */

const PEOPLE_COLUMNS = 7

function People({ data, token, fail }: { data: Dashboard | null; token: string; fail: Fail }) {
  const [search, setSearch] = useState('')
  // Поиск уходит на сервер не на каждую букву, а когда человек перестал печатать.
  const [needle, setNeedle] = useState('')
  const [found, setFound] = useState<DashboardPeople | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => setNeedle(search.trim()), 350)
    return () => window.clearTimeout(t)
  }, [search])

  useEffect(() => {
    setError('')
    setFound(null)
    if (!needle) return
    let alive = true
    adminApi.dashboardPeople(token, needle).then(
      (next) => {
        if (alive) setFound(next)
      },
      (e) => {
        if (alive) fail(e, setError)
      },
    )
    return () => {
      alive = false
    }
  }, [token, needle, fail])

  // Без поиска — топ-20 из основного ответа, с поиском — найденные.
  const list: DashboardPerson[] | null = needle ? (found?.items ?? null) : (data?.top ?? null)

  return (
    <Card
      title="Самые активные — для интервью"
      text="Двадцать человек с наибольшим числом дней с движением за всё время. Нажмите на почту — откроется, как человек занимается по дням."
    >
      <input
        className="analytics__search"
        type="search"
        value={search}
        placeholder="Найти человека по почте"
        aria-label="Найти человека по почте"
        onChange={(e) => setSearch(e.target.value)}
      />
      {error && <p className="page__note is-bad">{error}</p>}
      <div className="admin__scroll">
        <table className="admin__table analytics__people">
          <thead>
            <tr>
              <th>Почта</th>
              <th>Telegram</th>
              <th className="is-num">Дней с движением</th>
              <th className="is-num">Тренировок</th>
              <th className="is-num">Минут</th>
              <th>Последняя активность</th>
              <th>Оплата</th>
            </tr>
          </thead>
          <tbody>
            {list?.map((p) => (
              <PersonRows
                key={p.user_id}
                person={p}
                open={open === p.user_id}
                onToggle={() => setOpen((cur) => (cur === p.user_id ? null : p.user_id))}
                token={token}
                fail={fail}
              />
            ))}
            {list && list.length === 0 && (
              <tr>
                <td className="admin__empty" colSpan={PEOPLE_COLUMNS}>
                  {needle ? 'Никого с такой почтой' : 'Пока никто не двигался'}
                </td>
              </tr>
            )}
            {!list && !error && (
              <tr>
                <td className="admin__empty" colSpan={PEOPLE_COLUMNS}>
                  Загружаем…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function PersonRows({
  person: p,
  open,
  onToggle,
  token,
  fail,
}: {
  person: DashboardPerson
  open: boolean
  onToggle(): void
  token: string
  fail: Fail
}) {
  return (
    <Fragment>
      <tr className={open ? 'analytics__person is-open' : 'analytics__person'}>
        <td>
          <button type="button" className="analytics__person-btn" aria-expanded={open} onClick={onToggle}>
            {p.email}
          </button>
        </td>
        <td>
          <TelegramLink username={p.telegram_username} />
        </td>
        <td className="is-num">{num(p.active_days)}</td>
        <td className="is-num">{num(p.workouts)}</td>
        <td className="is-num">{num(p.minutes)}</td>
        <td>{dateTimeText(p.last_active_at)}</td>
        <td>{p.paid ? (p.tariff ?? 'да') : '—'}</td>
      </tr>
      {open && (
        <tr className="analytics__card-row">
          <td colSpan={PEOPLE_COLUMNS}>
            <PersonCard userId={p.user_id} token={token} fail={fail} />
          </td>
        </tr>
      )}
    </Fragment>
  )
}

/** Сколько последних дней показывать в карточке человека. */
const CARD_DAYS = 30

function PersonCard({ userId, token, fail }: { userId: string; token: string; fail: Fail }) {
  const [data, setData] = useState<UserActivity | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    adminApi.userActivity(token, userId).then(
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
  }, [token, userId, fail])

  const days = useMemo(() => data?.days.slice(0, CARD_DAYS) ?? [], [data])
  const maxMinutes = Math.max(1, ...days.map((d) => d.minutes))

  if (error) return <p className="page__note is-bad">{error}</p>
  if (!data) return <p className="admin__letters-note">Загружаем…</p>

  return (
    <div className="analytics__card">
      <div className="analytics__block">
        <h3 className="admin__letters-title">
          По дням{' '}
          <span className="analytics__muted">
            {data.days.length > CARD_DAYS ? `последние ${CARD_DAYS} из ${num(data.days.length)}` : ''}
          </span>
        </h3>
        {days.length === 0 ? (
          <p className="analytics__muted">Ещё ни разу не двигался.</p>
        ) : (
          <ul className="analytics__rows">
            {days.map((d) => (
              <li key={d.day} className="analytics__row">
                <span className="analytics__row-label">
                  {dayText(d.day)} <span className="overview__weekday">{weekday(d.day)}</span>
                </span>
                <span className="analytics__bar" aria-hidden="true">
                  <span style={{ width: `${(d.minutes / maxMinutes) * 100}%` }} />
                </span>
                <span className="analytics__row-value">
                  {duration(d.seconds)}{' '}
                  <span className="analytics__row-pct">
                    {num(d.sessions)} {plural(d.sessions, 'тренировка', 'тренировки', 'тренировок')}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="analytics__block">
        <h3 className="admin__letters-title">
          Последние тренировки <span className="analytics__muted">по его времени, {data.timezone}</span>
        </h3>
        {data.sessions.length === 0 ? (
          <p className="analytics__muted">
            Тренировок в истории нет: каждая хранится с 22.10.2026, раньше — только за 90 дней до этой
            даты.
          </p>
        ) : (
          <ul className="analytics__sessions">
            {data.sessions.map((s) => (
              <li key={s.started_at}>
                <span>
                  {dayText(s.local_date)} в {s.local_time}
                </span>
                <span className="analytics__muted">{PART_LABELS[s.day_part]}</span>
                <span className="analytics__row-value">{duration(s.seconds)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
