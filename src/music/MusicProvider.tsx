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
import { api } from '../api/client'
import { ApiError, type Me } from '../api/types'
import { useSession } from '../auth/SessionProvider'
import { bumpSettingsRevision, currentSettingsRevision } from '../lib/settings'
import { LONG_INTRO_SECONDS, TRACKS, type Track, playlistFor, shuffled, trackSrc } from '../data/music'
import { setMusicUnlock } from '../media/unlock'
import { isNotAllowed } from '../media/videoPool'

type MusicValue = {
  track: Track
  playing: boolean
  blocked: boolean
  /** Звук включён: настройка «Музыка» в профиле и кнопка звука в плеере. */
  soundOn: boolean
  /**
   * Кнопка звука. Звать прямо в обработчике касания: всё — пауза, пуск и
   * повтор после отказа браузера — делается тут же, пока WebKit ещё считает
   * это жестом.
   */
  toggleSound: () => void
  /**
   * Снять музыку с паузы прямо в касании — «Играть», «Продолжить». Иначе
   * пуск шёл бы из эффекта, уже без жеста, и после сворачивания вьюхи
   * iPhone мог его не пустить.
   */
  resumeNow: () => void
  /**
   * Остановить музыку сразу, в обработчике — вкладку спрятали или свернули
   * мини-ап. Эффект паузы пришёл бы только после перерисовки, а свёрнутой
   * вьюхе её можно и не дождаться: трек звучал бы в фоне.
   */
  pauseNow: () => void
  /**
   * Звук снова включён — так начинается каждый заход в поток (Дима,
   * Никита 07.10: «звук будет всегда включаться»). Выключенный кнопкой
   * «Звук» живёт только до конца захода: плеер зовёт это, когда открывается
   * и когда закрывается. Сам трек не запускает и играющий не трогает —
   * пуск, как и раньше, за отсчётом и «Играть».
   */
  resetSoundForEntry: () => void
  start: () => void
  setPlaying: (on: boolean) => void
  /**
   * Следующий трек. Из касания (карточка трека) звать прямо в обработчике:
   * новый трек ставится и запускается в том же жесте.
   */
  next: () => void
  /**
   * Музыка потока: у «Размять спину» свой плейлист (playlistFor в
   * src/data/music.ts). Отсчёт и плеер зовут это со своим потоком, а
   * переключатель потоков — прямо в касании, чтобы новый трек встал и
   * заиграл в том же жесте. Тот же плейлист — ничего не меняется, музыка
   * играет дальше.
   */
  selectStream: (streamId: string) => void
}

const MusicContext = createContext<MusicValue | null>(null)

/** Громкость по умолчанию, пока профиль не загрузился: 0…100 из настроек. */
const DEFAULT_VOLUME = 100

/** Плавный вход: новый трек разгорается дольше, возврат с паузы — быстро. */
const FADE_START = 1200
const FADE_RESUME = 400
const FADE_STEP = 50

/** Паузы между повторами, если сохранить «Музыка включена» не дала сеть. */
const SAVE_RETRY_MS = [2000, 6000]

/**
 * Сколько после ответа сервера кнопка ещё держит «Музыка включена» против
 * профиля с «выключено». Такой профиль — ответ на запрос, отправленный до
 * касания, а дольше 20 секунд (TIMEOUT_MS в src/api/http.ts) запрос не живёт.
 */
const STALE_PROFILE_MS = 25_000

/** play(), который всегда возвращает обещание: старые вьюхи отдают undefined. */
function startPlayback(a: HTMLAudioElement): Promise<void> {
  try {
    return Promise.resolve(a.play())
  } catch (error) {
    return Promise.reject(error)
  }
}

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

/**
 * «Музыка включена» кнопкой звука, пока сервер её не подтвердил и ещё
 * STALE_PROFILE_MS после этого. until — Infinity, пока ответа нет.
 */
type MusicWish = { userId: string; revision: number; until: number }

/**
 * Держит ли кнопка «включено» для этого профиля. Нет — если это другой
 * человек, если после касания настройки уже меняли (в «Настройках») или
 * если срок вышел.
 */
