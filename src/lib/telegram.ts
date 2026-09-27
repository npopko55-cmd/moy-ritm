/**
 * Telegram Mini App.
 *
 * Запуск идёт через Telegram: канал → бот → кнопка, которая открывает сайт
 * внутри Telegram. Узнаём это по параметрам запуска: Telegram дописывает к
 * адресу #tgWebAppData=…&tgWebAppVersion=… (изредка — в ?query) или сам
 * кладёт window.Telegram.WebApp.
 *
 * Скрипт Telegram (telegram-web-app.js) подключается только в этом случае и
 * только динамически: обычному посетителю сайта он не нужен, и в основной
 * бандл его код не попадает. Скрипт — своя копия в public/ (скачана с
 * https://telegram.org/js/telegram-web-app.js 28.09.2026 без правок): у части
 * людей в России telegram.org не открывается или открывается минутами, а мини-ап
 * ждал его и висел. Даже свой скрипт ждём не дольше SCRIPT_TIMEOUT_MS, и
 * ничто важное от него не зависит:
 *   • «готово» и «развернуть» уходят клиенту сразу при старте, напрямую
 *     (postRaw), — тем же путём, каким их шлёт сам скрипт;
 *   • ссылки на сайт без скрипта открываются тем же прямым событием;
 *   • догрузился позже — цвета, запрет свайпа, кнопка «Назад» и события
 *     всё равно включаются (whenTelegram).
 *
 * Оплаты внутри мини-апа нет — так требуют правила Telegram. Кнопки оплаты
 * там открывают сайт во внешнем браузере: тарифы (openTariffsOnSite) или
 * сразу страницу оплаты выбранного тарифа (openPayOnSite).
 *
 * Ссылка t.me/<бот>/<app>?startapp=<значение> открывает мини-ап с параметром
 * запуска (telegramStartParam): им приходит токен воронки, как в /go/<токен>.
 */

import { asset } from './asset'

type BackButton = {
  show(): void
  hide(): void
  onClick(cb: () => void): void
  offClick(cb: () => void): void
}

/** Только то, чем пользуемся. Методы новых версий — необязательные. */
type WebApp = {
  initData: string
  initDataUnsafe?: { start_param?: string }
  ready(): void
  expand(): void
  openLink(url: string): void
  setHeaderColor?(color: string): void
  setBackgroundColor?(color: string): void
  disableVerticalSwipes?(): void
  onEvent?(event: string, handler: () => void): void
  BackButton?: BackButton
}

/** Мост, который клиенты Telegram (мобильные и настольные) дают странице. */
type WebviewProxy = { postEvent(eventType: string, eventData: string): void }

declare global {
  interface Window {
    Telegram?: { WebApp?: WebApp }
    TelegramWebviewProxy?: WebviewProxy
  }
}

/** Своя копия скрипта Telegram — со своего домена, а не с telegram.org. */
const SCRIPT_URL = asset('telegram-web-app.js')

/** Дольше скрипт не ждём: ждущие получают null и обходятся без него. */
const SCRIPT_TIMEOUT_MS = 3000

/** Параметры запуска на эту вкладку: перезагрузка внутри мини-апа их не теряет. */
const SESSION_KEY = 'moy-ritm.tg'

/** Сайт, куда мини-ап уводит платить: во внешнем браузере. */
const SITE_URL = 'https://ritmritm.ru'

/**
 * Метка в адресе сайта, открытого из мини-апа: ?miniapp=1. По ней сайт после
 * оплаты зовёт вернуться в Telegram (cameFromMiniApp), а вход подсказывает
 * ту же почту и пароль.
 */
const MINIAPP_PARAM = 'miniapp'

/** Куда ведут кнопки оплаты в мини-апе: тарифы на сайте, во внешнем браузере. */
export const SITE_TARIFFS_URL = `${SITE_URL}/tariffs?${MINIAPP_PARAM}=1`

/** Страница оплаты выбранного тарифа на сайте: /pay/<код>. */
export const sitePayUrl = (code: string): string =>
  `${SITE_URL}/pay/${encodeURIComponent(code)}?${MINIAPP_PARAM}=1`

/** Бот «Моего ритма»: из браузера после оплаты — обратно в Telegram. */
export const BOT_URL = 'https://t.me/ritmritm_bot'

/** Цвет шапки и фона Telegram — фон сайта (--bg в tokens.css). */
const SITE_BG = '#ffffff'

