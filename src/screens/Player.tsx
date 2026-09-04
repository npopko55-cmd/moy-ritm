import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Logo from '../components/Logo'
import WaveBg from '../components/WaveBg'
import {
  Clock,
  FloatNote,
  Fullscreen,
  Gear,
  Info,
  MusicNote,
  Next,
  Pause,
  Play,
  Prev,
  PulseWave,
  Question,
  Sparkle,
  User,
} from '../components/Icons'
import { CURRENT_TRACK, MOTIVATION, STREAMS, getStream } from '../data/streams'
import { SECONDS_PER_MOVE, loopSrc } from '../data/loops'
import '../components/Logo.css'
import './Player.css'

/** Секунды → «12:47». */
const mmss = (total: number) =>
  `${Math.floor(total / 60)}:${String(Math.floor(total % 60)).padStart(2, '0')}`

const WEEK = [
  { day: 'пн', value: 22 },
  { day: 'вт', value: 31 },
  { day: 'ср', value: 36, today: true },
  { day: 'чт', value: 18 },
  { day: 'пт', value: 26 },
  { day: 'сб', value: 12 },
  { day: 'вс', value: 20 },
]

const MENU = [
  { icon: <Clock size={19} />, label: 'Мой прогресс' },
  { icon: <User size={19} />, label: 'Профиль' },
  { icon: <Gear size={19} />, label: 'Настройки' },
  { icon: <Question size={19} />, label: 'Нужна помощь?' },
]

