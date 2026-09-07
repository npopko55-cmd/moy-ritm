import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { hasAccess, type DayStats, type FreeTier, type Settings, type StatsSummary } from '../api/types'
import { useSession } from '../auth/SessionProvider'
import { days, minutes, toMinutes, weekdayShort } from '../lib/date'
import Logo from '../components/Logo'
import WaveBg from '../components/WaveBg'
import {
  Clock,
  FloatNote,
  Fullscreen,
  Gear,
  Info,
  Lock,
  MusicNote,
  Pause,
  Play,
  PulseWave,
  Question,
  Sparkle,
  User,
} from '../components/Icons'
import Unlock from '../components/Unlock'
import { STREAMS, getStream } from '../data/streams'
import { loopPoster, loopSrc, stepRate, type Loop } from '../data/loops'
import PlayerPause from './PlayerPause'
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
 * Дневной ориентир для кольца в карточке «Сегодня» — полчаса движения.
 * Это не цель и не обещание, просто шкала, по которой кольцо заполняется.
 */
const DAY_GOAL_SECONDS = 1800

/**
 * Бесплатный уровень, пока bootstrap не ответил.
 *
 * Правило приходит с сервера, но ответа надо дождаться, а плеер стартует
 * сразу. Если бы до ответа мы считали, что открыто всё, у человека без
 * доступа на секунду мелькали бы разблокированные потоки.
 */
const DEFAULT_FREE_TIER: FreeTier = { stream_code: 'cardio', exercise_limit: 5 }

/** Сколько держится подсветка блока разблокировки, мс. */
const PULSE_MS = 1200

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
 * Длинную фразу показываем мельче и в две строки. Считаем по код-поинтам,
 * иначе эмодзи в конце тянет на два знака.
 */
