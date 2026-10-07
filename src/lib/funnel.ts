/**
 * Метка воронки и анонимный id посетителя.
 *
 * Человек приходит из Telegram по ссылке входа /go/<токен> или открывает
 * мини-ап ссылкой t.me/<бот>/<app>?startapp=<токен> (launchFunnel). Визит в
 * обоих случаях один и тот же (visitFunnel). Токен сохраняем
 * до регистрации и отдаём в POST /auth/register (funnel_token) — дальше
 * метку воронки хранит бэкенд, а токен здесь больше не нужен. Какая это
 * воронка, фронтенд не решает: токен передаётся из адреса как есть.
 *
 * Анонимный id нужен бэкенду, чтобы считать уникальные визиты по ссылке,
 * а не открытия страницы. Хранилище может быть недоступно (приватный режим)
 * — тогда id живёт до перезагрузки, а токен просто не запоминается.
 */

import { api } from '../api/client'
import { ApiError, type BannerPlace } from '../api/types'
import { telegramStartParam } from './telegram'
import { uuid } from './uuid'

const ANON_KEY = 'moy-ritm.anon'
const TOKEN_KEY = 'moy-ritm.funnel_token'
/** Токен пришёл с гостевой ссылки /play/: регистрация пошлёт guest: true. */
const GUEST_KEY = 'moy-ritm.funnel_guest'
/** Токен из параметра запуска, визит по которому уже ушёл в этом открытии мини-апа. */
const LAUNCH_KEY = 'moy-ritm.funnel_launch'

/**
 * Так выглядит токен ссылки воронки. Другое значение startapp — не воронка.
 * «_» разрешён: ссылки из писем несут метку письма — hx4q7m2p_m1. Строка
 * уходит в визит и в регистрацию целиком, метку разбирает бэкенд.
 */
const TOKEN_RE = /^[A-Za-z0-9_-]{4,64}$/

/**
 * Похоже ли значение на токен воронки. Нужно, когда сервер не ответил: такой
 * токен запоминаем до регистрации, а мусор из адреса — нет (длиннее 64
 * знаков его не примет уже сама регистрация).
 */
export const isFunnelToken = (value: string): boolean => TOKEN_RE.test(value)

/** id на время жизни страницы, если в localStorage записать нельзя. */
let memoryAnon: string | null = null

export function anonId(): string {
  try {
    const saved = localStorage.getItem(ANON_KEY)
    if (saved) return saved
    const id = uuid()
    localStorage.setItem(ANON_KEY, id)
    return id
  } catch {
    return (memoryAnon ??= uuid())
  }
}

export function saveFunnelToken(token: string, guest = false): void {
  try {
    localStorage.setItem(TOKEN_KEY, token)
    // Обычная ссылка /go после гостевой снимает пометку: человек пришёл не гостем.
    if (guest) localStorage.setItem(GUEST_KEY, '1')
    else localStorage.removeItem(GUEST_KEY)
  } catch {
    /* приватный режим — зарегистрируется без метки */
  }
}

export function readFunnelToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY) || null
  } catch {
    return null
  }
}

/** Запомненный токен — с гостевой ссылки /play/. */
export function readFunnelGuest(): boolean {
  try {
    return localStorage.getItem(GUEST_KEY) === '1'
  } catch {
    return false
  }
}

export function forgetFunnelToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(GUEST_KEY)
  } catch {
    /* нечего забывать */
  }
}

/**
 * Чем кончился визит по ссылке воронки:
 *   • ok — воронка есть;
 *   • not_found — сервер ответил 404 FUNNEL_NOT_FOUND: такой ссылки нет
 *     (или воронки выключены);
 *   • error — ответа по существу нет: сеть, таймаут, 429, 5xx и всё прочее.
 *
 * Сбой — не «ссылки нет». Раньше любой сбой считался незнакомым токеном,
 * метка терялась, и человек регистрировался без воронки. Теперь при сбое
 * токен всё равно запоминается: при регистрации его проверит сам сервер,
 * незнакомый он просто не поставит.
 */
export type FunnelVisitResult = 'ok' | 'not_found' | 'error'

/** Один визит на токен за жизнь страницы: StrictMode не должен считать дважды. */
const visits = new Map<string, Promise<FunnelVisitResult>>()

/**
 * Визит по ссылке воронки: POST /funnel/visit с анонимным id. Не падает.
 * `guest` — гостевая ссылка /play/: визит с meta.guest.
 */
