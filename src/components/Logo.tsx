type Props = {
  /** Показывать подпись «поток движений под музыку» под названием. */
  withTagline?: boolean
  /** Выравнивание по центру — для экрана обратного отсчёта. */
  centered?: boolean
  size?: 'sm' | 'md'
}

/** Восьмиконечная искра: две наложенные четырёхлучевые звезды. */
export function StarMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id="star-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ff4e00" />
          <stop offset="55%" stopColor="#ff6a00" />
          <stop offset="100%" stopColor="#ff9f1c" />
        </linearGradient>
      </defs>
      <g fill="url(#star-grad)">
        <path d="M50 2 C53.5 33 58 41 68 45.5 C58 50 53.5 58 50 89 C46.5 58 42 50 32 45.5 C42 41 46.5 33 50 2 Z" />
        <path
          d="M50 2 C53.5 33 58 41 68 45.5 C58 50 53.5 58 50 89 C46.5 58 42 50 32 45.5 C42 41 46.5 33 50 2 Z"
          transform="rotate(90 50 47.5)"
        />
        <path
          d="M50 14 C52.4 35 55.5 40.5 62 43.5 C55.5 46.5 52.4 52 50 73 C47.6 52 44.5 46.5 38 43.5 C44.5 40.5 47.6 35 50 14 Z"
          transform="rotate(45 50 45.5)"
        />
        <path
          d="M50 14 C52.4 35 55.5 40.5 62 43.5 C55.5 46.5 52.4 52 50 73 C47.6 52 44.5 46.5 38 43.5 C44.5 40.5 47.6 35 50 14 Z"
          transform="rotate(135 50 45.5)"
        />
      </g>
    </svg>
  )
}

export default function Logo({ withTagline = true, centered = false, size = 'md' }: Props) {
  const mark = size === 'sm' ? 34 : 42
  return (
    <div className={`logo ${centered ? 'logo--centered' : ''} logo--${size}`}>
      <div className="logo__row">
        <StarMark size={mark} />
        <span className="logo__word">
          МОЙ
          <br />
          РИТМ
        </span>
      </div>
      {withTagline && <span className="logo__tagline">поток движений под музыку</span>}
    </div>
  )
}