/**
 * Параметры запуска из адреса при первом открытии. Читаются один раз, при
 * загрузке модуля — до того, как роутер уйдёт с первой страницы (например,
 * с /go/<токен> на /register) и хвост адреса пропадёт.
 */
function readLaunchParams(): string | null {
  try {
    const { hash, search } = window.location
    for (const raw of [hash.slice(1), search.slice(1)]) {
      if (raw && new URLSearchParams(raw).has('tgWebAppData')) {
        try {
          sessionStorage.setItem(SESSION_KEY, raw)
        } catch {
          /* приватный режим — хватит памяти страницы */
        }
        seedTelegramStorage(raw)
        return raw
      }
    }
  } catch {
    /* адрес не разобрался — значит, не Telegram */
  }
  try {
    return sessionStorage.getItem(SESSION_KEY)
  } catch {
    return null
  }
}

/**
 * Скрипт Telegram, не найдя параметров в location.hash, берёт их из своей
 * записи в sessionStorage (__telegram__initParams). Кладём туда свежие
 * параметры запуска сразу: скрипт качается асинхронно, и к моменту его
 * выполнения роутер мог уже уйти с первой страницы вместе с хвостом адреса.
 */
function seedTelegramStorage(raw: string): void {
  try {
    const params: Record<string, string> = {}
    new URLSearchParams(raw).forEach((value, key) => {
      params[key] = value
    })
    sessionStorage.setItem('__telegram__initParams', JSON.stringify(params))
  } catch {
    /* не вышло — остаётся возврат хвоста адреса на время загрузки */
  }
}

const launchParams = readLaunchParams()

/** Сайт открыт внутри Telegram как мини-ап. Не меняется до перезагрузки. */
export const IN_TELEGRAM: boolean = launchParams !== null || Boolean(window.Telegram?.WebApp)

/**
 * Параметр запуска из адреса (?tgWebAppStartParam=…). Как и параметры выше,
 * читается при загрузке модуля — до того, как роутер сменит адрес.
 */
function readUrlStartParam(): string {
  if (!IN_TELEGRAM) return ''
  try {
    const { hash, search } = window.location
    for (const raw of [search.slice(1), hash.slice(1), launchParams ?? '']) {
      const value = raw ? new URLSearchParams(raw).get('tgWebAppStartParam') : null
      if (value) return value
    }
  } catch {
    /* адрес не разобрался — параметра нет */
  }
  return ''
}

const urlStartParam = readUrlStartParam()

/* ─────────────  Сайт, открытый из мини-апа  ───────────── */

/** Когда сайт открыли из мини-апа (метка ?miniapp=1) — в этом браузере. */
const MINIAPP_VISIT_KEY = 'moy-ritm.miniapp_visit'

/** Дольше метка не живёт: оплата — дело одного вечера, а не недели. */
const MINIAPP_VISIT_MS = 24 * 60 * 60_000

/**
 * Метка ?miniapp=1 — один раз при загрузке, до того как роутер уйдёт на
 * вход, а виджет оплаты перепишет адрес своими полями. Запоминаем её в
 * localStorage (GetCourse вернёт на /payment/success в ту же вкладку, но
 * вход и подтверждение почты могут увести в другую) и убираем из адреса.
 */
function captureMiniAppVisit(): void {
  if (IN_TELEGRAM) return
  try {
    const url = new URL(window.location.href)
    if (url.searchParams.get(MINIAPP_PARAM) !== '1') return
    try {
      localStorage.setItem(MINIAPP_VISIT_KEY, String(Date.now()))
    } catch {
      /* приватный режим — после оплаты позовём в поток, как всех */
    }
    url.searchParams.delete(MINIAPP_PARAM)
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  } catch {
    /* адрес не разобрался — метки нет */
  }
}

captureMiniAppVisit()

/** Человек открыл сайт из мини-апа (кнопкой «Оформить на сайте»). */
export function cameFromMiniApp(): boolean {
  if (IN_TELEGRAM) return false
  try {
    const at = Number(localStorage.getItem(MINIAPP_VISIT_KEY))
    return Number.isFinite(at) && at > 0 && Date.now() - at < MINIAPP_VISIT_MS
  } catch {
    return false
  }
}

/** Оплата прошла — метка больше не нужна. */
export function forgetMiniAppVisit(): void {
  try {
    localStorage.removeItem(MINIAPP_VISIT_KEY)
  } catch {
    /* нечего забывать */
  }
}

/* ─────────────  Мини-ап ждёт оплату с сайта  ───────────── */

