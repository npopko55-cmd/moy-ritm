/**
 * «Проверяем оплату» — сюда GetCourse возвращает человека после оплаты.
 *
 * Номера заказа в адресе нет: GetCourse его не передаёт. Экран опирается
 * только на POST /payments/check. Обычно доступ появляется за секунды — его
 * открывает вебхук; если за пару минут ничего не изменилось, опрос
 * прекращается: сверка догонит оплату сама, максимум через час.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { ApiError, hasAccess, type Access } from '../api/types'
import { useSession } from '../auth/SessionProvider'
import { STREAMS } from '../data/streams'
import { formatDate } from '../lib/date'
import { AccountShell, FormError, errorText } from './Account'
import './PaymentSuccess.css'

/** Сколько всего ждём, прежде чем сказать «доступ откроется сам». */
const TOTAL_WAIT_MS = 120_000
/** Обычная пауза между проверками; сервер может попросить подождать дольше. */
const STEP_MS = 5000
/** Пауза перед уходом в поток: человек должен успеть прочитать «Оплата прошла». */
const LEAVE_MS = 2000

type Stage = 'checking' | 'paid' | 'timeout'

export default function PaymentSuccess() {
  const navigate = useNavigate()
  const { access: sessionAccess, reload } = useSession()

  const [stage, setStage] = useState<Stage>(() => (hasAccess(sessionAccess) ? 'paid' : 'checking'))
  const [access, setAccess] = useState<Access | null>(sessionAccess)
  const [error, setError] = useState('')

  // Живо ли ещё дерево и когда истекает терпение. В ref, чтобы цикл опроса
  // не пересобирался на каждом ответе.
  const alive = useRef(true)
  const until = useRef(Date.now() + TOTAL_WAIT_MS)
  const timer = useRef<number | undefined>(undefined)

  const stop = () => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = undefined
  }

  /** Одна проверка. Возвращает, через сколько миллисекунд спрашивать снова. */
  const checkOnce = useCallback(async (): Promise<number | null> => {
    try {
      const res = await api.paymentCheck()
      if (!alive.current) return null
      setAccess(res.access)
      setError('')
      if (hasAccess(res.access)) {
        setStage('paid')
        // Обновляем профиль: без этого защита маршрутов не пустит в плеер.
        await reload()
        return null
      }
      // Ручка тяжёлая: за ней запрос в GetCourse со своим лимитом.
      return Math.max(STEP_MS, (res.next_check_in || 0) * 1000)
    } catch (e) {
      if (!alive.current) return null
      if (e instanceof ApiError && e.status === 429) {
        // Лимит — не ошибка, а просьба подождать. Молча ждём.
        return Math.max(STEP_MS, (e.retry_after || 0) * 1000)
      }
      setError(errorText(e))
      return STEP_MS
    }
  }, [reload])

  /** Цикл опроса: сам себя перезапускает, пока есть смысл ждать. */
  const poll = useCallback(async () => {
    const wait = await checkOnce()
    if (!alive.current || wait === null) return
    if (Date.now() + wait > until.current) {
      setStage('timeout')
      return
    }
    timer.current = window.setTimeout(() => void poll(), wait)
  }, [checkOnce])

  useEffect(() => {
    alive.current = true
    // Доступ уже есть — проверять нечего: вебхук успел раньше возврата.
    if (!hasAccess(sessionAccess)) void poll()
    return () => {
      alive.current = false
      stop()
    }
    // Запускаем один раз: дальше цикл ведёт себя сам.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Оплата прошла — показали и ушли в поток.
  useEffect(() => {
    if (stage !== 'paid') return
    const id = window.setTimeout(() => navigate(`/start/${STREAMS[0].id}`), LEAVE_MS)
    return () => window.clearTimeout(id)
  }, [stage, navigate])

  const again = () => {
    stop()
    setStage('checking')
    setError('')
    until.current = Date.now() + TOTAL_WAIT_MS
    void poll()
  }


  if (stage === 'paid') {
    return (
      <AccountShell
        title="Оплата прошла"
        lead={
          access?.paid_until
            ? `Доступ открыт до ${formatDate(access.paid_until)}. Открываем поток…`
            : 'Доступ открыт. Открываем поток…'
        }
      >
        <div className="pay">
          <Ring done />
        </div>
        <nav className="account__links">
          <Link to={`/start/${STREAMS[0].id}`}>Влиться в поток</Link>
          <Link to="/">На главную</Link>
        </nav>
      </AccountShell>
    )
  }

  if (stage === 'timeout') {
    return (
      <AccountShell
        title="Пока не видим оплату"
        lead="Иногда GetCourse задерживает уведомление до часа — доступ откроется сам, и мы напишем на почту. Закрывать страницу не обязательно."
      >
        <div className="form__actions">
          <button className="form__submit" type="button" onClick={again}>
            Проверить ещё раз
          </button>
          <Link className="form__second" to="/help">
            Написать в поддержку
          </Link>
          <FormError>{error}</FormError>
        </div>

        <nav className="account__links">
          <Link to="/tariffs">К тарифам</Link>
          <Link to="/">На главную</Link>
        </nav>
      </AccountShell>
    )
  }

  return (
    <AccountShell title="Проверяем оплату" lead="Обычно это занимает 5–30 секунд.">
      <div className="pay">
        <Ring />
        <p className="pay__hint">
          Деньги уже у платёжной системы. Мы ждём от неё подтверждения и сразу откроем доступ.
        </p>
        <FormError>{error}</FormError>
      </div>
    </AccountShell>
  )
}

/** Кольцо-индикатор: крутится, пока ждём, и замирает полным, когда оплачено. */
function Ring({ done = false }: { done?: boolean }) {
  const r = 34
  const c = 2 * Math.PI * r
  return (
    <svg className={`pay__ring ${done ? 'is-done' : ''}`} viewBox="0 0 80 80" aria-hidden="true">
      <defs>
        <linearGradient id="pay-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ff2d8e" />
          <stop offset="100%" stopColor="#ff7a18" />
        </linearGradient>
      </defs>
      <circle cx="40" cy="40" r={r} fill="none" stroke="#f1eff2" strokeWidth="6" />
      <circle
        cx="40"
        cy="40"
        r={r}
        fill="none"
        stroke="url(#pay-grad)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={done ? 0 : c * 0.72}
        transform="rotate(-90 40 40)"
      />
    </svg>
  )
}
