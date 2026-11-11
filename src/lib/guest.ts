/**
 * Гостевой режим: ссылка /play/<токен>_<метка> пускает в плеер без
 * регистрации (заказ Димы 06.10.2026, запуск из блога).
 *
 *   • плеер гостя берёт всё из GET /player/guest-bootstrap — без входа, та
 *     же форма, что у bootstrap вошедшего (loadGuestBootstrap);
 *   • минуты гостя копятся в гостевом буфере (src/lib/chunks.ts) и уходят под
 *     аккаунт, когда человек зарегистрировался или вошёл в этом же браузере
 *     (finishGuest — её зовёт SessionProvider);
 *   • окно регистрации — по секундам движения в этом заходе: первое — мягкое,
 *     на минуте, без паузы (GUEST_FIRST_PROMPT_SECONDS, с 12.11.2026; до
 *     этого полное на 1:30 с паузой), короткое через 1:30 после него и дальше
 *     каждые 1:30 (GUEST_PROMPT_SECONDS; Никита 12.10.2026: гостю открыты 3
 *     движения по 30 с, они идут по кругу). Заход — вкладка:
 *     счёт и показанные окна лежат в sessionStorage, перезагрузка их не
 *     обнуляет, а новая вкладка (с главной сайта, по ссылке из блога — всё
 *     равно откуда) начинает с нуля и с полного окна. Дима 14.10.2026: «неважно,
 *     с какой страницы ты заходишь — полторы минуты, потом окно». До этого
 *     счёт копился в localStorage через все прошлые заходы, и в новом заходе
 *     первое окно приходило не на 1:30;
 *   • события гостя — POST /funnel/guest-event (reportGuest), ошибки глушим:
 *     метрика не должна мешать тренировке.
 */

import { api } from '../api/client'
import type { GuestAction, GuestBootstrap, GuestPromptKind } from '../api/types'
import { DEFAULT_STREAM } from '../data/streams'
import { track } from './analytics'
import { adoptGuestChunks } from './chunks'
import { anonId, readFunnelGuest, readFunnelToken } from './funnel'

/*
 * Адреса гостя (правка Димы 06.10.2026: «точно нужна главная»):
 *   • /play/<токен>        — главная с объяснением сервиса (Landing);
 *   • /play/<токен>/start  — отсчёт, как у вошедшего «Влиться в поток»;
 *   • /play/<токен>/live   — плеер гостя: после отсчёта тренировка идёт сама.
 * Токен с меткой когорты — в самом адресе, поэтому перезагрузка любого из
 * трёх экранов её не теряет.
 */

/** Отсчёт гостя — сюда ведёт «Включить эфир» на главной в гостевом режиме. */
export const guestStartPath = (token: string) => `/play/${token}/start`

/** Плеер гостя — сюда уводит отсчёт. */
export const guestLivePath = (token: string) => `/play/${token}/live`

/** Куда вернуть человека после регистрации из окна: в обычный плеер. */
export const GUEST_NEXT = `/player/${DEFAULT_STREAM.id}`

/** Регистрация из окна гостя: токен воронки уже запомнен, как после /go. */
export const GUEST_REGISTER_PATH = `/register?next=${encodeURIComponent(GUEST_NEXT)}`

/**
 * Тарифы из плеера гостя (владелец, 21.10.2026): блок «Открой весь
 * функционал Ритма!» и обе кнопки окна ведут сюда, а не сразу на
 * регистрацию. Первой карточкой там у такого гостя стоит «3 дня бесплатно»
 * (guestTrialToken ниже), за ней — платные тарифы.
 */
export const GUEST_TARIFFS_PATH = '/tariffs'

/** «Войти» в шапке гостя — и обратно в плеер, уже под своим аккаунтом. */
export const GUEST_LOGIN_PATH = `/login?next=${encodeURIComponent(GUEST_NEXT)}`

/**
 * Когда гость видит первое окно — секунды движения в этом заходе. Единственное
 * место, где задаётся момент: поменять — только здесь.
 *
 * С 12.11.2026 — 60 с, мягкое окно (GuestNudge): тренировка и музыка не
 * останавливаются. До этого первым было полное окно на 90 с, и оно ставило
 * тренировку на паузу; 60% начавших гостевую тренировку уходили раньше, чем
 * его видели. Почему минута, а не «после круга»: круг у гостя — 3 движения
 * по 30 с, то есть те же 90 с, раньше от него окно не встанет. Минута — конец
 * второго движения: окно ждёт стыка движений (Player.tsx), и на 30-секундных
 * движениях 60 с ровно на стыке, человек уже понял, что это за тренировка.
 */
export const GUEST_FIRST_PROMPT_SECONDS = 60

/**
 * Пороги окна в секундах движения этого захода: первое (мягкое, см. выше),
 * короткое после первого, дальше короткое каждые столько. Короткие — как
 * раньше, через 1:30 и каждые 1:30 (Никита, 12.10: гостю 3 движения по 30 с).
 * Мягкое окно тренировку не останавливает, поэтому «через 1:30 после него»
 * считается от показа. Счёт — на заход, а не на браузер (Дима, 14.10).
 */