/** Когда из мини-апа ушли оформлять доступ на сайт. Переживает перезагрузку мини-апа. */
const SITE_PAY_KEY = 'moy-ritm.tg.site_pay_at'

let sitePayAt: number | null = null
const sitePayListeners = new Set<() => void>()

/** Ушли оформлять доступ на сайт — ожидание оплаты (src/lib/sitePayment.ts). */
function markSitePayment(): void {
  sitePayAt = Date.now()
  try {
    sessionStorage.setItem(SITE_PAY_KEY, String(sitePayAt))
  } catch {
    /* хватит памяти страницы */
  }
  for (const fn of [...sitePayListeners]) safely('оплата на сайте', fn)
}

/** Когда в последний раз уходили оформлять доступ на сайт; null — не уходили. */
export function sitePaymentAt(): number | null {
  if (sitePayAt !== null) return sitePayAt
  try {
    const saved = Number(sessionStorage.getItem(SITE_PAY_KEY))
    return Number.isFinite(saved) && saved > 0 ? saved : null
  } catch {
    return null
  }
}

/** Оплата пришла — ждать больше нечего. */
export function forgetSitePayment(): void {
  sitePayAt = null
  try {
    sessionStorage.removeItem(SITE_PAY_KEY)
  } catch {
    /* нечего забывать */
  }
}

/** Подписка на уход оформлять доступ на сайт. Зовётся в самом касании. */
export function onSitePayment(fn: () => void): () => void {
  sitePayListeners.add(fn)
  return () => {
    sitePayListeners.delete(fn)
  }
}

/** Хук-обёртка над тем же флагом: так экраны не зависят от того, откуда он. */
export function useInTelegram(): boolean {
  return IN_TELEGRAM
}

/**
 * initData — подписанная Telegram строка о человеке. По ней бэкенд входит и
 * привязывает Telegram к аккаунту. Скрипт Telegram для неё не нужен: она уже
 * лежит в параметрах запуска.
 */
export function telegramInitData(): string {
  const fromApp = window.Telegram?.WebApp?.initData
  if (fromApp) return fromApp
  if (!launchParams) return ''
  try {
    return new URLSearchParams(launchParams).get('tgWebAppData') ?? ''
  } catch {
    return ''
  }
}

/**
 * Параметр запуска мини-апа: значение startapp из ссылки
 * t.me/<бот>/<app>?startapp=<значение>. Telegram кладёт его в initData
 * (start_param) и в адрес. Скрипт Telegram не нужен: initData уже есть в
 * параметрах запуска и переживает перезагрузку. Вне мини-апа — пусто.
 */
export function telegramStartParam(): string {
  if (!IN_TELEGRAM) return ''
  const fromApp = window.Telegram?.WebApp?.initDataUnsafe?.start_param
  if (fromApp) return fromApp
  try {
    const fromInitData = new URLSearchParams(telegramInitData()).get('start_param')
    if (fromInitData) return fromInitData
  } catch {
    /* initData не разобралась — остаётся адрес */
  }
  return urlStartParam
}

/** Ошибки Telegram человеку не показываем — только в консоль при разработке. */
export function telegramLog(what: string, error?: unknown): void {
  if (import.meta.env.DEV) console.warn(`[telegram] ${what}`, error ?? '')
}

/**
 * Версия клиента Telegram из параметров запуска (tgWebAppVersion) не ниже
 * `min`. Неизвестна — считаем старой: так же, как сам скрипт (он тогда 6.0).
 */
function versionAtLeast(min: string): boolean {
  let version = ''
  try {
    version = new URLSearchParams(launchParams ?? '').get('tgWebAppVersion') ?? ''
  } catch {
    return false
  }
  if (!version) return false
  const a = version.split('.').map((n) => parseInt(n, 10) || 0)
  const b = min.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff > 0
  }
  return true
}

/**
 * Событие клиенту Telegram без его скрипта — тем же путём и в том же виде,
 * что WebView.postEvent в telegram-web-app.js: мобильные и настольные клиенты
 * дают странице window.TelegramWebviewProxy (данные — строкой JSON), веб-версия
 * открывает мини-ап в рамке и слушает postMessage с JSON {eventType,
 * eventData}. false — передать некуда.
 */
