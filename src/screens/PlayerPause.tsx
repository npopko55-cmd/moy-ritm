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

import type { StatsSummary } from '../api/types'
import Logo from '../components/Logo'
import Unlock from '../components/Unlock'
import WaveBg from '../components/WaveBg'
import { Check, Clock, Close, Moon, Play, PulseWave, Steps, Sun, SunHalf } from '../components/Icons'
import { parseLocalDate, pluralWord, toMinutes } from '../lib/date'
import './PlayerPause.css'

/** Шкала полосы «сегодня в движении»: полчаса — это уже полная полоса. */
const BAR_SCALE = 30

/** Отметки на полосе. Проценты считаются от той же шкалы. */
const MARKS = [
  { at: 5, text: 'Уже здорово!' },
  { at: 15, text: 'Вы справляетесь!' },
  { at: 30, text: 'Вау!' },
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

/** Что написать рядом с полосой — по минутам за сегодня. */
function barNote(minutes: number): string {
  if (minutes < 5) return 'Каждая минута идёт в копилку'
  if (minutes < 15) return 'Уже здорово! Ещё немного'
  if (minutes < 30) return 'Вы справляетесь!'
  return 'Вау! Это отличный результат!'
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
  /** Секунды в движении за эту тренировку. */
  sessionSeconds: number
  /** Шаги за сегодня целиком — оценка, поэтому печатается с «~». */
  todaySteps: number
  /** Сегодня всего, вместе с тем, что сервер ещё не видел. */
  todaySeconds: number
  summary: StatsSummary | null
  /** Доступа нет: показываем блок разблокировки под полосой дня. */
  locked?: boolean
  /** «Продолжить сейчас» — снять паузу и вернуться в тренировку. */
  onResume(): void
  /** Крестик и «Вернусь позже» — закрыть экран, оставшись на паузе. */
  onClose(): void
}

export default function PlayerPause({
  sessionSeconds,
  todaySteps,
  todaySeconds,
  summary,
  locked = false,
  onResume,
  onClose,
}: Props) {
  const todayMinutes = toMinutes(todaySeconds)
  const fill = Math.min(100, (todayMinutes / BAR_SCALE) * 100)

  const today = summary?.local_today ?? browserToday()
  const streak = summary?.current_streak_days ?? 0
  const active = new Set((summary?.week ?? []).filter((d) => d.seconds > 0).map((d) => d.local_date))

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
            {/* Текст владельца, дословно: без восклицательного знака и эмодзи. */}
            <h1 className="pause__title">Возвращайтесь сегодня и продвигайтесь еще</h1>
            <p className="pause__lead">
              Вы уже в движении, и это здорово!
              <br />
              Даже несколько минут имеют значение.
            </p>
          </div>
        </header>

        <ul className="pause__cards">
          <li className="sum">
            <span className="sum__icon sum__icon--pink">
              <Clock size={19} />
            </span>
            <span className="sum__label">В этой сессии</span>
            <strong className="sum__value">{mmss(sessionSeconds)}</strong>
            <span className="sum__unit">минут в движении</span>
          </li>
          <li className="sum">
            <span className="sum__icon sum__icon--orange">
              <Steps size={19} />
            </span>
            <span className="sum__label">Шагов набрано</span>
            {/* «~» здесь и везде: шаги мы оцениваем по темпу движения. */}
            <strong className="sum__value">~{todaySteps}</strong>
            <span className="sum__unit">шагов сегодня</span>
          </li>
          <li className="sum">
            <span className="sum__icon sum__icon--green">
              <PulseWave size={20} />
            </span>
            <span className="sum__label">Сегодня уже</span>
            <strong className="sum__value">{todayMinutes}</strong>
            {/* Здесь под цифрой стоит именно число минут, поэтому слово склоняем:
                «1 минут в движении» читается как машинный перевод. */}
            <span className="sum__unit">{pluralWord(todayMinutes, 'минута', 'минуты', 'минут')} в движении</span>
          </li>
        </ul>

        <section className="pause__bar">
          <header className="pause__bar-top">
            <span>
              Сегодня в движении — <strong>{todayMinutes} мин</strong>
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

        {/* Тот же блок, что в правой колонке плеера, только строкой. Стоит
            сразу под полосой дня: человек только что увидел свои минуты — это
            и есть момент, когда он думает, продолжать ли. */}
        {locked && (
          <div className="pause__unlock">
            <Unlock compact />
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

        <button className="btn btn--pink-lg pause__cta" onClick={onResume}>
          <Play size={20} />
          Продолжить сейчас
        </button>

        {/* «Вернусь позже» никуда не уводит: экран закрывается, а плеер
            остаётся на паузе — тем же, чем его закрывает крестик. */}
        <button className="pause__later" onClick={onClose}>
          Вернусь позже
        </button>

        <p className="pause__hand pause__hand--footer">Движение — это забота о себе ♡</p>
      </div>
    </div>
  )
}
