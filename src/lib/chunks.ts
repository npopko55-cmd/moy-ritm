/**
 * Очередь кусков движения: буфер, отправка пакетом и повторы.
 *
 * Правила целиком из backend/docs/STATS.md:
 *   • идентификатор куска придумывается ДО первой отправки и не меняется при
 *     повторе — только так сеть, которая моргнула, не накрутит лишние минуты;
 *   • в пакете не больше 50 кусков, ответ приходит с готовой сводкой;
 *   • сеть не ответила, 5xx или 429 — буфер не трогаем и повторяем позже;
 *   • 403 access_required — доступ кончился, буфер чистим.
 *
 * Буфер лежит в localStorage: вкладку могут перезагрузить посреди обрыва
 * сети, и куски должны уйти при следующем открытии плеера.
 *
 * Буфер у каждого человека свой — ключ с его id. В одном браузере бывают
 * двое, и неотправленные минуты первого не должны уйти под аккаунтом второго.
 *
 * Источник истины — само хранилище: перед каждой записью буфер
 * перечитывается. Очередь закрытого плеера ещё может ждать ответа на свой
 * пакет, а плеер тем временем открыт снова и пишет новые куски; со своей
 * устаревшей копией старая очередь затёрла бы их.
 */

import { api } from '../api/client'
import { ApiError, type Chunk, type StatsSummary } from '../api/types'
import { stepsFor } from '../data/loops'

const PREFIX = 'moy-ritm.chunks'

/**
 * Общий буфер из версий до привязки к человеку. Чьи в нём минуты, уже не
 * узнать, а отправить их под чужим аккаунтом хуже, чем потерять: выбрасываем.
 * Обычно он и так пуст — куски уходят через секунды после закрытия.
 */
const LEGACY_KEY = PREFIX

const keyOf = (userId: string) => `${PREFIX}.${userId}`

/** Если localStorage недоступен — буфер в памяти, общий на вкладку. */
const memory = new Map<string, Chunk[]>()

function dropLegacy(): void {
  try {
    localStorage.removeItem(LEGACY_KEY)
  } catch {
    /* хранилища нет — и выбрасывать нечего */
  }
}

/** Больше пятидесяти за раз сервер не примет. */
const BATCH = 50

/** Буфер не растёт бесконечно: неделя офлайна никому не нужна. */
const LIMIT = 200

/** Паузы между повторами в секундах; дальше повторяем по последней. */
const BACKOFF = [5, 15, 60]

/**
 * Минимальный промежуток между отправками.
 *
 * Лимит сервера — 240 запросов в час. При интервале 15 секунд куски
 * закрываются четыре раза в минуту, и без склейки мы упёрлись бы в лимит
 * ровно. Двадцать секунд дают запас и почти не мешают: при интервалах
 * 30 секунд и длиннее пакет всё равно уходит сразу.
 */
const MIN_GAP_MS = 20_000

