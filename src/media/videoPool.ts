/**
 * Два <video> плеера — одни на всю жизнь страницы.
 *
 * Вьюха Telegram на iPhone (WKWebView) пускает медиа только из касания:
 * play() вне обработчика жеста отклоняется с NotAllowedError, даже у
 * беззвучного ролика. Разрешение WebKit выдаёт не странице, а конкретному
 * элементу: один раз запущенный в касании <video> дальше можно запускать из
 * кода — и после смены src тоже.
 *
 * Поэтому элементы не живут в разметке плеера. Они создаются здесь один раз,
 * разблокируются в касании «Влиться в поток» (unlockVideos), а плеер лишь
 * вставляет их в свой круг и меняет им src. Уходя с экрана, плеер забирает
 * их из DOM, но не уничтожает: вернувшись, он получит те же два элемента,
 * уже разблокированные. Новый <video> на месте старого пришлось бы
 * разрешать заново — именно так ролик и застывал на первом кадре.
 */

import { asset } from '../lib/asset'

/**
 * Заглушка для разблокировки: один кадр 16×16, H.264 baseline, без звука,
 * полтора килобайта. Нужна, пока плеер ещё не поставил элементу ролик.
 * Лежит в корне, а не в `media/`: адрес `/media/` на сервере nginx отдаёт из
 * каталога загрузок бэкенда, и файл сайта там был бы недоступен (404).
 */
const UNLOCK_SRC = asset('unlock.mp4')

type Pair = readonly [HTMLVideoElement, HTMLVideoElement]

let pool: Pair | null = null

/** Элементы, которые плеер сейчас хочет видеть играющими. */
const wanted = new Set<HTMLVideoElement>()

/**
 * Элементы, которым браузер уже разрешил играть: воспроизведение у них
 * действительно началось — пришло событие playing или выполнилось обещание
 * play(). Одной попытки пуска для этого мало.
 */
const unlocked = new Set<HTMLVideoElement>()

/**
 * Последний пуск каждого элемента и чем он кончился. Отказ play() плеер не
 * глотает молча: его отсюда читает сторож (watchVideo) — и чтобы назвать
 * причину перезапуска, и чтобы на NotAllowedError не перезагружать ролик зря.
 */
type Attempt = { error: unknown }
const attempts = new Map<HTMLVideoElement, Attempt>()

function create(): HTMLVideoElement {
  const video = document.createElement('video')
  // Звука в роликах нет, но без muted WebKit вообще не пускает видео без
  // касания. Атрибуты дублируем свойствами: часть вьюх смотрит только на них.
  video.muted = true
  video.defaultMuted = true
  video.setAttribute('muted', '')
  // Без playsinline iPhone разворачивает ролик на весь экран.
  video.playsInline = true
  video.setAttribute('playsinline', '')
  video.setAttribute('webkit-playsinline', '')
  video.preload = 'auto'
  video.loop = true
  video.controls = false
  // Заиграл — значит, браузер разрешил элементу играть, откуда бы ни пришёл
  // пуск: из касания, от плеера или от сторожа.
  video.addEventListener('playing', () => unlocked.add(video))
  return video
}

/** Оба элемента. Создаются при первом обращении — и больше никогда. */
export function videoPool(): Pair {
  pool ??= [create(), create()]
  return pool
}

/**
 * Поставить ролик и постер. Тот же адрес второй раз не ставим: присвоение
 * src, даже прежнего, заново запускает загрузку, и ролик мигал бы.
 */
export function setVideoSource(video: HTMLVideoElement, src: string, poster: string): void {
  if (video.getAttribute('poster') !== poster) video.poster = poster
  if (video.getAttribute('src') !== src) video.src = src
}

/** play(), который всегда возвращает обещание: старые вьюхи отдают undefined. */
function start(video: HTMLVideoElement): Promise<void> {
  try {
    return Promise.resolve(video.play())
  } catch (error) {
    return Promise.reject(error)
  }
}

