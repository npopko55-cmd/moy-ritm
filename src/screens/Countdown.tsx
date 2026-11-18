import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Logo from '../components/Logo'
import WaveBg from '../components/WaveBg'
import { FloatNote, MusicNote, Sparkle } from '../components/Icons'
import { getStream, WARM_MOVES } from '../data/streams'
import { loopPoster, loopSrc } from '../data/loops'
import { startState, useFlow } from '../flow/FlowSession'
import { GUEST_STREAM_PARAM, guestLivePath } from '../lib/guest'
import { prefetchFiles, prefetchImages } from '../lib/prefetch'
import { player } from '../lib/screens'
import { holdAwake, releaseAwake } from '../media/keepAwake'
import { useMusic } from '../music/MusicProvider'
import '../components/Logo.css'
import './Countdown.css'

const TICKS = 76
/** Пять секунд: за три человек не успевал встать из-за стола. */
const START_FROM = 5

/**
 * Цвет штриха по углу, как в макете: сверху розовый, справа оранжевый,
 * снизу красный, слева маджента — и обратно в розовый.
 */
function tickColor(t: number): string {
  const stops = [
    [255, 45, 142], // верх — розовый
    [255, 122, 24], // право — оранжевый
    [251, 59, 33], // низ — красный
    [216, 17, 122], // лево — маджента
    [255, 45, 142],
  ]
  const segs = stops.length - 1
  const seg = Math.min(Math.floor(t * segs), segs - 1)
  const local = t * segs - seg
  const [a, b] = [stops[seg], stops[seg + 1]]
  const mix = a.map((v, i) => Math.round(v + (b[i] - v) * local))
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`
}

export default function Countdown() {
  const navigate = useNavigate()
  // token — отсчёт гостя (/play/<токен>/start, src/screens/PlayGuest.tsx):
  // поток у него по умолчанию, а уводит отсчёт в плеер гостя.
  const { streamId: routeStreamId, token: guestToken } = useParams()
  const [search] = useSearchParams()
  // Гостю поток — из ?stream= (квиз), у вошедшего — из адреса /start/<поток>.
  const streamId = routeStreamId ?? (guestToken ? search.get(GUEST_STREAM_PARAM) ?? undefined : undefined)
  const [left, setLeft] = useState(START_FROM)
  const { start, setPlaying: setMusicPlaying, selectStream } = useMusic()
  // Отсчёт дошёл до конца и сам уводит в плеер: музыку тогда не трогаем.
  const toPlayer = useRef(false)
  const { session: flow } = useFlow()

  // Ссылка на скрытый поток ведёт в поток по умолчанию — это решает
  // getStream. Дальше по коду идёт уже существующий идентификатор.
  const stream = getStream(streamId)
  const target = stream.id
  const playerPath = guestToken ? guestLivePath(guestToken, target) : `/player/${target}`

  /**
   * Тренировка этого потока уже идёт — отсчёта не будет.
   *
   * Отсчёт перед стартом нужен, чтобы человек встал и
   * приготовился. Тот, кто просто заглянул в прогресс и вернулся,
   * приготовился полчаса назад: его пускаем в плеер сразу — на паузе, с
   * кнопкой «Играть» (isStart в src/flow/FlowSession.tsx), — и по ней музыка
   * продолжится с той же секунды, а не начнётся заново.
   *
   * Другой поток — это новый заход: отсчёт на месте, а прошлую тренировку
   * плеер закроет сам, когда откроется.
   */
  const resume = flow?.streamId === target

  // Музыка этого потока (у спины своя, src/data/music.ts) — до пуска ниже:
  // эффекты отсчёта идут после layout-эффектов, и первым пуском встанет уже
  // трек нужного плейлиста. Переключатель потоков в плеере сюда не ведёт:
  // с 28.10.2026 он открывает плеер нового потока сразу, без отсчёта.
  useLayoutEffect(() => {
    selectStream(target)
  }, [selectStream, target])

  // Музыка включается сразу на отсчёте, а не при появлении плеера. Плеер
  // подхватывает её из общего проигрывателя без перезапуска. Ушли с отсчёта
  // куда-то ещё («Назад», вход) — музыку гасим: на других экранах выключить
  // её было бы нечем.
  useEffect(() => {
    if (resume) return
    start()
    return () => {
      if (!toPlayer.current) setMusicPlaying(false)
    }
  }, [resume, start, setMusicPlaying])

  // Экран не гаснет и на отсчёте (src/media/keepAwake.ts): взяло его касание
  // «Влиться в поток», здесь — подтверждение. Отсчёт дошёл до конца — экран
  // дальше держит плеер; ушли куда-то ещё — отпускаем.
  useEffect(() => {
    if (resume) return
    holdAwake()
    return () => {
      if (!toPlayer.current) releaseAwake()
    }
  }, [resume])

  // Пять секунд отсчёта — единственная пауза, когда можно качать без спешки:
  // к открытию плеера постеры первых движений и первые два ролика уже в кэше.
  useEffect(() => {
    // Код плеера — первым: без него к концу отсчёта не будет и экрана.
    player.preload()
    if (resume) return
    prefetchImages(stream.loops.slice(0, WARM_MOVES).map((l) => loopPoster(l.id)))
    prefetchFiles(stream.loops.slice(0, 2).map((l) => loopSrc(l.id)))
  }, [stream, resume])

  useEffect(() => {
    if (resume) return
    if (left <= 0) {
      toPlayer.current = true
      // Отсчёт дошёл до нуля — единственный переход, после которого плеер
      // пускает тренировку сам (startState в src/flow/FlowSession.tsx).
      navigate(playerPath, { replace: true, state: startState() })
      return
    }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000)
    return () => clearTimeout(t)
  }, [left, navigate, playerPath, resume])

  if (resume) return <Navigate to={playerPath} replace />

  return (
    <div className="countdown">
      <WaveBg opacity={0.42} bottom />

      <Logo centered />

      {/* Текст владельца, дословно и на «вы» — включая многоточие в конце. */}
      <h1 className="countdown__title">Вставайте и повторяйте движения под музыку…</h1>

      <div className="countdown__ring">
        <svg viewBox="0 0 400 400" className="countdown__ticks" aria-hidden="true">
          {Array.from({ length: TICKS }, (_, i) => {
            const t = i / TICKS
            const angle = t * 360 - 90
            const rad = (angle * Math.PI) / 180
            const r1 = 150
            const r2 = 178
            return (
              <line
                key={i}
                x1={200 + Math.cos(rad) * r1}
                y1={200 + Math.sin(rad) * r1}
                x2={200 + Math.cos(rad) * r2}
                y2={200 + Math.sin(rad) * r2}
                stroke={tickColor(t)}
                strokeWidth="3.4"
                strokeLinecap="round"
              />
            )
          })}
        </svg>

        <div className="countdown__center">
          <span key={left} className="countdown__number">
            {left}
          </span>
          <span className="countdown__caption">до старта потока</span>
        </div>

        <FloatNote size={30} className="countdown__note countdown__note--a" />
        <MusicNote size={26} className="countdown__note countdown__note--b" />
        <Sparkle size={17} className="countdown__note countdown__note--c" />
        <Sparkle size={13} className="countdown__note countdown__note--d" />
      </div>

      <div className="countdown__card">
        <span className="countdown__card-icon">
          <MusicNote size={22} />
        </span>
        <div className="countdown__card-body">
          <strong>Приготовьтесь!</strong>
          <span>Включайте музыку погромче, и мы начинаем ⚡</span>
        </div>
      </div>
    </div>
  )
}
