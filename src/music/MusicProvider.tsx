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
import { TRACKS, type Track, shuffled, trackSrc } from '../data/music'

type MusicValue = {
  track: Track
  playing: boolean
  blocked: boolean
  start: () => void
  setPlaying: (on: boolean) => void
  next: () => void
}

const MusicContext = createContext<MusicValue | null>(null)

/** Целевая громкость. Позже приедет из настроек профиля. */
const VOLUME = 1

/** Плавный вход: новый трек разгорается дольше, возврат с паузы — быстро. */
const FADE_START = 1200
const FADE_RESUME = 400
const FADE_STEP = 50

/**
 * Один проигрыватель на всё приложение.
 *
 * Живёт выше маршрутов, поэтому музыка, запущенная на обратном отсчёте,
 * продолжает играть при переходе в плеер без паузы и перезапуска.
 */
export function MusicProvider({ children }: { children: ReactNode }) {
  const playlist = useMemo(() => shuffled(TRACKS), [])
  const [index, setIndex] = useState(0)
  const [playing, setPlayingState] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fadeRef = useRef<number | null>(null)

  const track = playlist[index % playlist.length]

  if (audioRef.current === null && typeof Audio !== 'undefined') {
    audioRef.current = new Audio()
    audioRef.current.preload = 'auto'
    // В разработке удобно дёргать проигрыватель из консоли: он не в DOM.
    if (import.meta.env.DEV) (window as Window & { __audio?: HTMLAudioElement }).__audio = audioRef.current
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
      a.volume = Math.min(VOLUME, (VOLUME * done) / steps)
      if (done >= steps) stopFade()
    }, FADE_STEP)
  }, [])

  // Пуск: сначала глушим, потом выводим громкость. Между вызовом play() и
  // его обещанием проходит кадр-другой, и без предварительного нуля трек
  // успел бы рявкнуть на полной.
  const play = useCallback(
    (ms: number) => {
      const a = audioRef.current
      if (!a) return
      stopFade()
      a.volume = 0
      a.play().then(
        () => {
          setBlocked(false)
          fadeIn(ms)
        },
        () => setBlocked(true),
      )
    },
    [fadeIn],
  )

  // Трек ещё ни разу не звучал: его первый пуск — долгий вход, а возврат
  // с паузы посреди трека — короткий.
  const fresh = useRef(true)

  const next = useCallback(() => {
    setIndex((i) => (i + 1) % playlist.length)
    setBlocked(false)
  }, [playlist.length])

  // Смена трека: подставляем источник и продолжаем, если играли.
  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    // #t= — медиафрагмент: браузер сам начинает с «разгара» трека. Работает
    // и через сервис-воркер, который отдаёт медиа кусками по 206.
    a.src = `${trackSrc(track.id)}#t=${track.startAt}`
    a.onended = next
    // Подстраховка, если фрагмент не подхватился: доводим руками.
    a.onloadedmetadata = () => {
      if (a.currentTime < track.startAt - 1) a.currentTime = track.startAt
    }
    a.volume = 0
    fresh.current = true
    if (playing) {
      play(FADE_START)
      fresh.current = false
    }
    return () => {
      a.onended = null
      a.onloadedmetadata = null
    }
    // playing нарочно не в зависимостях: пуск и паузу ведёт эффект ниже.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.id, track.startAt, next, play])

  // Пуск и пауза. Пауза мгновенная, возврат — без перемотки: трек
  // продолжается с того же места, только громкость возвращается плавно.
  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    if (playing) {
      play(fresh.current ? FADE_START : FADE_RESUME)
      fresh.current = false
    } else {
      stopFade()
      a.pause()
    }
  }, [playing, play])

  useEffect(
    () => () => {
      stopFade()
      audioRef.current?.pause()
    },
    [],
  )

  const start = useCallback(() => setPlayingState(true), [])
  const setPlaying = useCallback((on: boolean) => setPlayingState(on), [])

  const value = useMemo(
    () => ({ track, playing, blocked, start, setPlaying, next }),
    [track, playing, blocked, start, setPlaying, next],
  )
  return <MusicContext.Provider value={value}>{children}</MusicContext.Provider>
}

export function useMusic(): MusicValue {
  const ctx = useContext(MusicContext)
  if (!ctx) throw new Error('useMusic вызван вне MusicProvider')
  return ctx
}
