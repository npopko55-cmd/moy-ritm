/**
 * Квиз «Ваш план на 30 дней»: /quiz и /quiz/<токен> — сюда ведёт реклама ВК
 * и бот. Четыре вопроса по одному на экран, тап по ответу сразу ведёт
 * дальше; между вопросами — секундная загрузка с фразой под ответ; в конце
 * план из ответов и кнопка «Влиться в поток»: сразу тренировка, гостю — без
 * регистрации (с 18.11.2026). Пробный за 1 ₽ включён — кнопка пробного.
 *
 * Метка воронки — как у /go/<токен> (GoFunnel.tsx): визит уходит в фоне,
 * токен запоминается до регистрации, вошедшему не хранится, на ответ
 * «такой ссылки нет» забывается. Только экран не уводит на регистрацию сразу,
 * а показывает квиз. Куда ведёт кнопка плана — одна функция quizCtaPath
 * (src/lib/quiz.ts).
 *
 * Тексты и сборка плана — src/data/quiz.ts. Экран в основном бандле, как
 * GoFunnel и PlayGuest: это первая страница пришедшего с рекламы.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { hasAccess } from '../api/types'
import { flowLabel, useFlowStart } from '../auth/guards'
import { useSession } from '../auth/SessionProvider'
import { useFlow } from '../flow/FlowSession'
import Logo from '../components/Logo'
import WaveBg from '../components/WaveBg'
import { ArrowRight, Bolt, ChevronRight, Clock, Leaf, PlayCircle, Steps } from '../components/Icons'
import {
  buildPlan,
  QUESTIONS,
  QUIZ_TEXT,
  type Goal,
  type Plan,
  type QuizAnswers,
} from '../data/quiz'
import { track } from '../lib/analytics'
import { forgetFunnelToken, isFunnelToken, readFunnelToken, saveFunnelToken, visitFunnel } from '../lib/funnel'
import { guestFirstToken } from '../lib/guest'
import {
  forgetQuiz,
  QUIZ_SITE_TOKEN_FALLBACK,
  quizCardTrial,
  quizCtaPath,
  saveQuizAnswers,
  savedQuizAnswers,
} from '../lib/quiz'
import '../components/Logo.css'
import './Quiz.css'

/** Загрузка между вопросами и перед планом, мс. */
const WAIT_MS = 1200
const WAIT_FINAL_MS = 1500

const TOTAL = QUESTIONS.length

type Phase =
  | { kind: 'question'; index: number }
  | { kind: 'loading'; index: number; text: string }
  | { kind: 'plan' }

/** quiz_start — один раз за жизнь страницы (StrictMode зовёт эффект дважды). */
let startTracked = false

function trackStart(): void {
  if (startTracked) return
  startTracked = true
  track('quiz_start')
}

