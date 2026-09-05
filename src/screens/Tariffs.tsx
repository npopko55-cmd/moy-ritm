import { useEffect } from 'react'
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
import { asset } from '../lib/asset'
import { STREAMS } from '../data/streams'
import { TARIFFS, rub } from '../data/tariffs'
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

export default function Tariffs() {
  const navigate = useNavigate()
  const { key } = useLocation()

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

  // TODO: после подключения бэкенда — POST /api/v1/payments/link и переход
  // на оффер GetCourse. Пока ни оплаты, ни входа нет — ведём в поток.
  const choose = () => navigate(`/start/${STREAMS[0].id}`)

  return (
    <div className="tariffs">
      <WaveBg opacity={0.85} />

      <div className="tariffs__card">
        <button className="tariffs__close" onClick={close} aria-label="Закрыть и вернуться">
          <Close size={20} />
        </button>

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
          {TARIFFS.map((t) => (
            <li key={t.code} className={`plan plan--${t.code} ${t.is_recommended ? 'is-top' : ''}`}>
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

              <button className="plan__cta" data-tariff={t.code} onClick={choose}>
                Выбрать
              </button>
            </li>
          ))}
        </ul>

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
