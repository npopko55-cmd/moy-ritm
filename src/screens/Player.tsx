import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { hasAccess, type DayStats, type FreeTier, type Settings, type StatsSummary } from '../api/types'
import { useSession } from '../auth/SessionProvider'
import { days, toMinutes, weekdayShort } from '../lib/date'
import Logo from '../components/Logo'
import WaveBg from '../components/WaveBg'
import {
  Clock,
  FloatNote,
  Gear,
  Info,
  MusicNote,
  Pause,
  Play,
  Question,
  Sparkle,
  User,
} from '../components/Icons'
import Unlock from '../components/Unlock'
import { getStream } from '../data/streams'
import { loopPoster, loopSrc, stepRate, stepsFor, type Loop } from '../data/loops'
import PlayerPause from './PlayerPause'
import { useFlow, type FlowSession } from '../flow/FlowSession'
import { createChunkQueue, uuid, type ChunkQueue } from '../lib/chunks'
import { createDeck, type Deck } from '../lib/deck'
import { createMotivationPicker, tierIndex } from '../lib/motivation'
import { loadMoveInterval } from '../lib/settings'
import { prefetchFiles, prefetchImages } from '../lib/prefetch'
import { useMusic } from '../music/MusicProvider'
import '../components/Logo.css'
import './Player.css'

/** Секунды → «12:47». */
const mmss = (total: number) =>
  `${Math.floor(total / 60)}:${String(Math.floor(total % 60)).padStart(2, '0')}`

/** Сверка с сервером: раз в минуту серверные цифры заменяют локальные. */
const SYNC_MS = 60_000

/**
 * Кусок закрывается принудительно раз в минуту. Нужно только при интервале
 * в две минуты: при остальных движение сменится раньше и закроет кусок само.
 */
const FORCE_CLOSE_MS = 60_000

/** Длиннее сервер не примет: такой кусок означает спящую вкладку. */
const MAX_CHUNK_SECONDS = 300

/**
 * Бесплатный уровень, пока bootstrap не ответил.
 *
 * Правило приходит с сервера, но ответа надо дождаться, а плеер стартует
 * сразу. Если бы до ответа мы считали, что открыто всё, у человека без
 * доступа на секунду мелькали бы закрытые движения.
 */
const DEFAULT_FREE_TIER: FreeTier = { stream_code: 'cardio', exercise_limit: 5 }

/** Пока сводка не пришла — та же сетка из семи дней, чтобы карточка не прыгала. */
function emptyWeek(): DayStats[] {
  const p = (n: number) => String(n).padStart(2, '0')
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    return {
      local_date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
      seconds: 0,
      steps: 0,
      workouts: 0,
    }
  })
}

/**
 * Кегль фразы по её длине. Считаем по код-поинтам, иначе эмодзи в конце
 * тянет на два знака.
 *
 * Длинную показываем мельче и в две строки; совсем длинную — ещё мельче.
 * Второй порог появился вместе с обращением на «вы»: «Хотите продолжать —
 * кайфуйте…» в «длинном» кегле уходило в третью строку на узком экране, а
 * высота блока над кругом жёстко равна двум строкам и трогать её нельзя —
 * от неё считается размер круга.
 */
const phraseClass = (text: string): string => {
  const length = [...text].length
  if (length > 56) return ' is-long is-xlong'
  return length > 40 ? ' is-long' : ''
}

const MENU = [
  { icon: <Clock size={19} />, label: 'Мой прогресс', to: '/progress' },
  { icon: <User size={19} />, label: 'Профиль', to: '/profile' },
  { icon: <Gear size={19} />, label: 'Настройки', to: '/settings' },
  { icon: <Question size={19} />, label: 'Нужна помощь?', to: '/help' },
] as const

/** Открытый кусок движения: живёт в ref, чтобы не перерисовывать плеер. */
type OpenChunk = { startedAt: number; seconds: number; stream: string; move: string }

