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

/* ——— Иконки страницы тарифов ——— */

/** Треугольник в круге: «все потоки и движения». */
export const PlayCircle = ({ size = 20, className }: I) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="8.8" stroke="currentColor" strokeWidth="1.8" />
    <path d="M10.4 8.9v6.2l5.1-3.1-5.1-3.1Z" fill="currentColor" />
  </svg>
)

export const Star = ({ size = 20, className }: I) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="m12 2.6 2.85 5.9 6.35.9-4.6 4.55L17.7 21 12 17.95 6.3 21l1.1-7.05L2.8 9.4l6.35-.9L12 2.6Z" />
  </svg>
)

/* Имя со суффиксом: голый Infinity перекрыл бы глобальную переменную. */
export const InfinityMark = ({ size = 20, className }: I) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path
      d="M12 12c1.5-2.4 2.7-3.6 4.6-3.6a3.6 3.6 0 0 1 0 7.2C13.6 15.6 12.4 8.4 7.4 8.4a3.6 3.6 0 0 0 0 7.2c1.9 0 3.1-1.2 4.6-3.6Z"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinejoin="round"
    />
  </svg>
)

export const Phone = ({ size = 20, className }: I) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <rect x="6.6" y="2.6" width="10.8" height="18.8" rx="2.6" stroke="currentColor" strokeWidth="1.8" />
    <path d="M10.6 5.4h2.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <circle cx="12" cy="18.1" r="1.05" fill="currentColor" />
  </svg>
)

/** Смайлик: «движение в удовольствие». */
export const Smile = ({ size = 20, className }: I) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="8.8" stroke="currentColor" strokeWidth="1.8" />
    <path d="M8.4 13.6c.9 1.5 2.1 2.3 3.6 2.3s2.7-.8 3.6-2.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="9.4" cy="9.9" r="1.15" fill="currentColor" />
    <circle cx="14.6" cy="9.9" r="1.15" fill="currentColor" />
  </svg>
)

export const Leaf = ({ size = 20, className }: I) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path
      d="M20 4c-9 0-14 3.2-14 9a5 5 0 0 0 8.6 3.5C18.2 13 20 9.4 20 4Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path d="M4 20c1.6-4.2 4.4-7.4 8.4-9.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)

export const Shield = ({ size = 20, className }: I) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path
      d="M12 2.8 4.8 5.6v5.5c0 4.4 2.9 8.2 7.2 9.7 4.3-1.5 7.2-5.3 7.2-9.7V5.6L12 2.8Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path d="m9 12.1 2.2 2.2 4-4.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/** Корона на бейдже популярного тарифа. */
export const Crown = ({ size = 14, className }: I) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M4.6 18.6 2.4 6.2l5.3 3.7L12 3.4l4.3 6.5 5.3-3.7-2.2 12.4H4.6Zm0 1.6h14.8v1.8H4.6v-1.8Z" />
  </svg>
)

/** Крестик на кнопке «закрыть» страницы тарифов и экрана паузы. */
export const Close = ({ size = 20, className }: I) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path d="m6.4 6.4 11.2 11.2M17.6 6.4 6.4 17.6" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
  </svg>
)

/* ——— Иконки экрана паузы и «Моего прогресса» ——— */

/** Домик — первый пункт бокового меню. */
export const Home = ({ size = 20, className }: I) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path
      d="M3.6 10.4 12 3.6l8.4 6.8V19a1.4 1.4 0 0 1-1.4 1.4h-3.6v-5.6H8.6v5.6H5a1.4 1.4 0 0 1-1.4-1.4v-8.6Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
  </svg>
)

/** Следы: счётчик шагов. Шаги у нас оценочные, поэтому и знак нестрогий. */
export const Steps = ({ size = 20, className }: I) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M6.6 2.6c1.7 0 2.8 1.6 2.8 3.7 0 1.4-.5 2.6-.5 3.8 0 .9.3 1.5.3 2.3 0 1.3-1 2.1-2.6 2.1s-2.6-.8-2.6-2.1c0-.8.3-1.4.3-2.3 0-1.2-.5-2.4-.5-3.8 0-2.1 1.1-3.7 2.8-3.7Z" />
    <path d="M6.6 16.6c1.5 0 2.4.6 2.4 1.6 0 .6-.2 1-.2 1.5 0 .9-.8 1.7-2.2 1.7s-2.2-.8-2.2-1.7c0-.5-.2-.9-.2-1.5 0-1 .9-1.6 2.4-1.6Z" />
    <path d="M17.4 6.2c1.7 0 2.8 1.6 2.8 3.7 0 1.4-.5 2.6-.5 3.8 0 .9.3 1.5.3 2.3 0 1.3-1 2.1-2.6 2.1s-2.6-.8-2.6-2.1c0-.8.3-1.4.3-2.3 0-1.2-.5-2.4-.5-3.8 0-2.1 1.1-3.7 2.8-3.7Z" />
  </svg>
)

/** Солнце с лучами — «утром» и заметка про хорошее настроение. */
export const Sun = ({ size = 20, className }: I) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.8" />
    <path
      d="M12 2.4v2.2M12 19.4v2.2M2.4 12h2.2M19.4 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
)

/** Солнце над линией горизонта — «днём». */
export const SunHalf = ({ size = 20, className }: I) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path d="M6.6 15.4a5.4 5.4 0 0 1 10.8 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path
      d="M2.6 18.6h18.8M12 4v2.2M4.6 7.4l1.6 1.6M19.4 7.4l-1.6 1.6"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
)

/** Месяц — «вечером». */
export const Moon = ({ size = 20, className }: I) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path
      d="M20 14.4A8.4 8.4 0 0 1 9.6 4a8.4 8.4 0 1 0 10.4 10.4Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
  </svg>
)

/** Галочка: день в серии и полученная награда. */
export const Check = ({ size = 16, className }: I) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path d="m5 12.6 4.4 4.4L19 6.6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/** Росток — награда «Первый шаг». */
export const Sprout = ({ size = 20, className }: I) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path d="M12 21v-8.4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    <path
      d="M12 12.6C12 9.4 9.6 7 6.4 7H4.2c0 3.2 2.4 5.6 5.6 5.6H12ZM12 12.6c0-3 2.2-5.2 5.2-5.2h2.6c0 3-2.4 5.2-5.4 5.2H12Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
  </svg>
)

/** Ракета — награда «Поехали!». */
export const Rocket = ({ size = 20, className }: I) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path
      d="M12 2.6c3 2.2 4.6 5.4 4.6 9.2l-1.9 3.6H9.3l-1.9-3.6c0-3.8 1.6-7 4.6-9.2Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="9.6" r="1.8" stroke="currentColor" strokeWidth="1.7" />
    <path
      d="M9.3 15.4 7 17.8v2.6l2.7-1.5M14.7 15.4l2.3 2.4v2.6l-2.7-1.5"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
  </svg>
)

/** Календарь — награда за десять дней. */
export const Calendar = ({ size = 20, className }: I) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <rect x="3.4" y="5" width="17.2" height="15.6" rx="2.6" stroke="currentColor" strokeWidth="1.8" />
    <path d="M3.4 9.8h17.2M8.2 3.4v3.2M15.8 3.4v3.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="8.4" cy="14" r="1.15" fill="currentColor" />
    <circle cx="12" cy="14" r="1.15" fill="currentColor" />
    <circle cx="15.6" cy="14" r="1.15" fill="currentColor" />
  </svg>
)
