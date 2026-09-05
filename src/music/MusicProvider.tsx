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

  const track = playlist[index % playlist.length]

  if (audioRef.current === null && typeof Audio !== 'undefined') {
    audioRef.current = new Audio()
    audioRef.current.preload = 'auto'
  }

  const next = useCallback(() => {
    setIndex((i) => (i + 1) % playlist.length)
    setBlocked(false)
  }, [playlist.length])

  // Смена трека: подставляем источник и продолжаем, если играли.
  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    a.src = trackSrc(track.id)
    a.onended = next
    if (playing) a.play().then(() => setBlocked(false), () => setBlocked(true))
    return () => {
      a.onended = null
    }
  }, [track.id, next])

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    if (playing) a.play().then(() => setBlocked(false), () => setBlocked(true))
    else a.pause()
  }, [playing])

  useEffect(() => () => audioRef.current?.pause(), [])

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
