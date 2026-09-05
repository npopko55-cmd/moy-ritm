import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Logo from '../components/Logo'
import WaveBg from '../components/WaveBg'
import { FloatNote, MusicNote, Sparkle } from '../components/Icons'
import { STREAMS, getStream } from '../data/streams'
import { loopPoster, loopSrc } from '../data/loops'
import { prefetchFiles, prefetchImages } from '../lib/prefetch'
import { useMusic } from '../music/MusicProvider'
import '../components/Logo.css'
import './Countdown.css'

const TICKS = 76
const START_FROM = 3

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
  const { streamId } = useParams()
  const [left, setLeft] = useState(START_FROM)
  const { start } = useMusic()

  // Музыка включается сразу на отсчёте, а не при появлении плеера.
  useEffect(() => { start() }, [start])

  // Три секунды отсчёта — единственная пауза, когда можно качать без спешки:
  // к открытию плеера фото, постеры и первые два ролика уже в кэше.
  useEffect(() => {
    const stream = getStream(streamId)
    prefetchImages([
      ...STREAMS.map((s) => s.cover),
      ...stream.loops.map((l) => loopPoster(l.id)),
    ])
    prefetchFiles(stream.loops.slice(0, 2).map((l) => loopSrc(l.id)))
  }, [streamId])

  useEffect(() => {
    if (left <= 0) {
      navigate(`/player/${streamId ?? 'cardio'}`, { replace: true })
      return
    }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000)
    return () => clearTimeout(t)
  }, [left, navigate, streamId])

  return (
    <div className="countdown">
      <WaveBg opacity={0.42} bottom />

      <Logo centered />

      <h1 className="countdown__title">
        Повторяй за движения
        <br />в ритм через...
      </h1>

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
          <strong>Приготовься!</strong>
          <span>Включай музыку погромче, и мы начинаем ⚡</span>
        </div>
      </div>
    </div>
  )
}