function wishHolds(wish: MusicWish | null, me: Me | null): boolean {
  return (
    wish !== null &&
    me !== null &&
    me.user.id === wish.userId &&
    currentSettingsRevision() === wish.revision &&
    Date.now() <= wish.until
  )
}

/**
 * Один проигрыватель на всё приложение.
 *
 * Живёт выше маршрутов, поэтому музыка, запущенная на обратном отсчёте,
 * продолжает играть при переходе в плеер без паузы и перезапуска.
 */
export function MusicProvider({ children }: { children: ReactNode }) {
  /** Плейлист потока как в src/data/music.ts — по нему видно, сменился ли он. */
  const sourceRef = useRef<Track[]>(TRACKS)
  const [playlist, setPlaylist] = useState(() => shuffled(TRACKS))
  /** Очередь для обработчиков: смена потока подменяет её сразу, до перерисовки. */
  const playlistRef = useRef(playlist)
  const [index, setIndex] = useState(0)
  /**
   * Номер трека для обработчиков. Меняет его только «следующий» (next) — и
   * сразу, не дожидаясь перерисовки: новый трек ставится в том же касании.
   */
  const indexRef = useRef(0)
  const [playing, setPlayingState] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fadeRef = useRef<number | null>(null)

  // Музыка и её громкость — настройки профиля (раздел 5.2). Выключена —
  // проигрыватель не стартует вовсе, а уже игравший встаёт на паузу.
  const { me, setMe } = useSession()
  const meRef = useRef(me)
  meRef.current = me
  const musicWish = useRef<MusicWish | null>(null)
  // Кнопка включила музыку, а профиль пришёл с «выключено» — это ответ на
  // запрос, отправленный раньше касания: музыка из-за него не встаёт.
  const musicSetting = (me?.settings.music_enabled ?? true) || wishHolds(musicWish.current, me)
  // Кнопка звука в плеере глушит музыку поверх настройки профиля. Нигде не
  // запоминается (старый ключ moy-ritm.soundOff в браузере не читаем):
  // каждый заход в поток и каждая загрузка страницы начинаются со звуком
  // (resetSoundForEntry), выключает его человек кнопкой «Звук».
  const [soundOff, setSoundOff] = useState(false)
  const enabled = musicSetting && !soundOff
  // «Музыку» включили в настройках — это тоже просьба о звуке: снимаем и
  // выключение кнопкой, иначе переключатель в настройках ничего бы не дал.
  const settingWas = useRef(musicSetting)
  useEffect(() => {
    if (musicSetting && !settingWas.current) setSoundOff(false)
    settingWas.current = musicSetting
  }, [musicSetting])
  const target = (me?.settings.music_volume ?? DEFAULT_VOLUME) / 100
  // Ref, чтобы плавный вход читал свежую громкость, а не ту, что была при
  // создании обработчика.
  const targetRef = useRef(target)
  targetRef.current = target
  const on = playing && enabled

  const track = playlist[index % playlist.length]
  /** Трек, который сейчас стоит или встанет следующим пуском. */
  const currentTrack = useCallback(() => {
    const list = playlistRef.current
    return list[indexRef.current % list.length]
  }, [])

  // Состояние для обработчиков касаний — свежее, без пересоздания. Кнопка
  // звука правит их сразу: разблокировка в том же касании должна видеть уже
  // новое состояние.
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled
  const onRef = useRef(on)
  onRef.current = on
  const playingRef = useRef(playing)
  playingRef.current = playing
  const musicSettingRef = useRef(musicSetting)
  musicSettingRef.current = musicSetting
  const blockedRef = useRef(blocked)
  blockedRef.current = blocked

  /** «Следующий» для обработчиков проигрывателя: они ставятся один раз. */
  const nextRef = useRef<() => void>(() => undefined)
  /** С какой секунды идёт текущий трек («разгар»), 0 — с начала. */
  const fromRef = useRef(0)
  /** Сколько треков подряд не загрузилось; сбрасывает удачный пуск. */
  const failures = useRef(0)

  // Сам элемент создаётся сразу, но источника у него нет до первого пуска:
  // иначе preload='auto' качал бы первый трек (0,6–1,2 МБ) на любой
  // странице — у гостя на лендинге тоже.
  if (audioRef.current === null && typeof Audio !== 'undefined') {
    const a = new Audio()
    a.preload = 'auto'
    // Обработчики — один раз на весь проигрыватель: смена трека их не
    // переставляет, а свежие функции они берут через ref.
    a.onended = () => nextRef.current()
    // Трек не загрузился (сеть моргнула, файл не отдался) — раньше музыка
    // тогда молчала до конца тренировки. Берём следующий, но не больше
    // трёх раз подряд: без сети перебирать весь плейлист незачем.
    a.onerror = () => {
      if (failures.current >= 3) return
      failures.current += 1
      nextRef.current()
    }
    // Подстраховка, если фрагмент #t= не подхватился: доводим руками.
    a.onloadedmetadata = () => {
      const from = fromRef.current
      if (from > 0 && a.currentTime < from - 1) a.currentTime = from
    }
    audioRef.current = a
    // В разработке удобно дёргать проигрыватель из консоли: он не в DOM.
    if (import.meta.env.DEV) (window as Window & { __audio?: HTMLAudioElement }).__audio = a
  }

  const stopFade = () => {
    if (fadeRef.current !== null) clearInterval(fadeRef.current)
    fadeRef.current = null
  }

  /**
   * Выводим громкость с нуля до целевой ступенями по 50 мс.
   * iOS Safari программную громкость игнорирует: там звук появится сразу,
   * и это нормально — глушить нечего, вход просто не будет плавным.
   */
  const fadeIn = useCallback((ms: number) => {
    const a = audioRef.current
    if (!a) return
    stopFade()
    const steps = Math.max(1, Math.round(ms / FADE_STEP))
    let done = 0
    a.volume = 0
    fadeRef.current = window.setInterval(() => {
      done += 1
      const to = targetRef.current
      a.volume = Math.min(to, (to * done) / steps)
      if (done >= steps) stopFade()
    }, FADE_STEP)
  }, [])

  /** Браузер хоть раз дал проигрывателю играть: разблокировать его незачем. */
  const unlocked = useRef(false)

  // Пуск: сначала глушим, потом выводим громкость. Между вызовом play() и
  // его обещанием проходит кадр-другой, и без предварительного нуля трек
  // успел бы рявкнуть на полной. muted снимаем на случай, если пуск пришёл
  // посреди беззвучной разблокировки (prime ниже).
  const play = useCallback(
    (ms: number) => {
      const a = audioRef.current
      if (!a) return
      stopFade()
      a.volume = 0
      a.muted = false
      startPlayback(a).then(
        () => {
          unlocked.current = true
          failures.current = 0
          setBlocked(false)
          fadeIn(ms)
        },
        (error: unknown) => {
          // AbortError — пуск перебили паузой или сменой трека. Это не отказ
          // браузера: запуск был разрешён, и звать «включить звук» незачем.
          // Любой другой отказ — кнопка звука зовёт «Включить звук».
          if (error instanceof DOMException && error.name === 'AbortError') unlocked.current = true
          else setBlocked(true)
        },
      )
    },
    [fadeIn],
  )

  // Трек ещё ни разу не звучал: его первый пуск — долгий вход, а возврат
  // с паузы посреди трека — короткий.
  const fresh = useRef(true)

  /**
   * Был ли уже переход на следующий трек в этом заходе.
   *
   * Флаг, а не сравнение индексов: индекс возвращается к нулю, когда
   * плейлист доигран по кругу, и «первым» стал бы уже звучавший трек.
   * Ставится и автопереходом по концу трека, и кнопкой «следующий».
   */
  const advanced = useRef(false)

  /** Источник уже подставлен: музыку хоть раз запускали. */
  const armed = useRef(false)

  /** Подставить трек в проигрыватель. Сам по себе пуска не делает. */
  const load = useCallback((t: Track) => {
    const a = audioRef.current
    if (!a) return
    armed.current = true
    // Первый трек захода — с «разгара», чтобы поток начался сразу. Дальше
    // с начала, кроме треков с долгим вступлением: их разгар слишком далеко.
    const from = !advanced.current || t.startAt >= LONG_INTRO_SECONDS ? t.startAt : 0
    fromRef.current = from
    // #t= — медиафрагмент: браузер сам начинает с нужной секунды. Работает
    // и через сервис-воркер, который отдаёт медиа кусками по 206.
    a.src = from > 0 ? `${trackSrc(t.id)}#t=${from}` : trackSrc(t.id)
    a.volume = 0
    fresh.current = true
  }, [])

  /**
   * Следующий трек: карточка трека в плеере, конец трека, трек не загрузился.
   *
   * Новый трек ставится и запускается прямо здесь, а не эффектом после
   * перерисовки. Из касания «следующий трек» это тот же жест: раньше пуск шёл
   * из эффекта, уже без жеста, вьюха Telegram на iPhone (и Safari) его не
   * пускала, и музыка молчала, пока человек не нажмёт «Пауза» и «Играть».
   * play() зовём сразу после смены src, не дожидаясь canplay: обещание само
   * дождётся данных, а разрешение браузер проверяет в момент вызова. Отказ
   * придёт в play() и включит «Включить звук».
   */
  const next = useCallback(() => {
    advanced.current = true
    const list = playlistRef.current
    const i = (indexRef.current + 1) % list.length
    indexRef.current = i
    setIndex(i)
    setBlocked(false)
    // Музыку ещё ни разу не запускали — источник подставит первый пуск.
    if (!armed.current) return
    load(list[i])
    if (onRef.current) {
      play(FADE_START)
      fresh.current = false
    }
  }, [load, play])
  nextRef.current = next

  /**
   * Сменить плейлист на музыку потока. Тем же путём, что и «следующий»:
   * играла музыка — новый трек встаёт и разгорается сразу (FADE_START), стояла
   * — подставляется и ждёт пуска. Новый плейлист — это новый заход в музыку:
   * свежая перемешанная очередь, и её первый трек снова с «разгара».
   */
  const selectStream = useCallback(
    (streamId: string) => {
      const source = playlistFor(streamId)
      if (source === sourceRef.current) return
      sourceRef.current = source
      const list = shuffled(source)
      playlistRef.current = list
      indexRef.current = 0
      setPlaylist(list)
      setIndex(0)
      advanced.current = false
      failures.current = 0
      setBlocked(false)
      if (!armed.current) return
      load(list[0])
      if (onRef.current) {
        play(FADE_START)
        fresh.current = false
      }
    },
    [load, play],
  )

  /**
   * Пуск уже сделан прямо в касании (toggleSound, resumeNow), и эффекту
   * ниже повторять его не нужно: второй play() заново увёл бы громкость в
   * ноль посреди плавного входа.
   */
  const startedInTap = useRef(false)

  // Пуск и пауза. Пауза мгновенная, возврат — без перемотки: трек
  // продолжается с того же места, только громкость возвращается плавно.
  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    if (on && startedInTap.current) {
      startedInTap.current = false
      return
    }
    startedInTap.current = false
    if (on) {
      // Первый пуск: только теперь у проигрывателя появляется источник.
      if (!armed.current) load(currentTrack())
      play(fresh.current ? FADE_START : FADE_RESUME)
      fresh.current = false
    } else {
      stopFade()
      a.pause()
    }
  }, [on, play, load, currentTrack])

  // Ползунок громкости двигают во время музыки — она меняется сразу, но
  // только когда плавный вход уже закончился и не спорит с ним.
  useEffect(() => {
    const a = audioRef.current
    if (a && fadeRef.current === null && !a.paused) a.volume = target
  }, [target])

  useEffect(
    () => () => {
      stopFade()
      audioRef.current?.pause()
    },
    [],
  )

  /**
   * Беззвучный пуск в касании — разрешение играть на потом.
   *
   * Ставим тот же трек, что поставил бы первый пуск, запускаем беззвучно и
   * останавливаем, как только пуск подтвердится, если к этому времени
   * музыку никто не включил. Беззвучно — чтобы касание, после которого
   * музыки не будет (вход, предложение тарифов), не выдало обрывок трека:
   * громкость iPhone не слушается, а muted — слушается.
   */
  const prime = useCallback(() => {
    const a = audioRef.current
    if (!a) return
    if (!armed.current) load(currentTrack())
    a.muted = true
    startPlayback(a).then(
      () => {
        unlocked.current = true
        setBlocked(false)
        if (!onRef.current) a.pause()
        a.muted = false
      },
      (error: unknown) => {
        // AbortError — пуск был разрешён, его лишь перебила смена трека.
        if (!isNotAllowed(error)) unlocked.current = true
        a.muted = false
      },
    )
  }, [load, currentTrack])

  /**
   * Разблокировка в касании — для вьюхи Telegram на iPhone, где звук
   * пускают только из обработчика жеста (подробно — в src/media/unlock.ts).
   * Музыка выключена — трогать нечего.
   *
   * Музыка должна звучать, но стоит — браузер отказал раньше: повторяем
   * пуск прямо в касании, обычным порядком.
   *
   * Проигрыватель ещё ни разу не играл — беззвучный пуск (prime). Звук
   * начинается как обычно: отсчёт включает его через мгновение после
   * касания, плеер — снятием паузы.
   */
  const unlock = useCallback(() => {
    const a = audioRef.current
    if (!a || !enabledRef.current) return
    if (onRef.current) {
      if (a.paused) play(FADE_RESUME)
      return
    }
    if (unlocked.current) return
    prime()
  }, [play, prime])

  useEffect(() => {
    setMusicUnlock(unlock)
    return () => setMusicUnlock(null)
  }, [unlock])

  /** Запустить трек прямо сейчас, в касании. */
  const playInTap = useCallback(() => {
    if (!audioRef.current) return
    if (!armed.current) load(currentTrack())
    play(fresh.current ? FADE_START : FADE_RESUME)
    fresh.current = false
  }, [load, play, currentTrack])

  /**
   * Кнопка звука включила «Музыку», выключенную в профиле.
   *
   * В профиль — сразу, сервер подтвердит позже; не дошло из-за сети —
   * повторяем. Ответ ложится в профиль, только если настройки с тех пор не
   * меняли (src/lib/settings.ts). А профиль с «выключено», пришедший в это
   * время, музыку не выключает (musicSetting выше) и тут же поправляется —
   * чтобы и «Настройки» показывали «включено».
   */
  const enableMusicSetting = useCallback(
    (current: Me) => {
      const revision = bumpSettingsRevision()
      const wish: MusicWish = { userId: current.user.id, revision, until: Infinity }
      musicWish.current = wish
      setMe({ ...current, settings: { ...current.settings, music_enabled: true } })
      void (async () => {
        for (let attempt = 0; ; attempt += 1) {
          try {
            const saved = await api.patchSettings({ music_enabled: true })
            if (currentSettingsRevision() !== revision) return
            const latest = meRef.current
            if (latest && latest.user.id === current.user.id) setMe({ ...latest, settings: saved })
            wish.until = Date.now() + STALE_PROFILE_MS
            return
          } catch (e) {
            // Сеть, 5xx, 429 — пробуем ещё. Отказ по существу повтором не
            // лечится: музыка всё равно играет в этой вкладке.
            const temporary = !(e instanceof ApiError) || e.temporary
            if (!temporary || attempt >= SAVE_RETRY_MS.length) return
            await wait(SAVE_RETRY_MS[attempt])
            if (currentSettingsRevision() !== revision) return
          }
        }
      })()
    },
    [setMe],
  )

  // Профиль пришёл с «выключено», пока кнопка держит «включено», — это
  // ответ на запрос, отправленный раньше касания (перечитывание профиля,
  // ответ «Настроек»). Звук от него не встаёт (musicSetting), а сам профиль
  // возвращаем к «включено».
  useEffect(() => {
    if (!me || me.settings.music_enabled || !musicWish.current) return
    if (!wishHolds(musicWish.current, me)) {
      musicWish.current = null
      return
    }
    setMe({ ...me, settings: { ...me.settings, music_enabled: true } })
  }, [me, setMe])

  /**
   * Кнопка звука. Всё решается и делается здесь же, в касании:
   *   • звук включён, но молчит — браузер не пустил («Включить звук») или
   *     трек встал посреди тренировки — касание запускает его, а не
   *     выключает;
   *   • звук включён и играет (или тренировка на паузе) — выключаем:
   *     pause() сразу, без ожидания перерисовки;
   *   • звук выключен — включаем; «Музыка» выключена и в профиле — кнопка
   *     включает и её. Тренировка идёт — трек стартует в этом же касании,
   *     на паузе — касание даёт проигрывателю разрешение, а звук пойдёт с
   *     «Играть».
   */
  const toggleSound = useCallback(() => {
    const a = audioRef.current
    if (!a) return
    if (enabledRef.current) {
      const silent = playingRef.current && a.paused
      if (blockedRef.current || silent) {
        if (!playingRef.current) prime()
        else if (a.error) {
          // Трек не загрузился и перебор треков уже сдался — берём
          // следующий, он встанет и заиграет в этом же касании.
          failures.current = 0
          next()
        } else playInTap()
        return
      }
      // Состояние для обработчиков — сразу: разблокировка медиа в этом же
      // касании иначе снова запустила бы трек.
      enabledRef.current = false
      onRef.current = false
      setSoundOff(true)
      stopFade()
      a.pause()
      return
    }
    const current = meRef.current
    // Профиля нет — включать нечего (плеер открыт только после входа).
    if (!current && !musicSettingRef.current) return
    setSoundOff(false)
    if (current && !current.settings.music_enabled) enableMusicSetting(current)
    enabledRef.current = true
    if (playingRef.current) {
      // Эффект пуска увидит включение следующим рендером и повторять не станет.
      onRef.current = true
      startedInTap.current = true
      playInTap()
    } else if (!unlocked.current) {
      prime()
    }
  }, [playInTap, prime, next, enableMusicSetting])

  const resumeNow = useCallback(() => {
    const a = audioRef.current
    if (!a || !enabledRef.current) return
    if (!playingRef.current) {
      // Эффект пуска увидит «играет» следующим рендером — пуск уже сделан.
      startedInTap.current = true
      setPlayingState(true)
    }
    // Стоит или ещё идёт беззвучная разблокировка (muted) — пуск со звуком
    // здесь же, в касании.
    if (a.paused || a.muted) playInTap()
  }, [playInTap])

  const pauseNow = useCallback(() => {
    // Состояние для обработчиков — сразу: разблокировка в касании до
    // перерисовки иначе запустила бы трек снова.
    onRef.current = false
    playingRef.current = false
    startedInTap.current = false
    stopFade()
    audioRef.current?.pause()
    setPlayingState(false)
  }, [])

  const resetSoundForEntry = useCallback(() => {
    // Только снимаем выключение кнопкой. Звук и так включён (переход с
    // отсчёта в плеер) — ничего не меняется, музыка играет дальше без
    // запинки. Пуска здесь нет: без касания браузер его всё равно не дал бы.
    // Для обработчиков — сразу: разблокировка в касании «Влиться в поток»
    // должна видеть звук уже включённым. «Музыка» выключена в профиле — так
    // и остаётся.
    enabledRef.current = musicSettingRef.current
    setSoundOff(false)
  }, [])

  const start = useCallback(() => setPlayingState(true), [])
  const setPlaying = useCallback((on: boolean) => setPlayingState(on), [])

  const value = useMemo(
    () => ({
      track,
      playing,
      blocked,
      soundOn: enabled,
      toggleSound,
      resumeNow,
      pauseNow,
      resetSoundForEntry,
      start,
      setPlaying,
      next,
      selectStream,
    }),
    [
      track,
      playing,
      blocked,
      enabled,
      toggleSound,
      resumeNow,
      pauseNow,
      resetSoundForEntry,
      start,
      setPlaying,
      next,
      selectStream,
    ],
  )
  return <MusicContext.Provider value={value}>{children}</MusicContext.Provider>
}

export function useMusic(): MusicValue {
  const ctx = useContext(MusicContext)
  if (!ctx) throw new Error('useMusic вызван вне MusicProvider')
  return ctx
}
