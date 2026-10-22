/**
 * Главная админки — единое окно аналитики (/admin, с 22.10.2026).
 *
 * Зачем (созвон 22.10). Дима: «Мне супер важно любое действие человека в
 * ритме: в какое время суток заходит, сколько сессий делает, как долго они
 * длятся, какая возвращаемость, как часто — несколько раз в день, в неделю
 * или раз в неделю. Только аналитикой мы поймём, что это за продукт». И
 * «посчитать экономику: сколько нам обходится пользователь» и «где приседают
 * конверсии». Никита: «одно единое окно, где выведешь всё необходимое».
 *
 * Сверху вниз: период → итоги → воронка шагов с конверсиями и самым большим
 * провалом → возвращаемость по дням или неделям регистрации (тепловая
 * таблица, все / купили / не купили) → поведение (частота, тренировки, время
 * суток) → каналы (метки ссылок) → по дням → люди с поиском и карточкой
 * человека, которая раскрывается прямо в таблице (всплывающих окон в
 * продукте нет). Длинные таблицы (возвращаемость, по дням) по умолчанию
 * свёрнуты до последних строк: за всё время они растягивались на тысячи
 * пикселей.
 *
 * Данные — три запроса: окно целиком (/admin/dashboard), таблица людей
 * (/admin/dashboard/people, повторяется при поиске) и карточка человека по
 * нажатию. Правила подсчёта — на сервере (docs/STATS.md бэкенда, раздел 12);
 * здесь только показ. Блок «Экономика» (расходы руками → цена регистрации
 * и окупаемость) убран по просьбе Никиты 22.10.
 * Графических библиотек нет: полосы — это ширина блока в процентах.
 */

import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  adminApi,
  type CohortCells,
  type Dashboard,
  type DashboardCohort,
  type DashboardPeople,
  type DashboardPerson,
  type DayPartKey,
  type FrequencyWindow,
  type Period,
  type UserActivity,
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

/** Рубли без копеек: цена регистрации в 83,33 ₽ читается хуже, чем 83 ₽. */
const money = (value: number) => rub(Math.round(value))

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

const sourceTitle = (source: string | null) => (source ? source : 'Без метки')

/** Склонение: 1 день, 2 дня, 5 дней. */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

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
          Заходы, регистрации и оплаты — по Москве; движение и тренировки — по дню и часовому поясу
          человека. Администратор и удалённые аккаунты не считаются.
        </p>
        {error && <p className="page__note is-bad">{error}</p>}
      </Card>

      <Totals data={data} />
      <FunnelSteps data={data} />
      <Cohorts data={data} />
      <Behavior data={data} />
      <Channels data={data} />
      <Days data={data} />
      {ready && <People token={token} fail={fail} period={period} />}
    </>
  )
}

/* ——— Итоги ——— */

function Totals({ data }: { data: Dashboard | null }) {
  const t = data?.totals
  const tiles: { label: string; value: string; sub?: string }[] = [
    { label: 'Заходы на сайт', value: t ? num(t.visits) : '…', sub: 'разных браузеров' },
    { label: 'Гости начали тренировку', value: t ? num(t.guests) : '…', sub: 'без регистрации' },
    { label: 'Регистрации', value: t ? num(t.registered) : '…' },
    {
      label: 'Занимались',
      value: data ? num(data.behavior.active_users) : '…',
      sub: 'разных людей с движением',
    },
    {
      label: 'Оплатили',
      value: t ? num(t.paid_users) : '…',
      sub: t ? `${num(t.payments)} ${plural(t.payments, 'оплата', 'оплаты', 'оплат')} за период` : undefined,
    },
    {
      label: 'Выручка',
      value: t ? money(t.revenue) : '…',
      sub: t?.average_check != null ? `средний чек — ${money(t.average_check)}` : 'оплат нет',
    },
    {
      label: 'Выдано доступа вручную',
      value: t ? num(t.manual_grants) : '…',
      sub: 'в выручку не входит',
    },
  ]
  return (
    <Card title="Итоги за период">
      <div className="overview__tiles">
        {tiles.map((tile) => (
          <div key={tile.label} className="overview__tile">
            <span className="admin__step-label">{tile.label}</span>
            <span className="admin__step-value">{tile.value}</span>
            {tile.sub && <span className="admin__step-pct">{tile.sub}</span>}
          </div>
        ))}
      </div>
      <p className="admin__period-note">
        {data?.visits_since
          ? `Заходы считаются с ${dayText(data.visits_since)}. `
          : data
            ? 'Заходы ещё не считались. '
            : ''}
        Оплаты — деньги из GetCourse по дате оплаты, без отозванных; выручка — в рублях.
      </p>
    </Card>
  )
}