export default function Player() {
  const { streamId } = useParams()
  const navigate = useNavigate()
  const stream = getStream(streamId)
  const { access, me, reload } = useSession()

  /* ─────────────  Продолжение начатой тренировки  ───────────── */

  const { session: flow, begin: beginFlow, save: saveFlow } = useFlow()

  /**
   * Снимок сохранённой тренировки — берётся ОДИН раз, в первом рендере.
   *
   * Дальше состояние ведёт сам плеер и каждую секунду переписывает
   * сохранённое; читать его снова означало бы возвращаться назад.
   */
  const resumeRef = useRef<FlowSession | null | undefined>(undefined)
  if (resumeRef.current === undefined) {
    resumeRef.current = flow && flow.streamId === stream.id ? flow : null
  }
  const resume = resumeRef.current

  // Плашка о конце доступа: строкой в колонке, а не всплывающим окном.
  const notice =
    access?.status === 'expiring'
      ? `Доступ заканчивается через ${days(access.days_left)}`
      : access?.status === 'grace'
        ? 'Доступ закончился — продлите, чтобы продолжить завтра'
        : ''

  // Настройки: профиль уже загружен обёрткой RequireAuth, поэтому плеер
  // стартует сразу, а bootstrap лишь подтверждает цифры с сервера.
  const [boot, setBoot] = useState<Settings | null>(null)
  const settings = boot ?? me?.settings ?? null
  const moveInterval = settings?.move_interval_seconds ?? loadMoveInterval()
  const motivationOn = settings?.motivation_enabled ?? true

  /* ─────────────  Бесплатный уровень  ───────────── */

  /**
   * Без оплаты открыты только первые несколько движений. Правило целиком
   * серверное — фронт его не придумывает, а получает в bootstrap.free_tier.
   * При grace всё открыто: доступ ещё не кончился.
   */
  const [freeTier, setFreeTier] = useState<FreeTier>(DEFAULT_FREE_TIER)
  const limited = !hasAccess(access)

  // Счётчик смен движения. Не заворачивается по кругу нарочно: по его
  // чётности выбирается, какой из двух <video> сейчас на виду.
  const [step, setStep] = useState(() => resume?.moveIndex ?? 0)
  const [inMove, setInMove] = useState(() => resume?.moveSeconds ?? 0)
  const [playing, setPlaying] = useState(true)
  /**
   * Показан ли экран паузы.
   *
   * Отдельно от `playing`, потому что состояний три, а не два: тренировка
   * идёт; тренировка на паузе и поверх неё экран паузы; тренировка на паузе,
   * а экран закрыт крестиком или «Вернусь позже» — виден сам плеер со
   * стоящим роликом и кнопкой «Играть».
   */
  const [showPause, setShowPause] = useState(false)
  // Вкладку свернули — движение не считается, даже если ролик крутится.
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden')

  // Цифры правой колонки. Серверная сводка — основа, к ней прибавляются
  // секунды и шаги, которые сервер ещё не видел (раздел 6.5 архитектуры).
  const [summary, setSummary] = useState<StatsSummary | null>(null)
  const [pendingSeconds, setPendingSeconds] = useState(0)
  const [pendingSteps, setPendingSteps] = useState(0)
  const [openSeconds, setOpenSeconds] = useState(0)

  // Колода фраз одна на всё время жизни экрана, иначе они пошли бы по кругу.
  const picker = useRef(createMotivationPicker()).current
  const [motivation, setMotivation] = useState(() => picker.next(0))

  // Секунды В ДВИЖЕНИИ в этой тренировке: с нуля при открытии плеера, на
  // паузе не растут. Возвращение в начатый заход подхватывает их с той
  // секунды, на которой человек ушёл. Тот же счётчик продублирован в ref,
  // чтобы обработчики кнопок читали свежее значение и не пересоздавались
  // каждую секунду.
  const [sessionSeconds, setSessionSeconds] = useState(() => resume?.sessionSeconds ?? 0)
  const sessionRef = useRef(resume?.sessionSeconds ?? 0)

  // Шаги этой тренировки. На экране их больше не показывают — и в плеере, и
  // на паузе стоят шаги за сегодня, — но заход их всё равно копит: они уходят
  // в сохранённую тренировку и возвращаются, когда человек вернулся в поток.
  // Дробная часть копится в ref, округляем при записи.
  const stepsRef = useRef(resume?.sessionSteps ?? 0)

  // Фразу меняем не чаще раза в секунду: смена движения и переход в новый
  // ярус времени могут совпасть, а прочитать фразу надо успеть.
  const phraseAt = useRef(0)
  const showPhrase = useCallback(() => {
    const now = Date.now()
    if (now - phraseAt.current < 1000) return
    phraseAt.current = now
    setMotivation(picker.next(sessionRef.current))
  }, [picker])

  const { track, blocked: soundBlocked, setPlaying: setMusicPlaying, next: nextTrack } = useMusic()

  /* ─────────────  Порядок движений  ───────────── */

  /**
   * Движения этого потока — то, из чего собирается колода. Без доступа
   * это первые exercise_limit движений: остальные закрыты оплатой.
   */
  const moves = useMemo(
    () => (limited ? stream.loops.slice(0, freeTier.exercise_limit) : stream.loops),
    [stream, limited, freeTier.exercise_limit],
  )

  /**
   * Колода движений.
   *
   * Список потока тасуется, движения выдаются по одному без повторов; когда
   * выйдут все — колода тасуется заново, и первое движение новой колоды не
   * повторяет последнее показанное. Раньше движения шли строго по списку и
   * при четырёх роликах бросались в глаза.
   *
   * Уже выданные движения остаются в `list`: двойная буферизация видео
   * смотрит на шаг вперёд и через один, и эти взгляды не должны сдвигать
   * колоду — иначе «следующее» менялось бы на каждом рендере.
   */
  const orderRef = useRef<{ deck: Deck<Loop>; list: Loop[] } | null>(null)
  if (!orderRef.current) {
    // Возвращение в начатый заход: выданные движения восстанавливаем по
    // сохранённому порядку, чтобы человек увидел ровно то, на чём ушёл.
    // Незнакомый идентификатор обрывает восстановление — дальше колода
    // сдаёт сама (набор движений мог измениться вместе с доступом).
    const list: Loop[] = []
    for (const id of resume?.deck ?? []) {
      const found = moves.find((m) => m.id === id)
      if (!found) break
      list.push(found)
    }
    orderRef.current = { deck: createDeck(moves), list }
  }

  const moveAt = (n: number): Loop => {
    const order = orderRef.current as { deck: Deck<Loop>; list: Loop[] }
    while (order.list.length <= n) order.list.push(order.deck.next() ?? moves[0])
    return order.list[n]
  }

  const loop = moveAt(step)
  const nextLoop = moveAt(step + 1)
  const afterNext = moveAt(step + 2)

  // Сменили поток (или набор движений — бесплатный уровень) — новая колода
  // и счёт с нуля. На первом рендере колода уже собрана выше, поэтому здесь
  // сравниваем ключ: иначе ролик успевал бы моргнуть при открытии плеера.
  const deckKey = `${stream.id}:${moves.length}`
  const builtFor = useRef(deckKey)
  useEffect(() => {
    if (builtFor.current === deckKey) return
    builtFor.current = deckKey
    orderRef.current = { deck: createDeck(moves), list: [] }
    setStep(0)
    setInMove(0)
  }, [deckKey, moves])

  /* ─────────────  Куски движения  ───────────── */

  const queueRef = useRef<ChunkQueue | null>(null)
  const openRef = useRef<OpenChunk | null>(null)

  // Секунды и шаги в буфере считаем только за сегодня: кусок, застрявший с
  // вечера, не должен приписываться к новому дню.
  const recount = useCallback(() => {
    const q = queueRef.current
    if (!q) return
    const today = new Date().toDateString()
    const mine = q.pending().filter((c) => new Date(c.started_at).toDateString() === today)
    setPendingSeconds(mine.reduce((sum, c) => sum + c.duration_seconds, 0))
    setPendingSteps(mine.reduce((sum, c) => sum + (c.steps ?? 0), 0))
  }, [])

  const openChunk = useCallback((streamCode: string, moveId: string) => {
    openRef.current = { startedAt: Date.now(), seconds: 0, stream: streamCode, move: moveId }
    setOpenSeconds(0)
  }, [])

  // Закрытие идемпотентно: его зовут и обработчик ухода со страницы, и
  // уборка эффекта следом за ним.
  const closeChunk = useCallback(() => {
    const cur = openRef.current
    openRef.current = null
    setOpenSeconds(0)
    if (!cur || cur.seconds < 1) return
    const seconds = Math.min(MAX_CHUNK_SECONDS, Math.round(cur.seconds))
    queueRef.current?.push({
      // Идентификатор придумывается один раз, до первой отправки: повтор
      // после обрыва сети не должен засчитаться дважды.
      client_chunk_id: uuid(),
      stream_code: cur.stream,
      move_id: cur.move,
      started_at: new Date(cur.startedAt).toISOString(),
      duration_seconds: seconds,
      // steps очередь посчитает сама — по движению и длительности.
    })
  }, [])

  useEffect(() => {
    const q = createChunkQueue({
      onSummary: setSummary,
      // Доступ кончился прямо во время тренировки: перечитываем профиль,
      // и защита маршрутов уводит на тарифы.
      onAccessLost: () => void reload(),
      onChange: recount,
    })
    queueRef.current = q
    recount()
    return () => {
      // Уход из плеера — та же пауза: кусок закрываем и отправляем сразу,
      // и только потом снимаем таймеры очереди.
      closeChunk()
      q.flush()
      q.stop()
      queueRef.current = null
    }
  }, [recount, reload, closeChunk])

  // Один кусок на движение. Уборка эффекта закрывает его при смене движения,
  // паузе, сворачивании вкладки и уходе с экрана.
  useEffect(() => {
    if (!playing || !visible) return
    openChunk(stream.id, loop.id)
    const id = setInterval(() => {
      closeChunk()
      openChunk(stream.id, loop.id)
    }, FORCE_CLOSE_MS)
    return () => {
      clearInterval(id)
      closeChunk()
    }
  }, [playing, visible, stream.id, loop.id, openChunk, closeChunk])

  // Уход со страницы: закрываем кусок и пробуем отправить буфер. Не успеет —
  // не страшно, буфер лежит в localStorage и уйдёт при следующем открытии.
  useEffect(() => {
    const leave = () => {
      closeChunk()
      queueRef.current?.flush()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        leave()
        setVisible(false)
      } else {
        setVisible(true)
      }
    }
    window.addEventListener('pagehide', leave)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', leave)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [closeChunk])

  // Цифры при открытии плеера — из одного запроса. Не получилось (доступ
  // кончился между переходами) — берём хотя бы сводку: она открыта без оплаты.
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const data = await api.playerBootstrap()
        if (!alive) return
        setBoot(data.settings)
        setSummary(data.stats)
        if (data.free_tier) setFreeTier(data.free_tier)
      } catch {
        try {
          const stats = await api.statsSummary()
          if (alive) setSummary(stats)
        } catch {
          /* цифр не будет — покажем нули, тренировке это не мешает */
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  /* ─────────────  Смена суток  ───────────── */

  /**
   * Дата в поясе человека — «2026-09-07».
   *
   * Именно по этому поясу сервер раскладывает минуты по дням, поэтому и
   * сверяем ту же дату, а не дату браузера. en-CA нужна ради формата: этот
   * язык печатает дату как ISO.
   */
  const timezone = me?.user.timezone
  const userToday = useCallback(() => {
    try {
      return new Intl.DateTimeFormat('en-CA', timezone ? { timeZone: timezone } : {}).format(
        new Date(),
      )
    } catch {
      // Пояс из профиля браузер не знает — считаем по своему.
      return new Intl.DateTimeFormat('en-CA').format(new Date())
    }
  }, [timezone])

  /** Какой день сейчас «сегодня» по последней сводке. */
  const localToday = useRef<string | null>(null)
  useEffect(() => {
    if (summary?.local_today) localToday.current = summary.local_today
  }, [summary?.local_today])

  /**
   * Наступили новые сутки при открытом плеере.
   *
   * Вкладку могут не перезагружать сутками: человек нажимает паузу вечером,
   * возвращается утром и жмёт «play» — без этой проверки минуты нового дня
   * легли бы во вчерашний, а «сегодня» на экране осталось бы вчерашним.
   *
   * Поэтому: закрываем открытый кусок (он принадлежит прошлому дню и уже
   * записан со своим временем), отправляем буфер и берём сводку заново —
   * «сегодня» начнётся с серверного значения нового дня. Счётчик этой
   * тренировки не трогаем: она продолжается.
   */
  const checkDay = useCallback(() => {
    const now = userToday()
    if (!localToday.current || localToday.current === now) return
    // Помечаем сразу, чтобы до ответа сервера не сработать второй раз.
    localToday.current = now
    closeChunk()
    queueRef.current?.flush()
    void api
      .statsSummary()
      .then(setSummary)
      .catch(() => undefined)
  }, [userToday, closeChunk])

  // Каждое «play» — повод сверить дату. Эффект срабатывает и при открытии
  // плеера, и на каждом возвращении с паузы, откуда бы её ни сняли:
  // кнопкой, пробелом или «Продолжить» на экране паузы.
  useEffect(() => {
    if (playing) checkDay()
  }, [playing, checkDay])

  // Сверка раз в минуту: при расхождении правы цифры сервера, локальный
  // счётчик продолжает от них. Заодно ловим смену суток посреди тренировки.
  useEffect(() => {
    const id = setInterval(() => {
      checkDay()
      void api
        .statsSummary()
        .then(setSummary)
        .catch(() => undefined)
    }, SYNC_MS)
    return () => clearInterval(id)
  }, [checkDay])

  /* ─────────────  Ролики и таймер  ───────────── */

  // Два постоянных <video>: пока один играет, во второй уже качается
  // следующий ролик. Раньше элемент пересоздавался, и на медленной сети
  // круг пустел на несколько секунд при каждой смене движения.
  const videoA = useRef<HTMLVideoElement>(null)
  const videoB = useRef<HTMLVideoElement>(null)
  const buffers = [videoA, videoB]

  const active = ((step % 2) + 2) % 2

  const moveProgress = Math.min(1, inMove / moveInterval)

  // Секундный тик заведён один раз на всю тренировку и не пересоздаётся при
  // смене движения, поэтому темп он берёт не из замыкания, а отсюда.
  const moveRef = useRef(loop.id)
  useEffect(() => {
    moveRef.current = loop.id
  }, [loop.id])

  // Движение меняется только само, по интервалу: кнопок «назад» и «вперёд»
  // в плеере больше нет — владелец счёл их бессмысленными.
  const nextMove = useCallback(() => {
    setStep((s) => s + 1)
    setInMove(0)
    showPhrase()
  }, [showPhrase])

  // Секундный тик: ведёт время тренировки, смену движения и открытый кусок.
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      sessionRef.current += 1
      setSessionSeconds(sessionRef.current)
      stepsRef.current += stepRate(moveRef.current)
      if (openRef.current) {
        openRef.current.seconds += 1
        setOpenSeconds(openRef.current.seconds)
      }
      setInMove((s) => {
        if (s + 1 >= moveInterval) {
          nextMove()
          return 0
        }
        return s + 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [playing, nextMove, moveInterval])

  // Переход в новый ярус времени — сразу новая фраза, не дожидаясь смены
  // движения. Сравниваем с показанным ярусом, а не с флагом первого рендера:
  // в StrictMode эффекты прогоняются дважды.
  const tier = tierIndex(sessionSeconds)
  const shownTier = useRef(tier)
  useEffect(() => {
    if (shownTier.current === tier) return
    shownTier.current = tier
    showPhrase()
  }, [tier, showPhrase])

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

  /**
   * Уход из плеера тоже останавливает музыку: человек ушёл в меню, а не
   * остался в потоке. Трек при этом не перематывается — вернувшись, он
   * продолжится с той же секунды и с плавным входом.
   *
   * Ролики отдельно останавливать не нужно: вместе с плеером они уходят
   * из DOM и замирают сами.
   */
  useEffect(() => () => setMusicPlaying(false), [setMusicPlaying])

  // Следующий ролик уже лежит во втором <video>, поэтому вперёд заглядываем
  // через один: к его очереди файл успеет докачаться.
  useEffect(() => {
    prefetchImages([loopPoster(afterNext.id)])
    prefetchFiles([loopSrc(afterNext.id)])
  }, [afterNext.id])

  /* ─────────────  Разблокировка  ───────────── */

  /*
   * Ссылка на скрытый поток. Показываем мы в любом случае поток по
   * умолчанию — это решает getStream, — но адрес в строке подменяем молча,
   * чтобы он не спорил с тем, что на экране. Выбора потоков в интерфейсе
   * больше нет, а старые ссылки ходить не перестают.
   */
  useEffect(() => {
    if (streamId && streamId !== stream.id) {
      navigate(`/player/${stream.id}`, { replace: true })
    }
  }, [streamId, stream.id, navigate])

  /* ─────────────  Сохранение тренировки  ───────────── */

  // Шаг и секунды внутри движения — в ref: их читает обработчик ухода со
  // страницы, а он не должен пересоздаваться каждую секунду.
  const stepRef = useRef(step)
  stepRef.current = step
  const inMoveRef = useRef(inMove)
  inMoveRef.current = inMove

  /**
   * Запомнить тренировку. pausedAt = null, пока плеер открыт; при уходе
   * ставим время — с него пойдут те самые тридцать минут.
   */
  const store = useCallback(
    (pausedAt: number | null) => {
      saveFlow({
        streamId: stream.id,
        sessionSeconds: sessionRef.current,
        sessionSteps: Math.round(stepsRef.current),
        deck: (orderRef.current?.list ?? []).map((l) => l.id),
        moveIndex: stepRef.current,
        moveSeconds: inMoveRef.current,
        pausedAt,
      })
    },
    [saveFlow, stream.id],
  )

  // Плеер открылся: продолжаем начатое или начинаем новый заход. Новый
  // заход стирает прошлый — в том числе чужого потока.
  useEffect(() => {
    if (resume) store(null)
    else beginFlow(stream.id)
    // Ровно один раз на открытие плеера: дальше состояние ведут эффекты ниже.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Каждая пауза и каждая смена движения — повод переписать состояние.
  useEffect(() => {
    store(null)
  }, [playing, step, store])

  /**
   * Уход из плеера: в меню, в прогресс, в настройки, перезагрузкой вкладки.
   * Штампуем время паузы — тренировка ждёт возвращения полчаса, и всё это
   * время кнопки зовут «Вернуться в поток».
   */
  useEffect(() => {
    const leave = () => store(Date.now())
    window.addEventListener('pagehide', leave)
    return () => {
      window.removeEventListener('pagehide', leave)
      leave()
    }
  }, [store])

  /* ─────────────  Пауза  ───────────── */

  /**
   * Кнопка паузы и пробел. Пауза не просто останавливает ролик, а поднимает
   * экран паузы; снятие паузы его закрывает.
   *
   * Состояние читается из ref, а не из замыкания: обработчик пробела висит
   * на окне и не должен пересоздаваться на каждое переключение.
   */
  const playingRef = useRef(playing)
  playingRef.current = playing

  const toggle = useCallback(() => {
    if (playingRef.current) {
      setPlaying(false)
      setShowPause(true)
    } else {
      setPlaying(true)
      setShowPause(false)
    }
  }, [])

  /**
   * Крестик и «Вернусь позже» на экране паузы.
   *
   * Оба закрывают экран и оставляют человека в плеере на паузе: ролик и
   * музыка стоят, кнопка зовёт «Играть». Тренировка при этом продолжается —
   * закончить её нельзя ни одной кнопкой, она сама истекает через полчаса.
   *
   * Открытый кусок закрыл эффект паузы; здесь остаётся отправить буфер, не
   * дожидаясь склейки, — минуты этого захода уйдут на сервер сразу.
   */
  const closePause = useCallback(() => {
    closeChunk()
    queueRef.current?.flush()
    setShowPause(false)
  }, [closeChunk])

  // Пробел — та же пауза, что и кнопка. Когда в фокусе кнопка или поле,
  // пробел уже что-то значит для них: второй раз его перехватывать нельзя.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return
      const el = document.activeElement
      if (el instanceof HTMLElement && (el.isContentEditable || /^(BUTTON|INPUT|TEXTAREA|SELECT|A)$/.test(el.tagName))) return
      e.preventDefault()
      toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])

  /* ─────────────  Цифры для правой колонки  ───────────── */

  const todaySeconds = (summary?.today_seconds ?? 0) + pendingSeconds + openSeconds
  const week = summary?.week ?? emptyWeek()
  const isToday = (date: string) => date === (summary?.local_today ?? week[week.length - 1].local_date)
  const weekMinutes = week.map((d) => (isToday(d.local_date) ? toMinutes(todaySeconds) : toMinutes(d.seconds)))
  const weekTop = Math.max(1, ...weekMinutes)

  /**
   * Шаги за сегодня, а не за этот заход: заказчик хочет видеть день целиком.
   *
   * Складываются ровно так же, как секунды: серверное значение сегодняшнего
   * дня плюс то, что сервер ещё не видел, — закрытые куски из буфера и
   * открытый кусок. Складывать сюда весь счётчик захода нельзя: куски,
   * которые уже ушли, сервер вернул бы вторым слагаемым, и шаги удвоились бы.
   */
  const todayServerSteps = week.find((d) => isToday(d.local_date))?.steps ?? 0
  const todaySteps = todayServerSteps + pendingSteps + stepsFor(loop.id, openSeconds)

  return (
    <>
      {/*
        Игровая раскладка не размонтируется, а прячется на то время, пока
        поверх неё стоит экран паузы: ролики остаются в DOM вместе с
        закачанным буфером и текущей секундой, поэтому «Продолжить»
        возвращает ровно туда, где остановились. Закрыли экран крестиком —
        раскладка видна снова, только ролик стоит.
      */}
      <div
        className={`player ${notice ? 'player--notice' : ''} ${limited ? 'player--locked' : ''}`}
        hidden={showPause}
      >
      <WaveBg opacity={0.28} />

      {/* ——— Левая колонка ——— */}
      <aside className="player__side">
        <Logo size="sm" />

        {/* Плашка живёт внутри колонки: на телефоне .player__side
            распускается в сетку, и ей выделен отдельный ряд «note». */}
        {notice && (
          <Link className="access-note" to="/tariffs">
            <span>{notice}</span>
            <span className="access-note__cta">Продлить</span>
          </Link>
        )}

        {/* Карточек потоков здесь больше нет: выбирать нечего, и всё, что
            они занимали, отдано кругу. В колонке остались логотип и меню. */}
        <ul className="side__menu">
          {MENU.map((m) => (
            <li key={m.label}>
              <button
                className="side__menu-item"
                // Откуда пришли, чтобы «К тренировке» вернуло в тот же поток.
                onClick={() => navigate(m.to, { state: { from: stream.id } })}
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
          {/* Фразы выключены в настройках — блок остаётся на месте пустым,
              иначе круг подпрыгивал бы вверх. */}
          <h1 className={`stage__headline${motivationOn ? phraseClass(motivation) : ''}`}>
            {motivationOn ? motivation : ' '}
          </h1>
        </header>

        {/* Круг и кнопка паузы лежат в одной обёртке: от неё считается и
            угол квадрата, и строка под кругом. */}
        <div className="stage__area">
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

        {/*
          Пауза: на большом круге — в правом нижнем углу квадрата, в который
          он вписан (угол всё равно пустой, и кнопка не отнимает у круга ни
          пикселя), на маленьком — отдельной строкой под кругом. Выбирает
          размещение CSS по размеру окна, разметка одна и та же.
        */}
        <div className="stage__pause">
          <span>{playing ? 'Пауза' : 'Играть'}</span>
          <button className="ctrl ctrl--main" onClick={toggle} aria-label={playing ? 'Пауза' : 'Играть'}>
            {playing ? <Pause size={30} /> : <Play size={30} />}
          </button>
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
        </div>

        {/* Время за сегодня и неделя одной карточкой: раньше это были два
            блока с одной и той же цифрой в разном виде. */}
        <section className="stat stat--accent stat--chart">
          <header className="stat__head">
            <span>Время в движении сегодня</span>
            <Info size={15} />
          </header>
          <strong className="stat__big">{mmss(todaySeconds)}</strong>
          <div className="week">
            {week.map((d, i) => {
              const today = isToday(d.local_date)
              return (
                <div key={d.local_date} className="week__col">
                  <div className="week__track">
                    <div
                      className={`week__bar ${today ? 'is-today' : ''}`}
                      style={{ height: `${Math.round((weekMinutes[i] / weekTop) * 100)}%` }}
                    />
                  </div>
                  <span className={today ? 'is-today' : ''}>{weekdayShort(d.local_date)}</span>
                  {/* Минуты этого дня. День без движения — прочерк: ноль в
                      столбце цифр читается как результат, а его не было. */}
                  <span className={`week__min ${today ? 'is-today' : ''}`}>
                    {weekMinutes[i] > 0 ? weekMinutes[i] : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        </section>

        {/* Шаги те же, что на экране паузы: один счётчик, одна величина. */}
        <section className="stat">
          <header className="stat__head">
            <span>Шагов набрано</span>
          </header>
          <div className="stat__row">
            <span className="stat__steps">
              {/* «~» здесь и везде: шаги мы оцениваем по темпу движения. */}
              <strong className="stat__mid">~{todaySteps}</strong>
              <span>сегодня</span>
            </span>
          </div>
        </section>

        {/* Единственный вход в тарифы из тренировки. На телефоне и планшете
            правой колонки нет, и блок встаёт последним в ленте статистики —
            но остаётся тем же самым узлом, второго в разметке нет. */}
        {limited && (
          <div className="stats__unlock">
            <Unlock />
          </div>
        )}
      </aside>

      </div>

      {showPause && (
        <PlayerPause
          sessionSeconds={sessionSeconds}
          todaySteps={todaySteps}
          todaySeconds={todaySeconds}
          summary={summary}
          locked={limited}
          onResume={() => {
            setShowPause(false)
            setPlaying(true)
          }}
          onClose={closePause}
        />
      )}
    </>
  )
}
