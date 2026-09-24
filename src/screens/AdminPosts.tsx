/**
 * Админка → «Посты»: посты в Telegram-каналы воронок и рассылки ботом.
 *
 * Два канала — «Мой ритм! 1» (3 дня) и «Мой ритм! 2» (челлендж 21 день) — и две
 * аудитории бота: личные сообщения людям воронки 1 и 2 (главный канал с
 * запуска 28.09). Пост пишется здесь, ставится на время по Москве, а
 * отправляет его бот задачей на сервере (docs/POSTS.md бэкенда). У рассылки
 * ботом ещё есть расписание «день N в ЧЧ:ММ» (от дня регистрации человека),
 * сегмент аудитории, флаг «продающее», кнопка «открыть приложение» и
 * счётчики доставки. Что есть на странице:
 *   • переключатель канала и предупреждение, если канал не подключён;
 *   • список постов канала по времени публикации, со статусом и ошибкой;
 *   • редактор поста — отдельным блоком на месте списка: время, текст с
 *     подсказкой о тегах и счётчиком лимита, картинка или ролик, кнопка;
 *   • действия: предпросмотр себе в Telegram, запланировать, отменить,
 *     опубликовать сейчас, удалить черновик.
 *
 * Всплывающих окон нет: «Опубликовать сейчас» и «Удалить» переспрашивают
 * строкой прямо под кнопками. Время везде — московское.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  adminApi,
  isBotAudience,
  type ChannelPost,
  type PostButtonType,
  type PostChannelKey,
  type PostChannels,
  type PostDeliveries,
  type PostInput,
  type PostSegment,
  type PostStatus,
} from '../api/admin'
import {
  CAPTION_LIMIT,
  POST_TAGS_HINT,
  TEXT_LIMIT,
  formatMoscow,
  fromMoscowInput,
  toMoscowInput,
  visibleLength,
  visibleText,
} from '../lib/posts'
import { Card } from './Page'
import './AdminBot.css'

type Fail = (e: unknown, show: (text: string) => void) => void

const CHANNELS: { key: PostChannelKey; title: string; note: string }[] = [
  { key: 'bot_f1', title: 'Бот: воронка 1', note: '3 дня — личные сообщения' },
  { key: 'bot_f2', title: 'Бот: воронка 2', note: 'челлендж — личные сообщения' },
  { key: 'f1', title: 'Мой ритм! 1', note: 'канал воронки 1 — 3 дня' },
  { key: 'f2', title: 'Мой ритм! 2', note: 'канал воронки 2 — челлендж 21 день' },
]

const SEGMENTS: { key: PostSegment; label: string }[] = [
  { key: 'all', label: 'Все в воронке' },
  { key: 'registered_idle', label: 'Зарегистрировались, но ещё не тренировались' },
  { key: 'active_yesterday', label: 'Тренировались вчера' },
  { key: 'inactive_yesterday', label: 'Не тренировались вчера (из зарегистрированных)' },
  { key: 'unpaid', label: 'Не оплатили' },
]

const BUTTON_TYPES: { key: PostButtonType; label: string; bot: boolean }[] = [
  { key: 'none', label: 'Без кнопки', bot: false },
  { key: 'url', label: 'Ссылка', bot: false },
  { key: 'web_app', label: 'Открыть приложение', bot: true },
]

/** «День 2, 10:00 МСК» — расписание шаблона. */
const dayLabel = (p: ChannelPost) => `День ${p.schedule_day}, ${p.schedule_time} МСК`

const isTemplate = (p: ChannelPost | null) => !!p?.schedule_day

function deliveriesText(d: PostDeliveries | null | undefined): string {
  if (!d || !d.recipients) return ''
  const parts = [`получателей ${d.recipients}`, `доставлено ${d.delivered}`]
  if (d.failed) parts.push(`ошибок ${d.failed}${d.blocked ? ` (заблокировали бота ${d.blocked})` : ''}`)
  if (d.pending) parts.push(`в очереди ${d.pending}`)
  return parts.join(' · ')
}

