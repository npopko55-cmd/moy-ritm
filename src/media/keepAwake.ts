/**
 * Экран не гаснет, пока идёт тренировка.
 *
 * Телефон гасит экран через 30–60 секунд без касаний, а человек в это время
 * повторяет движения и экрана не трогает. Погасший экран — это спрятанная
 * вкладка (visibilitychange → hidden), и плеер честно ставит тренировку на
 * паузу: музыка и ролик встают посреди захода. Поэтому, пока тренировка идёт
 * (и на отсчёте перед ней), экран держим включённым.
 *
 * Основной путь — Screen Wake Lock API, navigator.wakeLock.request('screen'):
 * Chrome на Android, Safari с iOS 16.4, браузеры на компьютере. Просим его в
 * самом касании («Влиться в поток», «Играть», «Продолжить»): Safari без
 * свежего касания замок не даёт. Спрятанной вкладке браузер замок снимает сам —
 * вернулись, а экран всё ещё нужен (например, идёт отсчёт) — просим снова.
 *
 * Запасной путь — где замка нет или он отказал: вьюха Telegram на Android
 * (WebView не знает wakeLock), iPhone до iOS 16.4 (Safari и WKWebView
 * Telegram), веб-версия Telegram, где рамке замок не разрешён. Как у
 * NoSleep.js: вне экрана играет крошечное видео с беззвучной звуковой
 * дорожкой (public/nosleep.mp4 — 16×16, 2 с, дорожка — цифровая тишина).
 * Экран не гасят сами движки, пока играет видео со звуком:
 *   • WebKit — только у ролика со звуковой дорожкой, без muted и без
 *     атрибута loop (HTMLMediaElement::shouldDisableSleep). Поэтому ролик не
 *     приглушён, а петля — не атрибутом loop, а перемоткой назад по timeupdate;
 *   • Chromium — у играющего ролика со звуком и ненулевой громкостью на
 *     видимой странице (VideoWakeLock), даже если сам ролик за краем экрана.
 * Звучать нечему: в дорожке тишина. Пуск со звуком WebKit и WebView
 * разрешают только в касании, поэтому видео запускается прямо в нём — рядом
 * с unlockMedia(). Где замок есть, видео в касании лишь «разблокируем»
 * беззвучным пуском и остановкой, как ролики и музыку (src/media/unlock.ts):
 * если замок потом откажет, видео запустится уже из кода.
 *
 * Музыке и роликам плеера оно не мешает: это отдельный элемент, не из пула
 * (src/media/videoPool.ts), и разблокировка пула его не трогает. На iPhone
 * запрет играть одновременно WebKit держит только внутри одного вида медиа —
 * «видео со звуком»; у музыки вид «аудио», у роликов плеера (muted) — «видео».
 *
 * Кто держит экран:
 *   • касание (keepAwake) — просит экран сразу, пока касание ещё идёт;
 *   • отсчёт и идущая тренировка (holdAwake) — подтверждают, что экран нужен,
 *     и отпускают его (releaseAwake) на паузе и при уходе. Касание, после
 *     которого тренировка так и не началась (увели на вход, на предложение
 *     тарифов), отпускается само через LEASE_MS.
 */

import { asset } from '../lib/asset'

/** Беззвучное видео запасного пути. Лежит в корне, как unlock.mp4: /media/ на сервере — чужой каталог. */
const SRC = asset('nosleep.mp4')

/** Касание попросило экран, а тренировка так и не началась — отпускаем через столько. */
const LEASE_MS = 15_000

/** Перемотка назад, как только ролик ушёл дальше этой секунды: до конца (2 с) он не доходит. */
const REWIND_AFTER = 0.5

/** Экран должен гореть. */
let wanted = false
/** Желание подтвердил экран тренировки: отсчёт или идущий плеер. */
let held = false
let lease: number | undefined

/** Замок экрана, пока он у нас. */
let sentinel: WakeLockSentinel | null = null
/** Запрос замка в пути — второй не шлём. */
let asking = false
/** Замок отказал: следующее касание сразу запускает и видео. */
let lockFailed = false

let video: HTMLVideoElement | null = null
/** Видео должно играть: держит экран вместо замка. */
let videoOn = false
/** Видео хоть раз пошло: дальше его можно запускать из кода, без касания. */
let videoUnlocked = false

let wired = false

function hasWakeLock(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'wakeLock' in navigator &&
    typeof navigator.wakeLock?.request === 'function'
  )
}

function visible(): boolean {
  return document.visibilityState === 'visible'
}

