/**
 * Счётчики рекламы: Яндекс Метрика и пиксель VK Ads (счётчик Top.Mail.ru,
 * очередь _tmr). Всё, что сайт сообщает счётчикам, идёт через этот модуль.
 *
 *   • id — из переменных сборки VITE_YM_COUNTER_ID и VITE_VK_PIXEL_ID. Пусто
 *     (или не число) — этот счётчик не грузится вовсе, а вызовы ниже молча
 *     ничего не делают. Так собираются демо на GitHub Pages и любая сборка,
 *     в которую id не передали.
 *   • Согласие. Политика сайта (src/data/legal.ts, раздел 7) обещает: до
 *     активного выбора человека необязательные счётчики не грузятся. Выбор
 *     делает баннер (src/components/ConsentBanner.tsx): счётчики ждут
 *     setAnalyticsConsent(true), которую он зовёт по кнопке «Принять».
 *     VITE_ANALYTICS_NO_CONSENT=1 грузит их без выбора: включать только после
 *     того, как юристы поправят политику (иначе сайт нарушает свой же текст).
 *   • Скрипты счётчиков вставляются асинхронно и не раньше события load: из
 *     РФ и из Telegram они могут не прийти вовсе, и отрисовка с тренировкой
 *     этого ждать не должны. До их прихода вызовы копятся в штатных очередях
 *     (ym.a и _tmr) и уходят, когда скрипт загрузится. Не загрузился — очередь
 *     так и лежит в памяти, приложению это ничем не грозит. Сторож запуска в
 *     index.html чужие адреса не считает своими (он смотрит только /assets/),
 *     сервис-воркер чужие домены пропускает мимо себя.
 *   • Личных данных в счётчики не шлём. Цели — только имя и сумма. Адрес
 *     страницы — без хвоста #, а из ?параметров остаются только метки
 *     рекламы, и только в первом хите захода: дальше в адресе бывают почта
 *     (виджет GetCourse на /pay кладёт её туда сам), метка человека
 *     (utm_term оплаты), токены писем и параметры запуска мини-апа с именем
 *     человека в Telegram (#tgWebAppData). Пока такое есть в адресе,
 *     счётчики не запускаются и цели не отправляются: Метрика сама приписывает
 *     к цели текущий адрес. Вебвизор, карта кликов, внешние ссылки и точный
 *     показатель отказов выключены по той же причине — они шлют адрес
 *     страницы, которую мы не проверяли.
 *
 * Проверка без настоящей отправки: в разработке (npm run dev) с id в
 * .env.local адрес ?analytics=dry не вставляет скрипты счётчиков, а каждый
 * вызов пишет в консоль. В сборке для сайта параметр не читается вовсе.
 */

/** Цели. Такие же id нужно завести в кабинетах Метрики и VK Ads. */
export type Goal =
  | 'guest_start'
  | 'register'
  | 'first_workout'
  | 'open_tariffs'
  | 'pay_click'
  | 'purchase'
  // Квиз «План на 30 дней» (/quiz, src/screens/Quiz.tsx): открыли первый
  // вопрос, ответили (параметр question — номер вопроса), увидели план,
  // нажали кнопку пробного.
  | 'quiz_start'
  | 'quiz_answer'
  | 'quiz_done'
  | 'quiz_cta'

/**
 * Параметры цели для Метрики (VK Ads их не принимает). Только числа и
 * короткие коды — никаких личных данных.
 */
export type GoalParams = Record<string, string | number>

type YmFn = ((...args: unknown[]) => void) & { a?: unknown[][]; l?: number }

type TmrEvent = {
  id: string
  type: 'pageView' | 'reachGoal'
  goal?: string
  value?: number
  url?: string
  referrer?: string
  start?: number
}

declare global {
  interface Window {
    ym?: YmFn
    _tmr?: TmrEvent[]
  }
}

/** id счётчика — только цифры: строка уходит в адрес скрипта и в его вызовы. */
const counterId = (raw: string | undefined): string => {
  const id = (raw ?? '').trim()
  return /^\d{1,12}$/.test(id) ? id : ''
}

const YM_ID = counterId(import.meta.env.VITE_YM_COUNTER_ID)
const VK_ID = counterId(import.meta.env.VITE_VK_PIXEL_ID)
const NO_CONSENT = import.meta.env.VITE_ANALYTICS_NO_CONSENT === '1'

const YM_SRC = 'https://mc.yandex.ru/metrika/tag.js'
const VK_SRC = 'https://top-fwz1.mail.ru/js/code.js'

/** Только в разработке: ?analytics=dry — скрипты не вставляем, вызовы — в консоль. */
const DRY =
  import.meta.env.DEV &&
  (() => {
    try {
      return new URLSearchParams(window.location.search).get('analytics') === 'dry'
    } catch {
      return false
    }
  })()

/** Есть ли вообще чем считать в этой сборке. */
export const analyticsConfigured = (): boolean => Boolean(YM_ID || VK_ID)

