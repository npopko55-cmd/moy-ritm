/**
 * Экран паузы.
 *
 * Это не окно поверх тренировки, а состояние плеера: пока он показан,
 * `Player` остаётся смонтированным, секунды сессии и буфер кусков живут
 * дальше, а «Продолжить» возвращает ровно в то же движение и то же время.
 *
 * Задача экрана — не отчитаться, а поддержать: сколько уже сделано сегодня,
 * что даже несколько минут считаются и что серия не порвётся, если заглянуть
 * завтра.
 */

import { useEffect, useRef } from 'react'
import type { StatsSummary } from '../api/types'
import { useSession } from '../auth/SessionProvider'
import Logo from '../components/Logo'
import Unlock from '../components/Unlock'
import WaveBg from '../components/WaveBg'
import { Check, Clock, Close, Moon, Play, PulseWave, Steps, Sun, SunHalf } from '../components/Icons'
import { duration, durationText, parseLocalDate, pluralWord, toMinutes } from '../lib/date'
import { trialHint, useTrial } from '../lib/trial'
import './PlayerPause.css'

/** Шкала полосы «сегодня в движении»: полчаса — это уже полная полоса. */
const BAR_SCALE = 30

/** Отметки на полосе. Проценты считаются от той же шкалы. */
const MARKS = [
  { at: 5, text: 'Отличное начало!' },
  { at: 15, text: 'Вы на пути к цели!' },
  { at: 30, text: 'Круто!' },
]

/** Три коротких захода за день — статичный пример, не персональный совет. */
const IDEAS = [
  { icon: <Sun size={19} />, tone: 'orange', when: '4 мин утром', text: 'Включите поток с чашкой кофе' },
  { icon: <SunHalf size={19} />, tone: 'pink', when: '6 мин днём', text: 'Сделайте паузу и подвигайтесь' },
  { icon: <Moon size={19} />, tone: 'violet', when: '8 мин вечером', text: 'Завершите день в движении' },
]

const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']

/** Секунды → «12:47». */
const mmss = (total: number) =>
  `${Math.floor(Math.max(0, total) / 60)}:${String(Math.floor(Math.max(0, total) % 60)).padStart(2, '0')}`

/**
 * Что написать рядом с полосой — по минутам за сегодня (макет Димы 12.11.2026):
 * «Ещё немного — и будет 15 минут!» до ближайшей отметки.
 */
function barNote(minutes: number): string {
  const next = MARKS.find((m) => minutes < m.at)
  return next ? `Ещё немного — и будет ${next.at} минут!` : 'Вау! Это отличный результат!'
}