const isLongPhrase = (text: string) => [...text].length > 40

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
   * Без оплаты открыт один поток и только первые несколько его движений.
   * Правило целиком серверное — фронт его не придумывает, а получает в
   * bootstrap.free_tier. При grace всё открыто: доступ ещё не кончился.
   */
  const [freeTier, setFreeTier] = useState<FreeTier>(DEFAULT_FREE_TIER)
  const limited = !hasAccess(access)
  const isLocked = (streamCode: string) => limited && streamCode !== freeTier.stream_code

  // Счётчик смен движения. Не заворачивается по кругу нарочно: по его
  // чётности выбирается, какой из двух <video> сейчас на виду.
  const [step, setStep] = useState(0)
  const [inMove, setInMove] = useState(0)
  const [playing, setPlaying] = useState(true)
  // Вкладку свернули — движение не считается, даже если ролик крутится.
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden')

  // Цифры правой колонки. Серверная сводка — основа, к ней прибавляются
  // секунды, которые сервер ещё не видел (раздел 6.5 архитектуры).
  const [summary, setSummary] = useState<StatsSummary | null>(null)
  const [pendingSeconds, setPendingSeconds] = useState(0)
  const [openSeconds, setOpenSeconds] = useState(0)

  // Колода фраз одна на всё время жизни экрана, иначе они пошли бы по кругу.
  const picker = useRef(createMotivationPicker()).current
  const [motivation, setMotivation] = useState(() => picker.next(0))

  // Секунды В ДВИЖЕНИИ в этой тренировке: с нуля при открытии плеера, на
  // паузе не растут. Тот же счётчик продублирован в ref, чтобы обработчики
  // кнопок читали свежее значение и не пересоздавались каждую секунду.
  const [sessionSeconds, setSessionSeconds] = useState(0)
  const sessionRef = useRef(0)

  // Шаги этой тренировки — их показывает экран паузы. Идут от того же
  // секундного тика, что и «В этой сессии», и по темпу текущего движения.
  //
  // Раньше они складывались из кусков, которые уходят на сервер, а те живут
  // только при видимой вкладке: при паузе на восьмой секунде время было уже
  // 0:08, а шаги стояли на «~0». Здесь счётчики разъехаться не могут — у них
  // один источник секунд. Дробная часть копится в ref, округляем при показе.
  const stepsRef = useRef(0)
  const [sessionSteps, setSessionSteps] = useState(0)

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
  if (!orderRef.current) orderRef.current = { deck: createDeck(moves), list: [] }

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

  // Секунды в буфере считаем только за сегодня: кусок, застрявший с вечера,
  // не должен приписываться к новому дню.
  const recount = useCallback(() => {
    const q = queueRef.current
    if (!q) return
    const today = new Date().toDateString()
    setPendingSeconds(
      q
        .pending()
        .reduce(
          (sum, c) =>
            new Date(c.started_at).toDateString() === today ? sum + c.duration_seconds : sum,
          0,
        ),
    )
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
      q.stop()
      queueRef.current = null
    }
  }, [recount, reload])

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
      setSessionSteps(Math.round(stepsRef.current))
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

  // Следующий ролик уже лежит во втором <video>, поэтому вперёд заглядываем
  // через один: к его очереди файл успеет докачаться.
  useEffect(() => {
    prefetchImages([loopPoster(afterNext.id)])
    prefetchFiles([loopSrc(afterNext.id)])
  }, [afterNext.id])

  /* ─────────────  Разблокировка  ───────────── */

  // Прямая ссылка на закрытый поток: уводим в бесплатный, а не показываем
  // пустой экран. Решение всё равно за бэкендом — он не отдаст чужой контент.
  useEffect(() => {
    if (limited && stream.id !== freeTier.stream_code) {
      navigate(`/player/${freeTier.stream_code}`, { replace: true })
    }
  }, [limited, stream.id, freeTier.stream_code, navigate])

  // Клик по закрытому потоку не переключает поток, а показывает, что делать:
  // подводит к блоку разблокировки и коротко его подсвечивает.
  const unlockRef = useRef<HTMLLIElement>(null)
  const pulseTimer = useRef<number | null>(null)
  const [pulse, setPulse] = useState(false)

  const showUnlock = useCallback(() => {
    unlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    if (pulseTimer.current !== null) clearTimeout(pulseTimer.current)
    // Класс снимается и ставится заново, иначе повторный клик не перезапустит
    // анимацию.
    setPulse(false)
    pulseTimer.current = window.setTimeout(() => {
      setPulse(true)
      pulseTimer.current = window.setTimeout(() => setPulse(false), PULSE_MS)
    }, 30)
  }, [])

  useEffect(
    () => () => {
      if (pulseTimer.current !== null) clearTimeout(pulseTimer.current)
    },
    [],
  )

  /* ─────────────  Пауза  ───────────── */

  /**
   * «Вернусь позже»: закрываем открытый кусок, не ждём склейку — и уходим
   * на прогресс. Кусок уже в буфере, поэтому минуты этой тренировки там
   * будут даже если сеть ответит не сразу.
   */
  const goLater = useCallback(() => {
    closeChunk()
    queueRef.current?.flush()
    navigate('/progress', { state: { from: stream.id } })
  }, [closeChunk, navigate, stream.id])

  // Пробел — та же пауза, что и кнопка. Когда в фокусе кнопка или поле,
  // пробел уже что-то значит для них: второй раз его перехватывать нельзя.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return
      const el = document.activeElement
      if (el instanceof HTMLElement && (el.isContentEditable || /^(BUTTON|INPUT|TEXTAREA|SELECT|A)$/.test(el.tagName))) return
      e.preventDefault()
      setPlaying((p) => !p)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /* ─────────────  Цифры для правой колонки  ───────────── */

  const todaySeconds = (summary?.today_seconds ?? 0) + pendingSeconds + openSeconds
  const week = summary?.week ?? emptyWeek()
  const isToday = (date: string) => date === (summary?.local_today ?? week[week.length - 1].local_date)
  const weekMinutes = week.map((d) => (isToday(d.local_date) ? toMinutes(todaySeconds) : toMinutes(d.seconds)))
  const weekTop = Math.max(1, ...weekMinutes)

  return (
    <>
      {/*
        Игровая раскладка не размонтируется на паузе, а прячется: ролики
        остаются в DOM вместе с закачанным буфером и текущей секундой,
        поэтому «Продолжить» возвращает ровно туда, где остановились.
      */}
      <div className={`player ${notice ? 'player--notice' : ''}`} hidden={!playing}>
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

        <p className="side__label">Потоки</p>

        <ul className="side__streams">
          {STREAMS.map((s) => {
            const locked = isLocked(s.id)
            return (
              <li key={s.id}>
                <button
                  className={`stream-card stream-card--${s.theme} ${s.id === stream.id ? 'is-active' : ''} ${locked ? 'is-locked' : ''}`}
                  onClick={() => (locked ? showUnlock() : navigate(`/player/${s.id}`))}
                  aria-label={locked ? `${s.title} — откроется после оплаты` : s.title}
                >
                  <img className="stream-card__photo" src={s.cover} alt="" decoding="async" />
                  <span className="stream-card__tint" />
                  <span className="stream-card__fade" />
                  <span className="stream-card__text">
                    <span className="stream-card__title">{s.title}</span>
                    <span className="stream-card__sub">{s.subtitle}</span>
                  </span>
                  {locked && (
                    <span className="stream-card__lock">
                      <Lock size={15} />
                    </span>
                  )}
                </button>
              </li>
            )
          })}

          {/* Единственный вход в тарифы из тренировки. На телефоне лента
              потоков горизонтальная, и блок встаёт в ней последним. */}
          {limited && (
            <li className="side__unlock" ref={unlockRef}>
              <Unlock pulse={pulse} />
            </li>
          )}
        </ul>

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
          <h1 className={`stage__headline ${motivationOn && isLongPhrase(motivation) ? 'is-long' : ''}`}>
            {motivationOn ? motivation : ' '}
          </h1>
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

          {/*
            Пауза лежит в правом нижнем углу квадрата, в который вписан круг:
            угол всё равно пустой, поэтому кнопка не отнимает у круга ни
            пикселя. Подпись слева от кнопки — снизу её было бы негде разместить.
          */}
          <div className="stage__pause">
            <span>{playing ? 'Пауза' : 'Играть'}</span>
            <button
              className="ctrl ctrl--main"
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? 'Пауза' : 'Играть'}
            >
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
              {minutes(toMinutes(summary?.yesterday_seconds ?? 0))}
            </span>
          </footer>
        </section>

        {/* Шаги те же, что на экране паузы: один счётчик, одна величина. */}
        <section className="stat">
          <header className="stat__head">
            <span>Шагов набрано</span>
          </header>
          <div className="stat__row">
            <span className="stat__steps">
              {/* «~» здесь и везде: шаги мы оцениваем по темпу движения. */}
              <strong className="stat__mid">~{sessionSteps}</strong>
              <span>за эту сессию</span>
            </span>
            {/* Кольцо осталось индикатором: сколько ещё крутится это движение. */}
            <Donut value={1 - moveProgress} small />
          </div>
        </section>

        <section className="stat stat--chart">
          <header className="stat__head">
            <span>Сегодня</span>
          </header>
          <div className="stat__row stat__row--gap">
            <Donut value={todaySeconds / DAY_GOAL_SECONDS} small />
            <span className="stat__today">
              <strong>{toMinutes(todaySeconds)} мин</strong>
              <span>в движении</span>
            </span>
          </div>
          <div className="week">
            {week.map((d, i) => (
              <div key={d.local_date} className="week__col">
                <div
                  className={`week__bar ${isToday(d.local_date) ? 'is-today' : ''}`}
                  style={{ height: `${Math.round((weekMinutes[i] / weekTop) * 100)}%` }}
                />
                <span className={isToday(d.local_date) ? 'is-today' : ''}>
                  {weekdayShort(d.local_date)}
                </span>
              </div>
            ))}
          </div>
        </section>
      </aside>

      </div>

      {!playing && (
        <PlayerPause
          sessionSeconds={sessionSeconds}
          sessionSteps={sessionSteps}
          todaySeconds={todaySeconds}
          summary={summary}
          locked={limited}
          onResume={() => setPlaying(true)}
          onLater={goLater}
        />
      )}
    </>
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