/* ——— Воронка шагов ——— */

function FunnelSteps({ data }: { data: Dashboard | null }) {
  const t = data?.totals
  const c = data?.conversions
  const steps = [
    { label: 'Заходы на сайт', value: t?.visits ?? 0, share: null as number | null },
    { label: 'Гости начали тренировку', value: t?.guests ?? 0, share: c?.visit_to_guest ?? null },
    { label: 'Регистрации', value: t?.registered ?? 0, share: c?.guest_to_register ?? null },
    {
      label: 'Оплатили (из зарегистрированных за период)',
      value: t?.registered_paid ?? 0,
      share: c?.register_to_paid ?? null,
    },
  ]
  const top = Math.max(1, ...steps.map((s) => s.value))
  const visits = t?.visits ?? 0
  // Доля от предыдущего шага осмысленна, только пока она не больше 100%:
  // ссылки /go/… ведут сразу на регистрацию, поэтому регистраций бывает
  // больше, чем гостей, и «174% от гостей» ничего не говорит.
  const meaningful = (s: (typeof steps)[number]) => s.share !== null && s.share <= 1
  // Где теряем больше всего — шаг с самой низкой осмысленной долей перехода.
  // Переход без потерь (ровно 100%) провалом не считаем.
  const candidates = steps.filter((s) => meaningful(s) && (s.share ?? 1) < 1)
  const worst = candidates.length
    ? candidates.reduce((a, b) => ((b.share ?? 1) < (a.share ?? 1) ? b : a))
    : null

  return (
    <Card title="Воронка">
      {!data ? (
        <p className="admin__letters-note">Загружаем…</p>
      ) : (
        <>
          <ol className="analytics__funnel">
            {steps.map((s, i) => (
              <li key={s.label} className={`analytics__funnel-step ${worst === s ? 'is-worst' : ''}`}>
                <div className="analytics__funnel-head">
                  <span className="analytics__funnel-label">{s.label}</span>
                  <span className="analytics__funnel-value">{num(s.value)}</span>
                </div>
                <span className="analytics__bar" aria-hidden="true">
                  <span style={{ width: `${(s.value / top) * 100}%` }} />
                </span>
                <span className="analytics__funnel-pct">
                  {i === 0 ? (
                    visits ? (
                      'от этого шага считаем остальные'
                    ) : (
                      'заходов не было — считать не от чего'
                    )
                  ) : (
                    <>
                      <span className="analytics__funnel-main">
                        {visits ? pct(s.value / visits) : '—'} от заходов на сайт
                      </span>
                      {/* У второго шага предыдущий — и есть заходы: та же цифра дважды не нужна. */}
                      {i > 1 && meaningful(s) && ` · ${pct(s.share)} от предыдущего шага`}
                      {worst === s && ' · здесь теряем больше всего'}
                    </>
                  )}
                </span>
              </li>
            ))}
          </ol>
          <p className="admin__period-note">
            Главная цифра — доля от заходов на сайт; у «Оплатили» это и есть сквозная конверсия, сейчас{' '}
            {pct(c?.visit_to_paid)}. Процент от предыдущего шага — только где он не больше 100%:
            регистрируются не только гости. «Оплатили» — из зарегистрированных за период, оплата в
            любой момент.
          </p>
        </>
      )}
    </Card>
  )
}

/* ——— Возвращаемость ——— */

type CohortGroup = 'everyone' | 'bought' | 'not_bought'

const COHORT_GROUPS: { group: CohortGroup; label: string }[] = [
  { group: 'everyone', label: 'Все' },
  { group: 'bought', label: 'Купили' },
  { group: 'not_bought', label: 'Не купили' },
]

type CohortStep = 'day' | 'week'

const COHORT_STEPS: { step: CohortStep; label: string }[] = [
  { step: 'day', label: 'По дням' },
  { step: 'week', label: 'По неделям' },
]

/** Больше стольких дневных когорт — по умолчанию показываем недели. */
const COHORT_WEEKLY_AFTER = 21

