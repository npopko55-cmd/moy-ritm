/**
 * Установка сайта приложением — для карточки «Приложение на телефоне» в
 * настройках (src/screens/Settings.tsx). Две вещи:
 *   • чем человек смотрит сайт (DEVICE): от этого зависят шаги инструкции
 *     и подсказки вроде «откройте на телефоне»;
 *   • предложение браузера «Установить приложение» (beforeinstallprompt),
 *     чтобы на Android ставить сайт своей кнопкой в одно касание.
 *
 * Ничего из этого на сервер не уходит: всё нужно только самому экрану.
 *
 * Сам флаг «открыт как приложение» — в src/lib/standalone.ts.
 */

import { useSyncExternalStore } from 'react'
import { STANDALONE } from './standalone'

/* ─────────────  Чем смотрят сайт  ───────────── */

/** Айфон (и айпад), Android или всё остальное — компьютер. */
export type Device = 'iphone' | 'android' | 'computer'

/**
 * Определяем один раз, при загрузке модуля: устройство посреди визита не
 * меняется. Айпад с iPadOS 13 представляется маком (MacIntel), отличаем его
 * по сенсорному экрану — у настоящего мака maxTouchPoints 0.
 */
function detectDevice(): Device {
  try {
    const ua = navigator.userAgent
    if (/iPhone|iPad|iPod/.test(ua)) return 'iphone'
    if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return 'iphone'
    if (/Android/i.test(ua)) return 'android'
  } catch {
    /* navigator без нужных полей — считаем компьютером */
  }
  return 'computer'
}

export const DEVICE: Device = detectDevice()

/**
 * Айфон, но открыт не в Safari: Chrome (CriOS), Firefox (FxiOS), Edge
 * (EdgiOS), Яндекс (YaBrowser), Opera (OPiOS), приложение Google (GSA).
 * Поставить сайт на экран «Домой» как приложение надёжно умеет только
 * Safari — таким подсказываем перейти в него. Telegram здесь не узнать по
 * адресу браузера: его экран проверяет отдельно (IN_TELEGRAM).
 */
export const IOS_OTHER_BROWSER: boolean = (() => {
  if (DEVICE !== 'iphone') return false
  try {
    return /CriOS|FxiOS|EdgiOS|YaBrowser|OPiOS|GSA\//.test(navigator.userAgent)
  } catch {
    return false
  }
})()

/* ─────────────  Предложение «Установить приложение»  ───────────── */

/**
 * Событие beforeinstallprompt. В lib.dom его нет: это не стандарт, его
 * присылают только браузеры на Chromium — Chrome, Яндекс, Samsung Internet,
 * Edge. Описываем лишь то, чем пользуемся.
 */
type BeforeInstallPromptEvent = Event & {
  /** Показать окно браузера «Установить приложение». Только в касании и только раз. */
  prompt(): Promise<void>
  /** Что человек ответил в этом окне. */
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type InstallState = {
  /** Браузер прислал предложение — можно ставить своей кнопкой. */
  canInstall: boolean
  /** Поставили за этот визит: согласились в окне или пришло appinstalled. */
  installed: boolean
}

/** Пойманное предложение браузера. Одноразовое: после prompt() — null. */
let promptEvent: BeforeInstallPromptEvent | null = null

/** Снимок для useSyncExternalStore: новый объект на каждое изменение. */
let state: InstallState = { canInstall: false, installed: false }

const listeners = new Set<() => void>()

let catching = false

function update(next: Partial<InstallState>): void {
  state = { ...state, ...next }
  for (const fn of [...listeners]) fn()
}

/**
 * Ловить предложение браузера установить сайт. Зовётся один раз при старте
 * (src/main.tsx), а не из экрана настроек: браузер присылает
 * beforeinstallprompt один раз, вскоре после загрузки страницы, и тому, кто
 * подпишется позже, оно уже не достанется. Человек может зайти в настройки
 * через минуту — событие к тому времени ждёт здесь.
 *
 * preventDefault() убирает встроенную плашку Chrome «Установить» внизу
 * экрана. Так и задумано: вместо неё своя кнопка в настройках, которая
 * показывает то же окно браузера. Значок установки в адресной строке и пункт
 * в меню браузера остаются.
 *
 * В установленном приложении браузер этого события не присылает — там и
 * ловить нечего.
 */
export function catchInstallPrompt(): void {
  if (catching || STANDALONE) return
  catching = true
  try {
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault()
      promptEvent = event as BeforeInstallPromptEvent
      update({ canInstall: true })
    })
    // Поставили любым путём — нашей кнопкой, значком в адресной строке или
    // из меню браузера. Предложение больше не нужно.
    window.addEventListener('appinstalled', () => {
      promptEvent = null
      update({ canInstall: false, installed: true })
    })
  } catch {
    /* браузер без addEventListener на window — останутся шаги вручную */
  }
}

/**
 * Показать окно браузера «Установить приложение». Звать прямо в касании:
 * prompt() вне касания браузер отклоняет.
 *
 * Предложение одноразовое — второй prompt() бросит, поэтому кнопку убираем
 * сразу. Отказался человек — Chrome может прислать новое предложение позже,
 * тогда кнопка вернётся сама; до тех пор на экране шаги вручную.
 */
async function install(): Promise<void> {
  const event = promptEvent
  if (!event) return
  promptEvent = null
  update({ canInstall: false })
  try {
    await event.prompt()
    const { outcome } = await event.userChoice
    if (outcome === 'accepted') update({ installed: true })
  } catch {
    /* браузер не показал окно — остаются шаги вручную */
  }
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

const getState = (): InstallState => state

/**
 * Для экрана: можно ли поставить в одно касание, поставили ли уже и чем
 * ставить. Без catchInstallPrompt() при старте canInstall всегда false.
 */
export function useInstallPrompt(): InstallState & { install: () => Promise<void> } {
  const current = useSyncExternalStore(subscribe, getState)
  return { ...current, install }
}