/** Элемент создаётся при первом касании: гостю на лендинге качать нечего. */
function element(): HTMLVideoElement {
  if (video) return video
  const v = document.createElement('video')
  // Без playsinline iPhone развернул бы ролик на весь экран.
  v.playsInline = true
  v.setAttribute('playsinline', '')
  v.setAttribute('webkit-playsinline', '')
  v.setAttribute('disablepictureinpicture', '')
  v.setAttribute('disableremoteplayback', '')
  v.setAttribute('aria-hidden', 'true')
  v.tabIndex = -1
  v.preload = 'auto'
  v.controls = false
  // Не muted и без loop — иначе WebKit экран гасить не мешает (см. шапку).
  v.muted = false
  v.loop = false
  // Вне экрана, но в документе: WebKit на iOS 15+ держит экран только
  // роликом, который вставлен в страницу. display: none нельзя — такой ролик
  // браузер вправе не играть.
  Object.assign(v.style, {
    position: 'fixed',
    left: '-100px',
    top: '-100px',
    width: '16px',
    height: '16px',
    pointerEvents: 'none',
  })
  v.addEventListener('timeupdate', () => {
    // Петля перемоткой: ролик не доходит до конца, а конец снял бы запрет сна.
    // Точка возврата случайная, как у NoSleep.js: одинаковая перемотка раз за
    // разом браузеру не нужна.
    if (v.currentTime > REWIND_AFTER) v.currentTime = Math.random() * REWIND_AFTER
  })
  // Подстраховка, если timeupdate не успел: дошёл до конца — сначала.
  v.addEventListener('ended', () => {
    if (!videoOn) return
    v.currentTime = 0
    void start(v, false).catch(() => undefined)
  })
  v.src = SRC
  document.body.appendChild(v)
  video = v
  return v
}

/** play(), который всегда возвращает обещание: старые вьюхи отдают undefined. */
function start(v: HTMLVideoElement, muted: boolean): Promise<void> {
  v.muted = muted
  try {
    return Promise.resolve(v.play())
  } catch (error) {
    return Promise.reject(error)
  }
}

/** Видео держит экран. Из касания пускается всегда, из кода — если уже разблокировано. */
function startVideo(): void {
  const v = element()
  videoOn = true
  start(v, false).then(
    () => {
      videoUnlocked = true
      if (!videoOn) v.pause()
    },
    () => undefined,
  )
}

function stopVideo(): void {
  videoOn = false
  video?.pause()
}

/**
 * Беззвучный пуск и остановка в касании: разрешение запускать видео потом,
 * из кода, — на случай, если замок откажет. muted здесь только на время
 * пуска: играть видео будет уже со звуковой дорожкой.
 */
function primeVideo(): void {
  if (videoUnlocked || videoOn) return
  const v = element()
  start(v, true).then(
    () => {
      videoUnlocked = true
      if (!videoOn) v.pause()
      v.muted = false
    },
    () => {
      v.muted = false
    },
  )
}

function requestLock(): void {
  if (!hasWakeLock() || sentinel || asking || !visible()) return
  asking = true
  let request: Promise<WakeLockSentinel>
  try {
    request = navigator.wakeLock.request('screen')
  } catch (error) {
    request = Promise.reject(error)
  }
  request.then(
    (lock) => {
      asking = false
      if (!wanted) {
        void lock.release().catch(() => undefined)
        return
      }
      sentinel = lock
      lockFailed = false
      lock.addEventListener('release', () => {
        if (sentinel === lock) sentinel = null
      })
      // Экран держит замок — беззвучному видео играть незачем.
      stopVideo()
    },
    () => {
      asking = false
      lockFailed = true
      // Замок не дали (вьюха, рамка, нет касания) — держим экран видео.
      if (wanted) startVideo()
    },
  )
}

/** Взять экран: замок, а где его нет или он отказывал — видео. */
function acquire(inTap: boolean): void {
  if (hasWakeLock()) requestLock()
  if (!hasWakeLock() || lockFailed) startVideo()
  else if (inTap) primeVideo()
}

/**
 * Вернулись на вкладку: спрятанной вкладке браузер снимает замок, а видео
 * могло встать. Экран всё ещё нужен (идёт отсчёт) — берём его снова.
 */
function wire(): void {
  if (wired) return
  wired = true
  document.addEventListener('visibilitychange', () => {
    if (!visible() || !wanted) return
    if (hasWakeLock() && !lockFailed) requestLock()
    if (videoOn || !hasWakeLock() || lockFailed) startVideo()
  })
}

/**
 * Касание, после которого начнётся тренировка: «Влиться в поток», «Играть»,
 * «Продолжить сейчас», «Нажмите, чтобы начать». Звать синхронно, в самом
 * обработчике, рядом с unlockMedia(): после await касания для WebKit уже нет.
 */
export function keepAwake(): void {
  try {
    wire()
    wanted = true
    acquire(true)
    // Тренировка не подтвердила, что экран нужен, — отпускаем сами.
    window.clearTimeout(lease)
    lease = window.setTimeout(() => {
      if (!held) releaseAwake()
    }, LEASE_MS)
  } catch {
    /* подстраховка: кнопка должна сработать в любом случае */
  }
}

/**
 * Экран нужен: идёт отсчёт или тренировка. Без касания — из эффекта: обычно
 * касание уже взяло экран, и здесь это лишь подтверждение.
 */
export function holdAwake(): void {
  try {
    wire()
    held = true
    wanted = true
    window.clearTimeout(lease)
    acquire(false)
  } catch {
    /* экран погаснет по-старому — тренировку это не ломает */
  }
}

/** Тренировка на паузе или экран ушёл — экран снова может гаснуть. */
export function releaseAwake(): void {
  wanted = false
  held = false
  window.clearTimeout(lease)
  const lock = sentinel
  sentinel = null
  if (lock) void lock.release().catch(() => undefined)
  stopVideo()
}
