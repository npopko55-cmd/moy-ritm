/**
 * Активная тренировка.
 *
 * Плеер размонтируется при любом уходе с экрана — в меню, в «Мой прогресс»,
 * в настройки, — и вместе с ним раньше пропадала сама тренировка: человек
 * возвращался кнопкой «Влиться в поток», снова видел отсчёт 3-2-1 и начинал
 * с нуля, хотя музыка всё это время играла и заход не заканчивался.
 *
 * Поэтому состояние тренировки живёт здесь, выше маршрутов, и дублируется
 * в sessionStorage: контекст переживает размонтирование плеера, хранилище —
 * перезагрузку вкладки. Тренировка считается идущей ещё FLOW_RESUME_MINUTES
 * после ухода из плеера; дальше это уже другой заход.
 *
 * Хранилище именно session, а не local: закрытая вкладка — закрытая
 * тренировка, возвращаться в неё завтра было бы странно.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

/** Сколько тренировка ждёт возвращения после ухода из плеера, минут. */
export const FLOW_RESUME_MINUTES = 30

const KEY = 'moy-ritm.flow'

/** Состояние идущей тренировки — всё, что нужно плееру, чтобы продолжить. */
export type FlowSession = {
  streamId: string
  /** Секунды в движении в этом заходе. */
  sessionSeconds: number
  /** Шаги этого захода — оценка по темпу движений. */
  sessionSteps: number
  /** Порядок уже выданных движений: по нему восстанавливается колода. */
  deck: string[]
  /** Позиция в колоде — какое движение сейчас на экране. */
  moveIndex: number
  /** Секунды внутри текущего движения, чтобы кольцо не начиналось заново. */
  moveSeconds: number
  /** Когда заход начался, мс. */
  startedAt: number
  /** Когда ушли из плеера, мс; null — плеер открыт. */
  pausedAt: number | null
}

/** Ушли из плеера меньше получаса назад (или вовсе не уходили). */
export function isFlowAlive(session: FlowSession | null): session is FlowSession {
  if (!session) return false
  if (session.pausedAt === null) return true
  return Date.now() - session.pausedAt < FLOW_RESUME_MINUTES * 60_000
}

function read(): FlowSession | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as FlowSession
    // Чужая или битая запись не должна ронять экран.
    if (!saved || typeof saved.streamId !== 'string') return null
    if (isFlowAlive(saved)) return saved
    // Полчаса прошло — это уже прошлый заход, и держать его незачем.
    sessionStorage.removeItem(KEY)
    return null
  } catch {
    return null
  }
}

function write(session: FlowSession | null): void {
  try {
    if (session) sessionStorage.setItem(KEY, JSON.stringify(session))
    else sessionStorage.removeItem(KEY)
  } catch {
    /* приватный режим — переживём без восстановления после перезагрузки */
  }
}

type FlowValue = {
  /** Идущая тренировка или null. */
  session: FlowSession | null
  /** Новый заход: старый, если он был, на этом заканчивается. */
  begin(streamId: string): void
  /** Запомнить состояние. pausedAt задаёт вызывающий: null — плеер открыт. */
  save(state: Omit<FlowSession, 'startedAt'>): void
  /** Тренировка закончена — «Вернусь позже». */
  finish(): void
}

const FlowContext = createContext<FlowValue | null>(null)

export function FlowProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<FlowSession | null>(read)

  // Ref, чтобы обработчики читали свежее состояние и при этом не
  // пересоздавались: плеер вешает их на размонтирование.
  const last = useRef(session)
  last.current = session

  const put = useCallback((next: FlowSession | null) => {
    last.current = next
    setSession(next)
    write(next)
  }, [])

  const begin = useCallback(
    (streamId: string) => {
      put({
        streamId,
        sessionSeconds: 0,
        sessionSteps: 0,
        deck: [],
        moveIndex: 0,
        moveSeconds: 0,
        startedAt: Date.now(),
        pausedAt: null,
      })
    },
    [put],
  )

  const save = useCallback(
    (state: Omit<FlowSession, 'startedAt'>) => {
      const prev = isFlowAlive(last.current) ? last.current : null
      put({
        ...state,
        // Начало захода переносим из прошлого состояния: тот же поток —
        // та же тренировка. Другой поток — заход начался только что.
        startedAt: prev && prev.streamId === state.streamId ? prev.startedAt : Date.now(),
      })
    },
    [put],
  )

  const finish = useCallback(() => put(null), [put])

  const value = useMemo(
    // Полчаса могли истечь, пока страница открыта: наружу отдаём только
    // живую тренировку, чтобы кнопки не звали в законченный заход.
    () => ({ session: isFlowAlive(session) ? session : null, begin, save, finish }),
    [session, begin, save, finish],
  )

  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>
}

export function useFlow(): FlowValue {
  const ctx = useContext(FlowContext)
  if (!ctx) throw new Error('useFlow вызван вне FlowProvider')
  return ctx
}