function postRaw(eventType: string, eventData: unknown = ''): boolean {
  if (!IN_TELEGRAM) return false
  try {
    const proxy = window.TelegramWebviewProxy
    if (proxy && typeof proxy.postEvent === 'function') {
      proxy.postEvent(eventType, JSON.stringify(eventData))
      return true
    }
    if (window.parent != null && window.parent !== window) {
      window.parent.postMessage(JSON.stringify({ eventType, eventData }), '*')
      return true
    }
  } catch (e) {
    telegramLog(`postEvent ${eventType}`, e)
  }
  return false
}

/**
 * Скрипт Telegram разбирает параметры запуска из location.hash в момент
 * выполнения: без них он считает себя клиентом версии 6.0 и отключает
 * кнопку «Назад», цвета и запрет свайпа. Если роутер к моменту подключения
 * уже ушёл с первой страницы, на время загрузки возвращаем хвост адреса, а
 * потом убираем обратно (вдобавок к записи в sessionStorage выше).
 * Возвращает функцию уборки.
 */
function putLaunchHashBack(): () => void {
  const { pathname, search, hash } = window.location
  if (!launchParams || hash.includes('tgWebAppData')) return () => undefined
  const temporary = `#${launchParams}`
  try {
    // Состояние истории то же: роутер не должен заметить подмены.
    window.history.replaceState(window.history.state, '', pathname + search + temporary)
  } catch {
    return () => undefined
  }
  return () => {
    // Пока скрипт качался, могли перейти на другую страницу — тогда трогать нечего.
    if (window.location.hash !== temporary) return
    try {
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname + window.location.search + hash,
      )
    } catch {
      /* адрес останется с хвостом — это не мешает */
    }
  }
}

/** Метод может отсутствовать в старом клиенте или бросить — мини-ап от этого не должен падать. */
function safely(what: string, fn: () => void): void {
  try {
    fn()
  } catch (e) {
    telegramLog(what, e)
  }
}

let loading: Promise<WebApp | null> | null = null

/** Что выполнить, когда скрипт появится, — даже если он пришёл после таймаута. */
const whenLoaded = new Set<(app: WebApp) => void>()

function arrived(app: WebApp): void {
  const pending = [...whenLoaded]
  whenLoaded.clear()
  for (const run of pending) safely('скрипт догрузился', () => run(app))
}

/**
 * Подключить скрипт Telegram. Вне мини-апа — сразу null, скрипт не качается.
 *
 * Ждём не дольше SCRIPT_TIMEOUT_MS: не пришёл — null, и ждущие обходятся без
 * него. Сама загрузка при этом не обрывается: пришёл позже — отложенное через
 * whenTelegram выполнится, а следующие вызовы получат его сразу.
 */
export function loadTelegram(): Promise<WebApp | null> {
  if (!IN_TELEGRAM) return Promise.resolve(null)
  const ready = window.Telegram?.WebApp
  if (ready) return Promise.resolve(ready)
  loading ??= new Promise<WebApp | null>((resolve) => {
    const cleanUp = putLaunchHashBack()
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    const timer = window.setTimeout(() => {
      telegramLog(`скрипт telegram-web-app.js не пришёл за ${SCRIPT_TIMEOUT_MS} мс — работаем без него`)
      resolve(null)
    }, SCRIPT_TIMEOUT_MS)
    script.onload = () => {
      window.clearTimeout(timer)
      cleanUp()
      const app = window.Telegram?.WebApp ?? null
      if (app) arrived(app)
      resolve(app)
    }
    script.onerror = () => {
      window.clearTimeout(timer)
      cleanUp()
      telegramLog('скрипт telegram-web-app.js не загрузился')
      resolve(null)
    }
    document.head.appendChild(script)
  })
  return loading
}

/**
 * Выполнить, когда скрипт Telegram на месте: сразу, если он уже загружен,
 * иначе — когда догрузится, сколько бы это ни заняло. Возвращает отмену.
 */
function whenTelegram(run: (app: WebApp) => void): () => void {
  if (!IN_TELEGRAM) return () => undefined
  const ready = window.Telegram?.WebApp
  if (ready) {
    safely('whenTelegram', () => run(ready))
    return () => undefined
  }
  whenLoaded.add(run)
  void loadTelegram()
  return () => {
    whenLoaded.delete(run)
  }
}

/**
 * Первое, что делаем в мини-апе: сообщить Telegram, что страница готова,
 * развернуть её на весь экран, покрасить шапку и фон под сайт и запретить
 * закрытие свайпом вниз — иначе плеер закрывался бы посреди движения.
 *
 * «Готово» и «развернуть» уходят сразу, не дожидаясь скрипта: без первого
 * Telegram держит свою заглушку загрузки, без второго мини-ап открыт на
 * полэкрана. Со скриптом они уходят ещё раз — повтор клиенту не мешает.
 */
