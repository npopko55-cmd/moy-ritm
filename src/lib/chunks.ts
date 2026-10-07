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
 * У гостя (ссылка /play/, src/lib/guest.ts) аккаунта нет — его буфер под
 * ключом `moy-ritm.chunks.guest`, и очередь его не отправляет: отправить не
 * под кем. Зарегистрировался или вошёл в этом браузере — adoptGuestChunks
 * переносит буфер под его id, и минуты уходят как обычные. Гостевые куски
 * старше суток выбрасываются: сервер всё равно положил бы их на день
 * переноса (правило 2 в backend/docs/STATS.md), а не на тот, когда двигались.
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

/** Буфер гостя — один на браузер. */
const GUEST_KEY = `${PREFIX}.guest`

/** Гостевые куски живут не дольше суток. */
const GUEST_MAX_AGE_MS = 86_400_000

const fresh = (list: Chunk[]): Chunk[] => {
  const since = Date.now() - GUEST_MAX_AGE_MS
  return list.filter((c) => Date.parse(c.started_at) >= since)
}

/** Если localStorage недоступен — буфер в памяти, общий на вкладку. */
const memory = new Map<string, Chunk[]>()

/** Кто следит за буфером: «Мой прогресс» прибавляет неотправленное к «Сегодня». */
const bufferListeners = new Set<() => void>()

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

function load(key: string): Chunk[] {
  let list: Chunk[]
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? (JSON.parse(raw) as Chunk[]) : []
    list = Array.isArray(parsed) ? parsed.slice(-LIMIT) : []
  } catch {
    list = memory.get(key) ?? []
  }
  return key === GUEST_KEY ? fresh(list) : list
}

function save(key: string, list: Chunk[]): void {
  memory.set(key, list)
  try {
    if (list.length) localStorage.setItem(key, JSON.stringify(list))
    else localStorage.removeItem(key)
  } catch {
    /* приватный режим или запрет хранилища — переживём без буфера на диске */
  }
  bufferListeners.forEach((fn) => {
    try {
      fn()
    } catch {
      /* подписчик упал — очередь от этого не должна */
    }
  })
}

/** Подписка на изменения буфера — любого человека в этой вкладке. Возвращает отписку. */
export function onBufferChange(fn: () => void): () => void {
  bufferListeners.add(fn)
  return () => {
    bufferListeners.delete(fn)
  }
}

/**
 * Секунды из буфера человека, которые сервер ещё не видел, — только за
 * сегодня по часам браузера (так же считает плеер): кусок, застрявший с
 * вечера, к новому дню не относится.
 */
