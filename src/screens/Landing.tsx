import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '../auth/SessionProvider'
import { readFunnelGuest, readFunnelToken } from '../lib/funnel'
import { guestFirstToken, guestStartPath } from '../lib/guest'
import { flowLabel, useFlowStart } from '../auth/guards'
import { useFlow } from '../flow/FlowSession'
import LegalLinks from '../components/LegalLinks'
import Logo from '../components/Logo'
import WaveBg from '../components/WaveBg'
import { ArrowRight } from '../components/Icons'
import { asset } from '../lib/asset'
import { LANDING_LOOP, loopPoster, loopSrc } from '../data/loops'
import { useLandingLoop } from '../lib/landingLoop'
import { prefetchFiles, prefetchImages, whenIdle } from '../lib/prefetch'
import { login, preloadWorkout } from '../lib/screens'
import { warmTrial } from '../lib/trial'
import { useResendConfirmation } from '../lib/useResendConfirmation'
import { DEFAULT_STREAM, WARM_MOVES } from '../data/streams'
import '../components/Logo.css'
import './Landing.css'

/*
 * Четыре шага под героем — как заниматься (тексты Димы, 28.09.2026).
 *
 * \n — единственное место переноса. На планшете и десктопе шаги стоят в ряд,
 * и каждая строка ломается ровно здесь (white-space: pre-line): у всех
 * четырёх по две строки заголовка и две строки под ним. На телефоне текст
 * идёт в строку, а если не влезет, ломается здесь же: остальные пробелы
 * неразрывные (NB), и предлог не повиснет в конце строки.
 */
const NB = '\u00a0'

const STEPS = [
  { tone: 'pink', title: `Заходите\nна${NB}сайт`, text: `Из${NB}дома\nили${NB}офиса` },
  {
    tone: 'orange',
    title: `Подвигайтесь\nпод${NB}музыку`,
    text: `Без${NB}переодеваний\nи${NB}подготовки`,
  },
  {
    tone: 'pink',
    title: `Возвращайтесь\nк${NB}своим${NB}делам`,
    text: `С${NB}новыми${NB}силами\nи${NB}энергией`,
  },
  {
    tone: 'orange',
    title: 'Возвращайтесь\nснова',
    text: `Когда${NB}появится\nсвободная${NB}минутка`,
  },
] as const

/**
 * guestToken — главная гостя по ссылке /play/<токен> (src/screens/PlayGuest.tsx):
 * та же страница, но «Включить эфир» запускает отсчёт и тренировку гостя.
 */