/** «3 минуты», «45 секунд» — для заголовка и строки под ним, словами целиком. */
function spoken(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s} ${pluralWord(s, 'секунда', 'секунды', 'секунд')}`
  const m = Math.round(s / 60)
  return `${m} ${pluralWord(m, 'минута', 'минуты', 'минут')}`
}

/** «2026-09-06» по локальному времени браузера — запасной вариант, если сводки нет. */
function browserToday(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Понедельник…воскресенье текущей недели, семь локальных дат подряд. */
function weekDates(today: string): string[] {
  const start = parseLocalDate(today)
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  const p = (n: number) => String(n).padStart(2, '0')
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  })
}

type Props = {
  /** Секунды в движении в этом заходе. */
  sessionSeconds: number
  /** Шаги за сегодня целиком — оценка, поэтому печатается с «~». */
  todaySteps: number
  /** Движения этого захода, пройденные до конца, — во всех потоках. */
  sessionMoves: number
  /** Шаги этого захода — оценка по темпу, печатается с «~». */
  sessionSteps: number
  /** Движения за сегодня целиком (src/lib/dayMoves.ts). */
  todayMoves: number
  /** Сегодня всего, вместе с тем, что сервер ещё не видел. */
  todaySeconds: number
  summary: StatsSummary | null
  /** Доступа нет: показываем блок разблокировки под полосой дня. */
  locked?: boolean
  /** «Продолжить сейчас» — снять паузу и вернуться в тренировку. */
  onResume(): void
  /** Крестик — закрыть экран, оставшись в плеере на паузе. */
  onClose(): void
  /** «Вернусь позже» — уйти в «Мой прогресс»; тренировка ждёт полчаса. */
  onLater(): void
}

export default function PlayerPause({
  sessionSeconds,
  todaySteps,
  sessionMoves,
  sessionSteps,
  todayMoves,
  todaySeconds,
  summary,
  locked = false,
  onResume,
  onClose,
  onLater,
}: Props) {
  // Минуты — для шкалы полосы и отметок на ней, `todayTime` — для показа:
  // за короткий заход в нём стоят секунды, а не ноль минут.
  // Пробный период воронки: строка под итогами, та же, что в блоке разблокировки.
  const { access } = useSession()
  const trialNote = trialHint(useTrial(), access)

  const todayMinutes = toMinutes(todaySeconds)
  const todayTime = duration(todaySeconds)
  const fill = Math.min(100, (todayMinutes / BAR_SCALE) * 100)

  const today = summary?.local_today ?? browserToday()
  // Заходы — тренировки по сводке сервера. Идущий заход мог ещё не дойти до
  // сервера, поэтому не меньше одного сегодня и не меньше сегодняшних за неделю.
  const week = summary?.week ?? []
  const todayWorkouts = Math.max(1, week.find((d) => d.local_date === today)?.workouts ?? 0)
  const weekWorkouts = Math.max(todayWorkouts, week.reduce((sum, d) => sum + d.workouts, 0))
  const streak = summary?.current_streak_days ?? 0
  const active = new Set((summary?.week ?? []).filter((d) => d.seconds > 0).map((d) => d.local_date))

  // Плеер под экраном спрятан, и фокус с его кнопки паузы пропал бы. Отдаём
  // его главной кнопке экрана — без прокрутки: карточка должна открыться
  // сверху, как и раньше.
  const resumeButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    resumeButton.current?.focus({ preventScroll: true })
  }, [])

  return (
    <div className="pause">
      <WaveBg opacity={0.85} />

      <div className="pause__card">
        <button className="pause__close" onClick={onClose} aria-label="Закрыть и вернуться в плеер">
          <Close size={20} />
        </button>

        {/* Шапка текстовая: фотографию, розовое пятно, нотки и подпись рядом
            с ними убрал заказчик — заголовок и две строки под ним остались. */}
        <header className="pause__head">
          <div className="pause__intro">
            <Logo />
            {/* Заголовок и строки под ним — по макету Димы 12.11.2026, дословно. */}
            <h1 className="pause__title">
              Отлично! Ещё +{spoken(sessionSeconds)} движения сегодня 💛
            </h1>
            <p className="pause__lead">
              Сегодня вы уже двигались {spoken(todaySeconds)}.
              <br />
              Каждая минута считается!
            </p>
          </div>
        </header>

        {/*
          Подписи — дословно те, что продиктовал владелец. Единиц под
          цифрами больше нет: «шагов сегодня» под заголовком «Шагов набрано
          сегодня» повторяло его же. Осталось только число.
        */}
        <ul className="pause__cards pause__cards--pairs">
          {/* Макет Димы 12.11.2026: в каждой карточке два числа — «в этом
              заходе» и «сегодня» (у заходов — «сегодня» и «за неделю»). */}
          <li className="sum sum--pair sum--pink">
            <span className="sum__icon sum__icon--pink">
              <Clock size={19} />
            </span>
            <span className="sum__label">Минуты в движении</span>
            <span className="sum__pair">
              <span><strong className="sum__value">{mmss(sessionSeconds)}</strong><small>в этом заходе</small></span>
              <span><strong className="sum__value sum__value--sm">{todayTime.value} {todayTime.unit}</strong><small>сегодня</small></span>
            </span>
          </li>
          <li className="sum sum--pair sum--blue">
            <span className="sum__icon sum__icon--blue">
              <Steps size={19} />
            </span>
            <span className="sum__label">Шаги</span>
            <span className="sum__pair">
              <span><strong className="sum__value">~{sessionSteps}</strong><small>в этом заходе</small></span>
              <span><strong className="sum__value sum__value--sm">~{todaySteps}</strong><small>сегодня</small></span>
            </span>
          </li>
          <li className="sum sum--pair sum--orange">
            <span className="sum__icon sum__icon--orange">
              <Check size={19} />
            </span>
            <span className="sum__label">Движений</span>
            <span className="sum__pair">
              <span><strong className="sum__value">{sessionMoves}</strong><small>в этом заходе</small></span>
              <span><strong className="sum__value sum__value--sm">{Math.max(todayMoves, sessionMoves)}</strong><small>сегодня</small></span>
            </span>
          </li>
          <li className="sum sum--pair sum--green">
            <span className="sum__icon sum__icon--green">
              <PulseWave size={20} />
            </span>
            <span className="sum__label">Заходы</span>
            <span className="sum__pair">
              <span><strong className="sum__value">{todayWorkouts}</strong><small>сегодня</small></span>
              <span><strong className="sum__value sum__value--sm">{weekWorkouts}</strong><small>за неделю</small></span>
            </span>
          </li>
        </ul>

        {trialNote && <p className="pause__trial">{trialNote}</p>}

        {/* Кнопки — сразу под итогами, а не в самом низу: до них больше не
            нужно листать (просьба владельца). Полоса дня и блок разблокировки
            под ней идут следом, как и раньше. Порядок в разметке — это и
            порядок фокуса с клавиатуры. */}
        <button ref={resumeButton} className="btn btn--pink-lg pause__cta" onClick={onResume}>
          <Play size={20} />
          Продолжить двигаться
        </button>

        {/* «Вернусь позже» уводит в «Мой прогресс» — к минутам и серии
            (правка тестера 27.09.2026). Раньше оно лишь закрывало экран, как
            крестик, и человек оказывался снова в тренировке. Тренировка при
            этом ждёт: полчаса «Вернуться в поток» продолжит её. */}
        <button className="pause__later" onClick={onLater}>
          Вернусь позже
        </button>

        <section className="pause__bar">
          <header className="pause__bar-top">
            <span>
              Сегодня в движении — <strong>{durationText(todaySeconds)}</strong>
            </span>
            <span className="pause__bar-note">{barNote(todayMinutes)}</span>
          </header>

          <div className="meter">
            <div className="meter__fill" style={{ width: `${fill}%` }} />
            {MARKS.map((m) => (
              <span
                key={m.at}
                className={`meter__mark ${todayMinutes >= m.at ? 'is-done' : ''}`}
                style={{ left: `${(m.at / BAR_SCALE) * 100}%` }}
              />
            ))}
          </div>

          <ul className="meter__legend">
            {MARKS.map((m) => (
              <li
                key={m.at}
                className={todayMinutes >= m.at ? 'is-done' : ''}
                style={{ left: `${(m.at / BAR_SCALE) * 100}%` }}
              >
                <b>{m.at} мин</b>
                <span>{m.text}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Тот же блок, что в плеере: плашка «Разнообразь тренировки и
            открой все 40 движений!» с кнопкой «Открыть», без цены, а у
            trial3d с открытыми движениями — прежний блок строкой. Стоит
            сразу под полосой дня: человек только что увидел свои минуты — это
            и есть момент, когда он думает, продолжать ли. */}
        {locked && (
          <div className="pause__unlock">
            <Unlock place="pause" noSteps={sessionMoves !== null} />
          </div>
        )}

        <section className="pause__tip">
          <div className="pause__tip-text">
            <h2 className="pause__tip-title">Не обязательно заниматься долго</h2>
            <p>Есть свободные 3–5 минут? Вливайтесь в поток.</p>
            <p>Утром, между делами, в перерыве или вечером.</p>
            <p>Каждый заход добавляет минуты в вашу активность.</p>
          </div>

          <p className="pause__hand pause__hand--tip">Маленькие шаги — большие результаты! ♡</p>

          <ul className="ideas">
            {IDEAS.map((i) => (
              <li key={i.when} className="idea">
                <span className={`idea__icon idea__icon--${i.tone}`}>{i.icon}</span>
                <span className="idea__body">
                  <b>{i.when}</b>
                  <span>{i.text}</span>
                </span>
              </li>
            ))}
            <li className="idea idea--sum">= 18 минут движения 💗</li>
          </ul>
        </section>

        <section className="pause__streak">
          <div className="pause__streak-text">
            <h2>
              {streak > 0
                ? `🔥 ${streak} ${pluralWord(streak, 'день', 'дня', 'дней')} подряд в движении!`
                : '🔥 Начните серию сегодня!'}
            </h2>
            <p>Загляните завтра хотя бы на несколько минут, чтобы продолжить серию.</p>
          </div>

          <ul className="dots">
            {weekDates(today).map((date, i) => {
              const done = active.has(date)
              const future = date > today
              return (
                <li
                  key={date}
                  className={`dot ${done ? 'is-done' : ''} ${date === today ? 'is-today' : ''} ${future ? 'is-future' : ''}`}
                >
                  <span className="dot__mark">{done ? <Check size={15} /> : ''}</span>
                  <span className="dot__label">{WEEKDAYS[i]}</span>
                </li>
              )
            })}
          </ul>
        </section>

        <p className="pause__hand pause__hand--footer">Движение — это забота о себе ♡</p>
      </div>
    </div>
  )
}