export function pendingTodaySeconds(userId: string): number {
  const today = new Date().toDateString()
  return load(keyOf(userId))
    .filter((c) => new Date(c.started_at).toDateString() === today)
    .reduce((sum, c) => sum + c.duration_seconds, 0)
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

/**
 * Гость стал аккаунтом в этом браузере: его куски (не старше суток) — в
 * буфер человека, гостевой буфер пуст. Идентификаторы кусков прежние, так
 * что повтор переноса ничего не удвоит. Уйдут с первым открытием плеера.
 */
export function adoptGuestChunks(userId: string): void {
  const guest = load(GUEST_KEY)
  if (!guest.length) return
  const key = keyOf(userId)
  const mine = load(key)
  const known = new Set(mine.map((c) => c.client_chunk_id))
  save(key, [...mine, ...guest.filter((c) => !known.has(c.client_chunk_id))].slice(-LIMIT))
  save(GUEST_KEY, [])
}

export type ChunkQueue = {
  /** Положить закрытый кусок в буфер и попробовать отправить. */
  push(chunk: Chunk): void
  /** Куски, которые сервер ещё не признал: плеер считает их сам. */
  pending(): readonly Chunk[]
  /**
   * Отправить не откладывая — уход со страницы и конец тренировки.
   *
   * keepalive — вкладку прячут или закрывают: запрос должен дойти и без
   * страницы. Ответ тогда может не вернуться — куски останутся в буфере и
   * уйдут ещё раз при следующем открытии, а сервер не засчитает их дважды
   * (client_chunk_id).
   *
   * Обещание выполняется, когда попытка кончилась — успехом или нет; буфер
   * пуст — сразу. Идёт отправка — дожидается её и сразу отправляет то, что в
   * тот пакет не попало.
   */
  flush(options?: { keepalive?: boolean }): Promise<void>
  /** Снять таймеры: плеер закрылся. Уже начатый flush доводится до конца. */
  stop(): void
}

type Options = {
  /**
   * Чей это буфер: у каждого человека свой ключ в хранилище. null — гость:
   * куски копятся в гостевом буфере и не отправляются.
   */
  userId: string | null
  /** Свежая сводка с сервера: она всегда правее локального счётчика. */
  onSummary(summary: StatsSummary): void
  /** Доступ кончился прямо во время тренировки. */
  onAccessLost(): void
  /** Буфер изменился — плеер пересчитает «сегодня». */
  onChange(): void
}

export function createChunkQueue({ userId, onSummary, onAccessLost, onChange }: Options): ChunkQueue {
  const guest = userId === null
  const key = guest ? GUEST_KEY : keyOf(userId)
  dropLegacy()
  let timer: number | null = null
  /** Отправка, которая идёт сейчас: второй пакет параллельно не шлём, flush её дожидается. */
  let inflight: Promise<void> | null = null
  let attempt = 0
  let lastTry = 0
  let stopped = false

  // Пишем всегда поверх свежепрочитанного буфера — см. шапку файла.
  const store = (list: Chunk[]) => {
    save(key, list)
    onChange()
  }

  const clearTimer = () => {
    if (timer === null) return
    window.clearTimeout(timer)
    timer = null
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
    if (!guest && load(key).length) schedule(lastTry + MIN_GAP_MS - Date.now())
  }

  /** Выбросить из буфера то, что уже не вернётся: принято либо забраковано. */
  const drop = (batch: Chunk[]) => store(without(key, batch))

  /**
   * Отправить пакет, если склейка позволяет. force — явная просьба (flush):
   * её не отменяет и stop(), иначе минуты, закрытые при уходе из плеера,
   * ждали бы его следующего открытия.
   */
  function run(keepalive = false, force = false): Promise<void> {
    if (inflight) return inflight
    // Гостю отправлять не под кем: куски ждут регистрации (adoptGuestChunks).
    if (guest || (stopped && !force)) return Promise.resolve()
    const buffer = load(key)
    if (!buffer.length) return Promise.resolve()

    const wait = lastTry + MIN_GAP_MS - Date.now()
    if (wait > 0) {
      schedule(wait)
      return Promise.resolve()
    }

    const job = send(buffer.slice(0, BATCH), keepalive).finally(() => {
      inflight = null
    })
    inflight = job
    return job
  }

  /** Один пакет: ответ, повтор по сбою, следующая попытка. Не падает. */
  async function send(batch: Chunk[], keepalive: boolean): Promise<void> {
    lastTry = Date.now()

    try {
      const res = await api.sendChunks(batch, keepalive ? { keepalive: true } : undefined)
      attempt = 0
      // Забракованные куски не вернутся: повтор с тем же телом получит тот же
      // отказ. Человеку тут сказать нечего, а при разработке причина нужна.
      if (import.meta.env.DEV && res.rejected?.length) {
        console.warn('[chunks] сервер забраковал куски', res.rejected)
      }
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
        schedule(pause * 1000)
        return
      }
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

    flush(options) {
      const keepalive = options?.keepalive === true
      // Человек уходит со страницы: ждать склейку уже некогда.
      const now = () => {
        lastTry = 0
        clearTimer()
        return run(keepalive, true)
      }
      if (!inflight) return now()
      if (keepalive && !guest) {
        // Вкладку прячут или закрывают, а прошлый пакет ещё в пути: его
        // ответа страница может и не дождаться. Весь буфер — сразу и с
        // keepalive; то, что уже ушло, сервер второй раз не засчитает.
        clearTimer()
        const batch = load(key).slice(0, BATCH)
        return batch.length ? send(batch, true) : Promise.resolve()
      }
      // Пакет в пути — дождаться его и сразу отправить то, что в него не попало.
      return inflight.then(now)
    },

    stop() {
      stopped = true
      clearTimer()
    },
  }
}
