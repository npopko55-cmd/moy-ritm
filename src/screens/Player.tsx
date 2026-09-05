import { useCallback, useEffect, useRef, useState } from 'react'
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
import { MOTIVATION, STREAMS, getStream } from '../data/streams'
import { loopPoster, loopSrc } from '../data/loops'
import { loadMoveInterval } from '../lib/settings'
import { prefetchFiles, prefetchImages } from '../lib/prefetch'
import { useMusic } from '../music/MusicProvider'
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
  { icon: <Clock size={19} />, label: 'Мой прогресс', action: null },
  { icon: <User size={19} />, label: 'Профиль', action: null },
  { icon: <Gear size={19} />, label: 'Настройки', action: 'settings' },
  { icon: <Question size={19} />, label: 'Нужна помощь?', action: null },
] as const

export default function Player() {
  const { streamId } = useParams()
  const navigate = useNavigate()
  const stream = getStream(streamId)

  // Счётчик смен движения. Не заворачивается по кругу нарочно: по его
  // чётности выбирается, какой из двух <video> сейчас на виду.
  const [step, setStep] = useState(0)
  const [inMove, setInMove] = useState(17) // на макете до смены остаётся 0:13
  const [playing, setPlaying] = useState(true)
  const [todaySeconds, setTodaySeconds] = useState(12 * 60 + 47)
  const [motivation, setMotivation] = useState(MOTIVATION[0])
  // Интервал меняется на странице настроек; плеер читает его при открытии.
  const [moveInterval] = useState(loadMoveInterval)

  const { track, blocked: soundBlocked, setPlaying: setMusicPlaying, next: nextTrack } = useMusic()

  // Два постоянных <video>: пока один играет, во второй уже качается
  // следующий ролик. Раньше элемент пересоздавался, и на медленной сети
  // круг пустел на несколько секунд при каждой смене движения.
  const videoA = useRef<HTMLVideoElement>(null)
  const videoB = useRef<HTMLVideoElement>(null)
  const buffers = [videoA, videoB]

  const at = (n: number) => {
    const count = stream.loops.length
    return stream.loops[((n % count) + count) % count]
  }
  const loop = at(step)
  const nextLoop = at(step + 1)
  const afterNext = at(step + 2)
  const active = ((step % 2) + 2) % 2

  const untilSwitch = Math.max(0, moveInterval - inMove)
  const moveProgress = Math.min(1, inMove / moveInterval)

  const goToMove = useCallback((delta: number) => {
    setStep((s) => s + delta)
    setInMove(0)
    setMotivation(MOTIVATION[Math.floor(Math.random() * MOTIVATION.length)])
  }, [])

  // Секундный тик: ведёт время тренировки и смену движения.
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      setTodaySeconds((s) => s + 1)
      setInMove((s) => {
        if (s + 1 >= moveInterval) {
          goToMove(1)
          return 0
        }
        return s + 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [playing, goToMove, moveInterval])

  // Новое движение начинается с начала цикла — как раньше, когда элемент
  // пересоздавался заново.
  useEffect(() => {
    const on = buffers[active].current
    if (on) on.currentTime = 0
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, loop.id])

  // Пауза останавливает ролик, чтобы персонаж замирал вместе с таймером.
  // Скрытый элемент всегда на паузе: он в это время докачивает следующее.
  useEffect(() => {
    const on = buffers[active].current
    const off = buffers[1 - active].current
    off?.pause()
    if (!on) return
    if (playing) void on.play().catch(() => undefined)
    else on.pause()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, active, loop.id])

  // Пауза тренировки останавливает и музыку.
  useEffect(() => {
    setMusicPlaying(playing)
  }, [playing, setMusicPlaying])

  // Следующий ролик уже лежит во втором <video>, поэтому вперёд заглядываем
  // через один: к его очереди файл успеет докачаться.
  useEffect(() => {
    prefetchImages([loopPoster(afterNext.id)])
    prefetchFiles([loopSrc(afterNext.id)])
  }, [afterNext.id])

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
                <img className="stream-card__photo" src={s.cover} alt="" decoding="async" />
                <span className="stream-card__tint" />
                <span className="stream-card__fade" />
                <span className="stream-card__text">
                  <span className="stream-card__title">{s.title}</span>
                  <span className="stream-card__sub">{s.subtitle}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        <ul className="side__menu">
          {MENU.map((m) => (
            <li key={m.label}>
              <button
                className="side__menu-item"
                onClick={
                  m.action === 'settings'
                    ? () => navigate('/settings', { state: { from: stream.id } })
                    : undefined
                }
              >
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

          <div className="stage__disc">
            {[active === 0 ? loop : nextLoop, active === 0 ? nextLoop : loop].map((l, i) => (
              <video
                key={i}
                ref={buffers[i]}
                className={`stage__video ${i === active ? 'is-on' : ''}`}
                src={loopSrc(l.id)}
                poster={loopPoster(l.id)}
                loop
                muted
                playsInline
                preload="auto"
              />
            ))}
          </div>

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
        <div className="stats__top">
          <button
            className={`track ${soundBlocked ? 'track--muted' : ''}`}
            onClick={nextTrack}
            title="Следующий трек"
          >
            <span className="track__icon">
              <MusicNote size={19} />
            </span>
            <span className="track__text">
              <strong>{track.title}</strong>
              <span>{soundBlocked ? 'нажмите, чтобы включить звук' : track.artist}</span>
            </span>
          </button>
          <button className="icon-btn" title="На весь экран">
            <Fullscreen size={19} />
          </button>
        </div>

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

        <section className="stat stat--chart">
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