/** Сколько строк возвращаемости видно, пока не нажали «Показать все». */
const COHORT_ROWS = 12

/**
 * Ячейки строки и знаменатель доли по каждому столбцу. В неделе и в итоге
 * в столбец входят только когорты, дожившие до этого дня, поэтому «из
 * скольких» у столбцов разное, а не размер строки целиком.
 */
type HeatCells = CohortCells & { base: (number | null)[] }

/** Строка таблицы: день регистрации, неделя или итог. */
type CohortLine = {
  key: string
  title: ReactNode
  size: number
  paid: number
  cells: Record<CohortGroup, HeatCells>
  total?: boolean
}

const isReady = (cells: CohortCells, i: number) => cells.returned[i] !== null && cells.returned[i] !== undefined

/**
 * Складывает когорты так же, как сервер считает строку «Все когорты»: в
 * столбец — только когорты с готовой ячейкой, доля — от суммы их размеров.
 * Если готовых нет — ячейка пустая. Сложить готовые доли нельзя: у когорт
 * разный размер.
 */
function sumCells(list: CohortCells[], columns: number): HeatCells {
  const returned: (number | null)[] = []
  const share: (number | null)[] = []
  const base: (number | null)[] = []
  for (let i = 0; i < columns; i++) {
    const ready = list.filter((cells) => isReady(cells, i))
    if (ready.length === 0) {
      returned.push(null)
      share.push(null)
      base.push(null)
      continue
    }
    const count = ready.reduce((sum, cells) => sum + (cells.returned[i] ?? 0), 0)
    const whole = ready.reduce((sum, cells) => sum + cells.size, 0)
    returned.push(count)
    share.push(whole ? count / whole : null)
    base.push(whole)
  }
  return { size: list.reduce((sum, cells) => sum + cells.size, 0), returned, share, base }
}

/** Серверные ячейки как есть, плюс знаменатель по столбцам из тех же когорт. */
const withBase = (cells: CohortCells, parts: CohortCells[], columns: number): HeatCells => ({
  ...cells,
  base: sumCells(parts, columns).base,
})

function dayLine(c: DashboardCohort, columns: number): CohortLine {
  const day = c.day ?? ''
  return {
    key: day,
    title: (
      <>
        {dayText(day)} <span className="overview__weekday">{weekday(day)}</span>
      </>
    ),
    size: c.size,
    paid: c.paid,
    cells: {
      everyone: withBase(c.everyone, [c.everyone], columns),
      bought: withBase(c.bought, [c.bought], columns),
      not_bought: withBase(c.not_bought, [c.not_bought], columns),
    },
  }
}

/** Понедельник недели, в которую попал день. */
function mondayOf(day: string): Date {
  const date = dayDate(day)
  const back = (date.getDay() + 6) % 7
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - back)
}

/** Недели понедельник–воскресенье по дню регистрации; порядок — как у дней, от новых к старым. */
function weekLines(cohorts: DashboardCohort[], columns: number): CohortLine[] {
  const weeks = new Map<number, DashboardCohort[]>()
  for (const c of cohorts) {
    if (!c.day) continue
    const monday = mondayOf(c.day).getTime()
    const list = weeks.get(monday)
    if (list) list.push(c)
    else weeks.set(monday, [c])
  }
  return [...weeks].map(([monday, list]) => {
    const start = new Date(monday)
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)
    const pick = (group: CohortGroup) => sumCells(list.map((c) => c[group]), columns)
    return {
      key: String(monday),
      title: `${shortDate(start)}–${shortDate(end)}`,
      size: list.reduce((sum, c) => sum + c.size, 0),
      paid: list.reduce((sum, c) => sum + c.paid, 0),
      cells: { everyone: pick('everyone'), bought: pick('bought'), not_bought: pick('not_bought') },
    }
  })
}

/** Итог берём с сервера, знаменатель по столбцам — из всех когорт. */
function totalLine(total: DashboardCohort, cohorts: DashboardCohort[], columns: number): CohortLine {
  const pick = (group: CohortGroup) =>
    withBase(
      total[group],
      cohorts.map((c) => c[group]),
      columns,
    )
  return {
    key: 'total',
    title: 'Все когорты',
    size: total.size,
    paid: total.paid,
    cells: { everyone: pick('everyone'), bought: pick('bought'), not_bought: pick('not_bought') },
    total: true,
  }
}