export function visitFunnel(token: string, guest = false): Promise<FunnelVisitResult> {
  const key = guest ? `guest:${token}` : token
  let job = visits.get(key)
  if (!job) {
    job = api.funnelVisit(token, anonId(), guest).then(
      (): FunnelVisitResult => 'ok',
      (e: unknown): FunnelVisitResult =>
        e instanceof ApiError && e.status === 404 && e.code === 'FUNNEL_NOT_FOUND' ? 'not_found' : 'error',
    )
    visits.set(key, job)
  }
  return job
}

function launchCounted(token: string): boolean {
  try {
    return sessionStorage.getItem(LAUNCH_KEY) === token
  } catch {
    return false
  }
}

function markLaunchCounted(token: string): void {
  try {
    sessionStorage.setItem(LAUNCH_KEY, token)
  } catch {
    /* приватный режим — перезагрузка пришлёт визит ещё раз, это не страшно */
  }
}

let launch: Promise<string | null> | null = null

/**
 * Воронка из параметра запуска мини-апа — та же ссылка входа, что
 * /go/<токен>. Визит — один раз за открытие мини-апа: перезагрузка внутри
 * Telegram его не повторяет. Отдаёт токен или null и не падает. Запоминать
 * ли токен для регистрации, решает SessionProvider: только если человек не
 * вошёл.
 *
 * Токен отдаётся и при сбое визита (сеть, 429, 5xx): метку проверит
 * регистрация. null — только если сервер ответил, что такой ссылки нет.
 * Засчитанным визит считаем лишь по ответу сервера — после сбоя
 * перезагрузка мини-апа пошлёт его ещё раз.
 */
export function launchFunnel(): Promise<string | null> {
  launch ??= (async () => {
    const token = telegramStartParam()
    if (!TOKEN_RE.test(token) || launchCounted(token)) return null
    const result = await visitFunnel(token)
    if (result !== 'error') markLaunchCounted(token)
    return result === 'not_found' ? null : token
  })()
  return launch
}

/* ——— Плашка «Открой все 40» ——— */

/**
 * Показ плашки уже засчитан сервером в эти сутки: `<id человека>:<дата по
 * Москве>`. Во вкладке, а не в localStorage: новая вкладка пошлёт показ ещё
 * раз, и сервер сам его погасит.
 */
const BANNER_SHOWN_KEY = 'moy-ritm.banner_shown'

/** Сутки — по Москве, как их считает бэкенд («раз в сутки по Москве»). */
function moscowDay(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date())
  } catch {
    // Пояса браузер не знает — сутки по UTC: в худшем случае лишний показ,
    // который сервер всё равно погасит.
    return new Date().toISOString().slice(0, 10)
  }
}

/** Показ уже в пути: плеер и пауза или StrictMode не пошлют его дважды. */
let bannerShownPending = false

/**
 * Плашку «Открой все 40» показали (POST /funnel/banner, shown).
 *
 * Сервер пишет показ не чаще раза в сутки по Москве на человека, поэтому
 * второй раз за те же сутки из этой вкладки его не шлём вовсе. Отметку
 * ставим по ответу: не дошёл — пошлёт следующий показ. Ошибки глушим —
 * метрика не должна мешать тренировке.
 */
export function reportBannerShown(place: BannerPlace, userId: string | undefined): void {
  if (!userId || bannerShownPending) return
  const mark = `${userId}:${moscowDay()}`
  try {
    if (sessionStorage.getItem(BANNER_SHOWN_KEY) === mark) return
  } catch {
    /* хранилище закрыто — шлём: повтор сервер погасит сам */
  }
  bannerShownPending = true
  api
    .funnelBanner('shown', place)
    .then(
      () => {
        try {
          sessionStorage.setItem(BANNER_SHOWN_KEY, mark)
        } catch {
          /* приватный режим — следующий показ пошлёт ещё раз, не страшно */
        }
      },
      () => undefined,
    )
    .finally(() => {
      bannerShownPending = false
    })
}

/**
 * Нажали «Открыть» на плашке (POST /funnel/banner, click) — каждое нажатие.
 * Уходит до перехода и без ожидания ответа: переход на тарифы не ждёт
 * метрику, а её ошибки глушим.
 */
export function reportBannerClick(place: BannerPlace): void {
  api.funnelBanner('click', place).catch(() => undefined)
}
