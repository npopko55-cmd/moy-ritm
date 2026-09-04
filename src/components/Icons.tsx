type I = { size?: number; className?: string }

export const MusicNote = ({ size = 22, className }: I) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path
      d="M9 18V6.4c0-.5.35-.92.84-1l8-1.36A1 1 0 0 1 19 5.03V15"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="6.5" cy="18" r="2.6" stroke="currentColor" strokeWidth="2" />
    <circle cx="16.5" cy="15" r="2.6" stroke="currentColor" strokeWidth="2" />
  </svg>
)

export const Bolt = ({ size = 22, className }: I) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path
      d="M13.2 2 4.6 13.1c-.4.5 0 1.3.7 1.3h5l-1.5 7.6 8.6-11.1c.4-.5 0-1.3-.7-1.3h-5L13.2 2Z"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinejoin="round"
    />
  </svg>
)

export const Heart = ({ size = 22, className }: I) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path
      d="M12 20.3S3.6 15.5 3.6 9.6A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8.4 2.6c0 5.9-8.4 10.7-8.4 10.7Z"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinejoin="round"
    />
  </svg>
)

export const ArrowRight = ({ size = 20, className }: I) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path d="M5 12h13M12.5 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const Clock = ({ size = 20, className }: I) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="8.6" stroke="currentColor" strokeWidth="1.8" />
    <path d="M12 7.6V12l3 1.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const User = ({ size = 20, className }: I) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <circle cx="12" cy="8.4" r="3.6" stroke="currentColor" strokeWidth="1.8" />
    <path d="M4.8 20c.6-3.7 3.6-5.8 7.2-5.8s6.6 2.1 7.2 5.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)

export const Gear = ({ size = 20, className }: I) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="3.1" stroke="currentColor" strokeWidth="1.8" />
    <path
      d="M19.3 14.4a1.6 1.6 0 0 0 .32 1.77l.06.06a1.94 1.94 0 1 1-2.75 2.75l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-.97 1.47v.17a1.94 1.94 0 1 1-3.88 0v-.09a1.6 1.6 0 0 0-1.05-1.47 1.6 1.6 0 0 0-1.77.32l-.06.06a1.94 1.94 0 1 1-2.75-2.75l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.47-.97h-.17a1.94 1.94 0 1 1 0-3.88h.09a1.6 1.6 0 0 0 1.47-1.05 1.6 1.6 0 0 0-.32-1.77l-.06-.06a1.94 1.94 0 1 1 2.75-2.75l.06.06a1.6 1.6 0 0 0 1.77.32h.08a1.6 1.6 0 0 0 .97-1.47v-.17a1.94 1.94 0 1 1 3.88 0v.09a1.6 1.6 0 0 0 .97 1.47 1.6 1.6 0 0 0 1.77-.32l.06-.06a1.94 1.94 0 1 1 2.75 2.75l-.06.06a1.6 1.6 0 0 0-.32 1.77v.08a1.6 1.6 0 0 0 1.47.97h.17a1.94 1.94 0 1 1 0 3.88h-.09a1.6 1.6 0 0 0-1.47.97Z"
      stroke="currentColor"
      strokeWidth="1.55"
      strokeLinejoin="round"
    />
  </svg>
)

export const Question = ({ size = 20, className }: I) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="8.6" stroke="currentColor" strokeWidth="1.8" />
    <path
      d="M9.7 9.5a2.35 2.35 0 1 1 3.2 2.2c-.55.25-.9.8-.9 1.4v.45"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
    <circle cx="12" cy="16.4" r="1.05" fill="currentColor" />
  </svg>
)

export const Info = ({ size = 16, className }: I) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.9" />
    <path d="M12 11v5.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    <circle cx="12" cy="7.9" r="1.15" fill="currentColor" />
  </svg>
)

export const Prev = ({ size = 26, className }: I) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M6 5.5c0-.55.45-1 1-1s1 .45 1 1v13c0 .55-.45 1-1 1s-1-.45-1-1v-13Z" />
    <path d="M18.6 5.4c.63-.4 1.4.06 1.4.83v11.54c0 .77-.77 1.23-1.4.83l-8.4-5.77a1 1 0 0 1 0-1.66l8.4-5.77Z" />
  </svg>
)

export const Next = ({ size = 26, className }: I) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M18 5.5c0-.55-.45-1-1-1s-1 .45-1 1v13c0 .55.45 1 1 1s1-.45 1-1v-13Z" />
    <path d="M5.4 5.4C4.77 5 4 5.46 4 6.23v11.54c0 .77.77 1.23 1.4.83l8.4-5.77a1 1 0 0 0 0-1.66L5.4 5.4Z" />
  </svg>
)

export const Pause = ({ size = 30, className }: I) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <rect x="6.4" y="4.6" width="4" height="14.8" rx="1.6" />
    <rect x="13.6" y="4.6" width="4" height="14.8" rx="1.6" />
  </svg>
)

export const Play = ({ size = 30, className }: I) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M8 5.14v13.72c0 .79.86 1.28 1.54.87l11.1-6.86a1 1 0 0 0 0-1.74L9.54 4.27A1 1 0 0 0 8 5.14Z" transform="translate(-2)" />
  </svg>
)

export const Fullscreen = ({ size = 20, className }: I) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path
      d="M4 9V5.6c0-.9.7-1.6 1.6-1.6H9M15 4h3.4c.9 0 1.6.7 1.6 1.6V9M20 15v3.4c0 .9-.7 1.6-1.6 1.6H15M9 20H5.6A1.6 1.6 0 0 1 4 18.4V15"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
)

/** Розовая волна в карточке «Время в движении вчера». */
export const PulseWave = ({ size = 22, className }: I) => (
  <svg width={size} height={size * 0.55} viewBox="0 0 24 13" fill="none" className={className} aria-hidden="true">
    <path
      d="M1 8.6c2.6 0 3-6.6 5.6-6.6s3 9 5.6 9 3-8 5.6-8 3 4 5.2 4"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

/** Декоративные ноты, летящие рядом с персонажем. */
export const FloatNote = ({ size = 26, className }: I) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M20 3.2 8.9 5.3a1 1 0 0 0-.8 1v9.06a3.4 3.4 0 1 0 1.9 3.04V9.36l9.1-1.72v5.5a3.4 3.4 0 1 0 1.9 3.05V4.18a1 1 0 0 0-1-.98Z" />
  </svg>
)

export const Sparkle = ({ size = 16, className }: I) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M12 1c.9 7.6 2.4 9.1 10 10-7.6.9-9.1 2.4-10 10-.9-7.6-2.4-9.1-10-10 7.6-.9 9.1-2.4 10-10Z" />
  </svg>
)