/* ——— Согласие ——— */

const CONSENT_KEY = 'moy-ritm.analytics.consent'

/** Выбор, если записать его некуда (приватный режим). */
let memoryConsent: boolean | null = null

/** Выбор человека: 'granted', 'denied' или null — ещё не выбирал. */
export function analyticsConsent(): 'granted' | 'denied' | null {
  try {
    const saved = localStorage.getItem(CONSENT_KEY)
    return saved === 'granted' || saved === 'denied' ? saved : null
  } catch {
    return null
  }
}

/**
 * Выбор из баннера cookies (src/components/ConsentBanner.tsx). Согласие запускает счётчики сразу,
 * если адрес чистый. Отказ останавливает новые отправки; уже загруженный
 * скрипт из страницы не выгрузить — он просто больше ничего не получит.
 */
export function setAnalyticsConsent(granted: boolean): void {
  try {
    localStorage.setItem(CONSENT_KEY, granted ? 'granted' : 'denied')
  } catch {
    /* приватный режим — выбор живёт до перезагрузки */
    memoryConsent = granted
  }
  if (granted) pageView()
}

function allowed(): boolean {
  if (!analyticsConfigured()) return false
  if (NO_CONSENT) return true
  const saved = analyticsConsent()
  return saved ? saved === 'granted' : memoryConsent === true
}

/* ——— Адрес страницы ——— */

/** Имена параметров, за которыми бывают личные данные или секреты. */
const PERSONAL_KEY = /token|mail|phone|tel|name|fio|pass|initdata|tgwebapp|hash/i

/** Метки рекламы — их Метрика и VK Ads читают из адреса первого хита. */
const AD_PARAM = /^(utm_(source|medium|campaign|content|term)|yclid|gclid|rb_clickid|_openstat)$/

/** Есть ли в адресе то, что нельзя показывать счётчикам. */
function personalDataInUrl(): boolean {
  try {
    const { search, hash } = window.location
    for (const raw of [search.slice(1), hash.slice(1)]) {
      if (!raw) continue
      for (const [key, value] of new URLSearchParams(raw)) {
        if (PERSONAL_KEY.test(key) || value.includes('@')) return true
      }
    }
    return false
  } catch {
    return true
  }
}

/** Админка — не посетитель: её не считаем. */
function isAdminPath(): boolean {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '')
  const path = window.location.pathname.slice(base.length) || '/'
  return /^\/admin(\/|$)/.test(path)
}

/**
 * Адрес для хита: без хвоста #; метки рекламы — только в первом хите
 * захода (по ним считается источник визита), дальше — без ?параметров.
 */
function cleanUrl(first: boolean): string {
  const { origin, pathname, search } = window.location
  if (!first) return origin + pathname
  const kept = new URLSearchParams()
  for (const [key, value] of new URLSearchParams(search)) {
    if (AD_PARAM.test(key)) kept.append(key, value)
  }
  const query = kept.toString()
  return origin + pathname + (query ? `?${query}` : '')
}

/**
 * Откуда пришли — без ?параметров и #: источник визита по нему и так виден, а
 * в хвосте чужого адреса бывает почта (страница оплаты GetCourse).
 */
function outsideReferrer(): string {
  try {
    if (!document.referrer) return ''
    const from = new URL(document.referrer)
    return from.origin + from.pathname
  } catch {
    return ''
  }
}

/* ——— Скрипты счётчиков ——— */

let started = false
/** Очищенный адрес последнего хита — referrer следующего. */
let lastUrl: string | null = null
/**
 * Адрес последнего хита как есть, до очистки: повтор того же адреса
 * (StrictMode зовёт эффект дважды) не шлём. Сравнивать очищенные нельзя:
 * у первого хита в них остаются метки, у второго — нет.
 */
let lastRaw: string | null = null

function log(...args: unknown[]): void {
  if (DRY) console.info('[analytics]', ...args)
}

function ym(...args: unknown[]): void {
  if (!YM_ID || !window.ym) return
  log('ym', ...args)
  window.ym(YM_ID, ...args)
}

function tmr(event: Omit<TmrEvent, 'id'>): void {
  if (!VK_ID || !window._tmr) return
  const full: TmrEvent = { id: VK_ID, ...event }
  log('_tmr', full)
  window._tmr.push(full)
}

/** Вставить скрипт счётчика. Не пришёл — молча: приложение от него не зависит. */
function inject(src: string): void {
  if (DRY) {
    log('скрипт не вставлен (dry):', src)
    return
  }
  try {
    const script = document.createElement('script')
    script.async = true
    script.src = src
    script.onerror = () => script.remove()
    document.head.appendChild(script)
  } catch {
    /* без счётчика — так без счётчика */
  }
}

/** Скрипты — после load и в свободную минуту: первая отрисовка важнее. */
function whenIdle(job: () => void): void {
  const idle = () => {
    const ric = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void })
      .requestIdleCallback
    if (ric) ric(job, { timeout: 3000 })
    else window.setTimeout(job, 1000)
  }
  if (document.readyState === 'complete') idle()
  else window.addEventListener('load', idle, { once: true })
}

