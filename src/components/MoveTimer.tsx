import { useId } from 'react'
import './MoveTimer.css'

/**
 * Обратный отсчёт до смены движения (Дима после кастдева, 19.11.2026):
 * кружок справа от паузы. Внутри — сколько секунд осталось, по краю — кольцо,
 * которое убывает по кругу вместе с секундами. Секунды ведёт секундный тик
 * плеера (inMove в src/screens/Player.tsx), поэтому на паузе отсчёт стоит
 * сам: тик на паузе не идёт.
 */
export default function MoveTimer({
  left,
  total,
  running,
  className = '',
}: {
  /** Сколько секунд осталось до смены движения. */
  left: number
  /** Длина движения, секунды (интервал смены из настроек). */
  total: number
  /** Тренировка идёт — на паузе кольцо приглушено. */
  running: boolean
  className?: string
}) {
  const gradId = useId()
  const r = 21
  const length = 2 * Math.PI * r
  const shown = Math.max(0, Math.min(total, left))
  const frac = total > 0 ? shown / total : 0
  // Полное кольцо — новое движение: к нему прыгаем без анимации, иначе
  // кольцо на глазах «отматывалось» бы назад.
  const full = shown >= total
  return (
    <div
      className={`move-timer ${running ? '' : 'is-paused'} ${className}`}
      role="timer"
      aria-label={`До смены движения ${shown} с`}
    >
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ff2d8e" />
            <stop offset="55%" stopColor="#ff5ca8" />
            <stop offset="100%" stopColor="#ff9838" />
          </linearGradient>
        </defs>
        <circle cx="24" cy="24" r={r} fill="none" className="move-timer__track" strokeWidth="4" />
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={length * (1 - frac)}
          transform="rotate(-90 24 24)"
          className={`move-timer__arc ${full ? 'is-full' : ''}`}
        />
      </svg>
      <span className="move-timer__num">{shown}</span>
    </div>
  )
}