const STATUS_LABEL: Record<PostStatus, string> = {
  draft: 'Черновик',
  scheduled: 'Запланирован',
  sending: 'Отправляется',
  published: 'Опубликован',
  failed: 'Ошибка',
  cancelled: 'Отменён',
}

const MEDIA_LABEL = { none: '', photo: 'картинка', video: 'видео', animation: 'GIF' } as const

/** Что принимает бэкенд: фото до 10 МБ, MP4 и GIF до 50 МБ. */
const MEDIA_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,video/mp4'
const MB = 1024 * 1024

/** Посты, которые уже ушли или уходят, не правятся. */
const isLocked = (p: ChannelPost | null) => p !== null && (p.status === 'published' || p.status === 'sending')

export default function AdminPosts({ token, fail }: { token: string; fail: Fail }) {
  const [channel, setChannel] = useState<PostChannelKey>('bot_f1')
  const [channels, setChannels] = useState<PostChannels | null>(null)
  const [posts, setPosts] = useState<ChannelPost[] | null>(null)
  const [error, setError] = useState('')
  // Открытый в редакторе пост: 'new' — новый, null — показываем список.
  const [open, setOpen] = useState<ChannelPost | 'new' | null>(null)

  useEffect(() => {
    let alive = true
    adminApi.postChannels(token).then(
      (next) => {
        if (alive) setChannels(next)
      },
      (e) => {
        if (alive) fail(e, setError)
      },
    )
    return () => {
      alive = false
    }
  }, [token, fail])

  const reload = useCallback(() => {
    let alive = true
    setError('')
    adminApi.posts(token, channel).then(
      (list) => {
        if (alive) setPosts(list)
      },
      (e) => {
        if (alive) fail(e, setError)
      },
    )
    return () => {
      alive = false
    }
  }, [token, channel, fail])

  useEffect(() => reload(), [reload])

  const info = channels?.channels.find((c) => c.key === channel)
  const title = info?.title ?? CHANNELS.find((c) => c.key === channel)?.title ?? channel
  const bot = isBotAudience(channel)

  return (
    <>
      <Card title="Куда">
        <div className="chips">
          {CHANNELS.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`chip posts__chip ${channel === c.key ? 'is-on' : ''}`}
              onClick={() => {
                setChannel(c.key)
                setPosts(null)
                setOpen(null)
              }}
            >
              {c.title}
              <span className="posts__chip-note">{c.note}</span>
            </button>
          ))}
        </div>
        {channels && !channels.bot_configured && (
          <p className="page__note is-bad">Бот не настроен: на сервере пуст TELEGRAM_BOT_TOKEN — посты не уйдут.</p>
        )}
        {bot && (
          <p className="admin__period-note">
            Рассылка ботом: пост уходит личным сообщением каждому, кто нажал «Старт» по ссылке этой воронки, и
            аккаунтам воронки с привязанным Telegram. Отписавшимся (/stop) и заблокировавшим бота — нет.
          </p>
        )}
        {!bot && info && !info.configured && (
          <p className="page__note is-bad">
            Канал «{title}» не подключён: на сервере не задан POST_CHANNEL_{channel.toUpperCase()}_ID. Писать
            черновики можно, публиковать — нет. Как подключить — docs/POSTS.md.
          </p>
        )}
        {channels && !channels.preview_configured && (
          <p className="admin__period-note">
            Предпросмотр выключен: на сервере не задан POST_PREVIEW_CHAT_ID (ваш id в Telegram).
          </p>
        )}
        {error && <p className="page__note is-bad">{error}</p>}
      </Card>

      {open ? (
        <PostEditor
          key={open === 'new' ? `new-${channel}` : open.id}
          token={token}
          fail={fail}
          channel={channel}
          channelTitle={title}
          bot={bot}
          initial={open === 'new' ? null : open}
          onClose={() => {
            setOpen(null)
            reload()
          }}
        />
      ) : (
        <PostList posts={posts} channelTitle={title} bot={bot} onOpen={setOpen} />
      )}
    </>
  )
}

