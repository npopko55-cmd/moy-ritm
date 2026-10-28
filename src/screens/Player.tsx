import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { describeVideoFault, reportPlayerFault, type FaultContext } from '../api/playerFault'
import {
  hasAccess,
  type DayStats,
  type FreeTier,
  type GuestPromptKind,
  type PlayerBootstrap,
  type Settings,
  type StatsSummary,
} from '../api/types'
import { useSession } from '../auth/SessionProvider'
import { days, durationTight, toMinutes, weekdayShort } from '../lib/date'
import Logo from '../components/Logo'
import WaveBg from '../components/WaveBg'
import {
  FloatNote,
  Info,
  MusicNote,
  Pause,
  Play,
  Shrink,
  Sparkle,
  SpeakerOff,
  SpeakerOn,
} from '../components/Icons'
import GuestPrompt from '../components/GuestPrompt'
import TabBar from '../components/TabBar'
import StreamSwitcher from '../components/StreamSwitcher'
import Unlock, { GuestUnlock } from '../components/Unlock'
import { DEFAULT_FREE_TIER, getStream, streamLocked } from '../data/streams'
import { loopPoster, loopSrc, SECONDS_PER_MOVE, stepRate, stepsFor, type Loop } from '../data/loops'
import PlayerPause from './PlayerPause'
import {
  FLOW_RESUME_MINUTES,
  isStart,
  spendStart,
  useFlow,
  type FlowSession,
} from '../flow/FlowSession'
import { createChunkQueue, type ChunkQueue } from '../lib/chunks'
import { saveFunnelToken } from '../lib/funnel'
import {
  addGuestMoved,
  GUEST_TARIFFS_PATH,
  guestFullShown,
  guestMoved,
  guestPromptDue,
  guestThresholds,
  lastGuestBootstrap,
  loadGuestBootstrap,
  markGuestPromptShown,
  reportGuest,
  reportGuestStart,
} from '../lib/guest'
import { createRotation, type Deck } from '../lib/deck'
import { onAppReturn } from '../lib/appReturn'
import {
  closeFullscreen,
  isPhoneScreen,
  onFullscreenLost,
  openFullscreen,
  usePhoneScreen,
} from '../lib/fullscreen'
import { recentMoves, rememberMove } from '../lib/moveHistory'
import { loadMoveInterval } from '../lib/settings'
import { lastBootstrap, loadBootstrap, markTrialStale, trialOpensAll, useTrial } from '../lib/trial'
import { prefetchFiles, prefetchImages } from '../lib/prefetch'
import { onTelegramEvent, openTariffsOnSite, telegramActive, useInTelegram } from '../lib/telegram'
import { uuid } from '../lib/uuid'
import { playChime, unlockChime } from '../media/chime'
import { holdAwake, keepAwake, releaseAwake } from '../media/keepAwake'
import { unlockMedia } from '../media/unlock'
import {
  isNotAllowed,
  pauseVideo,
  playVideo,
  setVideoSource,
  unlockVideos,
  videoPool,
  watchVideo,
} from '../media/videoPool'
import { useMusic } from '../music/MusicProvider'
import '../components/Logo.css'
import './Player.css'

/** Секунды → «12:47». */
const mmss = (total: number) =>
  `${Math.floor(total / 60)}:${String(Math.floor(total % 60)).padStart(2, '0')}`

/** Сверка с сервером: раз в минуту серверные цифры заменяют локальные. */
const SYNC_MS = 60_000

/** Отчёт о сбое ролика — не чаще раза в столько за заход. */
const FAULT_REPORT_MS = 30_000

/**
 * Кусок закрывается принудительно раз в минуту. Нужно только при интервале
 * в две минуты: при остальных движение сменится раньше и закроет кусок само.
 */
const FORCE_CLOSE_MS = 60_000

/** Длиннее сервер не примет: такой кусок означает спящую вкладку. */
const MAX_CHUNK_SECONDS = 300

/** «Вернусь позже» ждёт отправку минут не дольше этого, потом уходит в «Мой прогресс». */
const PROGRESS_WAIT_MS = 1500

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

/** Открытый кусок движения: живёт в ref, чтобы не перерисовывать плеер. */
type OpenChunk = { startedAt: number; seconds: number; stream: string; move: string }

/** Вид движения для круга: соседние движения — разного вида (src/data/loops.ts). */
const moveKind = (move: Loop) => move.kind

