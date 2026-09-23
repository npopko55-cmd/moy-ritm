/**
 * «Проверяем оплату» — сюда GetCourse возвращает человека после оплаты.
 *
 * Номера заказа в адресе нет: GetCourse его не передаёт. Экран опирается
 * только на POST /payments/check. Обычно доступ появляется за секунды — его
 * открывает вебхук; если за пару минут ничего не изменилось, опрос
 * прекращается: сверка догонит оплату сама, максимум через час.
 *
 * «Доступ есть» ещё не значит «оплата пришла»: при продлении он был и до
 * оплаты. Поэтому сравниваем со сроком, запомненным перед уходом на
 * GetCourse (src/lib/payment.ts), и ждём, пока дата вырастет. Запоминает его
 * страница оплаты /pay, откуда бы человек на неё ни пришёл.
 *
 * Почта не подтверждена — опрашивать бессмысленно: оплату, пришедшую до
 * подтверждения (заплатил раньше, чем зарегистрировался), сервер выдаёт
 * только после него. Поэтому сразу просим подтвердить почту и даём
 * отправить письмо ещё раз. Профиль перечитывает SessionProvider при
 * возврате в приложение (src/lib/appReturn.ts) — подтвердили почту, и экран
 * сам переходит к обычной проверке оплаты.
 *
 * Платят виджетом GetCourse, встроенным в /pay. Если после оплаты GetCourse
 * вернёт человека сюда внутри рамки виджета, а не во всё окно, экран сам
 * выходит из рамки на всё окно (inOwnFrame).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { ApiError, type Access } from '../api/types'
import { useSession } from '../auth/SessionProvider'
import { DEFAULT_STREAM } from '../data/streams'
import { formatDate } from '../lib/date'
import { forgetAccessBefore, paymentArrived, readAccessBefore } from '../lib/payment'
import { useResendConfirmation } from '../lib/useResendConfirmation'
import { unlockMedia } from '../media/unlock'
import { AccountShell, FormError, FormOk, errorText } from './Account'
import './PaymentSuccess.css'

/** Сколько всего ждём, прежде чем сказать «доступ откроется сам». */
const TOTAL_WAIT_MS = 120_000
/** Обычная пауза между проверками; сервер может попросить подождать дольше. */
const STEP_MS = 5000
/** Пауза перед уходом в поток: человек должен успеть прочитать «Оплата прошла». */
const LEAVE_MS = 2000

type Stage = 'verify' | 'checking' | 'paid' | 'timeout'

/**
 * Экран открылся внутри нашей же страницы — в рамке виджета оплаты на /pay.
 * Чужую рамку (веб-версия Telegram открывает мини-ап в своём iframe) не
 * трогаем: её адрес прочитать нельзя, и тогда это не наш случай.
 */
function inOwnFrame(): boolean {
  try {
    return window.top !== window.self && window.top?.location.origin === window.location.origin
  } catch {
    return false
  }
}

export default function PaymentSuccess() {
  const navigate = useNavigate()
  const { me, access: sessionAccess, reload } = useSession()
  const [framed] = useState(inOwnFrame)
  // RequireAuth пускает сюда только вошедших, так что профиль есть.
  const verified = me?.user.email_verified !== false
  const resend = useResendConfirmation()
  const [rechecking, setRechecking] = useState(false)
  const [notYet, setNotYet] = useState('')

  // Срок доступа до ухода на оплату — читаем один раз, при открытии экрана.
  const [before] = useState(readAccessBefore)
  const arrived = (a: Access | null | undefined) => paymentArrived(a, before)

  const [stage, setStage] = useState<Stage>(() =>
    arrived(sessionAccess) ? 'paid' : verified ? 'checking' : 'verify',
  )
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
      if (paymentArrived(res.access, before)) {
        setStage('paid')
        // Обновляем профиль: плееру и шапке нужен новый срок доступа.
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
  }, [reload, before])

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
    // В рамке виджета не проверяем: этот же экран сейчас откроется во всё
    // окно и проверит сам.
    if (framed) {
      window.top?.location.replace(window.location.href)
      return
    }
    // Оплата уже видна — проверять нечего: вебхук успел раньше возврата.
    // Почта не подтверждена — тоже: оплату сервер выдаст только после неё.
    if (!arrived(sessionAccess) && verified) void poll()
    return () => {
      alive.current = false
      stop()
    }
    // Запускаем один раз: дальше цикл ведёт себя сам.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Оплата прошла — показали и ушли в поток. Запомненный срок больше не нужен.
  useEffect(() => {
    if (stage !== 'paid' || framed) return
    forgetAccessBefore()
    const id = window.setTimeout(() => navigate(`/start/${DEFAULT_STREAM.id}`), LEAVE_MS)
    return () => window.clearTimeout(id)
  }, [stage, navigate])

  const again = useCallback(() => {
    stop()
    setStage('checking')
    setError('')
    until.current = Date.now() + TOTAL_WAIT_MS
    void poll()
  }, [poll])

  // Почту подтвердили — дальше обычная проверка оплаты. Профиль перечитывает
  // SessionProvider при возврате в приложение или кнопка «Почта
  // подтверждена» ниже.
  useEffect(() => {
    if (!framed && verified && stage === 'verify') again()
  }, [framed, verified, stage, again])

  /** «Почта подтверждена — продолжить»: сами перечитываем профиль. */
  const recheck = async () => {
    setRechecking(true)
    setNotYet('')
    const fresh = await reload()
    if (!alive.current) return
    setRechecking(false)
    if (fresh && !fresh.user.email_verified) {
      setNotYet('Подтверждения пока не видим. Откройте ссылку из последнего письма.')
    }
  }

  if (framed) return null

  if (stage === 'verify') {
    return (
      <AccountShell title="Подтвердите почту" lead="Сразу после этого доступ откроется сам.">
        <div className="pay">
          <p className="pay__hint">
            Письмо со ссылкой мы отправили на {me?.user.email}. Если его нет во «Входящих», загляните
            в «Спам».
          </p>
        </div>

        <div className="form__actions">
          <button
            className="form__submit"
            type="button"
            onClick={() => void resend.send()}
            disabled={resend.disabled}
          >
            {resend.label('Отправить письмо ещё раз')}
          </button>
          <FormOk>{resend.ok}</FormOk>
          <FormError>{resend.error}</FormError>

          <button
            className="form__second"
            type="button"
            onClick={() => void recheck()}
            disabled={rechecking}
          >
            {rechecking ? 'Проверяем…' : 'Почта подтверждена — продолжить'}
          </button>
          <FormError>{notYet}</FormError>
        </div>

        <nav className="account__links">
          <Link to="/help">Написать в поддержку</Link>
          <Link to="/">На главную</Link>
        </nav>
      </AccountShell>
    )
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
          {/* Касание заодно разблокирует ролики и музыку — см. src/media/unlock.ts. */}
          <Link to={`/start/${DEFAULT_STREAM.id}`} onClick={() => unlockMedia()}>
            Влиться в поток
          </Link>
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