/* ——— Список ——— */

function PostList({
  posts,
  channelTitle,
  bot,
  onOpen,
}: {
  posts: ChannelPost[] | null
  channelTitle: string
  bot: boolean
  onOpen(post: ChannelPost | 'new'): void
}) {
  return (
    <Card
      title={`Посты «${channelTitle}»`}
      text={
        bot
          ? 'Сначала — по времени публикации, потом шаблоны «день N» по дню, московское время. Черновики без времени — в конце.'
          : 'По времени публикации, московское время. Черновики без времени — в конце.'
      }
    >
      <div className="admin__tools">
        <button className="page__btn page__btn--pink" type="button" onClick={() => onOpen('new')}>
          Новый пост
        </button>
      </div>

      {posts === null && <p className="admin__period-note">Загружаем…</p>}
      {posts?.length === 0 && (
        <p className="admin__period-note">{bot ? 'Рассылок этой воронке пока нет.' : 'В этом канале постов пока нет.'}</p>
      )}

      <ul className="posts__list">
        {posts?.map((p) => (
          <li key={p.id} className="posts__item">
            <button type="button" className="posts__row" onClick={() => onOpen(p)}>
              <span className="posts__when">
                {isTemplate(p) ? dayLabel(p) : p.publish_at ? formatMoscow(p.publish_at) : 'Без времени'}
              </span>
              <span className={`posts__status is-${p.status}`}>
                {isTemplate(p) && p.status === 'scheduled' ? 'Шаблон включён' : STATUS_LABEL[p.status]}
              </span>
              <span className="posts__preview">{excerpt(p.text) || '(без текста)'}</span>
              <span className="posts__meta">
                {[
                  MEDIA_LABEL[p.media_type],
                  p.button_text ? `кнопка «${p.button_text}»${p.button_type === 'web_app' ? ' (приложение)' : ''}` : '',
                  p.segment && p.segment !== 'all' ? SEGMENTS.find((x) => x.key === p.segment)?.label : '',
                  p.selling ? 'продающий' : '',
                  deliveriesText(p.deliveries),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              {p.error && p.status !== 'published' && <span className="posts__error">{p.error}</span>}
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function excerpt(html: string): string {
  const text = visibleText(html).replace(/\s+/g, ' ').trim()
  return text.length > 160 ? `${text.slice(0, 157)}…` : text
}

/* ——— Редактор ——— */

type When = 'time' | 'day'

type Form = {
  when: When
  publishAt: string
  day: string
  time: string
  text: string
  buttonType: PostButtonType
  buttonText: string
  buttonUrl: string
  segment: PostSegment
  selling: boolean
}

const formOf = (p: ChannelPost | null): Form => ({
  when: p?.schedule_day ? 'day' : 'time',
  publishAt: toMoscowInput(p?.publish_at ?? null),
  day: p?.schedule_day ? String(p.schedule_day) : '1',
  time: p?.schedule_time ?? '10:00',
  text: p?.text ?? '',
  // Старый бэкенд типа не шлёт: есть надпись — это ссылка.
  buttonType: p?.button_type ?? (p?.button_text ? 'url' : 'none'),
  buttonText: p?.button_text ?? '',
  buttonUrl: p?.button_url ?? '',
  segment: p?.segment ?? 'all',
  selling: p?.selling ?? false,
})

const sameForm = (a: Form, b: Form) => (Object.keys(a) as (keyof Form)[]).every((key) => a[key] === b[key])

type Confirm = 'publish' | 'delete' | null

type EditorProps = {
  token: string
  fail: Fail
  channel: PostChannelKey
  channelTitle: string
  bot: boolean
  initial: ChannelPost | null
  onClose(): void
}

function PostEditor({ token, fail, channel, channelTitle, bot, initial, onClose }: EditorProps) {
  const [post, setPost] = useState<ChannelPost | null>(initial)
  const [form, setForm] = useState<Form>(() => formOf(initial))
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [confirm, setConfirm] = useState<Confirm>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const locked = isLocked(post)
  const dirty = !sameForm(form, formOf(post))
  const hasMedia = post?.has_media ?? false
  const limit = hasMedia ? CAPTION_LIMIT : TEXT_LIMIT
  const length = visibleLength(form.text)
  const set = (patch: Partial<Form>) => {
    setForm((f) => ({ ...f, ...patch }))
    setOk('')
  }

  const template = bot && form.when === 'day'
  const audience = useAudience(token, bot ? channel : null, form.segment, form.selling)

  const input = (): PostInput => {
    const base: PostInput = {
      channel,
      publish_at: template ? null : fromMoscowInput(form.publishAt),
      text: form.text,
      button_type: form.buttonType,
      button_text: form.buttonType === 'none' ? null : form.buttonText.trim() || null,
      button_url: form.buttonType === 'none' ? null : form.buttonUrl.trim() || null,
    }
    if (!bot) return base
    const day = Number.parseInt(form.day, 10)
    return {
      ...base,
      schedule_day: template && day > 0 ? day : null,
      schedule_time: template ? form.time || null : null,
      segment: form.segment,
      selling: form.selling,
    }
  }

  /** Несохранённые правки — сначала сохранить: действия идут с тем, что на сервере. */
  const saved = async (): Promise<ChannelPost> => {
    if (post && !dirty) return post
    const next = post ? await adminApi.updatePost(token, post.id, input()) : await adminApi.createPost(token, input())
    setPost(next)
    setForm(formOf(next))
    return next
  }

  const run = async (label: string, action: () => Promise<string | void>) => {
    setBusy(label)
    setError('')
    setOk('')
    setConfirm(null)
    try {
      const message = await action()
      if (message) setOk(message)
    } catch (e) {
      fail(e, setError)
    } finally {
      setBusy('')
    }
  }

  const save = () => run('save', async () => {
    await saved()
    return 'Сохранено'
  })

  const preview = () => run('preview', async () => {
    const current = await saved()
    await adminApi.previewPost(token, current.id)
    return 'Предпросмотр отправлен вам в Telegram'
  })

  const schedule = () => run('schedule', async () => {
    const current = await saved()
    const next = await adminApi.schedulePost(token, current.id)
    setPost(next)
    if (isTemplate(next)) return `Шаблон включён: каждому — в его ${dayLabel(next).toLowerCase()}`
    return `Запланирован на ${formatMoscow(next.publish_at)}`
  })

  const cancel = () => run('cancel', async () => {
    if (!post) return
    setPost(await adminApi.cancelPost(token, post.id))
    return 'Снят с расписания'
  })

  const publishNow = () => run('publish', async () => {
    const current = await saved()
    const next = await adminApi.publishPostNow(token, current.id)
    setPost(next)
    setForm(formOf(next))
    if (bot && next.status === 'scheduled') return 'Рассылка начнётся в течение минуты — счётчики обновятся в списке'
    if (next.status === 'published') return `Опубликован в «${channelTitle}»`
    // Итог «не ушёл» или «неизвестен» — в самом посте, показываем его ошибкой.
    setError(next.error || 'Пост не опубликован')
  })

  const remove = () => run('delete', async () => {
    if (post) await adminApi.deletePost(token, post.id)
    onClose()
  })

  const upload = (file: File) => run('media', async () => {
    const tooBig = file.type.startsWith('image/') && file.type !== 'image/gif' ? 10 * MB : 50 * MB
    if (file.size > tooBig) {
      setError(`Файл больше ${tooBig / MB} МБ — столько Telegram от бота не примет`)
      return
    }
    const current = await saved()
    const next = await adminApi.uploadPostMedia(token, current.id, file)
    setPost(next)
    return 'Файл загружен'
  })

  const dropMedia = () => run('media', async () => {
    if (!post) return
    setPost(await adminApi.deletePostMedia(token, post.id))
    return 'Файл убран'
  })

  const status = post?.status ?? 'draft'
  const canSchedule = !locked && status !== 'scheduled'
  const canDelete = post !== null && (status === 'draft' || status === 'cancelled')
  const counts = deliveriesText(post?.deliveries)

  return (
    <Card title={post ? `Пост №${post.id} · ${channelTitle}` : `Новый пост · ${channelTitle}`}>
      <div className="admin__tools">
        <button className="page__btn" type="button" onClick={onClose} disabled={!!busy}>
          ← К списку
        </button>
        {post && <span className={`posts__status is-${status}`}>{STATUS_LABEL[status]}</span>}
      </div>

      {post?.status === 'published' && (
        <p className="page__note">
          {bot ? 'Разослан' : 'Опубликован'} {formatMoscow(post.published_at)}
          {post.telegram_message_id ? `, сообщение №${post.telegram_message_id}` : ''}. Изменить его уже нельзя.
        </p>
      )}
      {bot && counts && <p className="page__note botposts__counts">{counts}</p>}
      {post?.error && post.status !== 'published' && <p className="page__note is-bad">{post.error}</p>}
      {post?.source_ref && <p className="admin__period-note">Из импорта: {post.source_ref}</p>}

      <div className="posts__form">
        {bot && (
          <div className="field">
            <span className="field__label">Когда</span>
            <div className="chips botposts__when">
              <button
                type="button"
                className={`chip ${form.when === 'time' ? 'is-on' : ''}`}
                disabled={locked || !!busy}
                onClick={() => set({ when: 'time' })}
              >
                В дату и время
              </button>
              <button
                type="button"
                className={`chip ${form.when === 'day' ? 'is-on' : ''}`}
                disabled={locked || !!busy}
                onClick={() => set({ when: 'day' })}
              >
                День N от регистрации
              </button>
            </div>
          </div>
        )}

        {template ? (
          <div className="botposts__day">
            <div className="field">
              <label className="field__label" htmlFor="post-day">
                День
              </label>
              <input
                id="post-day"
                className="field__input"
                type="number"
                min={1}
                max={366}
                value={form.day}
                onChange={(e) => set({ day: e.target.value })}
                disabled={locked || !!busy}
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="post-time">
                Время (МСК)
              </label>
              <input
                id="post-time"
                className="field__input"
                type="time"
                value={form.time}
                onChange={(e) => set({ time: e.target.value })}
                disabled={locked || !!busy}
              />
            </div>
            <p className="field__note botposts__wide">
              День 1 — день регистрации по Москве; у тех, кто нажал «Старт», но не зарегистрировался, — день первого
              «Старт». Пока шаблон включён, каждый получит его один раз — в свой день и час (если сервер лежал, догонит
              в течение 3 часов).
            </p>
          </div>
        ) : (
          <div className="field">
            <label className="field__label" htmlFor="post-when">
              Дата и время публикации (МСК)
            </label>
            <input
              id="post-when"
              className="field__input"
              type="datetime-local"
              value={form.publishAt}
              onChange={(e) => set({ publishAt: e.target.value })}
              disabled={locked || !!busy}
            />
          </div>
        )}

        {bot && (
          <div className="field">
            <label className="field__label" htmlFor="post-segment">
              Кому
            </label>
            <select
              id="post-segment"
              className="field__input"
              value={form.segment}
              onChange={(e) => set({ segment: e.target.value as PostSegment })}
              disabled={locked || !!busy}
            >
              {SEGMENTS.map((x) => (
                <option key={x.key} value={x.key}>
                  {x.label}
                </option>
              ))}
            </select>
            <label className="botposts__check">
              <input
                type="checkbox"
                checked={form.selling}
                onChange={(e) => set({ selling: e.target.checked })}
                disabled={locked || !!busy}
              />
              Продающее — тем, кто уже оплатил, не присылать
            </label>
            <p className="field__note">
              {audience === null
                ? 'Считаем аудиторию…'
                : template
                  ? `Сейчас в аудитории ${audience} чел. — шаблон дойдёт до каждого в его день.`
                  : `Сейчас получили бы ${audience} чел.`}
            </p>
          </div>
        )}

        <div className={`field ${length > limit ? 'is-bad' : ''}`}>
          <label className="field__label" htmlFor="post-text">
            Текст
          </label>
          <textarea
            id="post-text"
            className="field__input posts__text"
            rows={10}
            value={form.text}
            onChange={(e) => set({ text: e.target.value })}
            disabled={locked || !!busy}
          />
          <p className={`field__note posts__counter ${length > limit ? 'is-bad' : ''}`}>
            {length} / {limit}
            {hasMedia ? ' — подпись к картинке или ролику' : ''}
          </p>
          <p className="field__note">
            Разметка Telegram: <code>{POST_TAGS_HINT}</code>. Перенос строки — просто Enter, тег &lt;br&gt; не нужен.
            Символы &lt; &gt; &amp; в тексте пишутся как <code>&amp;lt; &amp;gt; &amp;amp;</code>. Считаются только
            видимые символы, без тегов.
          </p>
        </div>

        <div className="field">
          <span className="field__label">Картинка или ролик</span>
          <div className="posts__media">
            <span className="posts__media-name">
              {hasMedia ? `Прикреплено: ${MEDIA_LABEL[post!.media_type]}` : 'Нет — пост только текстом'}
            </span>
            {!locked && (
              <>
                <button
                  className="page__btn"
                  type="button"
                  disabled={!!busy}
                  onClick={() => fileInput.current?.click()}
                >
                  {busy === 'media' ? 'Загружаем…' : hasMedia ? 'Заменить файл' : 'Выбрать файл'}
                </button>
                {hasMedia && (
                  <button className="page__btn page__btn--danger" type="button" disabled={!!busy} onClick={() => void dropMedia()}>
                    Убрать
                  </button>
                )}
              </>
            )}
            <input
              ref={fileInput}
              type="file"
              accept={MEDIA_ACCEPT}
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) void upload(file)
              }}
            />
          </div>
          <p className="field__note">JPEG, PNG, WEBP — до 10 МБ; MP4 и GIF — до 50 МБ. С файлом текст — подпись до 1024 символов.</p>
        </div>

        <div className="field">
          <span className="field__label">Кнопка под постом</span>
          <div className="chips botposts__when">
            {BUTTON_TYPES.filter((b) => bot || !b.bot).map((b) => (
              <button
                key={b.key}
                type="button"
                className={`chip ${form.buttonType === b.key ? 'is-on' : ''}`}
                disabled={locked || !!busy}
                onClick={() => set({ buttonType: b.key })}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>

        {form.buttonType !== 'none' && (
          <div className="posts__button-fields">
            <div className="field">
              <label className="field__label" htmlFor="post-btn-text">
                Надпись
              </label>
              <input
                id="post-btn-text"
                className="field__input"
                value={form.buttonText}
                maxLength={64}
                placeholder={form.buttonType === 'web_app' ? 'Зайти в мой ритм' : 'Например: Начать'}
                onChange={(e) => set({ buttonText: e.target.value })}
                disabled={locked || !!busy}
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="post-btn-url">
                {form.buttonType === 'web_app' ? 'Адрес приложения (необязательно)' : 'Ссылка кнопки'}
              </label>
              <input
                id="post-btn-url"
                className="field__input"
                type="url"
                value={form.buttonUrl}
                placeholder={
                  form.buttonType === 'web_app' ? 'По умолчанию — ссылка входа воронки' : 'https://t.me/ritmritm_bot?start=…'
                }
                onChange={(e) => set({ buttonUrl: e.target.value })}
                disabled={locked || !!busy}
              />
            </div>
          </div>
        )}
        <p className="field__note">
          {form.buttonType === 'web_app'
            ? 'Открывает «Мой ритм» прямо в Telegram, как кнопки бота. Без надписи — «Зайти в мой ритм».'
            : form.buttonType === 'url'
              ? 'Нужны и надпись, и ссылка.'
              : 'Пост уйдёт без кнопки.'}
        </p>
      </div>

      {!locked && (
        <div className="posts__actions">
          <button className="page__btn" type="button" disabled={!!busy || !dirty} onClick={() => void save()}>
            {busy === 'save' ? 'Сохраняем…' : post ? 'Сохранить' : 'Сохранить черновик'}
          </button>
          <button className="page__btn" type="button" disabled={!!busy} onClick={() => void preview()}>
            {busy === 'preview' ? 'Отправляем…' : 'Предпросмотр мне в Telegram'}
          </button>
          {canSchedule && (
            <button className="page__btn page__btn--pink" type="button" disabled={!!busy} onClick={() => void schedule()}>
              {busy === 'schedule' ? 'Ставим…' : 'Запланировать'}
            </button>
          )}
          {status === 'scheduled' && (
            <button className="page__btn" type="button" disabled={!!busy} onClick={() => void cancel()}>
              {busy === 'cancel' ? 'Отменяем…' : 'Отменить'}
            </button>
          )}
          {!template && (
            <button className="page__btn" type="button" disabled={!!busy} onClick={() => setConfirm('publish')}>
              {busy === 'publish' ? 'Публикуем…' : bot ? 'Разослать сейчас' : 'Опубликовать сейчас'}
            </button>
          )}
          {canDelete && (
            <button
              className="page__btn page__btn--danger"
              type="button"
              disabled={!!busy}
              onClick={() => setConfirm('delete')}
            >
              Удалить
            </button>
          )}
        </div>
      )}

      {confirm === 'publish' && (
        <div className="posts__confirm" role="group" aria-label="Подтверждение публикации">
          <p>
            {bot
              ? `Разослать всем из аудитории «${channelTitle}» прямо сейчас${audience !== null ? ` (${audience} чел.)` : ''}? Отменить рассылку нельзя.`
              : `Опубликовать в «${channelTitle}» прямо сейчас? Пост сразу увидят подписчики канала, отменить это нельзя.`}
            {dirty ? ' Несохранённые правки сначала сохранятся.' : ''}
          </p>
          <div className="posts__confirm-buttons">
            <button className="page__btn page__btn--pink" type="button" onClick={() => void publishNow()}>
              {bot ? 'Да, разослать' : 'Да, опубликовать'}
            </button>
            <button className="page__btn" type="button" onClick={() => setConfirm(null)}>
              Не надо
            </button>
          </div>
        </div>
      )}
      {confirm === 'delete' && (
        <div className="posts__confirm" role="group" aria-label="Подтверждение удаления">
          <p>Удалить этот пост насовсем?</p>
          <div className="posts__confirm-buttons">
            <button className="page__btn page__btn--danger" type="button" onClick={() => void remove()}>
              Да, удалить
            </button>
            <button className="page__btn" type="button" onClick={() => setConfirm(null)}>
              Не надо
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="page__note is-bad" role="alert">
          {error}
        </p>
      )}
      {ok && <p className="page__note">{ok}</p>}
    </Card>
  )
}

/** Сколько человек сейчас в аудитории рассылки. null — считаем (или это канал). */
function useAudience(token: string, channel: PostChannelKey | null, segment: PostSegment, selling: boolean) {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    if (!channel) return
    let alive = true
    setCount(null)
    adminApi.postAudience(token, channel, segment, selling).then(
      (n) => {
        if (alive) setCount(n)
      },
      () => {
        /* подсказка, а не главное: не посчиталось — просто не показываем число */
      },
    )
    return () => {
      alive = false
    }
  }, [token, channel, segment, selling])
  return count
}