/**
 * Очереди и настройка счётчиков — сразу, скрипты — позже. Очереди в той
 * форме, которую ждут штатные коды Метрики и Top.Mail.ru: прежние вызовы
 * они подберут сами.
 */
function start(): void {
  if (started) return
  started = true
  if (YM_ID) {
    const queue: YmFn = window.ym ?? (((...args: unknown[]) => void (queue.a ??= []).push(args)) as YmFn)
    queue.l ??= Date.now()
    window.ym = queue
    // defer — хиты шлём сами (pageView): у сайта одна страница на все адреса.
    ym('init', {
      defer: true,
      webvisor: false,
      clickmap: false,
      trackLinks: false,
      accurateTrackBounce: false,
      trackHash: false,
    })
    whenIdle(() => inject(YM_SRC))
  }
  if (VK_ID) {
    window._tmr ??= []
    whenIdle(() => inject(VK_SRC))
  }
}

/** Можно ли сейчас что-то отправить: настроено, разрешено и адрес чистый. */
function ready(): boolean {
  if (!allowed() || isAdminPath() || personalDataInUrl()) return false
  start()
  return true
}

/**
 * Хит страницы — при каждой смене адреса в приложении (AnalyticsRoutes в
 * App.tsx). Первый вызов заодно запускает счётчики.
 */
export function pageView(): void {
  if (!ready()) return
  const raw = window.location.pathname + window.location.search
  if (raw === lastRaw) return
  lastRaw = raw
  const url = cleanUrl(lastUrl === null)
  const referrer = lastUrl ?? outsideReferrer()
  lastUrl = url
  ym('hit', url, { referer: referrer })
  tmr({ type: 'pageView', url, referrer, start: Date.now() })
}

/**
 * Цель — в оба счётчика. value — сумма в рублях (только для purchase).
 * Возвращает, ушла ли цель: не ушла (нет id, согласия или в адресе личные
 * данные) — зовущий может попробовать позже.
 */
export function track(goal: Goal, value?: number, params?: GoalParams): boolean {
  if (!ready()) return false
  // Цель до первого хита: Метрика пишет её в визит, которого ещё нет.
  if (lastUrl === null) pageView()
  const sum = typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
  const ymParams = { ...params, ...(sum !== undefined ? { order_price: sum, currency: 'RUB' } : {}) }
  if (Object.keys(ymParams).length > 0) ym('reachGoal', goal, ymParams)
  else ym('reachGoal', goal)
  tmr({ type: 'reachGoal', goal, ...(sum !== undefined ? { value: sum } : {}) })
  return true
}

/* ——— Цели с правилами ——— */

/** Открыли тарифы. Звать при открытии страницы /tariffs. */
export const trackOpenTariffs = (): void => void track('open_tariffs')

/** Выбрали тариф и пошли платить. Звать по нажатию, до перехода на /pay. */
export const trackPayClick = (): void => void track('pay_click')

/**
 * Регистрация удалась. Запоминаем id нового человека: его первый пуск
 * тренировки — first_workout, даже если в сводке уже лежат минуты, которые
 * он набрал гостем (они переходят в аккаунт при регистрации).
 */
const REGISTERED_KEY = 'moy-ritm.analytics.registered'
const FIRST_WORKOUT_KEY = 'moy-ritm.analytics.first_workout'

export function trackRegister(userId: string): void {
  track('register')
  try {
    localStorage.setItem(REGISTERED_KEY, userId)
  } catch {
    /* приватный режим — first_workout решит сводка */
  }
}

/**
 * Пуск тренировки вошедшим (плеер). first_workout — один раз на человека в
 * этом браузере: если он зарегистрировался здесь же или в сводке ещё нет ни
 * одной тренировки. totalWorkouts = null — сводка ещё не пришла: ждём её.
 */
export function trackWorkoutStart(userId: string, totalWorkouts: number | null): void {
  let done: string[] = []
  let registered: string | null = null
  try {
    done = JSON.parse(localStorage.getItem(FIRST_WORKOUT_KEY) ?? '[]') as string[]
    registered = localStorage.getItem(REGISTERED_KEY)
  } catch {
    /* хранилище закрыто — судим по сводке */
  }
  if (!Array.isArray(done)) done = []
  if (done.includes(userId)) return
  const isNew = registered === userId
  if (!isNew && totalWorkouts !== 0) return
  if (!track('first_workout')) return
  try {
    // Хвост — последние 20 человек на этом устройстве: список не растёт.
    localStorage.setItem(FIRST_WORKOUT_KEY, JSON.stringify([...done, userId].slice(-20)))
    if (isNew) localStorage.removeItem(REGISTERED_KEY)
  } catch {
    /* не записалось — в худшем случае цель уйдёт ещё раз */
  }
}