/** Ячейка тепловой таблицы: чем выше доля, тем насыщеннее розовый. */
function HeatCell({ cells, index }: { cells: HeatCells; index: number }) {
  const share = cells.share[index]
  const count = cells.returned[index]
  const base = cells.base[index] ?? cells.size
  if (count === null || count === undefined) {
    return (
      <td className="is-num analytics__heat is-future" title="Этот день для когорты ещё не закончился">
        ·
      </td>
    )
  }
  // День прошёл, но в группе никого (например, никто из когорты не купил):
  // долю считать не от чего — это не «рано», а «некого».
  if (share === null || share === undefined) {
    return (
      <td className="is-num analytics__heat is-future" title="В этой группе никого">
        —
      </td>
    )
  }
  const strength = Math.round(Math.min(1, share) * 100)
  return (
    <td
      className={`is-num analytics__heat ${strength >= 55 ? 'is-strong' : ''}`}
      style={{ background: `color-mix(in srgb, var(--pink-500) ${strength}%, var(--white))` }}
      title={`${num(count)} из ${num(base)}`}
    >
      {pct(share)}
      <span className="analytics__heat-count">
        {num(count)} из {num(base)}
      </span>
    </td>
  )
}

function CohortRow({ line, group, columns }: { line: CohortLine; group: CohortGroup; columns: number }) {
  const cells = line.cells[group]
  return (
    <tr className={line.total ? 'analytics__cohort-total' : undefined}>
      <td>{line.title}</td>
      <td className="is-num">{num(cells.size)}</td>
      <td className="is-num">
        {num(line.paid)}
        {line.size > 0 && <span className="admin__cell-pct">{pct(line.paid / line.size)}</span>}
      </td>
      {Array.from({ length: columns }, (_, i) => (
        <HeatCell key={i} cells={cells} index={i} />
      ))}
    </tr>
  )
}

/** Кнопка под длинной таблицей: «Показать все (N)» / «Свернуть». */
function ShowAll({ total, limit, all, onToggle }: { total: number; limit: number; all: boolean; onToggle(): void }) {
  if (total <= limit) return null
  return (
    <div className="chips analytics__more">
      <button type="button" className="chip" onClick={onToggle}>
        {all ? 'Свернуть' : `Показать все (${num(total)})`}
      </button>
    </div>
  )
}

