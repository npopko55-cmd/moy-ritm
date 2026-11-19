/**
 * VK Mini App (19.11.2026).
 *
 * ВКонтакте открывает сайт как мини-приложение: в своём iframe (vk.com,
 * m.vk.com) или во встроенном браузере мобильного клиента, дописывая к
 * адресу параметры запуска ?vk_app_id=…&vk_platform=…&sign=…. По ним и
 * узнаём, что мы внутри ВК.
 *
 * Без события VKWebAppInit клиент ВК держит мини-приложение на заставке,
 * поэтому шлём его сразу при старте. Мост (@vkontakte/vk-bridge) качается
 * только внутри ВК и отдельным куском: обычному посетителю и мини-апу
 * Telegram он не нужен.
 *
 * Параметры запуска запоминаем на вкладку: роутер уходит с первой страницы
 * (лендинг → квиз → ритм), а перезагрузка внутри ВК не должна терять метку.
 */

const SESSION_KEY = 'moy-ritm.vk'

function readLaunchParams(): string | null {
  try {
    const raw = window.location.search.slice(1)
    if (raw) {
      const params = new URLSearchParams(raw)
      if (params.has('vk_app_id') && (params.has('sign') || params.has('vk_platform'))) {
        try {
          sessionStorage.setItem(SESSION_KEY, raw)
        } catch {
          /* приватный режим — хватит памяти страницы */
        }
        return raw
      }
    }
  } catch {
    /* адрес не разобрался — значит, не ВК */
  }
  try {
    return sessionStorage.getItem(SESSION_KEY)
  } catch {
    return null
  }
}

const launchParams = readLaunchParams()

/** Сайт открыт внутри ВКонтакте как мини-приложение. Не меняется до перезагрузки. */
export const IN_VK: boolean = launchParams !== null

/** Платформа из параметров запуска: mobile_web, desktop_web, mobile_android… */
export const VK_PLATFORM: string = (() => {
  try {
    return launchParams ? new URLSearchParams(launchParams).get('vk_platform') ?? '' : ''
  } catch {
    return ''
  }
})()

type Bridge = typeof import('@vkontakte/vk-bridge').default
let bridgePromise: Promise<Bridge | null> | null = null

/** Мост ВК — только внутри ВК; не загрузился — null, сайт работает и без него. */
export function vkBridge(): Promise<Bridge | null> {
  if (!IN_VK) return Promise.resolve(null)
  if (!bridgePromise) {
    bridgePromise = import('@vkontakte/vk-bridge').then((m) => m.default).catch(() => null)
  }
  return bridgePromise
}

/** Старт: внутри ВК сразу VKWebAppInit, снаружи ничего не делаем. */
export function startVk(): void {
  if (!IN_VK) return
  document.documentElement.classList.add('in-vk')
  void vkBridge().then((bridge) => {
    if (!bridge) return
    bridge.send('VKWebAppInit').catch(() => undefined)
  })
}

/**
 * Внешняя ссылка из мини-приложения. Внутри iframe ВК переход на чужой сайт
 * (например, id.vk.ru, который не даёт встраивать себя) дал бы пустое окно,
 * поэтому такие ссылки открываем в новой вкладке / внешнем браузере.
 */
export const VK_LINK_TARGET: '_blank' | undefined = IN_VK ? '_blank' : undefined
