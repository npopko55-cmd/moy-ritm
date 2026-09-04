/** Тонкие волнистые линии на фоне — есть на всех трёх экранах макета. */
export default function WaveBg({ opacity = 1, bottom = false }: { opacity?: number; bottom?: boolean }) {
  return (
    <div className={`wave-bg ${bottom ? "wave-bg--bottom" : ""}`} style={{ opacity }} aria-hidden="true">
      <svg viewBox="0 0 1440 420" preserveAspectRatio="none" fill="none">
        {[0, 26, 52, 78, 104].map((dy, i) => (
          <path
            key={dy}
            d={`M-40 ${150 + dy} C 180 ${100 + dy}, 320 ${210 + dy}, 540 ${170 + dy} S 900 ${90 + dy}, 1120 ${150 + dy} S 1380 ${215 + dy}, 1500 ${175 + dy}`}
            stroke={i % 2 === 0 ? '#ffd9e9' : '#ffe7d6'}
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        ))}
      </svg>
    </div>
  )
}