/** Запустить ролик. Обещание — как у play(): отказ браузера придёт в catch. */
export function playVideo(video: HTMLVideoElement): Promise<void> {
  wanted.add(video)
  // У каждого пуска своя запись: отказ прежнего, перебитого пуска может
  // прийти позже, но ляжет в прежнюю запись, а не в эту.
  const attempt: Attempt = { error: null }
  attempts.set(video, attempt)
  const started = start(video)
  started.then(
    // Заиграл — значит, разрешение у элемента уже есть, разблокировать нечего.
    () => unlocked.add(video),
    (error: unknown) => {
      attempt.error = error
    },
  )
  return started
}

/** Остановить ролик. */
export function pauseVideo(video: HTMLVideoElement): void {
  wanted.delete(video)
  video.pause()
}

/** Браузер не пустил медиа без касания. */
export function isNotAllowed(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotAllowedError'
}

/**
 * Разблокировать оба элемента. Звать синхронно, прямо в обработчике касания:
 * после первого await или таймера жеста для WebKit уже нет.
 *
 * Элемент запускаем и сразу останавливаем — если плеер тем временем не
 * попросил его играть. Настоящий ролик у элемента уже стоит — запускаем его:
 * заглушка на его месте сорвала бы закачку, и ролик пришлось бы качать
 * заново. Заглушку получает только элемент без ролика.
 *
 * Разблокированным элемент считается, только когда воспроизведение
 * действительно началось (обещание выполнилось или пришло playing — его
 * ловит create). NotAllowedError — касание не засчиталось; AbortError —
 * пуск перебили (плеер сменил src или поставил паузу), и неизвестно, успел
 * ли он начаться. Ни то ни другое не успех: такой элемент попробуем снова в
 * следующем касании. Разблокированные повторно не трогаем, так что лишний
 * вызов почти ничего не стоит.
 *
 * В Chrome, Firefox и на Android беззвучное видео играет и без касания —
 * там это просто короткий пуск и остановка, ничего не меняющие.
 */
export function unlockVideos(): void {
  for (const video of videoPool()) {
    if (unlocked.has(video)) continue
    if (!video.getAttribute('src')) video.src = UNLOCK_SRC
    // Разблокировка — не просьба плеера: играть элемент оставит только он.
    start(video).then(
      () => {
        unlocked.add(video)
        if (!wanted.has(video)) video.pause()
      },
      () => undefined,
    )
  }
}

/* ─────────────  Сторож  ───────────── */

/** Как часто сторож смотрит на ролик. */
const WATCH_MS = 700

/** Столько ролик с данными может стоять на одном кадре, прежде чем его сочтут застрявшим. */
const STILL_MS = 1500

/** Столько ролик может грузиться, прежде чем сторож один раз его перезагрузит. */
const LOADING_MS = 8000

/** Столько раз подряд сторож перезапускает ролик простым play(), прежде чем взяться за load(). */
const RESTARTS = 3

/** Название отказа для диагностики. */
const errorName = (error: unknown): string =>
  error instanceof DOMException || error instanceof Error ? error.name : String(error)

export type VideoWatch = {
  /** Вернуть элементу видимость: класс «на виду» и место в круге. */
  show: () => void
  /** Ролик не пошёл и после перезагрузки — дальше нужно касание человека. */
  giveUp: () => void
}

