import { useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSession } from '../auth/SessionProvider'
import { flowLabel, useFlowStart } from '../auth/guards'
import { useFlow } from '../flow/FlowSession'
import Logo from '../components/Logo'
import WaveBg from '../components/WaveBg'
import { ArrowRight, Bolt, Heart, MusicNote } from '../components/Icons'
import { asset } from '../lib/asset'
import { loopPoster, loopSrc } from '../data/loops'
import { MASCOT_AS_IMAGE, useMascot } from '../lib/mascot'
import { prefetchFiles, prefetchImages, whenIdle } from '../lib/prefetch'
import { login, preloadWorkout } from '../lib/screens'
import { warmTrial } from '../lib/trial'
import { useResendConfirmation } from '../lib/useResendConfirmation'
import { DEFAULT_STREAM, WARM_MOVES } from '../data/streams'
import '../components/Logo.css'
import './Landing.css'

const FEATURES = [
  {
    icon: <MusicNote size={22} />,
    tone: 'pink',
    title: 'Музыка ведёт',
    text: 'Энергия и настроение\nв каждом движении',
  },
  {
    icon: <Bolt size={22} />,
    tone: 'orange',
    title: 'Просто начать',
    text: 'Один клик — и вы\nуже в движении',
  },
  {
    icon: <Heart size={22} />,
    tone: 'pink',
    title: 'Для вас',
    text: 'Движения и музыка\nна любой вкус',
  },
] as const

export default function Landing() {
  const navigate = useNavigate()
  const { me, signOut } = useSession()

  // Не вошёл — на вход; вошёл — сразу в поток. На тарифы отсюда не уводим:
  // пейволл живёт внутри тренировки. Тренировка уже идёт — та же кнопка
  // зовёт вернуться и ведёт в плеер, минуя отсчёт.
  // Сам переход — через useFlowStart: он же разблокирует медиа в касании.
  const { session: flow } = useFlow()
  const goFlow = useFlowStart()
  const start = () => goFlow()

  /*
   * Почта не подтверждена — тонкая строка под шапкой. Не всплывашка:
   * окон на сайте нет, а мешать человеку заходить в поток нечему —
   * подтверждение нужно только к оплате. Строка исчезает сама, как
   * только почта подтверждена.
   */
  const resend = useResendConfirmation()

  // Маскот: анимация подгружается сама, сразу после первой отрисовки.
  const mascotImage = useRef<HTMLImageElement>(null)
  const mascotVideo = useRef<HTMLVideoElement>(null)
  const live = useMascot(mascotImage, mascotVideo)

  // Пока человек читает лендинг, канал свободен: тянем то, что понадобится
  // в плеере. До Pages 0,4–0,85 с на запрос, так что фора решает больше,
  // чем экономия байтов.
  useEffect(() => {
    let stopIdle: (() => void) | undefined
    const warmUp = () => {
      stopIdle = whenIdle(() => {
        // Код отсчёта, плеера и входа — отдельные куски: качаем их заранее,
        // чтобы кнопка «Влиться в поток» не ждала скрипта на слабой сети.
        preloadWorkout()
        login.preload()
        prefetchImages(DEFAULT_STREAM.loops.slice(0, WARM_MOVES).map((l) => loopPoster(l.id)))
        prefetchFiles(DEFAULT_STREAM.loops.slice(0, 2).map((l) => loopSrc(l.id)))
      })
    }
    if (document.readyState === 'complete') warmUp()
    else window.addEventListener('load', warmUp, { once: true })
    return () => {
      window.removeEventListener('load', warmUp)
      stopIdle?.()
    }
  }, [])

  // Вошедшему — заранее спросить о пробном периоде воронки: охранник
  // тренировки решает по нему, и «Влиться в поток» тогда не ждёт ответа.
  const userId = me?.user.id
  useEffect(() => {
    if (!userId) return
    return whenIdle(() => warmTrial(userId))
  }, [userId])

  return (
    <div className="landing">
      <WaveBg opacity={0.85} />

      <header className="landing__header">
        <Logo />

        <nav className="landing__nav">
          <a href="#about">О нас</a>
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
            {flowLabel(flow)}
          </button>
        </div>
      </header>

      {me && !me.user.email_verified && (
        <p className="verify-note">
          <span>
            Мы отправили письмо для подтверждения почты. Без подтверждения нельзя будет оплатить.
          </span>
          <button
            className="verify-note__btn"
            type="button"
            onClick={() => void resend.send()}
            disabled={resend.disabled}
          >
            {resend.label('Отправить ещё раз')}
          </button>
          {(resend.ok || resend.error) && (
            <span className={`verify-note__msg ${resend.error ? 'is-bad' : ''}`}>
              {resend.error || resend.ok}
            </span>
          )}
        </p>
      )}

      <main className="landing__hero">
        <div className="hero__copy">
          <p className="hero__kicker">Двигайтесь. Чувствуйте. Живите.</p>

          <h1 className="hero__title">
            Ваш поток
            <br />
            движений под музыку
          </h1>

          <p className="hero__lead">
            Просто включайте и двигайтесь в ритме.
            <br />В любое время. В любом месте.
          </p>

          <button className="btn btn--pink-lg hero__cta" onClick={start}>
            {flowLabel(flow)}
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
            {/*
              Адрес анимации ставит хук — до него в разметке ничего не качается.
              WebKit и мини-ап получают анимированный WebP, остальные — видео.
            */}
            {MASCOT_AS_IMAGE ? (
              <img
                className="hero__mascot-anim"
                ref={mascotImage}
                alt=""
                decoding="async"
                aria-hidden="true"
              />
            ) : (
              <video
                className="hero__mascot-anim"
                ref={mascotVideo}
                muted
                loop
                playsInline
                preload="none"
                poster={asset('mascot/warmup-poster.webp')}
                aria-hidden="true"
              />
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