export default function Quiz() {
  const { token } = useParams()
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const goFlow = useFlowStart()
  const { session: flow } = useFlow()
  const { me, loading, access } = useSession()
  const valid = token === undefined || isFunnelToken(token)

  /* ——— Метка воронки: как у /go/<токен> ——— */

  useEffect(() => {
    if (!token || !valid) return
    if (!me) saveFunnelToken(token)
    void visitFunnel(token).then((result) => {
      if (result === 'not_found' && readFunnelToken() === token) forgetFunnelToken()
    })
    // Один раз на токен: вход, случившийся позже, разбирает эффект ниже.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, valid])

  useEffect(() => {
    if (token && valid && !loading && me) forgetFunnelToken()
  }, [token, valid, loading, me])

  // Без токена в адресе и в памяти — токен «Сначала гость» на случай кнопки
  // плана (QUIZ_SITE_TOKEN_FALLBACK). Спрашиваем заранее, чтобы кнопка не ждала.
  const [siteToken, setSiteToken] = useState<string | null>(null)
  useEffect(() => {
    if (!QUIZ_SITE_TOKEN_FALLBACK || token || loading || me || readFunnelToken()) return
    let alive = true
    void guestFirstToken().then((t) => {
      if (alive) setSiteToken(t)
    })
    return () => {
      alive = false
    }
  }, [token, loading, me])

  // Пробный за 1 ₽ на сервере (guest-config, без входа) — тоже заранее: от
  // него зависят путь кнопки и строка под ней. Пока ответа нет — выключен,
  // кнопка ведёт как раньше (ждать нельзя: касание запускает тренировку).
  const [cardTrial, setCardTrial] = useState(false)
  useEffect(() => {
    let alive = true
    void quizCardTrial().then((on) => {
      if (alive) setCardTrial(on)
    })
    return () => {
      alive = false
    }
  }, [])

  /* ——— Вопросы ——— */

  const [answers, setAnswers] = useState<Partial<QuizAnswers>>(() => savedQuizAnswers() ?? {})
  const [phase, setPhase] = useState<Phase>(() =>
    savedQuizAnswers() ? { kind: 'plan' } : { kind: 'question', index: 0 },
  )

  // PageMeta ставит заголовок главной на каждую смену адреса — наш ставим
  // после него. /quiz/<токен> → /quiz экран не пересоздаёт, поэтому по адресу.
  useEffect(() => {
    document.title = QUIZ_TEXT.pageTitle
  }, [pathname])

  useEffect(() => {
    if (phase.kind === 'question' && phase.index === 0) trackStart()
  }, [phase])

  // Загрузка — и дальше: следующий вопрос или план.
  useEffect(() => {
    if (phase.kind !== 'loading') return
    const last = phase.index === TOTAL - 1
    const timer = window.setTimeout(
      () => {
        if (!last) {
          setPhase({ kind: 'question', index: phase.index + 1 })
          return
        }
        const full = answers as QuizAnswers
        saveQuizAnswers(full)
        track('quiz_done')
        setPhase({ kind: 'plan' })
      },
      last ? WAIT_FINAL_MS : WAIT_MS,
    )
    return () => window.clearTimeout(timer)
  }, [phase, answers])

  // Новый экран — фокус на заголовок (читалке экрана и клавиатуре), план — с начала страницы.
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (phase.kind === 'plan') window.scrollTo(0, 0)
    if (phase.kind !== 'loading') heading.current?.focus({ preventScroll: true })
  }, [phase])

  const choose = (index: number, value: QuizAnswers[keyof QuizAnswers], text: string) => {
    if (phase.kind !== 'question' || phase.index !== index) return
    const key = QUESTIONS[index].key
    setAnswers((prev) => ({ ...prev, [key]: value }))
    track('quiz_answer', undefined, { question: index + 1 })
    setPhase({ kind: 'loading', index, text })
  }

  const restart = () => {
    forgetQuiz()
    setAnswers({})
    startTracked = false
    setPhase({ kind: 'question', index: 0 })
  }

  const start = useCallback(() => {
    track('quiz_cta')
    const to = quizCtaPath({
      signedIn: Boolean(me),
      paid: hasAccess(access),
      urlToken: token && valid ? token : null,
      siteToken,
      cardTrial,
    })
    // В тренировку — через goFlow: касание заодно разблокирует ролики и музыку.
    // null — как «Влиться в поток» на главной: туда, куда ведёт flowTarget.
    if (to === null) goFlow()
    else if (to.startsWith('/play/') || to.startsWith('/player/')) goFlow(to)
    else navigate(to)
  }, [me, access, token, valid, siteToken, cardTrial, goFlow, navigate])

  if (!valid) return <Navigate to={`/quiz${search}`} replace />

  const answered =
    phase.kind === 'plan' ? TOTAL : phase.kind === 'loading' ? phase.index + 1 : phase.index

  return (
    <div className="quiz">
      <WaveBg opacity={0.7} />

      <header className="quiz__header">
        <Logo size="sm" />
      </header>

      <main className={`quiz__main quiz__main--${phase.kind}`}>
        {phase.kind !== 'plan' && (
          <div
            className="quiz__progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={TOTAL}
            aria-valuenow={answered}
          >
            <span className="quiz__progress-fill" style={{ width: `${(answered / TOTAL) * 100}%` }} />
          </div>
        )}

        {phase.kind === 'question' && (
          <QuestionView
            key={phase.index}
            index={phase.index}
            heading={heading}
            onBack={phase.index > 0 ? () => setPhase({ kind: 'question', index: phase.index - 1 }) : undefined}
            onChoose={choose}
          />
        )}

        {phase.kind === 'loading' && (
          <LoadingView
            key={phase.index}
            text={phase.text}
            final={phase.index === TOTAL - 1}
            ms={phase.index === TOTAL - 1 ? WAIT_FINAL_MS : WAIT_MS}
          />
        )}

        {phase.kind === 'plan' && (
          <PlanView
            plan={buildPlan(answers as QuizAnswers)}
            goal={(answers as QuizAnswers).goal}
            heading={heading}
            cardTrial={cardTrial}
            ctaLabel={flowLabel(flow)}
            onStart={start}
            onRestart={restart}
          />
        )}
      </main>
    </div>
  )
}

