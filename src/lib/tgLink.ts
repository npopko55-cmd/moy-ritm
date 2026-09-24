/**
 * Привязка Telegram для тех, кто из бота ушёл в браузер.
 *
 * Кнопка бота «Открыть в браузере» ведёт на сайт с подписанным токеном
 * `?tglink=<id>.<срок>.<подпись>` (docs/BOT.md бэкенда). В браузере initData
 * нет, поэтому Telegram привязывается так: токен читаем из адреса при
 * загрузке модуля — до того, как роутер уйдёт с /go/<токен> на регистрацию, —
 * кладём в localStorage и убираем из адреса. После входа или регистрации
 * (или сразу, если человек уже вошёл) отдаём его в POST /me/telegram/token.
 *
 * localStorage, а не sessionStorage: подтверждение почты открывается в
 * новой вкладке, и токен должен дожить до неё. Хранилище недоступно —
 * токен живёт в памяти страницы. Срок токена — сутки, он в самом токене:
 * устаревший не отправляем, а забываем.
 *
 * Ответ сервера по существу (200, 400, 409, 410) — токен больше не нужен.
 * Сеть или 5xx — пусть полежит до следующего раза.
 */

import { api } from '../api/client'
import { ApiError, type Me } from '../api/types'

const STORAGE_KEY = 'moy-ritm.tglink'
const PARAM = 'tglink'
/** `<id>.<срок unix>.<подпись base64url>` */
const TOKEN_RE = /^\d{1,20}\.\d{1,12}\.[A-Za-z0-9_-]{8,64}$/

let memory: string | null = null

function expired(token: string): boolean {
  const seconds = Number(token.split('.')[1])
  return !Number.isFinite(seconds) || seconds * 1000 < Date.now()
}

function save(token: string): void {
  memory = token
  try {
    localStorage.setItem(STORAGE_KEY, token)
  } catch {
    /* приватный режим — хватит памяти страницы */
  }
}

export function forgetTgLink(): void {
  memory = null
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* нечего забывать */
  }
}

/** Сохранённый токен; устаревший — забывается. */
export function readTgLink(): string | null {
  let token = memory
  try {
    token = localStorage.getItem(STORAGE_KEY) ?? token
  } catch {
    /* берём из памяти */
  }
  if (token && (!TOKEN_RE.test(token) || expired(token))) {
    forgetTgLink()
    return null
  }
  return token
}

/** Токен из адреса — один раз при загрузке; из адреса он убирается. */
function captureFromUrl(): void {
  try {
    const url = new URL(window.location.href)
    const token = url.searchParams.get(PARAM)
    if (token === null) return
    if (TOKEN_RE.test(token) && !expired(token)) save(token)
    // Токен в адресе незачем показывать дальше: ни в истории, ни в ссылке,
    // которую человек скопирует из строки браузера.
    url.searchParams.delete(PARAM)
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  } catch {
    /* адрес не разобрался — привязки не будет, вход работает как обычно */
  }
}

captureFromUrl()

let running: Promise<Me | null> | null = null

/**
 * Привязать Telegram по сохранённому токену. Вызывать, когда человек вошёл.
 * Отдаёт свежий профиль или null (токена нет, отказ, сбой). Не падает.
 */
export function linkTelegramFromBot(): Promise<Me | null> {
  const token = readTgLink()
  if (!token) return Promise.resolve(null)
  running ??= api
    .linkTelegramToken(token)
    .then(
      (me) => {
        forgetTgLink()
        return me
      },
      (e: unknown) => {
        // Отказ по существу — токен больше не поможет; сеть и 5xx — попробуем позже.
        if (e instanceof ApiError && !e.temporary) forgetTgLink()
        return null
      },
    )
    .finally(() => {
      running = null
    })
  return running
}