function Cohorts({ data }: { data: Dashboard | null }) {
  const [group, setGroup] = useState<CohortGroup>('everyone')
  // null — шаг выбираем сами по числу когорт, пока человек не нажал сам.
  const [chosenStep, setChosenStep] = useState<CohortStep | null>(null)
  const [all, setAll] = useState(false)
  // Новые данные приходят только при смене периода — тогда снова короткий
  // список и шаг по умолчанию для нового периода.
  useEffect(() => {
    setChosenStep(null)
    setAll(false)
  }, [data])

  const days = data?.cohort_days ?? [1, 3, 7, 14, 30]
  const columns = days.length
  const cohorts = useMemo(() => data?.cohorts ?? [], [data])
  const step: CohortStep = chosenStep ?? (cohorts.length > COHORT_WEEKLY_AFTER ? 'week' : 'day')

  const lines = useMemo(
    () => (step === 'week' ? weekLines(cohorts, columns) : cohorts.map((c) => dayLine(c, columns))),
    [step, cohorts, columns],
  )
  const total = useMemo(
    () => (data && cohorts.length > 0 ? totalLine(data.cohort_total, cohorts, columns) : null),
    [data, cohorts, columns],
  )
  // Строки идут от новых к старым — последние по времени наверху.
  const shown = all ? lines : lines.slice(0, COHORT_ROWS)

  return (
    <Card
      title="Возвращаемость"
      text="Люди, зарегистрированные в один день (по их часовому поясу), и доля тех, кто двигался на 1-й, 3-й, 7-й, 14-й и 30-й день после регистрации. «Купили» — есть оплата, когда бы она ни была."
    >
      <div className="analytics__toolbar">
        <div className="chips admin__chips">
          {COHORT_GROUPS.map((g) => (
            <button
              key={g.group}
              type="button"
              className={`chip ${group === g.group ? 'is-on' : ''}`}
              onClick={() => setGroup(g.group)}
            >
              {g.label}
            </button>
          ))}
        </div>
        <div className="chips admin__chips">
          {COHORT_STEPS.map((s) => (
            <button
              key={s.step}
              type="button"
              className={`chip ${step === s.step ? 'is-on' : ''}`}
              onClick={() => {
                setChosenStep(s.step)
                setAll(false)
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="admin__scroll">
        <table className="admin__table analytics__cohorts">
          <thead>
            <tr>
              <th>{step === 'week' ? 'Неделя регистрации' : 'Регистрация'}</th>
              <th className="is-num">Людей</th>
              <th className="is-num">Купили</th>
              {days.map((d) => (
                <th key={d} className="is-num">
                  D{d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {total && <CohortRow line={total} group={group} columns={columns} />}
            {shown.map((line) => (
              <CohortRow key={line.key} line={line} group={group} columns={columns} />
            ))}
            {data && cohorts.length === 0 && (
              <tr>
                <td className="admin__empty" colSpan={3 + columns}>
                  За эти даты никто не зарегистрировался
                </td>
              </tr>
            )}
            {!data && (
              <tr>
                <td className="admin__empty" colSpan={3 + columns}>
                  Загружаем…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <ShowAll total={lines.length} limit={COHORT_ROWS} all={all} onToggle={() => setAll((v) => !v)} />
      <p className="admin__period-note">
        D1 — следующий день после регистрации. Точка — день ещё не закончился, считать рано. В неделе
        и в строке «Все когорты» в каждый день входят только когорты, которые до него дожили, — поэтому
        «из скольких» у столбцов разное.
      </p>
    </Card>
  )
}

/* ——— Поведение ——— */

/** Строка-полоса: подпись, полоса от максимума, число и доля. */
function BarRow({ label, value, of, max }: { label: string; value: number; of: number; max: number }) {
  return (
    <li className="analytics__row">
      <span className="analytics__row-label">{label}</span>
      <span className="analytics__bar" aria-hidden="true">
        <span style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
      </span>
      <span className="analytics__row-value">
        {num(value)} <span className="analytics__row-pct">{of ? pct(value / of) : '—'}</span>
      </span>
    </li>
  )
}

/** «2–3» → «2–3 дня», «10+» → «10+ дней»: склонение — по последнему числу. */
function daysLabel(label: string): string {
  const last = Number(/(\d+)\D*$/.exec(label)?.[1] ?? 0)
  return `${label} ${plural(last, 'день', 'дня', 'дней')}`
}

function Frequency({ title, window }: { title: string; window: FrequencyWindow }) {
  const max = Math.max(1, ...window.buckets.map((b) => b.users))
  return (
    <div className="analytics__block">
      <h3 className="admin__letters-title">
        {title}{' '}
        <span className="analytics__muted">
          {shortDay(window.date_from)}–{shortDay(window.date_to)}
        </span>
      </h3>
      <ul className="analytics__rows">
        {window.buckets.map((b) => (
          <BarRow
            key={b.label}
            label={daysLabel(b.label)}
            value={b.users}
            of={window.users}
            max={max}
          />
        ))}
      </ul>
      <p className="analytics__muted">
        Людей с движением в эти дни — {num(window.users)}; полоса — сколько из них занимались
        столько дней.
      </p>
    </div>
  )
}

function Behavior({ data }: { data: Dashboard | null }) {
  const b = data?.behavior
  if (!b) {
    return (
      <Card title="Поведение">
        <p className="admin__letters-note">Загружаем…</p>
      </Card>
    )
  }
  const partMax = Math.max(1, ...b.day_parts.map((p) => p.sessions))
  const hourMax = Math.max(1, ...b.hours)
  return (
    <Card
      title="Поведение"
      text="Как часто, сколько и когда занимаются люди, которые двигались в выбранный период. Тренировка — движение без перерыва больше 30 минут."
    >
      <div className="analytics__grid">
        <Frequency title="Активные дни за неделю" window={b.week} />
        <Frequency title="Активные дни за 30 дней" window={b.month} />

        <div className="analytics__block">
          <h3 className="admin__letters-title">Тренировки</h3>
          <dl className="analytics__facts">
            <dt>Тренировок за период</dt>
            <dd>{num(b.sessions)}</dd>
            <dt>Длительность: медиана</dt>
            <dd>{duration(b.session_median_seconds)}</dd>
            <dt>Длительность: в среднем</dt>
            <dd>{duration(b.session_mean_seconds)}</dd>
            <dt>Тренировок в активный день (медиана)</dt>
            <dd>{b.sessions_per_day_median === null ? '—' : num(b.sessions_per_day_median)}</dd>
            <dt>Дней с двумя и больше тренировками</dt>
            <dd>
              {pct(b.multi_session_share)}{' '}
              <span className="analytics__muted">
                {num(b.multi_session_days)} из {num(b.active_days)}
              </span>
            </dd>
          </dl>
          <p className="analytics__muted">
            Длительность — секунды движения без пауз. Медиана честнее среднего: одна тренировка на
            два часа не тянет его вверх.
          </p>
        </div>

        <div className="analytics__block">
          <h3 className="admin__letters-title">Время суток</h3>
          <ul className="analytics__rows">
            {b.day_parts.map((p) => (
              <BarRow
                key={p.key}
                label={`${PART_LABELS[p.key]}, ${PART_HOURS[p.key]}`}
                value={p.sessions}
                of={b.sessions}
                max={partMax}
              />
            ))}
          </ul>
          <div className="analytics__hours" aria-label="Тренировки по часам">
            {b.hours.map((n, hour) => (
              <span key={hour} className="analytics__hour" title={`${hour}:00 — ${num(n)}`}>
                <span style={{ height: `${(n / hourMax) * 100}%` }} />
              </span>
            ))}
          </div>
          <div className="analytics__hours-axis" aria-hidden="true">
            <span>0</span>
            <span>6</span>
            <span>12</span>
            <span>18</span>
            <span>23</span>
          </div>
          <p className="analytics__muted">
            Час начала тренировки по часовому поясу человека.
            {b.sessions_since
              ? ` Данные о тренировках — с ${dayText(b.sessions_since)}.`
              : ' Данных о тренировках пока нет.'}
          </p>
        </div>
      </div>
    </Card>
  )
}

/* ——— Каналы ——— */

function Channels({ data }: { data: Dashboard | null }) {
  return (
    <Card
      title="Каналы"
      text="Метки ссылок: откуда пришли, сколько зарегистрировались и заплатили. Оплата относится к метке, с которой человек зарегистрировался."
    >
      <div className="admin__scroll">
        <table className="admin__table analytics__channels">
          <thead>
            <tr>
              <th>Метка</th>
              <th className="is-num">Заходы</th>
              <th className="is-num">Гости</th>
              <th className="is-num">Регистрации</th>
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
                <td className="is-num">{num(c.paid_users)}</td>
                <td className="is-num">{money(c.revenue)}</td>
                <td className="is-num">
                  {pct(c.register_to_paid)}
                  {c.registered > 0 && (
                    <span className="admin__cell-pct">
                      {num(c.registered_paid)} из {num(c.registered)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {!data && (
              <tr>
                <td className="admin__empty" colSpan={7}>
                  Загружаем…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="admin__period-note">
        Заходы и гости — по меткам ссылок входа (прямые заходы на сайт метки не несут и есть только в
        итогах). Оплатили и выручка — оплаты за период; «регистрация → оплата» — из
        зарегистрированных за период.
      </p>
    </Card>
  )
}

/* ——— По дням ——— */

/** Сколько последних дней видно, пока не нажали «Показать все». */
const DAYS_ROWS = 14

function Days({ data }: { data: Dashboard | null }) {
  const [all, setAll] = useState(false)
  // Новые данные — новый период: снова только последние дни.
  useEffect(() => setAll(false), [data])

  const list = data?.days ?? []
  // Полоса заходов — от максимума всего периода, чтобы при раскрытии не прыгала.
  const maxVisits = Math.max(1, ...list.map((d) => d.visits))
  // Дни идут от новых к старым — последние наверху.
  const shown = all ? list : list.slice(0, DAYS_ROWS)
  return (
    <Card title="По дням">
      <div className="admin__scroll">
        <table className="admin__table analytics__days">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Заходы</th>
              <th className="is-num">Гости</th>
              <th className="is-num">Регистрации</th>
              <th className="is-num">Занимались</th>
              <th className="is-num">Тренировки</th>
              <th className="is-num">Минуты</th>
              <th className="is-num">Оплаты</th>
              <th className="is-num">Выручка</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((d) => (
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
                <td className="is-num">{num(d.registered)}</td>
                <td className="is-num">{num(d.active_users)}</td>
                <td className="is-num">
                  {num(d.workouts)}
                  <span className="admin__cell-pct">начато {num(d.workouts_started)}</span>
                </td>
                <td className="is-num">{num(d.minutes)}</td>
                <td className="is-num">{num(d.payments)}</td>
                <td className="is-num">{d.revenue ? money(d.revenue) : '—'}</td>
              </tr>
            ))}
            {data && data.days.length === 0 && (
              <tr>
                <td className="admin__empty" colSpan={9}>
                  За эти даты данных нет
                </td>
              </tr>
            )}
            {!data && (
              <tr>
                <td className="admin__empty" colSpan={9}>
                  Загружаем…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <ShowAll total={list.length} limit={DAYS_ROWS} all={all} onToggle={() => setAll((v) => !v)} />
      <p className="admin__period-note">
        Тренировки — засчитанные, от минуты движения; ниже мелко — сколько начато всего.
      </p>
    </Card>
  )
}

/* ——— Люди ——— */

const PEOPLE_COLUMNS = 10

function People({ token, fail, period }: { token: string; fail: Fail; period: Period }) {
  // Период — новым объектом на каждую отрисовку, поэтому в зависимости
  // эффекта идут сами даты.
  const { from, to } = period
  const [search, setSearch] = useState('')
  // Поиск уходит на сервер не на каждую букву, а когда человек перестал печатать.
  const [needle, setNeedle] = useState('')
  const [data, setData] = useState<DashboardPeople | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => setNeedle(search.trim()), 350)
    return () => window.clearTimeout(t)
  }, [search])

  useEffect(() => {
    let alive = true
    setError('')
    setData(null)
    adminApi.dashboardPeople(token, { from, to }, needle).then(
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
  }, [token, from, to, needle, fail])

  return (
    <Card
      title="Люди"
      text="Кто зарегистрировался или двигался в выбранный период; выше — у кого больше дней с движением. Поиск по почте — среди всех. Нажмите на почту — откроется активность человека."
    >
      <input
        className="analytics__search"
        type="search"
        value={search}
        placeholder="Поиск по почте"
        aria-label="Поиск по почте"
        onChange={(e) => setSearch(e.target.value)}
      />
      {error && <p className="page__note is-bad">{error}</p>}
      <div className="admin__scroll">
        <table className="admin__table analytics__people">
          <thead>
            <tr>
              <th>Почта</th>
              <th>Регистрация</th>
              <th>Метка</th>
              <th>Оплата</th>
              <th className="is-num">Дней с движением</th>
              <th className="is-num">Тренировок</th>
              <th className="is-num">Минут</th>
              <th>Последняя активность</th>
              <th>Любимое время</th>
              <th className="is-num">Дней с регистрации</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((p) => (
              <PersonRows
                key={p.user_id}
                person={p}
                open={open === p.user_id}
                onToggle={() => setOpen((cur) => (cur === p.user_id ? null : p.user_id))}
                token={token}
                fail={fail}
              />
            ))}
            {data && data.items.length === 0 && (
              <tr>
                <td className="admin__empty" colSpan={PEOPLE_COLUMNS}>
                  {needle ? 'Никого с такой почтой' : 'За эти даты никого'}
                </td>
              </tr>
            )}
            {!data && !error && (
              <tr>
                <td className="admin__empty" colSpan={PEOPLE_COLUMNS}>
                  Загружаем…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {data && data.total > data.items.length && (
        <p className="admin__period-note">
          Показаны первые {num(data.items.length)} из {num(data.total)} — остальных найдёт поиск по
          почте.
        </p>
      )}
    </Card>
  )
}

function payText(p: DashboardPerson): string {
  if (!p.paid) return '—'
  return (
    [p.tariff, p.paid_amount != null ? rub(p.paid_amount) : '', p.paid_at ? dateText(p.paid_at) : '']
      .filter(Boolean)
      .join(' · ') || 'да'
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
        <td>{dateText(p.registered_at)}</td>
        <td>{sourceTitle(p.source)}</td>
        <td>{payText(p)}</td>
        <td className="is-num">{num(p.active_days)}</td>
        <td className="is-num">{num(p.sessions)}</td>
        <td className="is-num">{num(p.minutes)}</td>
        <td>{dateTimeText(p.last_active_at)}</td>
        <td>{p.favorite_part ? PART_LABELS[p.favorite_part] : '—'}</td>
        <td className="is-num">{num(p.days_since_registration)}</td>
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
