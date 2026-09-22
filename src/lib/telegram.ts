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
 * бандл его код не попадает.
 *
 * Оплаты внутри мини-апа нет — так требуют правила Telegram. Кнопки оплаты
 * там открывают тарифы сайта во внешнем браузере (openTariffsOnSite).
 *
 * Ссылка t.me/<бот>/<app>?startapp=<значение> открывает мини-ап с параметром
 * запуска (telegramStartParam): им приходит токен воронки, как в /go/<токен>.
 */

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
  BackButton?: BackButton
}

declare global {
  interface Window {
    Telegram?: { WebApp?: WebApp }
  }
}

const SCRIPT_URL = 'https://telegram.org/js/telegram-web-app.js'

/** Параметры запуска на эту вкладку: перезагрузка внутри мини-апа их не теряет. */
const SESSION_KEY = 'moy-ritm.tg'

/** Куда ведут кнопки оплаты в мини-апе: тарифы на сайте, во внешнем браузере. */
export const SITE_TARIFFS_URL = 'https://ritmritm.ru/tariffs'

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

let loading: Promise<WebApp | null> | null = null

/** Подключить скрипт Telegram. Вне мини-апа — сразу null, скрипт не качается. */
export function loadTelegram(): Promise<WebApp | null> {
  if (!IN_TELEGRAM) return Promise.resolve(null)
  loading ??= new Promise<WebApp | null>((resolve) => {
    const ready = window.Telegram?.WebApp
    if (ready) {
      resolve(ready)
      return
    }
    const cleanUp = putLaunchHashBack()
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.onload = () => {
      cleanUp()
      resolve(window.Telegram?.WebApp ?? null)
    }
    script.onerror = () => {
      cleanUp()
      telegramLog('скрипт telegram-web-app.js не загрузился')
      resolve(null)
    }
    document.head.appendChild(script)
  })
  return loading
}

/** Метод может отсутствовать в старом клиенте или бросить — мини-ап от этого не должен падать. */
function safely(what: string, fn: () => void): void {
  try {
    fn()
  } catch (e) {
    telegramLog(what, e)
  }
}

/**
 * Первое, что делаем в мини-апе: сообщить Telegram, что страница готова,
 * развернуть её на весь экран, покрасить шапку и фон под сайт и запретить
 * закрытие свайпом вниз — иначе плеер закрывался бы посреди движения.
 */
export function startTelegram(): void {
  if (!IN_TELEGRAM) return
  void loadTelegram().then((app) => {
    if (!app) return
    safely('ready', () => app.ready())
    safely('expand', () => app.expand())
    safely('setHeaderColor', () => app.setHeaderColor?.(SITE_BG))
    safely('setBackgroundColor', () => app.setBackgroundColor?.(SITE_BG))
    safely('disableVerticalSwipes', () => app.disableVerticalSwipes?.())
  })
}

/**
 * Тарифы сайта во внешнем браузере — вместо оплаты внутри мини-апа.
 * Скрипт не загрузился — обычная ссылка в новой вкладке.
 */
export function openTariffsOnSite(): void {
  void loadTelegram().then((app) => {
    if (app) safely('openLink', () => app.openLink(SITE_TARIFFS_URL))
    else window.open(SITE_TARIFFS_URL, '_blank', 'noopener')
  })
}

/**
 * Системная кнопка «Назад» Telegram: видна не на главной и ведёт назад по
 * истории. Возвращает функцию отписки.
 */
export function syncBackButton(visible: boolean, onBack: () => void): () => void {
  let off = () => undefined as void
  let cancelled = false
  void loadTelegram().then((app) => {
    const button = app?.BackButton
    if (!button || cancelled) return
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
    cancelled = true
    off()
  }
}