/**
 * Сторож ролика на виду: пока тренировка идёт, следит, что ролик
 * действительно играет. Таймер тренировки ведёт не ролик, а плеер, и ролик,
 * не пошедший после смены движения, стоял на кадре, пока кольцо шло.
 *
 * Раз в WATCH_MS сторож смотрит на элемент:
 * - ролик на паузе (play() отклонён, перебит или ролик кто-то остановил),
 *   ошибка ролика или, при данных наперёд (readyState ≥ HAVE_FUTURE_DATA),
 *   кадр не сменился за STILL_MS — застрял;
 * - данных ещё нет (readyState < HAVE_FUTURE_DATA) или идёт перемотка —
 *   грузится, это не застрял; но грузится дольше LOADING_MS — один раз
 *   load() и снова play().
 *
 * Застрял — вернуть видимость (show) и в следующем кадре play(); стоящий, но
 * не на паузе ролик сначала останавливаем: play() у неостановленного ничего
 * не перезапускает. Не пошло за RESTARTS попыток подряд: причина —
 * NotAllowedError — сразу giveUp (без касания его не пустят, перезагрузка
 * не поможет); иначе load() и play(), и если и это не помогло — giveUp.
 * Пошёл — счёт попыток сначала.
 *
 * Спрятанную вкладку не проверяет: там ролик стоит нарочно. Возвращает
 * функцию, снимающую сторожа.
 */
export function watchVideo(video: HTMLVideoElement, { show, giveUp }: VideoWatch): () => void {
  let lastTime = video.currentTime
  let movedAt = performance.now()
  let loadingSince: number | null = null
  let reloadedSlow = false
  let restarts = 0
  let reloaded = false
  let done = false
  let frame = 0

  const restart = (reason: string, reload: boolean) => {
    if (import.meta.env.DEV) {
      console.warn(`[ролик] сторож перезапускает: ${reason}`, {
        src: video.currentSrc,
        currentTime: video.currentTime,
        readyState: video.readyState,
        networkState: video.networkState,
        paused: video.paused,
      })
    }
    show()
    if (!video.paused && !reload) video.pause()
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      if (reload) {
        // load() раньше play(), а не наоборот: иначе он оборвал бы этот же
        // пуск. Ролик после него стоит в нуле — это не движение, и счёт
        // попыток сбрасываться не должен.
        video.load()
        lastTime = video.currentTime
      }
      void playVideo(video).catch(() => undefined)
    })
    movedAt = performance.now()
  }

  const check = () => {
    if (done || document.visibilityState === 'hidden') return
    const now = performance.now()
    const time = video.currentTime
    const moved = time !== lastTime
    lastTime = time

    // Идёт — всё хорошо, и счёт попыток сначала.
    if (!video.paused && moved) {
      movedAt = now
      loadingSince = null
      restarts = 0
      reloaded = false
      return
    }

    // Ещё грузится или перематывается. Часы «стоит на месте» при этом не
    // идут: иначе ролик, едва догрузившись, сразу считался бы застрявшим.
    const loading = video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA || video.seeking
    if (!video.paused && !video.error && loading) {
      movedAt = now
      loadingSince ??= now
      if (!reloadedSlow && now - loadingSince >= LOADING_MS) {
        reloadedSlow = true
        loadingSince = now
        restart('грузится дольше 8 с', true)
      }
      return
    }
    loadingSince = null

    // Играет с данными — кадр ещё может смениться, ждём STILL_MS.
    if (!video.paused && !video.error && now - movedAt < STILL_MS) return

    const failure = attempts.get(video)?.error ?? null
    const reason = video.error
      ? `ошибка ролика, код ${video.error.code}`
      : !video.paused
        ? 'не движется'
        : failure
          ? `ошибка play(): ${errorName(failure)}`
          : 'paused'

    if (restarts < RESTARTS) {
      restarts += 1
      restart(`${reason}, попытка ${restarts}`, false)
      return
    }
    if (!reloaded && !isNotAllowed(failure)) {
      reloaded = true
      restart(`${reason}, перезагрузка`, true)
      return
    }
    done = true
    if (import.meta.env.DEV) console.warn(`[ролик] сторож сдался: ${reason} — ждём касания`)
    giveUp()
  }

  const timer = setInterval(check, WATCH_MS)
  return () => {
    done = true
    clearInterval(timer)
    cancelAnimationFrame(frame)
  }
}
