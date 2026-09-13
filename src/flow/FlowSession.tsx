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
 *
 * Тренировка принадлежит тому, кто её начал. В одном браузере бывают двое:
 * после выхода другой человек не должен видеть «Вернуться в поток» с чужим
 * заходом. Поэтому в записи лежит id, а выход и смена аккаунта её стирают.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useSession } from '../auth/SessionProvider'

/** Сколько тренировка ждёт возвращения после ухода из плеера, минут. */
export const FLOW_RESUME_MINUTES = 30

const KEY = 'moy-ritm.flow'

/** Состояние идущей тренировки — всё, что нужно плееру, чтобы продолжить. */
export type FlowSession = {
  /** Чья тренировка: id вошедшего человека. */
  userId: string
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
  /** Когда ушли из плеера (или спрятали вкладку), мс; null — плеер открыт. */
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
    // Чужая или битая запись не должна ронять экран. Запись без владельца —
    // из прошлых версий: чья она, не узнать, поэтому не продолжаем.
    if (!saved || typeof saved.streamId !== 'string' || typeof saved.userId !== 'string') {
      sessionStorage.removeItem(KEY)
      return null
    }
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
  /**
   * Идущая тренировка вошедшего человека или null. Срок проверяется в момент
   * чтения, а не когда запись последний раз менялась.
   */
  readonly session: FlowSession | null
  /** Новый заход: старый, если он был, на этом заканчивается. */
  begin(streamId: string): void
  /** Запомнить состояние. pausedAt задаёт вызывающий: null — плеер открыт. */
  save(state: Omit<FlowSession, 'startedAt' | 'userId'>): void
  /** Тренировка закончена: выход из аккаунта. */
  finish(): void
}

const FlowContext = createContext<FlowValue | null>(null)

export function FlowProvider({ children }: { children: ReactNode }) {
  const { me, loading } = useSession()
  const userId = me?.user.id ?? null
  // Ref, чтобы сохранение при размонтировании плеера видело, вошёл ли ещё
  // человек, — уже после того, как сессия погасла.
  const user = useRef(userId)
  user.current = userId

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

  /** Живая тренировка именно этого человека — на момент вызова. */
  const current = useCallback((): FlowSession | null => {
    const s = last.current
    return isFlowAlive(s) && s.userId === user.current ? s : null
  }, [])

  const begin = useCallback(
    (streamId: string) => {
      const owner = user.current
      if (!owner) return
      put({
        userId: owner,
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
    (state: Omit<FlowSession, 'startedAt' | 'userId'>) => {
      const owner = user.current
      // Вход уже погас (выход, отказ в обновлении токена), а плеер при
      // размонтировании хочет сохраниться — сохранять не для кого.
      if (!owner) return
      const prev = current()
      put({
        ...state,
        userId: owner,
        // Начало захода переносим из прошлого состояния: тот же поток —
        // та же тренировка. Другой поток — заход начался только что.
        startedAt: prev && prev.streamId === state.streamId ? prev.startedAt : Date.now(),
      })
    },
    [put, current],
  )

  const finish = useCallback(() => put(null), [put])

  // Вышел или вошёл другой: чужая тренировка стирается. Пока неизвестно,
  // кто вошёл (первая проверка при открытии), запись не трогаем — это
  // перезагрузка вкладки посреди тренировки.
  useEffect(() => {
    if (loading) return
    const s = last.current
    if (s && s.userId !== userId) put(null)
  }, [loading, userId, put])

  // Полчаса истекли, пока страница открыта: стираем запись, чтобы кнопки
  // перерисовались и не звали в законченный заход. Таймеры спрятанной
  // вкладки браузер придерживает, поэтому сверяемся ещё и при возвращении.
  useEffect(() => {
    const expire = () => {
      const s = last.current
      if (s && !isFlowAlive(s)) put(null)
    }
    const timer =
      session?.pausedAt != null
        ? window.setTimeout(expire, session.pausedAt + FLOW_RESUME_MINUTES * 60_000 - Date.now() + 1000)
        : undefined
    document.addEventListener('visibilitychange', expire)
    window.addEventListener('pageshow', expire)
    window.addEventListener('focus', expire)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', expire)
      window.removeEventListener('pageshow', expire)
      window.removeEventListener('focus', expire)
    }
  }, [session, put])

  const value = useMemo<FlowValue>(
    () => ({
      get session() {
        return current()
      },
      begin,
      save,
      finish,
    }),
    // session и userId — чтобы потребители перерисовывались при их смене.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, userId, current, begin, save, finish],
  )

  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>
}

export function useFlow(): FlowValue {
  const ctx = useContext(FlowContext)
  if (!ctx) throw new Error('useFlow вызван вне FlowProvider')
  return ctx
}
