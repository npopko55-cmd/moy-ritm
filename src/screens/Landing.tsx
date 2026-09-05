import { useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSession } from '../auth/SessionProvider'
import { flowTarget } from '../auth/guards'
import Logo from '../components/Logo'
import WaveBg from '../components/WaveBg'
import { ArrowRight, Bolt, Heart, MusicNote } from '../components/Icons'
import { asset } from '../lib/asset'
import { loopPoster, loopSrc } from '../data/loops'
import { useMascotVideo } from '../lib/mascot'
import { prefetchFiles, prefetchImages, whenIdle } from '../lib/prefetch'
import { STREAMS } from '../data/streams'
import '../components/Logo.css'
import './Landing.css'

const FEATURES = [
  {
    icon: <MusicNote size={22} />,
    tone: 'pink',
    title: 'Музыка ведёт',
    text: 'Энергия и настроение\nв каждом потоке',
  },
  {
    icon: <Bolt size={22} />,
    tone: 'orange',
    title: 'Просто начать',
    text: 'Один клик — и ты\nуже в движении',
  },
  {
    icon: <Heart size={22} />,
    tone: 'pink',
    title: 'Для тебя',
    text: 'Потоки на любой вкус\nи уровень',
  },
] as const

export default function Landing() {
  const navigate = useNavigate()
  const { me, access, signOut } = useSession()

  // Не вошёл — на вход; вошёл без доступа — в тарифы; с доступом — в поток.
  const start = () => navigate(flowTarget(Boolean(me), access))

  // Маскот: ролик подгружается сам, уже после того как страница открылась.
  const mascot = useRef<HTMLVideoElement>(null)
  const live = useMascotVideo(mascot)

  // Пока человек читает лендинг, канал свободен: тянем то, что понадобится
  // в плеере. До Pages 0,4–0,85 с на запрос, так что фора решает больше,
  // чем экономия байтов.
  useEffect(() => {
    let stopIdle: (() => void) | undefined
    const warmUp = () => {
      stopIdle = whenIdle(() => {
        const first = STREAMS[0]
        prefetchImages([
          ...STREAMS.map((s) => s.cover),
          ...first.loops.map((l) => loopPoster(l.id)),
        ])
        prefetchFiles(first.loops.slice(0, 2).map((l) => loopSrc(l.id)))
      })
    }
    if (document.readyState === 'complete') warmUp()
    else window.addEventListener('load', warmUp, { once: true })
    return () => {
      window.removeEventListener('load', warmUp)
      stopIdle?.()
    }
  }, [])

  return (
    <div className="landing">
      <WaveBg opacity={0.85} />

      <header className="landing__header">
        <Logo />

        <nav className="landing__nav">
          <a href="#about">О нас</a>
          <a href="#streams">Потоки</a>
          {/* Тарифы — отдельная страница. href настоящий (Pages живёт
              в подпапке), клик перехватываем, чтобы не перезагружать сайт. */}
          <a href={asset('tariffs')} onClick={(e) => { e.preventDefault(); navigate('/tariffs') }}>
            Тарифы
          </a>
        </nav>

        <div className="landing__actions">
          {me ? (
            <>
              <Link className="landing__who" to="/profile" title={me.user.email}>
                {me.user.name || me.user.email}
              </Link>
              <button className="btn btn--ghost" onClick={() => void signOut()}>
                Выйти
              </button>
            </>
          ) : (
            <Link className="btn btn--ghost" to="/login">
              Войти
            </Link>
          )}
          <button className="btn btn--pink" onClick={start}>
            Влиться в поток
          </button>
        </div>
      </header>

      <main className="landing__hero">
        <div className="hero__copy">
          <p className="hero__kicker">Двигайся. Чувствуй. Живи.</p>

          <h1 className="hero__title">
            Твой поток
            <br />
            движений под музыку
          </h1>

          <p className="hero__lead">
            Просто включай и двигайся в ритме.
            <br />В любое время. В любом месте.
          </p>

          <button className="btn btn--pink-lg hero__cta" onClick={start}>
            Влиться в поток
            <span className="hero__cta-arrow">
              <ArrowRight size={19} />
            </span>
          </button>

          <ul className="hero__features">
            {FEATURES.map((f) => (
              <li key={f.title} className="feature">
                <span className={`feature__icon feature__icon--${f.tone}`}>{f.icon}</span>
                <div className="feature__body">
                  <span className="feature__title">{f.title}</span>
                  <span className="feature__text">{f.text}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="hero__visual">
          <div className="hero__blob" />
          <span className="hero__dot hero__dot--a" />
          <span className="hero__dot hero__dot--b" />
          <span className="hero__dot hero__dot--c" />
          <span className="hero__dot hero__dot--d" />
          <div className={`hero__mascot ${live ? 'is-live' : ''}`}>
            <img
              className="hero__mascot-poster"
              src={asset('mascot/warmup-poster.webp')}
              alt=""
              decoding="async"
            />
            {/* Источники вешает хук — до них в разметке ничего не качается. */}
            <video
              className="hero__mascot-video"
              ref={mascot}
              muted
              loop
              playsInline
              preload="none"
              poster={asset('mascot/warmup-poster.webp')}
              aria-hidden="true"
            />
          </div>
        </div>
      </main>
    </div>
  )
}
