import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Logo from '../components/Logo'
import TariffPlans from '../components/TariffPlans'
import WaveBg from '../components/WaveBg'
import {
  Close,
  FloatNote,
  Heart,
  Leaf,
  MusicNote,
  Phone,
  PlayCircle,
  Shield,
  Smile,
  Bolt,
} from '../components/Icons'
import { hasAccess } from '../api/types'
import { useSession } from '../auth/SessionProvider'
import { asset } from '../lib/asset'
import { formatDate } from '../lib/date'
import { EXTRA_MOVES_LABEL } from '../data/streams'
import '../components/Logo.css'
import './Tariffs.css'

/**
 * Что входит в подписку — строка под заголовком.
 *
 * Первый пункт — сколько движений добавит оплата, числом: так попросил
 * владелец вместо «Все движения без ограничений». «Все новые движения» и
 * «Всё, что появится дальше» он же попросил убрать. Серверный список
 * features страница не выводит — текст пунктов живёт здесь.
 */
const PERKS = [
  { icon: <PlayCircle size={19} />, tone: 'pink', text: `${EXTRA_MOVES_LABEL}\nи больше разнообразия` },
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
  const { access } = useSession()

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

  const paid = hasAccess(access)

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

        <header className="tariffs__head">
          <div className="tariffs__intro">
            <Logo />

            <h1 className="tariffs__title">
              Откройте больше
              <br />
              <span className="tariffs__title-accent">движений!</span>
            </h1>

            <p className="tariffs__lead">Все движения и всё новое — сразу ваши.</p>
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

        {/* Карточки, оплата и строка сообщения — общий компонент: те же
            карточки стоят на /offer и /trial-ended. */}
        <TariffPlans />

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