/* ——— Вопрос ——— */

function QuestionView({
  index,
  heading,
  onBack,
  onChoose,
}: {
  index: number
  heading: React.RefObject<HTMLHeadingElement>
  onBack?: () => void
  onChoose: (index: number, value: QuizAnswers[keyof QuizAnswers], text: string) => void
}) {
  const q = QUESTIONS[index]
  return (
    <section className="quiz__step" aria-labelledby="quiz-q">
      <div className="quiz__meta">
        {onBack ? (
          <button type="button" className="quiz__back" onClick={onBack}>
            ← {QUIZ_TEXT.back}
          </button>
        ) : (
          <span />
        )}
        <span className="quiz__count">{QUIZ_TEXT.progress(index + 1, TOTAL)}</span>
      </div>

      {index === 0 && <p className="quiz__intro">{QUIZ_TEXT.intro}</p>}

      <h1 className="quiz__title" id="quiz-q" ref={heading} tabIndex={-1}>
        {q.title}
      </h1>

      <ul className="quiz__options">
        {(q.options as { value: QuizAnswers[keyof QuizAnswers]; label: string; hint?: string; loading: string }[]).map(
          (o) => (
            <li key={String(o.value)}>
              <button type="button" className="quiz__option" onClick={() => onChoose(index, o.value, o.loading)}>
                <span className="quiz__option-text">
                  <span className="quiz__option-label">{o.label}</span>
                  {o.hint && <span className="quiz__option-hint">{o.hint}</span>}
                </span>
                <span className="quiz__option-arrow" aria-hidden="true">
                  <ChevronRight size={20} />
                </span>
              </button>
            </li>
          ),
        )}
      </ul>
    </section>
  )
}

/* ——— Загрузка между вопросами ——— */

function LoadingView({ text, final, ms }: { text: string; final: boolean; ms: number }) {
  return (
    <section className="quiz__wait" style={{ ['--quiz-wait' as string]: `${ms}ms` }}>
      <svg className="quiz__ring" viewBox="0 0 88 88" aria-hidden="true">
        <defs>
          <linearGradient id="quiz-ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f5157f" />
            <stop offset="100%" stopColor="#ff9838" />
          </linearGradient>
        </defs>
        <circle className="quiz__ring-track" cx="44" cy="44" r="38" />
        <circle className="quiz__ring-arc" cx="44" cy="44" r="38" />
      </svg>
      <p className="quiz__wait-text" role="status" aria-live="polite">
        {text}
      </p>
      {final && <p className="quiz__wait-sub">{QUIZ_TEXT.loadingFinal}</p>}
    </section>
  )
}

/* ——— План ——— */

const GOAL_ICON: Record<Goal, JSX.Element> = {
  slim: <Steps size={20} />,
  back: <Leaf size={20} />,
  energy: <Bolt size={20} />,
}