export default function Player() {
  const { streamId } = useParams()
  const navigate = useNavigate()
  const stream = getStream(streamId)

  const [moveIndex, setMoveIndex] = useState(0)
  const [inMove, setInMove] = useState(17) // на макете до смены остаётся 0:13
  const [playing, setPlaying] = useState(true)
  const [todaySeconds, setTodaySeconds] = useState(12 * 60 + 47)
  const [motivation, setMotivation] = useState(MOTIVATION[0])

  const videoRef = useRef<HTMLVideoElement>(null)
  const loop = stream.loops[moveIndex % stream.loops.length]
  const untilSwitch = Math.max(0, SECONDS_PER_MOVE - inMove)
  const moveProgress = Math.min(1, inMove / SECONDS_PER_MOVE)

  const goToMove = useCallback(
    (delta: number) => {
      const count = stream.loops.length
      setMoveIndex((i) => (i + delta + count) % count)
      setInMove(0)
      setMotivation(MOTIVATION[Math.floor(Math.random() * MOTIVATION.length)])
    },
    [stream.loops.length],
  )

  // Секундный тик: ведёт время тренировки и смену движения.
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      setTodaySeconds((s) => s + 1)
      setInMove((s) => {
        if (s + 1 >= SECONDS_PER_MOVE) {
          goToMove(1)
          return 0
        }
        return s + 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [playing, goToMove])

  // Пауза останавливает и ролик, чтобы персонаж замирал вместе с таймером.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (playing) void v.play().catch(() => undefined)
    else v.pause()
  }, [playing, loop.id])

  const src = useMemo(() => loopSrc(loop.id), [loop.id])

  return (
    <div className="player">
      <WaveBg opacity={0.28} />

      {/* ——— Левая колонка ——— */}
      <aside className="player__side">
        <Logo size="sm" />

        <p className="side__label">Потоки</p>

        <ul className="side__streams">
          {STREAMS.map((s) => (
            <li key={s.id}>
              <button
                className={`stream-card stream-card--${s.theme} ${s.id === stream.id ? 'is-active' : ''}`}
                onClick={() => navigate(`/player/${s.id}`)}
              >
                <span className="stream-card__text">
                  <span className="stream-card__title">{s.title}</span>
                  <span className="stream-card__sub">{s.subtitle}</span>
                </span>
                <img
                  className="stream-card__photo"
                  src={s.cover}
                  alt=""
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
              </button>
            </li>
          ))}
        </ul>

        <ul className="side__menu">
          {MENU.map((m) => (
            <li key={m.label}>
              <button className="side__menu-item">
                {m.icon}
                <span>{m.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* ——— Центр ——— */}
      <main className="player__stage">
        <header className="stage__top">
          <h1 className="stage__headline">{motivation}</h1>

          <div className="stage__top-right">
            <div className="track">
              <span className="track__icon">
                <MusicNote size={19} />
              </span>
              <span className="track__text">
                <strong>{CURRENT_TRACK.title}</strong>
                <span>{CURRENT_TRACK.artist}</span>
              </span>
            </div>
            <button className="icon-btn" title="На весь экран">
              <Fullscreen size={19} />
            </button>
          </div>
        </header>

        <div className="stage__figure">
          <svg className="stage__ring" viewBox="0 0 400 400" aria-hidden="true">
            <defs>
              <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#ff2d8e" />
                <stop offset="55%" stopColor="#ff5ca8" />
                <stop offset="100%" stopColor="#ff9838" />
              </linearGradient>
            </defs>
            <circle cx="200" cy="200" r="186" fill="none" stroke="#f4f0ee" strokeWidth="7" />
            <circle
              cx="200"
              cy="200"
              r="186"
              fill="none"
              stroke="url(#ring-grad)"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 186}
              strokeDashoffset={2 * Math.PI * 186 * (1 - moveProgress)}
              transform="rotate(-90 200 200)"
            />
          </svg>

          <video
            ref={videoRef}
            key={loop.id}
            className="stage__video"
            src={src}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
          />

          <FloatNote size={30} className="stage__note stage__note--a" />
          <MusicNote size={24} className="stage__note stage__note--b" />
          <Sparkle size={15} className="stage__note stage__note--c" />

        </div>

        <div className="controls">
          <div className="controls__item">
            <button className="ctrl ctrl--side" onClick={() => goToMove(-1)} aria-label="Назад">
              <Prev size={24} />
            </button>
            <span>Назад</span>
          </div>

          <div className="controls__item">
            <button
              className="ctrl ctrl--main"
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? 'Пауза' : 'Продолжить'}
            >
              {playing ? <Pause size={30} /> : <Play size={30} />}
            </button>
            <span>{playing ? 'Пауза' : 'Продолжить'}</span>
          </div>

          <div className="controls__item">
            <button className="ctrl ctrl--side" onClick={() => goToMove(1)} aria-label="Вперед">
              <Next size={24} />
            </button>
            <span>Вперед</span>
          </div>
        </div>
      </main>

      {/* ——— Правая колонка ——— */}
      <aside className="player__stats">
        <section className="stat stat--accent">
          <header className="stat__head">
            <span>Время в движении сегодня</span>
            <Info size={15} />
          </header>
          <strong className="stat__big">{mmss(todaySeconds)}</strong>
          <footer className="stat__foot">
            <PulseWave size={22} />
            <span>
              Время в движении вчера:
              <br />
              15 минут
            </span>
          </footer>
        </section>

        <section className="stat">
          <header className="stat__head">
            <span>До смены движения</span>
          </header>
          <div className="stat__row">
            <strong className="stat__mid">{mmss(untilSwitch)}</strong>
            <Donut value={1 - moveProgress} />
          </div>
        </section>

        <section className="stat">
          <header className="stat__head">
            <span>Сегодня</span>
          </header>
          <div className="stat__row stat__row--gap">
            <Donut value={0.6} small />
            <span className="stat__today">
              <strong>36 мин</strong>
              <span>в движении</span>
            </span>
          </div>
          <div className="week">
            {WEEK.map((d) => (
              <div key={d.day} className="week__col">
                <div
                  className={`week__bar ${d.today ? 'is-today' : ''}`}
                  style={{ height: `${Math.round((d.value / 40) * 100)}%` }}
                />
                <span className={d.today ? 'is-today' : ''}>{d.day}</span>
              </div>
            ))}
          </div>
        </section>
      </aside>
    </div>
  )
}

/** Маленькое кольцо прогресса в карточках справа. */
function Donut({ value, small = false }: { value: number; small?: boolean }) {
  const r = 21
  const c = 2 * Math.PI * r
  return (
    <svg className={`donut ${small ? 'donut--sm' : ''}`} viewBox="0 0 52 52" aria-hidden="true">
      <defs>
        <linearGradient id="donut-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ff2d8e" />
          <stop offset="100%" stopColor="#ff7a18" />
        </linearGradient>
      </defs>
      <circle cx="26" cy="26" r={r} fill="none" stroke="#eeeff2" strokeWidth="5" />
      <circle
        cx="26"
        cy="26"
        r={r}
        fill="none"
        stroke="url(#donut-grad)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))}
        transform="rotate(-90 26 26)"
      />
    </svg>
  )
}
