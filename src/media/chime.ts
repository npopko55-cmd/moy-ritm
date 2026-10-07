/**
 * Сигнал «смена упражнения» — тёплый короткий звук поверх музыки (правка
 * Никиты 06.10.2026). Синтез Web Audio, без файлов: качать нечего, и на
 * медленной сети сигнал не опаздывает.
 *
 * Каждая нота — синус и треугольная волна октавой ниже (тише), огибающая
 * громкости от нуля и до нуля: атака CHIME_ATTACK, дальше экспоненциальное
 * затухание. Без резких фронтов не бывает щелчков ни в начале, ни в конце.
 *
 * Вьюха Telegram и Safari на iPhone выпускают звук Web Audio только из
 * контекста, запущенного в касании. Поэтому контекст создаётся и
 * запускается в unlockChime — её зовёт unlockMedia (src/media/unlock.ts) в
 * тех же касаниях, что разблокируют ролики и музыку. Контекст не запущен —
 * playChime молча ничего не делает. Музыку (MusicProvider) сигнал не трогает
 * и не приглушает: это отдельный выход, они просто звучат вместе.
 *
 * Превью вариантов в WAV рендерит scratchpad-скрипт с теми же числами, что
 * здесь (CHIME_VARIANTS): поменяли тут — перерендерите и там.
 */

/** Какой сигнал звучит. A — две ноты калимбы вверх, B — колокольчик, C — перебор маримбы. */
export type ChimeVariant = 'A' | 'B' | 'C'
export const CHIME_VARIANT: ChimeVariant = 'A'

/**
 * Громкость сигнала (пик огибающей на выходе). Музыка играет громкостью
 * из настроек (обычно 0,6–0,8 у <audio>), сигнал заметно тише, но на
 * динамике телефона слышен.
 */
export const CHIME_GAIN = 0.16

/** Атака ноты, секунды. */
export const CHIME_ATTACK = 0.005

type Overtone = { type: OscillatorType; mul: number; level: number }
type Variant = {
  /** Ноты: сдвиг от начала (с) и частота (Гц). */
  notes: { at: number; freq: number }[]
  /** Затухание до тишины после атаки, секунды. */
  decay: number
  /** Из чего складывается нота: волна, множитель частоты, уровень. */
  partials: Overtone[]
}

export const CHIME_VARIANTS: Record<ChimeVariant, Variant> = {
  // Калимба: ми5 → ля5, вторая нота через 120 мс.
  A: {
    notes: [
      { at: 0, freq: 659.25 },
      { at: 0.12, freq: 880 },
    ],
    decay: 0.38,
    partials: [
      { type: 'sine', mul: 1, level: 1 },
      { type: 'triangle', mul: 0.5, level: 0.35 },
    ],
  },
  // Мягкий колокольчик: до6 с негармоническим обертоном ×2,76.
  B: {
    notes: [{ at: 0, freq: 1046.5 }],
    decay: 0.42,
    partials: [
      { type: 'sine', mul: 1, level: 1 },
      { type: 'sine', mul: 2.76, level: 0.12 },
      { type: 'triangle', mul: 0.5, level: 0.3 },
    ],
  },
  // Маримба: до5 – ми5 – соль5 перебором через 70 мс.
  C: {
    notes: [
      { at: 0, freq: 523.25 },
      { at: 0.07, freq: 659.25 },
      { at: 0.14, freq: 783.99 },
    ],
    decay: 0.3,
    partials: [
      { type: 'sine', mul: 1, level: 1 },
      { type: 'sine', mul: 4, level: 0.08 },
      { type: 'triangle', mul: 0.5, level: 0.3 },
    ],
  },
}

/** Уровень, до которого идёт экспонента (ноль ей нельзя), дальше — ровно до нуля. */
const FLOOR = 0.0001
/** Последний шаг огибающей от FLOOR до нуля. */
const TAIL = 0.02

type Ctor = typeof AudioContext
let ctx: AudioContext | null = null

/**
 * Создать и запустить контекст. Звать синхронно в касании — это делает
 * unlockMedia. Повторный вызов только будит уснувший контекст. Не падает.
 */
export function unlockChime(): void {
  try {
    const Context: Ctor | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext
    if (!Context) return
    ctx ??= new Context()
    if (ctx.state !== 'running') void ctx.resume().catch(() => undefined)
    // Старые WebKit открывают вывод только после звука из касания: пустой
    // буфер в один отсчёт — неслышно.
    const blank = ctx.createBufferSource()
    blank.buffer = ctx.createBuffer(1, 1, 22050)
    blank.connect(ctx.destination)
    blank.start(0)
  } catch {
    /* Web Audio нет или он запрещён — сигнала просто не будет */
  }
}

/** Сыграть сигнал. Контекст не запущен (не было касания) — молча ничего. */
export function playChime(variant: ChimeVariant = CHIME_VARIANT): void {
  const audio = ctx
  if (!audio || audio.state !== 'running') return
  try {
    const { notes, decay, partials } = CHIME_VARIANTS[variant]
    const master = audio.createGain()
    master.gain.value = CHIME_GAIN
    master.connect(audio.destination)
    const start = audio.currentTime + 0.01
    let end = start
    for (const note of notes) {
      const t0 = start + note.at
      const peakAt = t0 + CHIME_ATTACK
      const quietAt = peakAt + decay
      for (const p of partials) {
        const osc = audio.createOscillator()
        osc.type = p.type
        osc.frequency.value = note.freq * p.mul
        const env = audio.createGain()
        env.gain.setValueAtTime(0, t0)
        env.gain.linearRampToValueAtTime(p.level, peakAt)
        env.gain.exponentialRampToValueAtTime(p.level * FLOOR, quietAt)
        env.gain.linearRampToValueAtTime(0, quietAt + TAIL)
        osc.connect(env).connect(master)
        osc.start(t0)
        osc.stop(quietAt + TAIL + 0.01)
      }
      end = Math.max(end, quietAt + TAIL + 0.02)
    }
    // Узлы сами уходят после stop; общий регулятор отключаем следом.
    window.setTimeout(() => master.disconnect(), Math.ceil((end - audio.currentTime) * 1000) + 50)
  } catch {
    /* сигнал — украшение: тренировке он мешать не должен */
  }
}
