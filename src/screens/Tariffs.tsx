import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Logo from '../components/Logo'
import WaveBg from '../components/WaveBg'
import {
  Close,
  Crown,
  FloatNote,
  Heart,
  InfinityMark,
  Leaf,
  MusicNote,
  Phone,
  PlayCircle,
  Shield,
  Smile,
  Star,
  Bolt,
} from '../components/Icons'
import { api } from '../api/client'
import { ApiError, hasAccess, type AccessStatus, type Tariff } from '../api/types'
import { useSession } from '../auth/SessionProvider'
import { nextParam } from '../auth/guards'
import { asset } from '../lib/asset'
import { formatDate } from '../lib/date'
import { rub } from '../data/tariffs'
import { errorText } from './Account'
import '../components/Logo.css'
import './Tariffs.css'

/** Что входит в подписку — строка под заголовком. */
const PERKS = [
  { icon: <PlayCircle size={19} />, tone: 'pink', text: 'Все потоки\nи движения' },
  { icon: <Star size={19} />, tone: 'violet', text: 'Все новые\nдвижения' },
  { icon: <InfinityMark size={19} />, tone: 'orange', text: 'Все будущие\nпотоки' },
  { icon: <Phone size={19} />, tone: 'blue', text: 'На любом\nустройстве' },
  { icon: <Heart size={19} />, tone: 'pink', text: 'Без\nавтосписаний' },
] as const

/** Нижний ряд: почему это стоит своих денег. */
const FACTS = [
  { icon: <Bolt size={19} />, tone: 'pink', title: 'Больше энергии', text: 'Всего несколько минут в день' },
  { icon: <Smile size={19} />, tone: 'violet', title: 'Движение в удовольствие', text: 'Под любимую музыку' },
  { icon: <Leaf size={19} />, tone: 'green', title: 'Забота о здоровье', text: 'Лёгкий способ быть в хорошей форме' },
  {
    icon: <Shield size={19} />,
    tone: 'blue',
    title: 'Безопасная оплата',
    text: 'Оплата через GetCourse, чек придёт на почту',
  },
] as const

/** Почему человека сюда привели: это ставит защита маршрутов. */
type FromGuard = { accessReason?: AccessStatus } | null

/** Что показать под кнопками. `verify` рисует ещё и кнопку повторного письма. */
type Note = { kind: 'error' | 'verify'; text: string } | null