export const GUEST_PROMPT_SECONDS = { full: GUEST_FIRST_PROMPT_SECONDS, shortAfterFull: 90, shortEvery: 90 }

type Thresholds = typeof GUEST_PROMPT_SECONDS

/**
 * Пороги для этого открытия. Только в разработке их можно уменьшить адресом
 * `?guestPrompt=10,15,20` — чтобы проверить окно, не двигаясь по полторы минуты.
 * В сборке для сайта параметр не читается вовсе.
 */
export function guestThresholds(): Thresholds {
  if (!import.meta.env.DEV) return GUEST_PROMPT_SECONDS
  const raw = new URLSearchParams(window.location.search).get('guestPrompt')
  const [full, shortAfterFull, shortEvery] = (raw ?? '').split(',').map(Number)
  if (!(full > 0 && shortAfterFull > 0 && shortEvery > 0)) return GUEST_PROMPT_SECONDS
  return { full, shortAfterFull, shortEvery }
}

/** Счёт этого захода: секунды движения и показанные окна — в sessionStorage. */
const MOVED_KEY = 'moy-ritm.guest.moved'
const PROMPT_KEY = 'moy-ritm.guest.prompt'
/** Один guest_start на браузер (метрика) — в localStorage, как и было. */
const STARTED_KEY = 'moy-ritm.guest.started'

type Store = 'local' | 'session'

/** Когда хранилище закрыто (приватный режим) — счёт живёт до перезагрузки. */
const memory = new Map<string, string>()

function read(key: string, store: Store = 'local'): string | null {
  try {
    return (store === 'local' ? localStorage : sessionStorage).getItem(key)
  } catch {
    return memory.get(key) ?? null
  }
}

function write(key: string, value: string | null, store: Store = 'local'): void {
  if (value === null) memory.delete(key)
  else memory.set(key, value)
  try {
    const target = store === 'local' ? localStorage : sessionStorage
    if (value === null) target.removeItem(key)
    else target.setItem(key, value)
  } catch {
    /* приватный режим — хватит памяти вкладки */
  }
}

/**
 * До 14.10.2026 счёт и окна лежали в localStorage под теми же ключами и
 * копились через все заходы (там же могли остаться пороги старых версий).
 * При первом обращении за жизнь страницы молча стираем — читать их больше
 * некому.
 */
let legacyCleared = false

function clearLegacy(): void {
  if (legacyCleared) return
  legacyCleared = true
  try {
    localStorage.removeItem(MOVED_KEY)
    localStorage.removeItem(PROMPT_KEY)
  } catch {
    /* хранилище закрыто — и стирать нечего */
  }
}

/** Счёт захода: прочитать и записать — только через эти две. */
function readVisit(key: string): string | null {
  clearLegacy()
  return read(key, 'session')
}

function writeVisit(key: string, value: string | null): void {
  clearLegacy()
  write(key, value, 'session')
}