export function startTelegram(): void {
  if (!IN_TELEGRAM) return
  postRaw('web_app_ready')
  postRaw('web_app_expand')
  onTelegramEvent('deactivated', () => {
    active = false
  })
  onTelegramEvent('activated', () => {
    active = true
  })
  whenTelegram((app) => {
    safely('ready', () => app.ready())
    safely('expand', () => app.expand())
    safely('setHeaderColor', () => app.setHeaderColor?.(SITE_BG))
    safely('setBackgroundColor', () => app.setBackgroundColor?.(SITE_BG))
    safely('disableVerticalSwipes', () => app.disableVerticalSwipes?.())
  })
}

/**
 * События Telegram:
 *   • activated — мини-ап снова развернули после того, как его свернули или
 *     ушли в другое приложение;
 *   • deactivated — мини-ап свернули: вкладка при этом может остаться «на
 *     виду» (visibilityState), и без события тренировка шла бы дальше.
 *
 * Подписка на каждое событие у скрипта одна на всю страницу, а обработчики
 * живут здесь: так их можно снимать и в клиентах без offEvent. Старый
 * клиент таких событий не знает — подписка просто молчит. Вне мини-апа
 * ничего не делает. Возвращает отписку.
 */
type TelegramEvent = 'activated' | 'deactivated'

const handlers = new Map<TelegramEvent, Set<() => void>>()

/** Мини-ап развёрнут: после deactivated — false до activated. */
let active = true

/**
 * Мини-ап сейчас развёрнут. Свёрнутый может оставаться «на виду» для
 * visibilityState — тогда тренировка сама не пускается (src/screens/Player.tsx).
 * Вне мини-апа всегда true.
 */
export function telegramActive(): boolean {
  return active
}

export function onTelegramEvent(event: TelegramEvent, handler: () => void): () => void {
  if (!IN_TELEGRAM) return () => undefined
  let list = handlers.get(event)
  if (!list) {
    const own = new Set<() => void>()
    handlers.set(event, own)
    list = own
    whenTelegram((app) =>
      app.onEvent?.(event, () => {
        for (const fn of [...own]) safely(`событие ${event}`, fn)
      }),
    )
  }
  list.add(handler)
  return () => {
    handlers.get(event)?.delete(handler)
  }
}

/**
 * Адрес сайта во внешнем браузере — вместо оплаты внутри мини-апа.
 *
 * Скрипт не ждём: кнопка оплаты срабатывает сразу. Скрипта нет (ещё грузится
 * или не пришёл) — то же событие web_app_open_link напрямую; клиент старше
 * 6.1 его не знает — обычная ссылка в новой вкладке, как у самого скрипта.
 *
 * Уход запоминаем: мини-ап ждёт оплату и сам перечитывает доступ
 * (src/lib/sitePayment.ts).
 */
function openOnSite(url: string): void {
  markSitePayment()
  const app = window.Telegram?.WebApp
  if (app) {
    try {
      app.openLink(url)
      return
    } catch (e) {
      telegramLog('openLink', e)
    }
  }
  if (versionAtLeast('6.1') && postRaw('web_app_open_link', { url })) return
  window.open(url, '_blank', 'noopener')
}

/** Тарифы сайта во внешнем браузере. */
export function openTariffsOnSite(): void {
  openOnSite(SITE_TARIFFS_URL)
}

/**
 * Страница оплаты выбранного тарифа во внешнем браузере: после входа на
 * сайте человек попадает сразу к нему, а не выбирает заново.
 */
export function openPayOnSite(code: string): void {
  openOnSite(sitePayUrl(code))
}

/**
 * Системная кнопка «Назад» Telegram: видна не на главной и ведёт назад по
 * истории. Скрипт догрузился позже — кнопка появится тогда же. Возвращает
 * функцию отписки.
 */
export function syncBackButton(visible: boolean, onBack: () => void): () => void {
  let off = () => undefined as void
  const cancel = whenTelegram((app) => {
    const button = app.BackButton
    if (!button) return
    safely('BackButton', () => {
      if (visible) {
        button.onClick(onBack)
        button.show()
        off = () => safely('BackButton.offClick', () => button.offClick(onBack))
      } else {
        button.hide()
      }
    })
  })
  return () => {
    cancel()
    off()
  }
}
