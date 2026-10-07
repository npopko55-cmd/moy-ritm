/**
 * Сигнал «смена упражнения» — тёплый короткий звук поверх музыки (правка
 * Никиты 06.10.2026): две ноты калимбы вверх, ми5 → ля5, полсекунды.
 *
 * Играет файлом через <audio> — тем же путём, что и музыка (MusicProvider).
 * Первая версия синтезировала его в Web Audio, и Никита его не услышал
 * (07.10): на iPhone Web Audio по умолчанию идёт в «окружающий» звук, его
 * глушит переключатель «Беззвучный режим», а музыку из <audio> — нет; к тому
 * же синтез был в пять раз тише музыки, а после сворачивания вьюхи Telegram
 * контекст засыпал и будился только касанием «Продолжить». У <audio> одна
 * судьба с музыкой: где слышна музыка, там слышен и сигнал.
 *
 * Громкость. iPhone громкость <audio> из кода не слушает (всегда полная),
 * поэтому громкость сигнала задаёт сам файл: public/sounds/chime.m4a
 * отрендерен с пиком −2 дБ (0,8 от полной шкалы) — на 11 дБ громче
 * прежнего синтеза, заметно поверх музыки. Там, где громкость слушается
 * (компьютер, Android), её дальше правит CHIME_VOLUME.
 *
 * Разрешение играть. Вьюха Telegram и Safari на iPhone запускают звук только
 * из касания, а сигнал звучит по таймеру. Поэтому в касаниях (unlockMedia в
 * src/media/unlock.ts, кнопка «Звук» в плеере) элемент запускается беззвучно
 * и сразу встаёт — дальше WebKit пускает его из кода. Это повторяется в
 * каждом касании, а не один раз: после сворачивания мини-апа разрешение
 * могло потеряться, и «Продолжить» или «Звук» его возвращают.
 *
 * Запасной путь — прежний синтез Web Audio (CHIME_VARIANTS): если файл не
 * загрузился (сеть) или браузер отказал элементу. Звучит, только если
 * контекст запущен касанием.
 *
 * Сервис-воркер файл не трогает (scripts/build-sw.mjs, путь /sounds/):
 * браузер берёт его из своего HTTP-кэша или из сети, как ролики.
 */

import { isNotAllowed } from './videoPool'

/** Файл сигнала: вариант A, 0,55 с, AAC 44,1 кГц, пик −2 дБ. */
export const CHIME_SRC = `${import.meta.env.BASE_URL}sounds/chime.m4a`

/**
 * Громкость элемента сигнала там, где её слушают (на iPhone — всегда полная,
 * громкость задаёт файл). Полная: музыка идёт с громкостью из настроек
 * (по умолчанию 0,8–1), и сигнал должен быть слышен поверх неё.
 */
export const CHIME_VOLUME = 1

/** Какой сигнал звучит. A — две ноты калимбы вверх, B — колокольчик, C — перебор маримбы. */
export type ChimeVariant = 'A' | 'B' | 'C'
export const CHIME_VARIANT: ChimeVariant = 'A'

/** Громкость запасного синтеза (пик огибающей на выходе Web Audio). */
export const CHIME_GAIN = 0.6

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

/**
 * Варианты сигнала — для запасного синтеза и для рендера файла (скрипт
 * render_chime_file.py в scratchpad с теми же числами варианта A): поменяли
 * тут — перерендерите public/sounds/chime.m4a.
 */
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

/* ─────────────  Файл через <audio>  ───────────── */

let element: HTMLAudioElement | null = null
/**
 * Номер последнего настоящего пуска. Беззвучная разблокировка останавливает
 * элемент, только если за это время сигнал не зазвучал по-настоящему.
 */
let shot = 0

/** play(), который всегда возвращает обещание: старые вьюхи отдают undefined. */
function startPlayback(a: HTMLAudioElement): Promise<void> {
  try {
    return Promise.resolve(a.play())
  } catch (error) {
    return Promise.reject(error)
  }
}

/** Элемент сигнала. Создаётся в первом касании: файл (8 КБ) качается тогда же. */
function chimeElement(): HTMLAudioElement | null {
  if (element) return element
  if (typeof Audio === 'undefined') return null
  const a = new Audio()
  a.preload = 'auto'
  a.src = CHIME_SRC
  element = a
  return a
}

/** Беззвучный пуск и остановка в касании — разрешение играть из кода. */
function primeElement(): void {
  const a = chimeElement()
  // Звучит прямо сейчас — значит, разрешение уже есть; не перебиваем.
  if (!a || (!a.paused && !a.muted)) return
  const mine = shot
  a.muted = true
  startPlayback(a).then(
    () => {
      if (shot !== mine) return
      a.pause()
      a.currentTime = 0
      a.muted = false
    },
    () => {
      if (shot === mine) a.muted = false
    },
  )
}

/* ─────────────  Запасной синтез Web Audio  ───────────── */

/** Уровень, до которого идёт экспонента (ноль ей нельзя), дальше — ровно до нуля. */
const FLOOR = 0.0001
/** Последний шаг огибающей от FLOOR до нуля. */
const TAIL = 0.02

type Ctor = typeof AudioContext
let ctx: AudioContext | null = null

/** Создать и запустить контекст запасного синтеза. Только в касании. */
function unlockSynth(): void {
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
    /* Web Audio нет или он запрещён — запасного сигнала просто не будет */
  }
}

/** Синтез сигнала. Контекст не запущен — молча ничего. */
function playSynth(variant: ChimeVariant = CHIME_VARIANT): void {
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

/* ─────────────  Снаружи  ───────────── */

/**
 * Разрешение сигналу играть. Звать синхронно в касании — это делают
 * unlockMedia и кнопка «Звук». Повторные вызовы дешёвые и нужны: после
 * сворачивания вьюхи разрешение возвращает следующее касание. Не падает.
 */
export function unlockChime(): void {
  try {
    primeElement()
  } catch {
    /* без разрешения сигнал попробует запасной путь */
  }
  unlockSynth()
}

/**
 * Сыграть сигнал — с начала, даже если прошлый ещё звучит. Файл не
 * загрузился или браузер отказал — запасной синтез. Молчать ли (пауза, звук
 * выключен, вкладка спрятана), решает вызывающий (nextMove в плеере).
 */
export function playChime(): void {
  const a = element
  if (!a || a.error) {
    playSynth()
    return
  }
  try {
    shot += 1
    a.muted = false
    a.volume = CHIME_VOLUME
    a.currentTime = 0
    startPlayback(a).catch((error: unknown) => {
      // AbortError — пуск перебили (следующий сигнал, пауза): не отказ.
      if (isNotAllowed(error) || a.error) playSynth()
    })
  } catch {
    playSynth()
  }
}