export const uuid = (): string =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`

function load(key: string): Chunk[] {
  try {
    const raw = localStorage.getItem(key)
    const list = raw ? (JSON.parse(raw) as Chunk[]) : []
    return Array.isArray(list) ? list.slice(-LIMIT) : []
  } catch {
    return memory.get(key) ?? []
  }
}

function save(key: string, list: Chunk[]): void {
  memory.set(key, list)
  try {
    if (list.length) localStorage.setItem(key, JSON.stringify(list))
    else localStorage.removeItem(key)
  } catch {
    /* приватный режим или запрет хранилища — переживём без буфера на диске */
  }
}

/** Убрать из буфера пакет, который уже не вернётся: принят либо забракован. */
function without(key: string, batch: Chunk[]): Chunk[] {
  const sent = new Set(batch.map((c) => c.client_chunk_id))
  return load(key).filter((c) => !sent.has(c.client_chunk_id))
}

/**
 * Отправить буфер человека перед выходом, пока его токен ещё действует.
 *
 * Ждём не дольше `ms`: выход не должен зависать из-за сети. Не успело — куски
 * остаются под его ключом и уйдут, когда он сам откроет плеер снова.
 */
export async function flushBeforeSignOut(userId: string, ms = 2000): Promise<void> {
  dropLegacy()
  const key = keyOf(userId)
  const batch = load(key).slice(0, BATCH)
  if (!batch.length) return
  const sending = api.sendChunks(batch).then(
    () => save(key, without(key, batch)),
    () => undefined,
  )
  await Promise.race([sending, new Promise((resolve) => window.setTimeout(resolve, ms))])
}

export type ChunkQueue = {
  /** Положить закрытый кусок в буфер и попробовать отправить. */
  push(chunk: Chunk): void
  /** Куски, которые сервер ещё не признал: плеер считает их сам. */
  pending(): readonly Chunk[]
  /** Отправить не откладывая — уход со страницы и конец тренировки. */
  flush(): void
  /** Снять таймеры: плеер закрылся. */
  stop(): void
}

type Options = {
  /** Чей это буфер: у каждого человека свой ключ в хранилище. */
  userId: string
  /** Свежая сводка с сервера: она всегда правее локального счётчика. */
  onSummary(summary: StatsSummary): void
  /** Доступ кончился прямо во время тренировки. */
  onAccessLost(): void
  /** Буфер изменился — плеер пересчитает «сегодня». */
  onChange(): void
}

export function createChunkQueue({ userId, onSummary, onAccessLost, onChange }: Options): ChunkQueue {
  const key = keyOf(userId)
  dropLegacy()
  let timer: number | null = null
  let sending = false
  let attempt = 0
  let lastTry = 0
  let stopped = false

  // Пишем всегда поверх свежепрочитанного буфера — см. шапку файла.
  const store = (list: Chunk[]) => {
    save(key, list)
    onChange()
  }

  const schedule = (ms: number) => {
    if (stopped || timer !== null) return
    timer = window.setTimeout(() => {
      timer = null
      void run()
    }, Math.max(0, ms))
  }

  /** Следующая попытка не раньше, чем позволяет склейка. */
  const plan = () => {
    if (load(key).length) schedule(lastTry + MIN_GAP_MS - Date.now())
  }

  /** Выбросить из буфера то, что уже не вернётся: принято либо забраковано. */
  const drop = (batch: Chunk[]) => store(without(key, batch))

  async function run(): Promise<void> {
    if (stopped || sending) return
    const buffer = load(key)
    if (!buffer.length) return

    const wait = lastTry + MIN_GAP_MS - Date.now()
    if (wait > 0) {
      schedule(wait)
      return
    }

    sending = true
    const batch = buffer.slice(0, BATCH)
    lastTry = Date.now()

    try {
      const res = await api.sendChunks(batch)
      attempt = 0
      drop(batch)
      onSummary(res.summary)
    } catch (e) {
      const err = e instanceof ApiError ? e : null

      if (err?.code === 'access_required') {
        // Продолжать нечего: запись закрыта оплатой, а плеер сейчас уедет
        // на тарифы. Буфер чистим, иначе он будет стучаться до конца дня.
        store([])
        onAccessLost()
      } else if (err?.status === 422) {
        // Неверный тип поля — это баг плеера, а не сети. Пакет не станет
        // правильнее от повтора, поэтому выбрасываем и идём дальше.
        drop(batch)
      } else {
        const pause = err?.status === 429 ? (err.retry_after ?? 60) : BACKOFF[Math.min(attempt, BACKOFF.length - 1)]
        attempt += 1
        sending = false
        schedule(pause * 1000)
        return
      }
    } finally {
      sending = false
    }

    plan()
  }

  // Буфер мог остаться с прошлого раза: вкладку закрыли посреди обрыва сети.
  // Отправляем его сразу, не дожидаясь первого нового куска.
  plan()

  return {
    push(chunk) {
      // Шаги считаются здесь, в одном месте: плеер знает про движение и
      // секунды, а перевод в шаги — дело куска.
      const withSteps: Chunk = {
        ...chunk,
        steps: chunk.steps ?? stepsFor(chunk.move_id, chunk.duration_seconds),
      }
      store([...load(key), withSteps].slice(-LIMIT))
      plan()
    },

    pending: () => load(key),

    flush() {
      // Человек уходит со страницы: ждать склейку уже некогда.
      lastTry = 0
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      void run()
    },

    stop() {
      stopped = true
      if (timer !== null) clearTimeout(timer)
      timer = null
    },
  }
}