export default function Player() {
  const { streamId, token: guestToken } = useParams()
  const navigate = useNavigate()
  // Состояние записи истории: по нему видно, что плеер открыл отсчёт.
  const { state: routeState } = useLocation()
  const stream = getStream(streamId)
  const { access, me, reload } = useSession()

  /**
   * Гость — ссылка /play/<токен> без входа (src/lib/guest.ts). Плеер тот же,
   * но всё, что требует входа, гостю не зовётся: сверка цифр, отчёт о сбое,
   * плашки воронки, «Мой прогресс». Его минуты копятся в гостевом буфере, а
   * окно регистрации встаёт поверх тренировки по секундам движения.
   */
  const guest = Boolean(guestToken) && !me
  const guestRef = useRef(guest)
  guestRef.current = guest
  // Пороги окна — один раз на открытие (в разработке их можно уменьшить адресом).
  const thresholds = useRef(guestThresholds()).current
  // Открыть окно — из секундного тика, который не пересоздаётся: через ref.
  const openPromptRef = useRef<(kind: GuestPromptKind, moved: number) => void>(() => undefined)

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
  // Гостю — интервал из guest-bootstrap, а до ответа (или без него) — 30 с:
  // интервал, оставшийся в этом браузере от прошлого входа (хоть 15 с), к
  // гостю не относится — окно регистрации рассчитано на круг 3 × 30 с.
  const moveInterval =
    settings?.move_interval_seconds ?? (guest ? SECONDS_PER_MOVE : loadMoveInterval())
  // Мотивационных фраз над кругом больше нет (правка Димы 14.10.2026): их
  // место занял ряд потоков. Настройка motivation_enabled осталась на
  // сервере, но плеер её не читает.

  /* ─────────────  Бесплатный уровень  ───────────── */

  /**
   * Без оплаты открыты только первые несколько движений. Правило целиком
   * серверное — фронт его не придумывает, а получает в bootstrap.free_tier.
   * При grace всё открыто: доступ ещё не кончился.
   *
   * Первое значение — из ответа, который уже дождался охранник тренировки
   * (src/lib/trial.ts), а не местное «пять движений». Иначе у trial3d и
   * trial20 (все движения и 10) колода собиралась из пяти, а через секунду-три,
   * с ответом сервера, пересобиралась с нуля — и движение на экране менялось
   * само, в том числе сразу после «Вернуться в поток».
   */
  const [freeTier, setFreeTier] = useState<FreeTier>(
    () =>
      (guest ? lastGuestBootstrap(guestToken) : lastBootstrap(me?.user.id))?.free_tier ??
      DEFAULT_FREE_TIER,
  )
  const limited = !hasAccess(access)
  const accessRef = useRef(access)
  accessRef.current = access

  // Счётчик смен движения. Не заворачивается по кругу нарочно: по его
  // чётности выбирается, какой из двух <video> сейчас на виду.
  const [step, setStep] = useState(() => resume?.moveIndex ?? 0)
  // Ref — для обработчика ухода со страницы и пересборки порядка движений:
  // они не должны пересоздаваться на каждой смене движения.
  const stepRef = useRef(step)
  stepRef.current = step
  const [inMove, setInMove] = useState(() => resume?.moveSeconds ?? 0)
  /**
   * Идёт ли тренировка.
   *
   * Сама она идёт только сразу после отсчёта — это явный старт человека
   * (isStart в src/flow/FlowSession.tsx). Любое другое открытие плеера —
   * вкладка «Тренировка», логотип и «← На главную», «Вернуться в поток»,
   * «Назад», перезагрузка, повторный запуск мини-апа — встречает тренировку
   * на паузе: ролик и музыка стоят, кольцо и таймер замерли, под кругом
   * «Играть», а экран паузы не поднимается, как после его крестика.
   * Раньше плеер при каждом открытии начинал играть сам, и возвращение из
   * меню тут же снова запускало тренировку.
   *
   * Отсчёт мог закончиться и в спрятанной вкладке, а ОС — поднять выгруженную
   * вкладку в фоне. Тогда тренировка тоже не должна пойти сама: ждём «Играть».
   * То же — в свёрнутом мини-апе: для visibilityState он бывает «на виду».
   */
  const [playing, setPlaying] = useState(
    () => isStart(routeState) && document.visibilityState !== 'hidden' && telegramActive(),
  )
  // Старт одноразовый: «Назад» в эту же запись истории и перезагрузка
  // откроют плеер уже на паузе. Гасим после монтирования, а не при чтении:
  // StrictMode в разработке рисует плеер дважды, и второй раз должен увидеть
  // тот же старт.
  useEffect(() => spendStart(), [])
  /**
   * Заход начат: его продолжают или тренировка хоть раз пошла.
   *
   * Главная и вкладка «Тренировка» без идущей тренировки открывают плеер на
   * паузе, и заход заводит только первое «Играть» — это и есть явный старт,
   * сразу, без отсчёта. До него ничего не сохраняем: иначе лендинг и «Мой
   * прогресс» звали бы «Вернуться в поток» туда, где человек ещё не
   * двигался, а «Влиться в поток» теряло бы свой отсчёт.
   */
  const begun = useRef(resume !== null || playing)
  /**
   * Показан ли экран паузы.
   *
   * Отдельно от `playing`, потому что состояний три, а не два: тренировка
   * идёт; тренировка на паузе и поверх неё экран паузы; тренировка на паузе,
   * а экран закрыт крестиком — виден сам плеер со стоящим роликом и кнопкой
   * «Играть». «Вернусь позже» уводит из плеера в «Мой прогресс».
   */
  const [showPause, setShowPause] = useState(false)
  /**
   * Вьюха не пустила ролик без касания: Telegram на iPhone запускает медиа
   * только из обработчика жеста, а касание «Влиться в поток» до плеера могло
   * не дойти (открыли ссылкой, вошли после формы). Тогда тренировка стоит на
   * паузе, а в круге — кнопка «Нажмите, чтобы начать».
   */
  const [needTap, setNeedTap] = useState(false)
  // Вкладку свернули — движение не считается, даже если ролик крутится.
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden')

  // Цифры правой колонки. Серверная сводка — основа, к ней прибавляются
  // секунды и шаги, которые сервер ещё не видел (раздел 6.5 архитектуры).
  const [summary, setSummary] = useState<StatsSummary | null>(null)
  const [pendingSeconds, setPendingSeconds] = useState(0)
  const [pendingSteps, setPendingSteps] = useState(0)
  const [openSeconds, setOpenSeconds] = useState(0)

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

  // Движения этого захода — вместо шагов там, где шагов нет («Размять
  // спину»: stepsPerMinute 0 у всех движений). Засчитывается движение,
  // пройденное до конца: кольцо замкнулось и плеер сам сменил его на
  // следующее (nextMove). Начатое, но не законченное не считаем — иначе
  // «Играть» и сразу «Пауза» уже давали бы движение. Счёт живёт столько же,
  // сколько минуты захода: уходит в сохранённую тренировку, возвращается с
  // ней и обнуляется вместе с ними (renew).
  const movesRef = useRef(resume?.sessionMoves ?? 0)
  const [sessionMoves, setSessionMoves] = useState(movesRef.current)

  const {
    track,
    blocked: soundBlocked,
    soundOn,
    toggleSound,
    resumeNow: resumeMusic,
    pauseNow: pauseMusicNow,
    resetSoundForEntry,
    setPlaying: setMusicPlaying,
    next: nextTrack,
    selectStream: selectMusic,
  } = useMusic()
  // Кнопка звука выключила музыку — молчит и сигнал смены упражнения.
  const soundOnRef = useRef(soundOn)
  soundOnRef.current = soundOn

  // Каждый заход в поток — со звуком (Дима, Никита 07.10: «звук будет
  // всегда включаться»): новый вход, перезагрузка, возврат из «Моего
  // прогресса», гость по /play/. Выключенный кнопкой «Звук» живёт до конца
  // захода — пауза и окно гостя плеер не закрывают. Музыку с отсчёта сброс
  // не трогает: звук там уже включён. Второй сброс — при уходе из плеера
  // (ниже, вместе с остановкой музыки): «Влиться в поток» следующего захода
  // должно застать звук включённым. До отрисовки — чтобы кнопка не мелькнула
  // выключенной.
  useLayoutEffect(() => {
    resetSoundForEntry()
  }, [resetSoundForEntry])

  // Музыка потока — и когда плеер открыли мимо отсчёта: перезагрузка,
  // возврат в идущую тренировку спины. Плейлист тот же — музыка не прерывается.
  useLayoutEffect(() => {
    selectMusic(stream.id)
  }, [selectMusic, stream.id])

  /* ─────────────  Порядок движений  ───────────── */

  /**
   * Движения этого потока — то, из чего собирается колода. Без доступа
   * это первые exercise_limit движений: остальные закрыты оплатой.
   *
   * Поток не бесплатный (не free_tier.stream_code — «Спина» с 27.10.2026)
   * без доступа закрыт целиком — streamLocked в src/data/streams.ts. Тогда
   * движений нет вовсе, и на месте круга встаёт блок разблокировки, как при
   * нуле бесплатных. Сюда попадают только по старой ссылке или «Вернуться в
   * поток» после конца доступа: пилюля закрытого потока ведёт на тарифы
   * (openStream ниже), а ряд потоков над блоком остаётся — вернуться в
   * «Подвигаться» можно одним касанием.
   */
  const locked = streamLocked(stream.id, limited, freeTier)
  const moves = useMemo(
    () => (locked ? [] : limited ? stream.loops.slice(0, freeTier.exercise_limit) : stream.loops),
    [stream, locked, limited, freeTier.exercise_limit],
  )

  /**
   * Порядок движений — круг (createRotation в src/lib/deck.ts).
   *
   * Сначала все открытые движения по разу в случайном порядке, дальше —
   * тем же порядком по кругу: любое движение возвращается только после всех
   * остальных. Раньше каждый круг тасовался заново, и на стыке недавнее
   * движение приходило снова через одно-два — при пяти бесплатных казалось,
   * что крутятся три одних и тех же.
   *
   * Круг сквозной между тренировками: колоде отдаётся и история устройства
   * (src/lib/moveHistory.ts) — что человек делал в прошлых тренировках, —
   * поэтому новая тренировка начинает не со случайного порядка, а с
   * движений, которых давно не было. Внутри тренировки всё как прежде.
   *
   * Ещё не показанные движения идут так, чтобы соседние были разного вида
   * (kind: шаги, ноги, руки): почти половина каталога — шаги с разными
   * руками, и в чисто случайном порядке они шли по два-три подряд — тестер
   * видел, что «дублируется упражнение шагов вперёд» (27.09.2026). Сам круг
   * от этого не меняется: движение по-прежнему возвращается только после
   * всех остальных открытых.
   *
   * Уже выданные движения остаются в `list`: двойная буферизация видео
   * смотрит на шаг вперёд и через один, и эти взгляды не должны сдвигать
   * порядок — иначе «следующее» менялось бы на каждом рендере.
   */
  const orderRef = useRef<{ deck: Deck<Loop>; list: Loop[] } | null>(null)
  if (!orderRef.current) {
    // Возвращение в начатый заход: выданные движения восстанавливаем по
    // сохранённому порядку, чтобы человек увидел ровно то, на чём ушёл.
    // Незнакомый идентификатор обрывает восстановление — дальше колода
    // сдаёт сама (набор движений мог измениться вместе с доступом).
    // Круг продолжается с того же места: он помнит, что уже показывали, —
    // выданное в этом заходе идёт после истории и важнее её.
    const list: Loop[] = []
    for (const id of resume?.deck ?? []) {
      const found = moves.find((m) => m.id === id)
      if (!found) break
      list.push(found)
    }
    orderRef.current = {
      deck: createRotation(moves, { dealt: [...recentMoves(moves), ...list], kind: moveKind, family: (m) => m.family }),
      list,
    }
  }

  const moveAt = (n: number): Loop => {
    const order = orderRef.current as { deck: Deck<Loop>; list: Loop[] }
    while (order.list.length <= n) order.list.push(order.deck.next() ?? moves[0])
    return order.list[n]
  }

  /**
   * Движений может не быть вовсе: сервер вправе открыть бесплатно ноль
   * (FREE_EXERCISE_LIMIT=0). Тогда круга нет — на его месте блок
   * разблокировки, а таймер, куски и музыка стоят.
   */
  const empty = moves.length === 0

  /**
   * Блок разблокировки (src/components/Unlock.tsx) — одно место на экране.
   *
   * Открыты не все движения — плашка «Открой все 40» вверху, сразу под
   * карточкой музыки (правка заказчика 26.09.2026). Идёт trial3d и открыто
   * всё — прежний блок пробного периода на прежнем месте: в правой колонке,
   * на телефоне — последним в ленте статистики. Движений нет вовсе — блок
   * стоит на месте круга, и больше его нигде нет. С оплатой — нигде.
   *
   * Гость — свой блок (GuestUnlock, макет Димы 14.10.2026): «Открой весь
   * функционал Ритма!» с переходом на тарифы (toGuestTariffs), всё время, пока есть
   * движения. Он стоит над кругом, как верхняя плашка тарифов.
   */
  const opensAll = trialOpensAll(useTrial(), access)
  // Плашек воронки гостю нет: «Открыть» ведёт на тарифы и пишет метрику — и
  // то и другое требует входа. Его зовут к регистрации своё окно и свой блок.
  const topBanner = limited && !empty && !opensAll && !guest
  const sideUnlock = limited && !empty && opensAll && !guest
  const guestUnlock = guest && !empty

  const loop: Loop | null = empty ? null : moveAt(step)
  const nextLoop: Loop | null = empty ? null : moveAt(step + 1)
  const afterNext: Loop | null = empty ? null : moveAt(step + 2)

  // Сменили поток или набор движений (бесплатный уровень пришёл с сервера,
  // открылся доступ, кончился пробный период). На первом рендере порядок
  // уже собран выше, поэтому здесь сравниваем ключ: иначе ролик успевал бы
  // моргнуть при открытии плеера.
  //
  // Если движение на экране и всё показанное до него есть в новом наборе,
  // заход продолжается: текущее движение не меняется, круг помнит
  // показанное, и новые движения идут раньше повторов. Заглядывание вперёд
  // (step + 1, step + 2) отбрасываем — его пересчитают из нового набора.
  // Иначе (набор сузился и текущего движения в нём нет) — с нуля.
  // В обоих случаях колода помнит и историю устройства: круг сквозной и
  // тогда, когда бесплатный уровень пришёл с сервера уже после открытия.
  const [, setReorder] = useState(0)
  const deckKey = `${stream.id}:${moves.map((m) => m.id).join(',')}`
  const builtFor = useRef(deckKey)
  useEffect(() => {
    if (builtFor.current === deckKey) return
    builtFor.current = deckKey
    const shown = orderRef.current?.list.slice(0, stepRef.current + 1) ?? []
    const ids = new Set(moves.map((m) => m.id))
    if (shown.length > 0 && shown.every((m) => ids.has(m.id))) {
      orderRef.current = {
        deck: createRotation(moves, { dealt: [...recentMoves(moves), ...shown], kind: moveKind, family: (m) => m.family }),
        list: shown,
      }
      // Порядок живёт в ref: перерисовка нужна, чтобы следующий ролик во
      // втором <video> взялся уже из нового набора.
      setReorder((n) => n + 1)
      return
    }
    orderRef.current = { deck: createRotation(moves, { dealt: recentMoves(moves), kind: moveKind, family: (m) => m.family }), list: [] }
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

  // Буфер кусков — свой у каждого человека: плеер открыт только вошедшему.
  const userId = me?.user.id

  useEffect(() => {
    if (!userId && !guest) return
    const q = createChunkQueue({
      // Гость — null: куски копятся в гостевом буфере и ждут регистрации.
      userId: userId ?? null,
      onSummary: setSummary,
      // Доступ кончился прямо во время тренировки: перечитываем профиль —
      // плеер сам перейдёт на бесплатный уровень и покажет разблокировку.
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
  }, [userId, guest, recount, reload, closeChunk])

  // Один кусок на движение. Уборка эффекта закрывает его при смене движения,
  // паузе, сворачивании вкладки и уходе с экрана.
  const loopId = loop?.id
  useEffect(() => {
    if (!playing || !visible || !loopId) return
    openChunk(stream.id, loopId)
    const id = setInterval(() => {
      closeChunk()
      openChunk(stream.id, loopId)
    }, FORCE_CLOSE_MS)
    return () => {
      clearInterval(id)
      closeChunk()
    }
  }, [playing, visible, stream.id, loopId, openChunk, closeChunk])

  /**
   * Движение, которое человек действительно делал, — в историю устройства
   * (src/lib/moveHistory.ts): по ней следующая тренировка продолжит круг.
   * Один раз на шаг и только когда тренировка идёт: плеер, открытый на
   * паузе и закрытый без «Играть», ничего не показал. Шаг, на котором
   * человек вернулся в заход, уже записан в прошлый раз.
   */
  const rememberedStep = useRef(resume && loopId ? `${step}:${loopId}` : '')
  useEffect(() => {
    if (!playing || !loopId) return
    const key = `${step}:${loopId}`
    if (rememberedStep.current === key) return
    rememberedStep.current = key
    rememberMove(loopId)
  }, [playing, step, loopId])

  /**
   * Вкладка простояла спрятанной дольше, чем тренировка ждёт возвращения, —
   * это уже новый заход, ровно как после ухода из плеера на полчаса. Счёт
   * захода начинается с нуля, плеер остаётся на паузе. Прежний заход истёк
   * вместе с получасом, а новый, как и с главной, заведёт первое «Играть».
   */
  const hiddenAt = useRef<number | null>(visible ? null : Date.now())
  const renew = useCallback(() => {
    sessionRef.current = 0
    stepsRef.current = 0
    movesRef.current = 0
    setSessionSeconds(0)
    setSessionMoves(0)
    begun.current = false
  }, [])

  /**
   * Уход со страницы: закрываем кусок и пробуем отправить буфер. Не успеет —
   * не страшно, буфер лежит в localStorage и уйдёт при следующем открытии.
   *
   * Переключение на другую вкладку — это пауза, ровно такая же, как по
   * кнопке: ролик и музыка встают, счётчики секунд и шагов замирают, кусок
   * закрывается и уходит на сервер. Без неё счётчик захода тикал у скрытой
   * вкладки, а минуты за день — нет, и на экране паузы «в этом заходе»
   * расходилось с «сегодня» в разы.
   *
   * Экран паузы при этом не поднимаем: человек его не просил и не увидит,
   * пока не вернётся. Сама тренировка не возобновляется — вернувшись, он
   * жмёт «Играть».
   *
   * Спрятанная вкладка для сохранённой тренировки — тот же уход из плеера:
   * время ухода запоминаем, и правило получаса действует и здесь.
   *
   * Свёрнутый мини-ап (событие Telegram deactivated) — та же пауза: вьюха при
   * этом может остаться «на виду» для visibilityState, и visibilitychange не
   * приходит вовсе. Развернули (activated) — как возвращение на вкладку.
   *
   * Ролики и музыку останавливаем прямо в обработчике, а не эффектом после
   * перерисовки: свёрнутая вьюха перерисовки может и не дождаться, и трек
   * звучал бы в фоне. Экран тоже отпускаем сразу (src/media/keepAwake.ts).
   */
  const cameBack = useCallback(() => {
    const away = hiddenAt.current
    hiddenAt.current = null
    if (away !== null && Date.now() - away >= FLOW_RESUME_MINUTES * 60_000) renew()
  }, [renew])

  useEffect(() => {
    // keepalive: страница прячется или закрывается, и запрос должен дойти
    // без неё. Не дошёл — куски лежат в буфере и уйдут при следующем открытии.
    const leave = () => {
      closeChunk()
      void queueRef.current?.flush({ keepalive: true })
    }
    const goneAway = () => {
      // Пул — те же два элемента, что и `buffers` ниже: объявлены они позже.
      for (const video of videoPool()) pauseVideo(video)
      pauseMusicNow()
      releaseAwake()
      leave()
      hiddenAt.current ??= Date.now()
      setPlaying(false)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        goneAway()
        setVisible(false)
      } else {
        cameBack()
        setVisible(true)
      }
    }
    const offDeactivated = onTelegramEvent('deactivated', goneAway)
    const offActivated = onTelegramEvent('activated', () => {
      if (document.visibilityState !== 'hidden') cameBack()
    })
    window.addEventListener('pagehide', leave)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', leave)
      document.removeEventListener('visibilitychange', onVisibility)
      offDeactivated()
      offActivated()
    }
  }, [closeChunk, cameBack, pauseMusicNow])

  /** Ответ bootstrap — в плеер: настройки, цифры и бесплатный уровень. */
  const applyBoot = useCallback((data: PlayerBootstrap) => {
    setBoot(data.settings)
    setSummary(data.stats)
    if (data.free_tier) setFreeTier(data.free_tier)
  }, [])

  // Цифры при открытии плеера — из одного запроса. Не получилось (доступ
  // кончился между переходами) — берём хотя бы сводку: она открыта без оплаты.
  // Ответ общий с охранником тренировки (src/lib/trial.ts): если тот только
  // что спрашивал сервер о пробном периоде, второго запроса нет.
  //
  // Сервер и профиль разошлись в том, есть ли доступ (оплата пришла, а
  // профиль в памяти старый, или наоборот), — перечитываем профиль: доступ
  // плеера берётся из него.
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        // Гость — свой ответ без входа: та же форма, доступа и цифр нет.
        const data = await (guest && guestToken
          ? loadGuestBootstrap(guestToken)
          : userId
            ? loadBootstrap(userId)
            : api.playerBootstrap())
        if (!alive) return
        applyBoot(data)
        if (!guest && hasAccess(data.access) !== hasAccess(accessRef.current)) void reload()
      } catch {
        // Гостю сводку спрашивать не у кого: остаются нули и его буфер.
        if (guest) return
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
    // Один раз при открытии: человек за время жизни плеера не меняется.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Плеер закрылся — у trial20 мог подойти срок предложения тарифов: следующий вход
  // в тренировку спросит сервер заново, а не поверит старому ответу. (В
  // разработке StrictMode дёргает это и при открытии — лишний запрос, не беда.)
  useEffect(() => markTrialStale, [])

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
    // Гостю «сегодня» считает его буфер: сводка требует входа.
    if (guestRef.current) return
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
    // Гостю сверяться не с чем: сводка требует входа.
    if (guest) return
    const id = setInterval(() => {
      checkDay()
      void api
        .statsSummary()
        .then(setSummary)
        .catch(() => undefined)
    }, SYNC_MS)
    return () => clearInterval(id)
  }, [checkDay, guest])

  /* ─────────────  Ролики и таймер  ───────────── */

  // Два постоянных <video>: пока один играет, во второй уже качается
  // следующий ролик. Раньше элемент пересоздавался, и на медленной сети
  // круг пустел на несколько секунд при каждой смене движения.
  //
  // Сами элементы живут дольше плеера — в общем пуле (src/media/videoPool.ts):
  // во вьюхе Telegram на iPhone разрешение играть выдаётся элементу в касании,
  // и новый <video> застыл бы на первом кадре. Плеер их только вставляет в
  // круг и меняет им src; за всю жизнь страницы их ровно два.
  const buffers = videoPool()

  const active = ((step % 2) + 2) % 2
  const activeRef = useRef(active)
  activeRef.current = active

  /**
   * Отчёт о сбое ролика (src/api/playerFault.ts): по нему видно, какой
   * элемент, на каком движении и почему не пошёл. Не чаще раза в
   * FAULT_REPORT_MS за заход — сторож и отказ пуска часто приходят парой.
   */
  const faultAt = useRef<number | null>(null)
  const reportFault = useCallback(
    (kind: FaultContext['kind'], index: number) => {
      // POST /player/faults требует входа — гостю отчёт не шлём.
      if (guestRef.current) return
      const now = performance.now()
      if (faultAt.current !== null && now - faultAt.current < FAULT_REPORT_MS) return
      faultAt.current = now
      try {
        reportPlayerFault(
          describeVideoFault(buffers[index], {
            kind,
            buffer: index,
            step: stepRef.current,
            loopId: moveRef.current || null,
            immersive: immersiveRef.current,
          }),
        )
      } catch {
        /* диагностика не должна мешать тренировке */
      }
    },
    [buffers],
  )

  const moveProgress = Math.min(1, inMove / moveInterval)

  // Секундный тик заведён один раз на всю тренировку и не пересоздаётся при
  // смене движения, поэтому темп он берёт не из замыкания, а отсюда.
  const moveRef = useRef(loopId ?? '')
  useEffect(() => {
    moveRef.current = loopId ?? ''
  }, [loopId])

  // Движение меняется только само, по интервалу: кнопок «назад» и «вперёд»
  // в плеере больше нет — владелец счёл их бессмысленными.
  const nextMove = useCallback(() => {
    setStep((s) => s + 1)
    setInMove(0)
    // Зовёт его только секундный тик, когда кольцо замкнулось: движение
    // пройдено целиком.
    movesRef.current += 1
    setSessionMoves(movesRef.current)
    // Сигнал «смена упражнения» (src/media/chime.ts) — поверх музыки, тем же
    // путём (<audio>). Только при смене по интервалу: звучит на каждой смене,
    // начиная с первой на вторую, а на самом старте тренировки его нет.
    // Молчит, если тренировка на паузе, открыто окно гостя, звук выключен
    // кнопкой или вкладка спрятана.
    if (
      playingRef.current &&
      soundOnRef.current &&
      !promptRef.current &&
      document.visibilityState !== 'hidden'
    ) {
      playChime()
    }
  }, [])

  // Секундный тик: ведёт время тренировки, смену движения и открытый кусок.
  useEffect(() => {
    if (!playing || empty) return
    const id = setInterval(() => {
      sessionRef.current += 1
      setSessionSeconds(sessionRef.current)
      // Гость: секунды движения копятся в этом заходе (вкладке, src/lib/guest.ts),
      // по ним встаёт окно.
      // Положенное окно ждёт стыка движений — секунды, в которую ниже сменится
      // движение (Никита 12.10: окно после круга из 3 движений, не посреди
      // движения). Порог отсчитывается от показа, поэтому после первого же
      // окна график ровно по стыкам. Открываем до смены: так молчит её сигнал.
      if (guestRef.current) {
        const moved = addGuestMoved(1)
        const due = guestPromptDue(moved, thresholds)
        if (due && inMoveRef.current + 1 >= moveInterval) openPromptRef.current(due, moved)
      }
      stepsRef.current += stepRate(moveRef.current)
      if (openRef.current) {
        openRef.current.seconds += 1
        setOpenSeconds(openRef.current.seconds)
      }
      // Смена движения — отдельным шагом, а не внутри функции обновления
      // состояния: такие функции React в StrictMode вызывает дважды, и
      // движения перескакивали через одно.
      const next = inMoveRef.current + 1
      if (next >= moveInterval) {
        inMoveRef.current = 0
        nextMove()
      } else {
        inMoveRef.current = next
        setInMove(next)
      }
    }, 1000)
    return () => clearInterval(id)
  }, [playing, empty, nextMove, moveInterval])

  /**
   * Ролик и постер каждому из двух элементов: на виду — текущее движение,
   * под ним — следующее. Со сменой движения они меняются ролями, и src
   * получает только тот, что ушёл вниз: верхний уже докачан. До эффектов
   * ниже — чтобы пуск шёл уже с новым роликом и новый ролик к пуску был уже
   * на виду.
   */
  const firstId = (active === 0 ? loop : nextLoop)?.id
  const secondId = (active === 0 ? nextLoop : loop)?.id
  useLayoutEffect(() => {
    const ids = [firstId, secondId]
    buffers.forEach((video, i) => {
      video.className = `stage__video ${i === active ? 'is-on' : ''}`
      const id = ids[i]
      if (id) setVideoSource(video, loopSrc(id), loopPoster(id))
    })
  }, [buffers, active, firstId, secondId])

  /**
   * Круг забирает элементы пула к себе, а уходя — возвращает: вынимает из
   * DOM и останавливает, но не уничтожает. Под экраном паузы круг лишь
   * спрятан, и ролики остаются на месте.
   *
   * Сам круг запоминаем: сторож ролика возвращает в него элемент, если тот
   * вдруг оказался вне круга.
   */
  const discRef = useRef<HTMLDivElement | null>(null)
  const mountVideos = useCallback(
    (disc: HTMLDivElement | null) => {
      discRef.current = disc
      for (const video of buffers) {
        if (disc) {
          disc.appendChild(video)
        } else {
          pauseVideo(video)
          video.remove()
        }
      }
    },
    [buffers],
  )

  /*
   * Пуск ролика на виду. Пауза останавливает ролик, чтобы персонаж замирал
   * вместе с таймером. Скрытый элемент всегда на паузе: он в это время
   * докачивает следующее.
   *
   * Новое движение начинается с начала цикла — как раньше, когда элемент
   * пересоздавался заново. Перемотка и пуск — в одном эффекте и именно в
   * таком порядке: сначала currentTime, потом play() в следующем кадре, когда
   * новый ролик уже на виду (класс is-on ставит эффект раскладки выше).
   * Раньше это были два эффекта с разными зависимостями, и пуск мог
   * разойтись с перемоткой. Перематываем только при смене движения:
   * «Продолжить» возвращает ролик с той же секунды.
   *
   * Вьюха отказала в пуске без касания (NotAllowedError) — тренировка встаёт
   * на паузу и ждёт «Нажмите, чтобы начать». Иначе таймер, куски и шаги шли
   * бы, пока персонаж стоит на первом кадре: их ведёт playing, а не ролик.
   * Прочие отказы (AbortError и другие) пул запоминает, и разбирается с ними
   * сторож ниже: он увидит стоящий ролик и перезапустит его.
   */
  const rewoundFor = useRef('')
  useEffect(() => {
    const on = buffers[active]
    pauseVideo(buffers[1 - active])
    const move = `${active}:${loopId ?? ''}`
    if (rewoundFor.current !== move) {
      rewoundFor.current = move
      // Уже в начале — не трогаем: лишняя перемотка перед пуском ни к чему.
      if (on.currentTime > 0) on.currentTime = 0
    }
    if (!playing || empty) {
      pauseVideo(on)
      return
    }
    let alive = true
    const frame = requestAnimationFrame(() => {
      playVideo(on).catch((error: unknown) => {
        if (!alive || !isNotAllowed(error)) return
        reportFault('video_not_allowed', active)
        setPlaying(false)
        setNeedTap(true)
      })
    })
    return () => {
      alive = false
      cancelAnimationFrame(frame)
    }
  }, [buffers, playing, empty, active, loopId, reportFault])

  /**
   * Сторож ролика (watchVideo в src/media/videoPool.ts). Кольцо, таймер и
   * «Пауза» идут по playing, а не по ролику, поэтому ролик, не пошедший
   * после смены движения, стоял на кадре, пока тренировка будто шла.
   *
   * Пока тренировка идёт и вкладка на виду, сторож следит, что ролик на виду
   * действительно играет, и перезапускает застрявший. Не пошёл и после
   * перезагрузки (или браузер требует касания) — тренировка встаёт на паузу,
   * а в круге кнопка «Нажмите, чтобы начать»: касание разблокирует оба
   * элемента и запустит ролик.
   */
  useEffect(() => {
    if (!playing || empty || !visible) return
    return watchVideo(buffers[active], {
      // Видимость, если вдруг потерялась: is-on — только у ролика на виду, и
      // оба элемента — в круге.
      show: () => {
        const disc = discRef.current
        buffers.forEach((video, i) => {
          video.classList.toggle('is-on', i === active)
          if (disc && video.parentNode !== disc) disc.appendChild(video)
        })
      },
      giveUp: () => {
        reportFault('video_giveup', active)
        setPlaying(false)
        setNeedTap(true)
      },
    })
  }, [buffers, playing, empty, visible, active, loopId, reportFault])

  // Пауза тренировки останавливает и музыку. Без движений играть нечему.
  useEffect(() => {
    setMusicPlaying(playing && !empty)
  }, [playing, empty, setMusicPlaying])

  /**
   * Экран не гаснет, пока тренировка идёт (src/media/keepAwake.ts): иначе
   * через полминуты без касаний телефон гасил экран, вкладка пряталась, и
   * тренировка вставала на паузу посреди захода. Сам экран берут касания —
   * «Влиться в поток», «Играть», «Продолжить», — здесь это подтверждение.
   * Пауза, уход из плеера и открытие плеера на паузе экран отпускают.
   */
  useEffect(() => {
    if (!playing || empty) {
      releaseAwake()
      return
    }
    holdAwake()
    return releaseAwake
  }, [playing, empty])

  /**
   * Уход из плеера тоже останавливает музыку: человек ушёл в меню, а не
   * остался в потоке. Трек при этом не перематывается — вернувшись, он
   * продолжится с той же секунды и с плавным входом.
   *
   * Ролики останавливает сам круг, возвращая элементы в пул (mountVideos).
   *
   * Здесь же звук снова включается для следующего захода — в одном
   * обработчике с остановкой, одной перерисовкой: включение без остановки
   * на миг запустило бы трек уже без касания, на другом экране.
   */
  useEffect(
    () => () => {
      setMusicPlaying(false)
      resetSoundForEntry()
    },
    [setMusicPlaying, resetSoundForEntry],
  )

  // Следующий ролик уже лежит во втором <video>, поэтому вперёд заглядываем
  // через один: к его очереди файл успеет докачаться.
  const afterNextId = afterNext?.id
  useEffect(() => {
    if (!afterNextId) return
    prefetchImages([loopPoster(afterNextId)])
    prefetchFiles([loopSrc(afterNextId)])
  }, [afterNextId])

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

  // Секунды внутри движения — в ref (шаг — выше, рядом с его состоянием):
  // их читает обработчик ухода со страницы, а он не должен пересоздаваться
  // каждую секунду.
  const inMoveRef = useRef(inMove)
  inMoveRef.current = inMove

  /**
   * Запомнить тренировку. pausedAt = null, пока плеер открыт; при уходе
   * ставим время — с него пойдут те самые тридцать минут. Заход ещё не начат
   * (begun выше) — запоминать нечего.
   */
  const store = useCallback(
    (pausedAt: number | null) => {
      if (!begun.current) return
      saveFlow({
        streamId: stream.id,
        sessionSeconds: sessionRef.current,
        sessionSteps: Math.round(stepsRef.current),
        sessionMoves: movesRef.current,
        deck: (orderRef.current?.list ?? []).map((l) => l.id),
        moveIndex: stepRef.current,
        moveSeconds: inMoveRef.current,
        pausedAt,
      })
    },
    [saveFlow, stream.id],
  )

  // Плеер открылся: продолжаем начатое, а после отсчёта начинаем новый
  // заход. Новый заход стирает прошлый — в том числе чужого потока. Открыли
  // на паузе без идущей тренировки — заход заведёт первое «Играть».
  useEffect(() => {
    if (resume) store(null)
    else if (begun.current) beginFlow(stream.id)
    // Ровно один раз на открытие плеера: дальше состояние ведут эффекты ниже.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Каждая пауза, смена движения и скрытие вкладки — повод переписать
  // состояние. Спрятанная вкладка хранит время ухода: иначе пауза при
  // скрытии тут же затёрла бы его, и тридцать минут не шли бы.
  useEffect(() => {
    store(visible ? null : (hiddenAt.current ?? Date.now()))
  }, [playing, step, visible, store])

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

  /**
   * Вернулись в приложение, пока тренировка на паузе (src/lib/appReturn.ts):
   * человек мог оплатить доступ в браузере. Профиль, а с ним и доступ,
   * перечитывает SessionProvider; здесь — bootstrap: бесплатный уровень,
   * настройки и цифры. Доступ стал полным — колода пересоберётся, на паузе
   * это не мешает. Идущую тренировку не трогаем: движение не должно
   * смениться посреди захода.
   */
  useEffect(() => {
    if (!userId) return
    let alive = true
    const off = onAppReturn(() => {
      if (playingRef.current) return
      loadBootstrap(userId, 0).then(
        (data) => {
          if (alive) applyBoot(data)
        },
        () => undefined,
      )
    })
    return () => {
      alive = false
      off()
    }
  }, [userId, applyBoot])

  /**
   * «Вернусь позже» ждёт отправку минут (leaveToProgress ниже). За это время
   * человек мог передумать — «Продолжить» и крестик переход отменяют, уход из
   * плеера тоже.
   */
  const leaving = useRef(false)
  useEffect(
    () => () => {
      leaving.current = false
    },
    [],
  )

  /* ─────────────  Тренировка на весь экран (телефон)  ───────────── */

  /**
   * На телефоне касание кружка уводит тренировку на весь экран (правка
   * заказчика 30.09.2026). «Погружённый» вид: нижнее меню и логотип
   * прячутся, круг растёт во всю ширину, а трек, звук, пауза и счётчики
   * остаются (Player.css, .player--immersive). Поверх — системный режим:
   * полноэкранный Telegram или браузер на Android (src/lib/fullscreen.ts);
   * нет его — хватает и этого вида.
   *
   * Выход: «Свернуть»; пауза — экран паузы всегда в обычном виде, а
   * «Продолжить сейчас» возвращает на весь экран; уход из плеера; выход
   * из системного режима самим человеком. Спрятанная вкладка и свёрнутый
   * мини-ап вид не снимают: вернувшись, человек видит тренировку на паузе,
   * и под рукой и «Играть», и «Свернуть». На десктопе и планшете этого нет.
   */
  const phone = usePhoneScreen()
  const [immersive, setImmersive] = useState(false)
  // Для обработчиков касаний: они не должны пересоздаваться при смене вида.
  const immersiveRef = useRef(false)
  /** Пауза поставлена с «весь экран»: «Продолжить сейчас» вернёт туда же. */
  const backToImmersive = useRef(false)

  /** Весь экран. Звать в касании и синхронно: системный режим просит жест. */
  const enterImmersive = useCallback(() => {
    if (!immersiveRef.current) {
      immersiveRef.current = true
      setImmersive(true)
      // Шапка ушла, круг вырос — тренировку показываем с самого верха.
      window.scrollTo(0, 0)
    }
    // И когда вид уже включён: спрятанной вкладке система режим снимает,
    // и следующее касание просит его снова. Включённый не трогается.
    openFullscreen()
  }, [])

  /** Обычный вид с меню. Системный режим снимается, только если включали его мы. */
  const leaveImmersive = useCallback(() => {
    immersiveRef.current = false
    setImmersive(false)
    closeFullscreen()
  }, [])

  // Человек сам вышел из системного режима («Назад» на Android, меню
  // Telegram) — весь экран закончился, показываем обычный вид.
  useEffect(
    () =>
      onFullscreenLost(() => {
        backToImmersive.current = false
        immersiveRef.current = false
        setImmersive(false)
      }),
    [],
  )

  // Уход из плеера — уход и из системного режима: прогресс, настройки и
  // остальные экраны на весь экран не рассчитаны.
  useEffect(() => closeFullscreen, [])

  // Круга больше нет (движений не осталось) или экран перестал быть
  // телефоном (окно стало шире) — обычный вид: правила раскладки «весь
  // экран» есть только у телефона, и без круга в нём делать нечего.
  useEffect(() => {
    if (immersive && (!phone || empty)) leaveImmersive()
  }, [immersive, phone, empty, leaveImmersive])

  /**
   * Снять паузу: «Играть», пробел, «Продолжить сейчас» на экране паузы,
   * «Нажмите, чтобы начать» в круге и на телефоне — касание самого кружка.
   *
   * Всё это — касание, и первой строкой идёт разблокировка медиа, пока
   * WebKit ещё считает его жестом. Следом, в том же касании, запускаем ролик
   * на виду; музыку, которую раньше не пустили, разблокировка запускает сама.
   * В том же касании — и запрет гасить экран (src/media/keepAwake.ts): замок
   * экрана Safari даёт только из жеста, а запасное видео со звуковой
   * дорожкой без жеста не пускают вьюхи.
   *
   * fullscreen — касание кружка: на телефоне тренировка уходит на весь экран.
   */
  const continueFlow = useCallback((fullscreen = false) => {
    unlockMedia()
    keepAwake()
    // Весь экран — тоже в этом касании, сразу за разблокировкой и до любой
    // перерисовки: системный полноэкранный режим дают только из жеста.
    // Просит его касание кружка, а «Играть» и «Продолжить сейчас» лишь
    // возвращают туда, где тренировка была: на весь экран, если с него ушли
    // на паузу или прятали вкладку. Сравнение с true — строгое: обработчик
    // кнопки мог бы передать сюда событие касания.
    if ((fullscreen === true || immersiveRef.current || backToImmersive.current) && isPhoneScreen()) {
      enterImmersive()
    }
    backToImmersive.current = false
    // Передумал уходить в «Мой прогресс» — переход отменяется.
    leaving.current = false
    // Касание — значит, человек вернулся, даже если Telegram не прислал
    // activated после deactivated: правило получаса считаем здесь.
    if (hiddenAt.current !== null && document.visibilityState !== 'hidden') cameBack()
    setNeedTap(false)
    void playVideo(buffers[activeRef.current]).catch(() => undefined)
    // Музыку — тоже в касании, а не эффектом после перерисовки: после
    // сворачивания вьюхи iPhone пуск без жеста мог и не пустить.
    resumeMusic()
    // Первое «Играть» без идущей тренировки — явный старт нового захода:
    // сразу, без отсчёта (отсчёт — у «Влиться в поток»). Сохранит его эффект
    // выше, когда увидит, что тренировка пошла.
    if (!begun.current) {
      begun.current = true
      beginFlow(stream.id)
    }
    setShowPause(false)
    setPlaying(true)
  }, [buffers, resumeMusic, beginFlow, stream.id, cameBack, enterImmersive])

  /**
   * Кнопка звука. Всё — в самом касании, и решает сам проигрыватель
   * (toggleSound в src/music/MusicProvider.tsx): играет — pause() сразу;
   * выключен — play() прямо в обработчике, иначе iPhone и вьюха Telegram его
   * не пустят; должен играть, но браузер не пустил (soundBlocked) —
   * нажатие запускает его, а не выключает.
   *
   * Заодно касание разблокирует ролики и сигнал смены упражнения (после
   * сворачивания мини-апа разрешение могло потеряться). Не музыку:
   * разблокировка музыки (unlockMedia) в том же касании спорила бы с
   * кнопкой — выключаемый трек она запускала бы снова.
   */
  const soundPlaying = soundOn && !soundBlocked
  const pressSound = useCallback(() => {
    unlockVideos()
    unlockChime()
    toggleSound()
  }, [toggleSound])

  const toggle = useCallback(() => {
    if (playingRef.current) {
      // Пауза — тоже касание: если музыку раньше не пустили, разблокировка
      // даст ей разрешение, и «Продолжить» запустит её уже без отказа.
      unlockMedia()
      // Экран паузы — всегда в обычном виде: весь экран снимаем сразу, в
      // этом же касании, чтобы он не мелькнул поверх экрана паузы.
      // «Продолжить сейчас» вернёт тренировку на весь экран.
      if (immersiveRef.current) {
        backToImmersive.current = true
        leaveImmersive()
      }
      setPlaying(false)
      setShowPause(true)
    } else {
      continueFlow()
    }
  }, [continueFlow, leaveImmersive])

  /**
   * Касание кружка на телефоне — тренировка на весь экран. На паузе это
   * ещё и «Играть»: касание запускает тренировку, как кнопка. Идёт —
   * только весь экран, без паузы: кружок — большая мишень, задеть его
   * посреди движения легко. На десктопе кружок касаний не ловит.
   */
  const pressCircle = useCallback(() => {
    if (!isPhoneScreen()) return
    if (playingRef.current) enterImmersive()
    else continueFlow(true)
  }, [continueFlow, enterImmersive])

  /** «Свернуть» — обычный вид с меню. Тренировка при этом идёт дальше. */
  const collapse = useCallback(() => {
    backToImmersive.current = false
    leaveImmersive()
  }, [leaveImmersive])

  /**
   * Крестик на экране паузы.
   *
   * Закрывает экран и оставляет человека в плеере на паузе: ролик и музыка
   * стоят, кнопка зовёт «Играть». Тренировка при этом продолжается —
   * закончить её нельзя ни одной кнопкой, она сама истекает через полчаса.
   *
   * Открытый кусок закрыл эффект паузы; здесь остаётся отправить буфер, не
   * дожидаясь склейки, — минуты этого захода уйдут на сервер сразу.
   */
  const closePause = useCallback(() => {
    leaving.current = false
    // Плеер на паузе — в обычном виде, с меню: весь экран остался в прошлом.
    backToImmersive.current = false
    closeChunk()
    void queueRef.current?.flush()
    setShowPause(false)
  }, [closeChunk])

  /**
   * «Вернусь позже» — в «Мой прогресс»: человек закончил подход и хочет
   * увидеть свои минуты, а не снова плеер (правка тестера 27.09.2026).
   *
   * Буфер отправляем сразу и ждём отправку, но не дольше PROGRESS_WAIT_MS:
   * «Мой прогресс» спрашивает цифры сразу при открытии, и минуты этого захода
   * должны быть на сервере раньше — иначе их там не было видно. Не успело —
   * всё равно уходим: неотправленное «Мой прогресс» прибавит к «Сегодня» сам.
   * «Продолжить» или крестик за это время переход отменяют.
   *
   * Тренировка не заканчивается: уход из плеера запоминает её (эффекты
   * выше), и полчаса «Вернуться в поток» ведёт обратно сюда.
   */
  const leaveToProgress = useCallback(() => {
    if (leaving.current) return
    leaving.current = true
    closeChunk()
    const sent = queueRef.current?.flush() ?? Promise.resolve()
    const waited = new Promise<void>((resolve) => window.setTimeout(resolve, PROGRESS_WAIT_MS))
    void Promise.race([sent, waited]).then(() => {
      if (!leaving.current) return
      leaving.current = false
      navigate('/progress')
    })
  }, [closeChunk, navigate])

  /* ─────────────  Гость: окно регистрации  ───────────── */

  // Первый настоящий пуск тренировки гостем — один на браузер (src/lib/guest.ts).
  useEffect(() => {
    if (guest && playing && guestToken) reportGuestStart(guestToken)
  }, [guest, playing, guestToken])

  const [prompt, setPrompt] = useState<GuestPromptKind | null>(null)
  const promptRef = useRef<GuestPromptKind | null>(null)
  promptRef.current = prompt

  /**
   * Окно встаёт поверх тренировки и ставит её на паузу без экрана паузы:
   * таймер, ролик и музыка стоят, кусок закрывается (эффекты по playing).
   * Когда следующее окно, запоминает src/lib/guest.ts.
   */
  const openPrompt = useCallback(
    (kind: GuestPromptKind, moved: number) => {
      if (!guestToken || promptRef.current) return
      markGuestPromptShown(kind, moved, thresholds)
      promptRef.current = kind
      setShowPause(false)
      setPlaying(false)
      setPrompt(kind)
      reportGuest(guestToken, 'prompt_shown', kind)
    },
    [guestToken, thresholds],
  )
  openPromptRef.current = openPrompt

  /**
   * Крестик, Esc и «Продолжить без регистрации». Это касание: тренировка
   * продолжается сразу, с разблокировкой медиа в том же обработчике.
   */
  const closePrompt = useCallback(() => {
    const kind = promptRef.current
    if (!kind) return
    promptRef.current = null
    setPrompt(null)
    if (guestToken) reportGuest(guestToken, 'prompt_close', kind)
    continueFlow()
  }, [continueFlow, guestToken])

  /**
   * На тарифы (владелец, 21.10.2026; раньше — сразу на регистрацию). Один
   * общий переход для всех «Попробовать…» гостя: кнопки блока на экране и
   * обеих кнопок окна — полного и короткого, чтобы они не разъехались.
   * Первой карточкой на тарифах у гостя trial3d стоит «3 дня бесплатно»
   * (TariffPlans): она ведёт на регистрацию и обратно в плеер, платные — на
   * регистрацию и потом на оплату.
   *
   * Токен воронки запоминаем здесь, до ухода: регистрация с тарифов должна
   * его получить, а стереть его могла другая ссылка (/go без гостя снимает
   * пометку гостя). По нему же тарифы решают, показывать ли бесплатную
   * карточку.
   *
   * Крестик тарифов — «Назад» в эту запись истории: плеер откроется на
   * паузе (старт одноразовый, spendStart), а счёт секунд и показанные окна
   * лежат в sessionStorage вкладки (src/lib/guest.ts) и никуда не денутся.
   *
   * Блок зовёт переход напрямую, без события: prompt_cta бэкенд принимает
   * только с видом окна (kind full/short).
   */
  const toGuestTariffs = useCallback(() => {
    if (!guestToken) return
    saveFunnelToken(guestToken, true)
    navigate(GUEST_TARIFFS_PATH)
  }, [guestToken, navigate])

  /**
   * Нажали включённый поток в ряду над кругом (src/components/StreamSwitcher.tsx):
   * с 27.10.2026 это «Размять спину» из кардио или «Подвигаться» из спины.
   *
   * Вошедшего — на отсчёт нового потока, как с главной: /start/<id> заведёт
   * новый заход, а плеер откроется заново со своим набором движений. Музыка
   * и счёт минут при этом те же: отсчёт включает общий проигрыватель, а
   * куски уходят на сервер с кодом нового потока. У гостя адрес /play/<токен>
   * без потока — ему поток откроется после регистрации, поэтому ведём туда
   * же, куда «Открой весь функционал Ритма!».
   *
   * Поток закрыт этому человеку (без оплаты открыт только бесплатный,
   * streamLocked) — сразу на тарифы, как кнопка «Открыть» блока
   * разблокировки: отсчёт, после которого вместо круга замок, только злил
   * бы. В мини-апе тарифы — во внешнем браузере: платить в Telegram нельзя.
   */
  const inTelegram = useInTelegram()
  const openStream = useCallback(
    (id: string) => {
      if (guest) toGuestTariffs()
      else if (streamLocked(id, limited, freeTier)) {
        if (inTelegram) openTariffsOnSite()
        else navigate('/tariffs')
      } else {
        // Музыка нового потока — здесь же, в касании: новый трек встаёт и
        // разгорается, пока WebKit ещё считает это жестом. Отсчёт её не
        // прервёт — общий проигрыватель играет и через смену экрана.
        selectMusic(id)
        navigate(`/start/${id}`)
      }
    },
    [guest, toGuestTariffs, limited, freeTier, inTelegram, navigate, selectMusic],
  )

  /** «Попробовать…» в окне: событие prompt_cta с видом окна — и на тарифы. */
  const promptCta = useCallback(() => {
    const kind = promptRef.current
    if (!guestToken || !kind) return
    reportGuest(guestToken, 'prompt_cta', kind)
    toGuestTariffs()
  }, [guestToken, toGuestTariffs])

  /** «Вернусь позже» у гостя: «Мой прогресс» требует входа — вместо него окно. */
  const laterGuest = useCallback(() => {
    openPrompt(guestFullShown() ? 'short' : 'full', guestMoved())
  }, [openPrompt])

  // Пока стоит экран паузы, плеер спрятан, и фокус с его кнопки пропадал бы
  // в никуда. Экран паузы забирает фокус себе, а закрываясь, возвращает его
  // на кнопку паузы.
  const pauseButton = useRef<HTMLButtonElement>(null)
  const pauseWasShown = useRef(false)
  useEffect(() => {
    if (showPause) {
      pauseWasShown.current = true
      return
    }
    if (!pauseWasShown.current) return
    pauseWasShown.current = false
    pauseButton.current?.focus({ preventScroll: true })
  }, [showPause])

  // Пробел — та же пауза, что и кнопка. Когда в фокусе кнопка или поле,
  // пробел уже что-то значит для них: второй раз его перехватывать нельзя.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return
      // Открыто окно гостя — пробел принадлежит ему.
      if (promptRef.current) return
      const el = document.activeElement
      if (el instanceof HTMLElement && (el.isContentEditable || /^(BUTTON|INPUT|TEXTAREA|SELECT|A)$/.test(el.tagName))) return
      e.preventDefault()
      toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])

  /* ─────────────  Цифры для правой колонки  ───────────── */

  /** Пояснение к «Время в движении сегодня»: раскрывается прямо в карточке. */
  const [timeNote, setTimeNote] = useState(false)
  const timeNoteId = useId()

  const todaySeconds = (summary?.today_seconds ?? 0) + pendingSeconds + openSeconds
  const week = summary?.week ?? emptyWeek()
  const isToday = (date: string) => date === (summary?.local_today ?? week[week.length - 1].local_date)
  const weekSeconds = week.map((d) => (isToday(d.local_date) ? todaySeconds : d.seconds))
  const weekMinutes = weekSeconds.map(toMinutes)
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
  const todaySteps = todayServerSteps + pendingSteps + (loopId ? stepsFor(loopId, openSeconds) : 0)
  // Поток без шагов — у всех его движений темп 0 («Размять спину»): вместо
  // шагов, которые там всегда ~0, карточка и пауза показывают движения захода.
  const countsMoves = stream.loops.every((l) => l.stepsPerMinute === 0)

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
        className={`player ${notice ? 'player--notice' : ''} ${sideUnlock ? 'player--locked' : ''} ${topBanner || guestUnlock ? 'player--banner' : ''} ${guestUnlock ? 'player--guest-banner' : ''} ${immersive ? 'player--immersive' : ''}`}
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
            они занимали, отдано кругу. В колонке остались логотип и меню —
            панель вкладок, общая с «Прогрессом», «Профилем», «Настройками»
            и «Помощью» (src/components/TabBar.tsx). Здесь текущая вкладка —
            «Тренировка»; где панель стоит, решает сетка плеера (.side__menu). */}
        <TabBar current="workout" className="side__menu" guest={guest} />
      </aside>

      {/* ——— Центр ——— */}
      <main className="player__stage">
        {/* Ряд потоков вместо мотивационных фраз (макет Димы 14.10.2026):
            активный — тот, что играет, остальные серые «скоро». Тот же ряд у
            вошедшего, у гостя по /play/ и в мини-апе Telegram. Высота блока
            жёсткая (Player.css, --switch-h) — от неё считается круг. */}
        <header className="stage__top">
          <StreamSwitcher current={stream.id} onOpen={openStream} />
        </header>

        {/* Круг и кнопка паузы лежат в одной обёртке: от неё считается и
            угол квадрата, и строка под кругом. */}
        <div className="stage__area">
        {loop && nextLoop ? (
        <>
        {/* На телефоне кружок — ещё и кнопка: касание уводит тренировку на
            весь экран (pressCircle). На десктопе он касаний не ловит. */}
        <div
          className={`stage__figure${phone ? ' is-tappable' : ''}`}
          onClick={phone ? pressCircle : undefined}
        >
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

          {/* Ролики — два элемента пула: их вставляет mountVideos, React
              внутрь круга ничего не рисует. */}
          <div className="stage__disc" ref={mountVideos} />

          {/* Вьюха не пустила ролик без касания: кнопка — часть круга, не
              окно, и уходит с первым же нажатием. */}
          {needTap && (
            <div className="stage__tap">
              {/* Кнопка лежит в кружке, и касание её — касание кружка: на
                  телефоне тренировка тоже уходит на весь экран. Дальше к
                  кружку касание не идёт, иначе запуск случился бы дважды. */}
              <button
                type="button"
                className="btn btn--pink-lg stage__tap-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  continueFlow(true)
                }}
              >
                <Play size={22} />
                Нажмите, чтобы начать
              </button>
            </div>
          )}

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
        {/*
          Звук: зеркально паузе — в левом нижнем углу квадрата вокруг круга
          или слева в строке под кругом. Состояние видно сразу: динамик с
          волнами на яркой кнопке — музыка играет; перечёркнутый на белой с
          подписью «Включить звук» — выключен кнопкой (до конца захода:
          следующий начнётся со звуком) или браузер его не пустил (тогда
          кнопка ещё и пульсирует).
        */}
        <div className="stage__sound">
          <button
            type="button"
            className={`ctrl ctrl--sound ${soundPlaying ? 'is-on' : ''} ${soundOn && soundBlocked ? 'is-blocked' : ''}`}
            onClick={pressSound}
            aria-pressed={soundPlaying}
            aria-label={soundPlaying ? 'Выключить звук' : 'Включить звук'}
          >
            {soundPlaying ? <SpeakerOn size={28} /> : <SpeakerOff size={28} />}
          </button>
          <span>{soundPlaying ? 'Звук' : 'Включить звук'}</span>
        </div>

        <div className="stage__pause">
          <span>{playing ? 'Пауза' : 'Играть'}</span>
          <button
            ref={pauseButton}
            className="ctrl ctrl--main"
            onClick={toggle}
            aria-label={playing ? 'Пауза' : 'Играть'}
          >
            {playing ? <Pause size={30} /> : <Play size={30} />}
          </button>
        </div>
        </>
        ) : (
          // Бесплатно не открыто ни одного движения или весь поток закрыт
          // (streamLocked): вместо круга — вход в тарифы. Ни вверху, ни в
          // правой колонке его тогда не дублируем.
          <div className="stage__empty">{limited && <Unlock place="player" />}</div>
        )}
        </div>
      </main>

      {/* ——— Правая колонка ——— */}
      <aside className="player__stats">
        <div className="stats__top">
          <button
            className={`track ${soundPlaying ? '' : 'track--muted'}`}
            onClick={() => {
              // Звук выключен или его не пустили — карточка включает звук
              // (как кнопка у круга), а не листает трек молча.
              if (!soundPlaying) {
                pressSound()
                return
              }
              // Следующий трек ставится и запускается в этом же касании
              // (next в src/music/MusicProvider.tsx). Разблокируем только
              // ролики: трек, который сейчас сменится, запускать незачем.
              unlockVideos()
              nextTrack()
            }}
            title={soundPlaying ? 'Следующий трек' : 'Включить звук'}
          >
            <span className="track__icon">
              <MusicNote size={19} />
            </span>
            <span className="track__text">
              <strong>{track.title}</strong>
              <span>{soundPlaying ? track.artist : 'нажмите, чтобы включить звук'}</span>
            </span>
          </button>
        </div>

        {/* Призыв к регистрации гостя и плашка тарифов стоят сразу под
            карточкой музыки. На планшете и телефоне это отдельный ряд над
            кругом; в ландшафте — верх правой колонки. */}
        {(topBanner || guestUnlock) && (
          <div className="player__banner">
            {guestUnlock ? <GuestUnlock onCta={toGuestTariffs} /> : <Unlock place="player" />}
          </div>
        )}

        {/* Время за сегодня и неделя одной карточкой: раньше это были два
            блока с одной и той же цифрой в разном виде. */}
        <section className={`stat stat--accent stat--chart ${timeNote ? 'has-note' : ''}`}>
          <header className="stat__head">
            <span>Время в движении сегодня</span>
            {/* Знак (i) раньше был картинкой и на касание не отвечал. Теперь
                это кнопка: раскрывает и прячет пояснение строкой прямо в
                карточке — окон поверх экрана в продукте нет. */}
            <button
              type="button"
              className="stat__info"
              aria-expanded={timeNote}
              aria-controls={timeNoteId}
              aria-label={timeNote ? 'Скрыть пояснение' : 'Что считается во времени в движении'}
              onClick={() => setTimeNote((open) => !open)}
            >
              <Info size={15} />
            </button>
          </header>
          <p id={timeNoteId} className="stat__note" hidden={!timeNote}>
            Считаются минуты, когда вы двигаетесь в плеере. Пауза и другие вкладки не считаются.
            День — по вашему часовому поясу.
          </p>
          <strong className="stat__big">{mmss(todaySeconds)}</strong>
          <div className="week">
            {week.map((d, i) => {
              const today = isToday(d.local_date)
              const time = weekSeconds[i] > 0 ? durationTight(weekSeconds[i]) : null
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
                      столбце цифр читается как результат, а его не было. Заход
                      короче минуты — «<1 мин»: секунды в такую колонку не
                      влезают, но и нулём этот день называть нельзя.
                      Единица стоит у каждого дня: голые цифры под столбиками
                      непонятно что значат. В узкой колонке она уходит строкой
                      ниже — это решает CSS, разметка одна. */}
                  <span className={`week__min ${today ? 'is-today' : ''}`}>
                    {time ? (
                      <>
                        {time.value} <span className="week__unit">{time.unit}</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        </section>

        {/* Шаги те же, что на экране паузы: один счётчик, одна величина.
            «Сегодня» стоит в заголовке, поэтому под цифрой его нет: дважды
            одно и то же в одной карточке только путает. В потоке без шагов
            (спина) — движения захода: «сегодня» нет, их считает только
            этот заход, а «~» нет, потому что это точный счёт. */}
        <section className="stat">
          <header className="stat__head">
            <span>{countsMoves ? 'Движений сделано' : 'Шагов набрано сегодня'}</span>
          </header>
          <div className="stat__row">
            <span className="stat__steps">
              {/* «~» у шагов здесь и везде: их мы оцениваем по темпу движения. */}
              <strong className="stat__mid">{countsMoves ? sessionMoves : `~${todaySteps}`}</strong>
            </span>
          </div>
        </section>

        {/* Пробный период trial3d (открыто всё) остаётся после статистики.
            Регистрация гостя находится выше, сразу после карточки музыки. */}
        {sideUnlock && (
          <div className="stats__unlock">
            <Unlock place="player" />
          </div>
        )}
      </aside>

      {/* «Свернуть» — есть только на весь экран: в углу над кругом, рядом с
          карточкой трека (в ландшафте — на месте меню). Последней в разметке,
          чтобы лежать поверх соседей по ячейке сетки. */}
      {immersive && (
        <button
          type="button"
          className="player__collapse"
          onClick={collapse}
          aria-label="Свернуть"
          title="Свернуть"
        >
          <Shrink size={22} />
        </button>
      )}

      </div>

      {showPause && (
        <PlayerPause
          sessionSeconds={sessionSeconds}
          todaySteps={todaySteps}
          sessionMoves={countsMoves ? sessionMoves : null}
          todaySeconds={todaySeconds}
          summary={summary}
          locked={limited && !guest}
          // Обёртка, а не сама функция: событие касания не должно попасть
          // в её параметр «на весь экран».
          onResume={() => continueFlow()}
          onClose={closePause}
          onLater={guest ? laterGuest : leaveToProgress}
        />
      )}

      {guest && prompt && <GuestPrompt kind={prompt} onClose={closePrompt} onCta={promptCta} />}
    </>
  )
}