function PlanView({
  plan,
  goal,
  heading,
  cardTrial,
  ctaLabel,
  onStart,
  onRestart,
}: {
  plan: Plan
  goal: Goal
  heading: React.RefObject<HTMLHeadingElement>
  /** Пробный за 1 ₽ включён на сервере — под кнопкой строка об автосписании. */
  cardTrial: boolean
  /** Подпись кнопки без пробного за 1 ₽ — та же, что у входа в поток на главной (flowLabel). */
  ctaLabel: string
  onStart: () => void
  onRestart: () => void
}) {
  const max = Math.max(...plan.weeks.map((w) => w.minutes))
  return (
    <section className="quiz__plan" aria-labelledby="quiz-plan">
      <h1 className="quiz__title quiz__title--plan" id="quiz-plan" ref={heading} tabIndex={-1}>
        {QUIZ_TEXT.planTitle}
      </h1>
      <p className="quiz__lead">{QUIZ_TEXT.planSubtitle}</p>

      <div className="quiz__card">
        <div className="quiz__row">
          <span className="quiz__row-icon quiz__row-icon--pink">{GOAL_ICON[goal]}</span>
          <div className="quiz__row-body">
            <span className="quiz__row-label">{QUIZ_TEXT.goalLabel}</span>
            <span className="quiz__row-title">{plan.goal.title}</span>
            <span className="quiz__row-text">{plan.goal.text}</span>
          </div>
        </div>

        <div className="quiz__row">
          <span className="quiz__row-icon quiz__row-icon--orange">
            <PlayCircle size={20} />
          </span>
          <div className="quiz__row-body">
            <span className="quiz__row-label">{QUIZ_TEXT.streamsLabel}</span>
            <ul className="quiz__streams">
              {plan.streams.map((s) => (
                <li key={s.id} className={`quiz__stream quiz__stream--${s.id}`}>
                  <span className="quiz__stream-dot" aria-hidden="true" />
                  <span className="quiz__stream-body">
                    <span className="quiz__stream-title">
                      {s.title}
                      {s.extra && <span className="quiz__badge">{QUIZ_TEXT.extraBadge}</span>}
                    </span>
                    <span className="quiz__row-text">{s.text}</span>
                    {s.extra && <span className="quiz__row-text quiz__row-text--note">{QUIZ_TEXT.extraReason}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="quiz__row">
          <span className="quiz__row-icon quiz__row-icon--blue">
            <Clock size={20} />
          </span>
          <div className="quiz__row-body">
            <span className="quiz__row-label">{QUIZ_TEXT.minutesLabel}</span>
            <span className="quiz__row-title">{plan.minutes.title}</span>
            <span className="quiz__row-text">{plan.minutes.text}</span>
          </div>
        </div>
      </div>

      <div className="quiz__card quiz__scale">
        <h2 className="quiz__scale-title">{QUIZ_TEXT.scaleTitle}</h2>
        <ol className="quiz__bars">
          {plan.weeks.map((w, i) => (
            <li key={w.name} className={`quiz__bar ${i === plan.weeks.length - 1 ? 'quiz__bar--last' : ''}`}>
              <span className="quiz__bar-value">{w.minutes}</span>
              <span className="quiz__bar-track">
                <span
                  className="quiz__bar-fill"
                  style={{ height: `${Math.round((w.minutes / max) * 100)}%`, animationDelay: `${i * 90}ms` }}
                />
              </span>
              <span className="quiz__bar-name">{w.name}</span>
            </li>
          ))}
        </ol>
        <p className="quiz__scale-note">{plan.paceNote}</p>
        <p className="quiz__scale-total">{QUIZ_TEXT.total(plan.total)}</p>
      </div>

      <div className="quiz__cta">
        <button type="button" className="btn btn--pink-lg quiz__cta-btn" onClick={onStart}>
          {cardTrial ? QUIZ_TEXT.cta : ctaLabel}
          <span className="quiz__cta-arrow" aria-hidden="true">
            <ArrowRight size={19} />
          </span>
        </button>
        {cardTrial && <p className="quiz__cta-note">{QUIZ_TEXT.ctaNote}</p>}
      </div>

      <button type="button" className="quiz__restart" onClick={onRestart}>
        {QUIZ_TEXT.restart}
      </button>
    </section>
  )
}
