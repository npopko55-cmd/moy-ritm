/**
 * Админка → «Посты»: посты в Telegram-каналы воронок по расписанию.
 *
 * Два канала — «Мой ритм! 1» (3 дня) и «Мой ритм! 2» (челлендж 21 день). Пост
 * пишется здесь, ставится на время по Москве, а в канал его отправляет бот
 * задачей на сервере (docs/POSTS.md бэкенда). Что есть на странице:
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
  type ChannelPost,
  type PostChannelKey,
  type PostChannels,
  type PostInput,
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

type Fail = (e: unknown, show: (text: string) => void) => void

const CHANNELS: { key: PostChannelKey; title: string; note: string }[] = [
  { key: 'f1', title: 'Мой ритм! 1', note: 'воронка 1 — 3 дня' },
  { key: 'f2', title: 'Мой ритм! 2', note: 'воронка 2 — челлендж 21 день' },
]

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
  const [channel, setChannel] = useState<PostChannelKey>('f1')
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
  const title = CHANNELS.find((c) => c.key === channel)?.title ?? channel

  return (
    <>
      <Card title="Канал">
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
        {info && !info.configured && (
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
          initial={open === 'new' ? null : open}
          onClose={() => {
            setOpen(null)
            reload()
          }}
        />
      ) : (
        <PostList posts={posts} channelTitle={title} onOpen={setOpen} />
      )}
    </>
  )
}

/* ——— Список ——— */

function PostList({
  posts,
  channelTitle,
  onOpen,
}: {
  posts: ChannelPost[] | null
  channelTitle: string
  onOpen(post: ChannelPost | 'new'): void
}) {
  return (
    <Card title={`Посты «${channelTitle}»`} text="По времени публикации, московское время. Черновики без времени — в конце.">
      <div className="admin__tools">
        <button className="page__btn page__btn--pink" type="button" onClick={() => onOpen('new')}>
          Новый пост
        </button>
      </div>

      {posts === null && <p className="admin__period-note">Загружаем…</p>}
      {posts?.length === 0 && <p className="admin__period-note">В этом канале постов пока нет.</p>}

      <ul className="posts__list">
        {posts?.map((p) => (
          <li key={p.id} className="posts__item">
            <button type="button" className="posts__row" onClick={() => onOpen(p)}>
              <span className="posts__when">{p.publish_at ? formatMoscow(p.publish_at) : 'Без времени'}</span>
              <span className={`posts__status is-${p.status}`}>{STATUS_LABEL[p.status]}</span>
              <span className="posts__preview">{excerpt(p.text) || '(без текста)'}</span>
              <span className="posts__meta">
                {[MEDIA_LABEL[p.media_type], p.button_text ? `кнопка «${p.button_text}»` : '']
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

type Form = { publishAt: string; text: string; buttonText: string; buttonUrl: string }

const formOf = (p: ChannelPost | null): Form => ({
  publishAt: toMoscowInput(p?.publish_at ?? null),
  text: p?.text ?? '',
  buttonText: p?.button_text ?? '',
  buttonUrl: p?.button_url ?? '',
})

const sameForm = (a: Form, b: Form) =>
  a.publishAt === b.publishAt && a.text === b.text && a.buttonText === b.buttonText && a.buttonUrl === b.buttonUrl

type Confirm = 'publish' | 'delete' | null

type EditorProps = {
  token: string
  fail: Fail
  channel: PostChannelKey
  channelTitle: string
  initial: ChannelPost | null
  onClose(): void
}

function PostEditor({ token, fail, channel, channelTitle, initial, onClose }: EditorProps) {
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

  const input = (): PostInput => ({
    channel,
    publish_at: fromMoscowInput(form.publishAt),
    text: form.text,
    button_text: form.buttonText.trim() || null,
    button_url: form.buttonUrl.trim() || null,
  })

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
          Опубликован {formatMoscow(post.published_at)}
          {post.telegram_message_id ? `, сообщение №${post.telegram_message_id}` : ''}. Изменить его уже нельзя.
        </p>
      )}
      {post?.error && post.status !== 'published' && <p className="page__note is-bad">{post.error}</p>}
      {post?.source_ref && <p className="admin__period-note">Из импорта: {post.source_ref}</p>}

      <div className="posts__form">
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

        <div className="posts__button-fields">
          <div className="field">
            <label className="field__label" htmlFor="post-btn-text">
              Кнопка под постом — надпись
            </label>
            <input
              id="post-btn-text"
              className="field__input"
              value={form.buttonText}
              maxLength={64}
              placeholder="Например: Начать"
              onChange={(e) => set({ buttonText: e.target.value })}
              disabled={locked || !!busy}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="post-btn-url">
              Ссылка кнопки
            </label>
            <input
              id="post-btn-url"
              className="field__input"
              type="url"
              value={form.buttonUrl}
              placeholder="https://t.me/ritmritm_bot?start=…"
              onChange={(e) => set({ buttonUrl: e.target.value })}
              disabled={locked || !!busy}
            />
          </div>
        </div>
        <p className="field__note">Необязательно. Нужны оба поля — или ни одного.</p>
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
          <button className="page__btn" type="button" disabled={!!busy} onClick={() => setConfirm('publish')}>
            {busy === 'publish' ? 'Публикуем…' : 'Опубликовать сейчас'}
          </button>
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
            Опубликовать в «{channelTitle}» прямо сейчас? Пост сразу увидят подписчики канала, отменить это нельзя.
            {dirty ? ' Несохранённые правки сначала сохранятся.' : ''}
          </p>
          <div className="posts__confirm-buttons">
            <button className="page__btn page__btn--pink" type="button" onClick={() => void publishNow()}>
              Да, опубликовать
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
