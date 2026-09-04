import { useNavigate } from 'react-router-dom'
import Logo from '../components/Logo'
import WaveBg from '../components/WaveBg'
import { ArrowRight, Bolt, Heart, MusicNote } from '../components/Icons'
import { asset } from '../lib/asset'
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
  const start = () => navigate(`/start/${STREAMS[0].id}`)

  return (
    <div className="landing">
      <WaveBg opacity={0.85} />

      <header className="landing__header">
        <Logo />

        <nav className="landing__nav">
          <a href="#about">О нас</a>
          <a href="#streams">Потоки</a>
          <a href="#pricing">Тарифы</a>
        </nav>

        <div className="landing__actions">
          <button className="btn btn--ghost">Войти</button>
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
          <img
            className="hero__photo"
            src={asset("hero/hero.png")}
            alt="Девушка двигается под музыку"
            onError={(e) => {
              e.currentTarget.style.visibility = 'hidden'
            }}
          />
        </div>
      </main>
    </div>
  )
}