export default function Tariffs() {
  const navigate = useNavigate()
  const { key, state } = useLocation() as { key: string; state: FromGuard }
  const { me, access } = useSession()

  // null — ещё грузим: в это время в карточках стоит скелетон.
  const [tariffs, setTariffs] = useState<Tariff[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [busyCode, setBusyCode] = useState<string | null>(null)
  const [note, setNote] = useState<Note>(null)
  const [resend, setResend] = useState({ busy: false, ok: '', error: '' })

  // Владелец не хочет всплывающих окон, поэтому это страница, а не модалка.
  // Крестик и Escape ведут туда, откуда пришли; при прямом заходе истории
  // нет (ключ 'default') — тогда на главную.
  const close = () => (key === 'default' ? navigate('/') : navigate(-1))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const list = await api.getTariffs()
        if (alive) setTariffs(list)
      } catch (e) {
        if (alive) {
          setTariffs([])
          setLoadError(errorText(e, 'Не получилось загрузить тарифы'))
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  /**
   * Оплата: ссылка на оффер GetCourse выдаётся персонально, с подставленной
   * почтой и меткой человека, поэтому её нельзя зашить в разметку.
   */
  const choose = async (code: string) => {
    if (!me) {
      navigate(`/login${nextParam('/tariffs')}`)
      return
    }
    if (!me.user.email_verified) {
      setNote({
        kind: 'verify',
        text: 'Сначала подтвердите почту — иначе оплата уедет на несуществующий адрес.',
      })
      return
    }

    setNote(null)
    setBusyCode(code)
    try {
      const { url } = await api.paymentLink(code)
      // Обычный переход на сторону GetCourse, без всплывающих окон.
      window.location.assign(url)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'EMAIL_NOT_VERIFIED') {
        setNote({
          kind: 'verify',
          text: 'Сначала подтвердите почту — иначе оплата уедет на несуществующий адрес.',
        })
      } else if (e instanceof ApiError && e.code === 'OFFER_NOT_CONFIGURED') {
        setNote({ kind: 'error', text: 'Оплата пока недоступна, напишите в поддержку.' })
      } else {
        setNote({ kind: 'error', text: errorText(e) })
      }
      setBusyCode(null)
    }
  }

  const sendAgain = async () => {
    setResend({ busy: true, ok: '', error: '' })
    try {
      const res = await api.resendConfirmation()
      setResend({ busy: false, ok: res.message, error: '' })
    } catch (e) {
      setResend({ busy: false, ok: '', error: errorText(e) })
    }
  }

  const paid = hasAccess(access)
  const ctaLabel = paid ? 'Продлить' : 'Выбрать'
  const support = me?.support.email

  return (
    <div className="tariffs">
      <WaveBg opacity={0.85} />

      <div className="tariffs__card">
        <button className="tariffs__close" onClick={close} aria-label="Закрыть и вернуться">
          <Close size={20} />
        </button>

        {/* Строка состояния доступа. Её нет у того, кто ни разу не платил и
            пришёл сюда сам: показывать нечего. */}
        {paid && access?.paid_until && (
          <p className="tariffs__access">
            Доступ до {formatDate(access.paid_until)}
            {access.tariff && ` · тариф ${access.tariff.name}`}
          </p>
        )}
        {!paid && state?.accessReason === 'expired' && (
          <p className="tariffs__access tariffs__access--warn">
            Доступ закончился. Выберите тариф, чтобы вернуться в поток.
          </p>
        )}
        {!paid && state?.accessReason === 'none' && (
          <p className="tariffs__access">Чтобы влиться в поток, выберите тариф.</p>
        )}

        <header className="tariffs__head">
          <div className="tariffs__intro">
            <Logo />

            <h1 className="tariffs__title">
              Открой больше
              <br />
              <span className="tariffs__title-accent">движений!</span>
            </h1>

            <p className="tariffs__lead">Все потоки, все движения и всё новое — сразу твоё.</p>
          </div>

          <div className="tariffs__visual">
            <div className="tariffs__blob" />
            <MusicNote size={26} className="tariffs__note tariffs__note--a" />
            <FloatNote size={22} className="tariffs__note tariffs__note--b" />
            <MusicNote size={18} className="tariffs__note tariffs__note--c" />
            <FloatNote size={16} className="tariffs__note tariffs__note--d" />
            <img
              className="tariffs__photo"
              src={asset('hero/hero.webp')}
              alt="Девушка двигается под музыку"
              decoding="async"
            />
            <p className="tariffs__hand tariffs__hand--side">
              Больше движения — больше классных дней! ♡
            </p>
          </div>
        </header>

        <ul className="tariffs__perks">
          {PERKS.map((p) => (
            <li key={p.text} className="perk">
              <span className={`perk__icon perk__icon--${p.tone}`}>{p.icon}</span>
              <span className="perk__text">{p.text}</span>
            </li>
          ))}
        </ul>

        <ul className="tariffs__plans">
          {tariffs === null
            ? [0, 1, 2, 3].map((i) => <PlanSkeleton key={i} />)
            : tariffs.map((t) => (
                <li
                  key={t.code}
                  className={`plan plan--${t.code} ${t.is_recommended ? 'is-top' : ''}`}
                >
                  {t.is_recommended && (
                    <span className="plan__crown">
                      <Crown size={13} />
                      Популярный выбор
                    </span>
                  )}
                  {t.discount_label && <span className="plan__badge">{t.discount_label}</span>}

                  <h2 className="plan__name">{t.name}</h2>
                  <p className="plan__price">{rub(t.price)}</p>
                  <p className="plan__per">{rub(t.per_month)} / месяц</p>

                  {t.savings ? (
                    <span className="plan__save">Экономия {rub(t.savings)}</span>
                  ) : (
                    <span className="plan__rule" aria-hidden="true" />
                  )}

                  <p className="plan__note">{t.note}</p>

                  <button
                    className="plan__cta"
                    data-tariff={t.code}
                    onClick={() => void choose(t.code)}
                    disabled={busyCode !== null}
                  >
                    {busyCode === t.code ? 'Открываем оплату…' : ctaLabel}
                  </button>
                </li>
              ))}
        </ul>

        {/* Всё, что нужно сказать про оплату, говорим здесь строкой —
            всплывающих панелей на сайте нет. */}
        {(note || loadError) && (
          <div className={`tariffs__msg ${note?.kind === 'error' || loadError ? 'is-bad' : ''}`}>
            <p>{loadError || note?.text}</p>

            {note?.kind === 'verify' && (
              <>
                <button
                  className="tariffs__msg-btn"
                  type="button"
                  onClick={() => void sendAgain()}
                  disabled={resend.busy}
                >
                  {resend.busy ? 'Отправляем…' : 'Отправить письмо ещё раз'}
                </button>
                {resend.ok && <p className="tariffs__msg-ok">{resend.ok}</p>}
                {resend.error && <p className="tariffs__msg-bad">{resend.error}</p>}
              </>
            )}

            {note?.kind === 'error' && support && (
              <a className="tariffs__msg-btn" href={`mailto:${support}`}>
                Написать в поддержку
              </a>
            )}
          </div>
        )}

        <ul className="tariffs__facts">
          {FACTS.map((f) => (
            <li key={f.title} className="fact">
              <span className={`fact__icon fact__icon--${f.tone}`}>{f.icon}</span>
              <span className="fact__body">
                <span className="fact__title">{f.title}</span>
                <span className="fact__text">{f.text}</span>
              </span>
            </li>
          ))}
        </ul>

        <p className="tariffs__hand tariffs__hand--footer">Движение — это забота о себе ♡</p>
      </div>
    </div>
  )
}

/**
 * Карточка на время загрузки. Разметка та же, что у настоящей, а текст
 * заменён полосками той же высоты — поэтому раскладка не прыгает, когда
 * приходят цены.
 */
function PlanSkeleton() {
  return (
    <li className="plan is-skeleton" aria-hidden="true">
      <h2 className="plan__name">
        <span className="sk sk--sm" />
      </h2>
      <p className="plan__price">
        <span className="sk sk--md" />
      </p>
      <p className="plan__per">
        <span className="sk sk--sm" />
      </p>
      <span className="plan__rule" />
      <p className="plan__note">
        <span className="sk sk--lg" />
        <span className="sk sk--md" />
      </p>
      <button className="plan__cta" type="button" disabled>
        <span className="sk sk--sm" />
      </button>
    </li>
  )
}