export default function Landing({ guestToken }: { guestToken?: string } = {}) {
  const navigate = useNavigate()
  const { me, signOut } = useSession()

  // Не вошёл — на вход; вошёл — сразу в поток. На тарифы отсюда не уводим:
  // пейволл живёт внутри тренировки. Тренировка уже идёт — та же кнопка
  // зовёт вернуться и ведёт в плеер, минуя отсчёт.
  // Сам переход — через useFlowStart: он же разблокирует медиа в касании.
  const { session: flow } = useFlow()
  const goFlow = useFlowStart()
  // Гостевой контекст: ссылка /play/<токен> (guestToken) или запомненный с
  // неё токен — человек ушёл с гостевой главной на / (логотип, «Тарифы» и
  // назад). Метка когорты тогда та же, и кнопка не уводит на вход.
  const [savedGuest] = useState(() => (readFunnelGuest() ? readFunnelToken() : null))
  const ownGuest = guestToken ?? savedGuest
  // «Сначала гость» (GUEST_FIRST_ENABLED на бэкенде): невошедшего кнопки
  // старта ведут в гостевой режим trial3d с меткой site, а не на вход.
  // Настройку спрашиваем один раз за открытие и только у невошедшего без
  // своей гостевой ссылки.
  const [guestEntry, setGuestEntry] = useState<string | null>(null)
  useEffect(() => {
    if (me || ownGuest) return
    let alive = true
    void guestFirstToken().then((token) => {
      if (alive) setGuestEntry(token)
    })
    return () => {
      alive = false
    }
  }, [me, ownGuest])
  // Гостю (правка Димы 06.10.2026) кнопка — сразу в отсчёт, а после него
  // тренировка идёт сама: без «Играть» и без регистрации. Не на /play/<токен>:
  // там эта же главная. Переход тоже через goFlow — касание разблокирует медиа,
  // и после отсчёта ролик на iPhone пойдёт без нового касания.
  const guest = me ? null : (ownGuest ?? guestEntry)
  const start = () => goFlow(guest ? guestStartPath(guest) : undefined)

  /*
   * Почта не подтверждена — тонкая строка под шапкой. Не всплывашка:
   * окон на сайте нет, а мешать человеку заходить в поток нечему —
   * подтверждение нужно только к оплате. Строка исчезает сама, как
   * только почта подтверждена.
   */
  const resend = useResendConfirmation()

  /*
   * «О нас» — четыре шага под героем: «Заходите на сайт», «Подвигайтесь под
   * музыку», «Возвращайтесь к своим делам», «Возвращайтесь снова» (STEPS).
   * Отдельной страницы «О нас» нет, а ссылка раньше вела на якорь, которого
   * на странице не было, — и никуда не вела.
   *
   * Касание прокручивает к разделу и коротко подсвечивает его: на широком
   * экране лендинг умещается целиком, и без подсветки казалось бы, что
   * ничего не произошло. С других страниц сюда ведёт адрес /#about — он
   * делает то же самое при открытии.
   */
  const about = useRef<HTMLOListElement>(null)
  const showAbout = useCallback(() => {
    const el = about.current
    if (!el) return
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    el.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'center' })
    if (calm || typeof el.animate !== 'function') return
    el.animate(
      [
        { backgroundColor: 'rgba(255, 227, 240, 0)', boxShadow: '0 0 0 0 rgba(255, 227, 240, 0)' },
        { backgroundColor: 'rgba(255, 227, 240, 0.95)', boxShadow: '0 0 0 14px rgba(255, 227, 240, 0.95)' },
        { backgroundColor: 'rgba(255, 227, 240, 0)', boxShadow: '0 0 0 0 rgba(255, 227, 240, 0)' },
      ],
      { duration: 1600, easing: 'ease-in-out' },
    )
  }, [])
  const { hash } = useLocation()
  useEffect(() => {
    if (hash !== '#about') return
    // Кадр на раскладку: шрифты могли ещё сдвигать высоту героя.
    const timer = window.setTimeout(showAbout, 120)
    return () => window.clearTimeout(timer)
  }, [hash, showAbout])

  // Круг с роликом: сам ролик подгружается после первой отрисовки, до него — постер.
  const loopVideo = useRef<HTMLVideoElement>(null)
  useLandingLoop(loopVideo)

  // Пока человек читает лендинг, канал свободен: тянем то, что понадобится
  // в плеере. До Pages 0,4–0,85 с на запрос, так что фора решает больше,
  // чем экономия байтов.
  useEffect(() => {
    let stopIdle: (() => void) | undefined
    const warmUp = () => {
      stopIdle = whenIdle(() => {
        // Код отсчёта, плеера и входа — отдельные куски: качаем их заранее,
        // чтобы кнопки старта («Включить эфир», «Влиться в поток» в шапке)
        // не ждали скрипта на слабой сети.
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
  // тренировки решает по нему, и кнопки старта тогда не ждут ответа.
  const userId = me?.user.id
  useEffect(() => {
    if (!userId) return
    return whenIdle(() => warmTrial(userId))
  }, [userId])

  return (
    <div className="landing">
      <WaveBg opacity={0.85} />

      <header className={`landing__header ${me ? 'landing__header--member' : ''}`}>
        <Logo />

        {/* Вошедшему здесь же «Мой прогресс»: с главной в статистику иначе
            было не попасть. На телефоне и планшете навигация шапки спрятана,
            но у вошедшего она встаёт второй строкой под логотипом — без
            «Тарифов», как и раньше (Landing.css). */}
        <nav className={`landing__nav ${me ? 'landing__nav--member' : ''}`}>
          <a
            href={asset('#about')}
            onClick={(e) => {
              e.preventDefault()
              showAbout()
            }}
          >
            О нас
          </a>
          {/* Тарифы — отдельная страница. href настоящий (Pages живёт
              в подпапке), клик перехватываем, чтобы не перезагружать сайт. */}
          <a
            className="landing__nav-tariffs"
            href={asset('tariffs')}
            onClick={(e) => {
              e.preventDefault()
              navigate('/tariffs')
            }}
          >
            Тарифы
          </a>
          {me && <Link to="/progress">Мой прогресс</Link>}
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
          {/* Заголовок ломается только по смыслу: каждая фраза — своей
              строкой (.hero__line в Landing.css), «фитнес-эфир» не рвётся по
              дефису, «с» не повисает в конце строки. На десктопе три строки,
              на узком экране первая может разойтись на «Бесконечный /
              фитнес-эфир» — тогда четыре. */}
          <h1 className="hero__title">
            <span className="hero__line">
              <span className="hero__phrase">Бесконечный</span>{' '}
              <span className="hero__phrase">фитнес-эфир</span>
            </span>{' '}
            <span className="hero__line">с простыми движениями</span>{' '}
            <span className="hero__line">под музыку</span>
          </h1>

          {/* Строки ломаются только между фразами, по смыслу: внутри фразы
              переноса нет (.hero__phrase). На телефоне три строки, на
              широком экране две: «…повторяйте за тренером / и набирайте
              больше активности за день.» (max-width в Landing.css). */}
          <p className="hero__lead">
            <span className="hero__phrase">Включайтесь в любой момент,</span>{' '}
            <span className="hero__phrase">повторяйте за тренером</span>{' '}
            <span className="hero__phrase">и набирайте больше активности за день.</span>
          </p>

          {/* Кнопка в своём блоке: на планшете он стоит в ячейке сетки, на
              телефоне встаёт на место по order. Тренировка уже идёт — кнопка,
              как и в шапке, зовёт «Вернуться в поток»; в шапке для нового
              захода остаётся «Влиться в поток». */}
          <div className="hero__start">
            <button className="btn btn--pink-lg hero__cta" onClick={start}>
              {flow ? flowLabel(flow) : 'Включить эфир'}
              <span className="hero__cta-arrow">
                <ArrowRight size={19} />
              </span>
            </button>
          </div>

          {/* Раздел «О нас» — на него ведёт ссылка в шапке и адрес /#about. */}
          <ol className="hero__steps" id="about" ref={about}>
            {STEPS.map((s, i) => (
              <li key={s.title} className="step">
                <span className={`step__num step__num--${s.tone}`}>{i + 1}</span>
                <div className="step__body">
                  <span className="step__title">{s.title}</span>
                  <span className="step__text">{s.text}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Круг с роликом упражнения (правка Димы 06.10.2026: вместо
            маскота — кружок, бесконечно по кругу). Как круг в плеере: ролик
            целиком в круглой рамке на своём бежевом фоне. Адрес ролика ставит
            useLandingLoop — до него в разметке только постер. */}
        <div className="hero__visual">
          <span className="hero__dot hero__dot--a" />
          <span className="hero__dot hero__dot--b" />
          <span className="hero__dot hero__dot--c" />
          <span className="hero__dot hero__dot--d" />
          <div className="hero__loop">
            <video
              className="hero__loop-video"
              ref={loopVideo}
              poster={loopPoster(LANDING_LOOP)}
              muted
              loop
              autoPlay
              playsInline
              preload="none"
              disablePictureInPicture
              aria-hidden="true"
            />
          </div>
        </div>
      </main>

      {/* Подвал: оферта и политика — тихой строкой под героем. */}
      <LegalLinks className="landing__legal" />
    </div>
  )
}
