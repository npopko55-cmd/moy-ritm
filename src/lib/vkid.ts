/**
 * Вход через VK ID (19.11.2026).
 *
 * Кнопка — обычная ссылка на бэкенд: GET /api/auth/vk/start сам создаёт
 * state и PKCE, отправляет человека на id.vk.ru, а колбэк
 * /api/auth/vk/callback ставит ту же refresh-cookie, что и вход паролем, и
 * возвращает на сайт туда, куда человек шёл, с ?vk=ok (вошёл) или ?vk=new
 * (аккаунт создан). Отказ — /login?vk_error=<код>.
 *
 * Дальше SessionProvider входит по cookie как при любой загрузке страницы, а
 * takeVkReturn() говорит ему, что это был вход через VK: гостевые минуты
 * уходят под аккаунт (finishGuest), токен воронки больше не нужен.
 */

import { IS_DEMO } from '../api/client'
import { anonId, readFunnelGuest, readFunnelToken } from './funnel'
import { IN_TELEGRAM } from './telegram'

/** В демо бэкенда нет, в мини-апе Telegram уход на VK ломает вход. */
export const VK_LOGIN_AVAILABLE = !IS_DEMO && !IN_TELEGRAM

const API_URL: string = import.meta.env.VITE_API_URL || ''

/** /api/v1 → /api: колбэк и старт живут без версии, как записано в VK. */
const AUTH_BASE = API_URL.replace(/\/v1\/?$/, '') + '/auth/vk'

export function vkStartUrl(next: string): string {
  const params = new URLSearchParams()
  if (next && next !== '/') params.set('next', next)
  const funnel = readFunnelToken()
  if (funnel) {
    params.set('funnel_token', funnel)
    if (readFunnelGuest()) {
      params.set('guest', 'true')
      params.set('anon_id', anonId())
    }
  }
  const query = params.toString()
  return `${AUTH_BASE}/start${query ? `?${query}` : ''}`
}

/**
 * Пришли ли мы сюда из колбэка VK. Параметр стирается из адреса, чтобы
 * обновление страницы или ссылка «поделиться» не повторяли действия.
 */
export function takeVkReturn(): 'new' | 'ok' | null {
  try {
    const url = new URL(window.location.href)
    const value = url.searchParams.get('vk')
    if (value !== 'new' && value !== 'ok') return null
    url.searchParams.delete('vk')
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
    return value
  } catch {
    return null
  }
}

const VK_ERRORS: Record<string, string> = {
  cancelled: 'Вход через ВКонтакте отменён',
  expired: 'Вход через ВКонтакте не завершился. Попробуйте ещё раз',
  disabled: 'Вход через ВКонтакте пока не включён — войдите по почте',
  retry: 'Вход через ВКонтакте не завершился. Нажмите кнопку ещё раз',
  vk: 'ВКонтакте не подтвердил вход. Нажмите «Войти через ВКонтакте» ещё раз',
  network: 'ВКонтакте не ответил. Попробуйте ещё раз через минуту',
  linked: 'Этот ВКонтакте или эта почта уже привязаны к другому аккаунту. Войдите по почте',
  account: 'Этот аккаунт войти через ВКонтакте не может. Войдите по почте или напишите в поддержку',
}

export function vkErrorText(code: string | null): string {
  if (!code) return ''
  return VK_ERRORS[code] ?? 'Не получилось войти через ВКонтакте. Попробуйте ещё раз или войдите по почте'
}

/**
 * Адрес-заглушка аккаунта из VK без почты (бэкенд: VK_PLACEHOLDER_EMAIL_DOMAIN).
 * На него писем не шлём, поэтому и «подтвердите почту» ему не показываем.
 */
export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.toLowerCase().endsWith('@vk.ritmritm.ru'))
}