/** Секунды движения гостя в этом заходе (вкладке) — перезагрузка их не обнуляет. */
export function guestMoved(): number {
  const n = Number(readVisit(MOVED_KEY))
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Прибавить секунды движения; возвращает новый счёт. */
export function addGuestMoved(seconds: number): number {
  const next = guestMoved() + seconds
  writeVisit(MOVED_KEY, String(next))
  return next
}

/** Что уже показано в этом заходе: полное окно и с какой секунды движения положено короткое. */
type PromptState = { full: boolean; next: number }

function promptState(): PromptState {
  try {
    const saved = JSON.parse(readVisit(PROMPT_KEY) ?? 'null') as PromptState | null
    if (saved && typeof saved.full === 'boolean' && Number.isFinite(saved.next)) return saved
  } catch {
    /* испорченная запись — как будто окон ещё не было */
  }
  return { full: false, next: 0 }
}

/** Какое окно положено сейчас: полное, короткое или никакого. */
export function guestPromptDue(moved: number, t: Thresholds): GuestPromptKind | null {
  const state = promptState()
  if (!state.full) return moved >= t.full ? 'full' : null
  return moved >= state.next ? 'short' : null
}

/**
 * Окно показано — запоминаем, когда следующее. Пока окно открыто, тренировка
 * стоит, поэтому «через 1:30 после закрытия» — то же, что после показа.
 */
export function markGuestPromptShown(kind: GuestPromptKind, moved: number, t: Thresholds): void {
  const next: PromptState = {
    full: true,
    next: moved + (kind === 'full' ? t.shortAfterFull : t.shortEvery),
  }
  writeVisit(PROMPT_KEY, JSON.stringify(next))
}

/** Полное окно в этом заходе уже было — «Вернусь позже» на паузе зовёт короткое. */
export const guestFullShown = (): boolean => promptState().full

/** Событие гостя. Не падает и не ждёт ответа. */
export function reportGuest(token: string, action: GuestAction, kind?: GuestPromptKind): void {
  api.guestEvent({ token, anon_id: anonId(), action, ...(kind ? { kind } : {}) }).catch(() => undefined)
}

/**
 * Первый настоящий пуск тренировки гостем. Один раз на браузер: отметка в
 * хранилище, а дубль (две вкладки, StrictMode) сервер погасит сам.
 */
export function reportGuestStart(token: string): void {
  if (read(STARTED_KEY)) return
  write(STARTED_KEY, '1')
  reportGuest(token, 'start')
  // Та же отметка — и для счётчиков рекламы: цель guest_start одна на браузер.
  track('guest_start')
}

/* ——— Ответ guest-bootstrap ——— */

let guestBoot: { token: string; job: Promise<GuestBootstrap>; boot: GuestBootstrap | null } | null = null

/**
 * Плеер гостя: один запрос на токен за жизнь страницы. Его заранее зовёт
 * экран /play (PlayGuest), а плеер дожидается того же ответа.
 */
export function loadGuestBootstrap(token: string): Promise<GuestBootstrap> {
  if (guestBoot?.token === token) return guestBoot.job
  const entry: NonNullable<typeof guestBoot> = { token, job: api.guestBootstrap(token), boot: null }
  guestBoot = entry
  entry.job.then(
    (boot) => {
      entry.boot = boot
    },
    () => {
      // Не вышло — следующий вызов спросит заново.
      if (guestBoot === entry) guestBoot = null
    },
  )
  return entry.job
}

/** Уже пришедший ответ — для первого рендера плеера. */
export function lastGuestBootstrap(token: string | undefined): GuestBootstrap | null {
  return guestBoot && guestBoot.token === token ? guestBoot.boot : null
}

/* ——— Карточка «3 дня бесплатно» на тарифах ——— */

/**
 * Токен воронки, запомненный с гостевой ссылки /play/, или null. Запоминают
 * его PlayGuest и переход из плеера на тарифы, снимает — регистрация.
 * Входа он не учитывает: вошёл ли человек, решает тот, кто спрашивает.
 */
export function savedGuestToken(): string | null {
  const token = readFunnelToken()
  return token !== null && readFunnelGuest() ? token : null
}

/*
 * Кому показывать «3 дня бесплатно». Три дня даёт только регистрация с
 * токеном воронки trial3d (бэкенд, funnel_service: TRIAL3D_DAYS суток всё
 * открыто). Без токена пробного нет вовсе (TRIAL_DAYS = 0), а с токеном
 * trial20 — челлендж без трёх дней. Какая воронка за токеном, фронтенд сам
 * не решает (src/lib/funnel.ts) — её называет ответ guest-bootstrap
 * (guest.funnel). Поэтому карточку видит только гость, у которого:
 *   • запомнен токен с гостевой ссылки (savedGuestToken);
 *   • guest-bootstrap по этому токену ответил funnel = trial3d.
 * Не ответил (сеть, 404 — ссылки нет или воронки выключены) — карточки нет:
 * лучше не показать её, чем пообещать три дня, которых не будет.
 */

/** Уже известный ответ — без запроса: из плеера на тарифы карточка не мигает. */
export function knownGuestTrialToken(): string | null {
  const token = savedGuestToken()
  return token && lastGuestBootstrap(token)?.guest.funnel === 'trial3d' ? token : null
}

/**
 * То же с запросом, если ответа ещё нет (тарифы открыли перезагрузкой или
 * отдельной вкладкой). guest-bootstrap — публичная ручка и ничего не пишет;
 * в плеере тот же ответ берётся из памяти страницы, второго запроса нет.
 * Не падает.
 */
export async function loadGuestTrialToken(): Promise<string | null> {
  const token = savedGuestToken()
  if (!token) return null
  try {
    const boot = await loadGuestBootstrap(token)
    return boot.guest.funnel === 'trial3d' ? token : null
  } catch {
    return null
  }
}

/**
 * Гость стал аккаунтом — зарегистрировался или вошёл в этом браузере.
 * Минуты гостевого буфера переходят в буфер человека (уйдут с первым
 * открытием плеера), счёт окон сбрасывается: он нужен только гостю.
 */
export function finishGuest(userId: string): void {
  adoptGuestChunks(userId)
  writeVisit(MOVED_KEY, null)
  writeVisit(PROMPT_KEY, null)
}

/* ——— «Сначала гость» на лендинге (GUEST_FIRST_ENABLED) ——— */

let config: Promise<string | null> | null = null

/**
 * Строка гостевой ссылки для «Включить эфир» невошедшего или null — кнопка
 * ведёт как раньше. Один запрос за жизнь страницы и только с лендинга.
 * Кнопка с этой строкой ведёт прямо в отсчёт гостя (guestStartPath), а не на
 * /play/<токен>: там та же главная, и вышел бы круг «главная → главная».
 */
export function guestFirstToken(): Promise<string | null> {
  config ??= api.guestConfig().then(
    (c) => (c.enabled && c.token ? c.token : null),
    () => null,
  )
  return config
}
