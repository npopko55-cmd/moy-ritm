/**
 * Диагностика сбоев ролика в плеере (POST /player/faults).
 *
 * Жалобы «картинка застыла на втором упражнении, потом кнопка „Нажмите,
 * чтобы начать“» воспроизвести у себя не удавалось: устройства неизвестны.
 * Теперь плеер в такой момент сам присылает состояние элемента и окружения.
 *
 * Отчёт — «выстрелил и забыл»: без повторов, любая ошибка глотается, UI он
 * не трогает. В демо-режиме не уходит вовсе.
 */

import { isUnlocked, lastPlayError } from '../media/videoPool'
import { api, IS_DEMO } from './client'
import type { PlayerFault } from './types'

/** Отправить отчёт. Никогда не бросает и ничего не ждёт. */
export function reportPlayerFault(fault: PlayerFault): void {
  if (IS_DEMO) return
  try {
    void api.playerFault(fault).catch(() => undefined)
  } catch {
    /* диагностика не должна мешать тренировке */
  }
}

type Connection = { saveData?: boolean; effectiveType?: string }
type TelegramApp = { platform?: string; version?: string }

/** Что плеер знает сам: какой элемент, какое движение, весь ли экран. */
export type FaultContext = {
  kind: PlayerFault['kind']
  buffer: number
  step: number
  loopId: string | null
  immersive: boolean | null
}

/** Снимок элемента и окружения в момент сбоя. */
export function describeVideoFault(video: HTMLVideoElement, ctx: FaultContext): PlayerFault {
  const connection = (navigator as Navigator & { connection?: Connection }).connection
  const telegram = (window as Window & { Telegram?: { WebApp?: TelegramApp } }).Telegram?.WebApp
  let standalone: boolean | null = null
  try {
    standalone = window.matchMedia('(display-mode: standalone)').matches
  } catch {
    standalone = null
  }
  return {
    kind: ctx.kind,
    buffer: ctx.buffer,
    step: ctx.step,
    loop_id: ctx.loopId,
    error: lastPlayError(video),
    ready_state: video.readyState,
    network_state: video.networkState,
    paused: video.paused,
    unlocked: isUnlocked(video),
    page_visible: document.visibilityState !== 'hidden',
    save_data: typeof connection?.saveData === 'boolean' ? connection.saveData : null,
    net_type: connection?.effectiveType ?? null,
    tg_platform: telegram?.platform ?? null,
    tg_version: telegram?.version ?? null,
    standalone,
    immersive: ctx.immersive,
    extra: {
      // Какой ролик стоит у элемента на самом деле: заглушка разблокировки,
      // прежнее движение или нужное. Только имя файла — без адреса сайта.
      src: (video.currentSrc || video.getAttribute('src') || '').split('/').pop()?.slice(0, 80) ?? '',
      time: Math.round(video.currentTime * 10) / 10,
      media_error: video.error?.code ?? null,
    },
  }
}
