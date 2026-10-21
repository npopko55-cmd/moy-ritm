/**
 * Настройки (раздел 5.2 архитектуры).
 *
 * Кнопки «Сохранить» нет: каждое изменение сразу уходит в PATCH и отвечает
 * строкой «Сохранено». Пока сервер думает, на экране уже новое значение —
 * не получилось, возвращаем прежнее и пишем почему.
 *
 * Источник истины — сервер. Интервал смены движения дублируется в
 * localStorage, но только как кэш для мгновенного старта плеера.
 *
 * Последняя карточка — «Приложение на телефоне»: как поставить сайт на экран
 * «Домой». Это не настройка и на сервер ничего не шлёт; на неё ведёт ссылка
 * https://ritmritm.ru/settings#app из постов и писем.
 */

import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from '../api/client'
import type { PatchSettingsBody } from '../api/client'
import { useSession } from '../auth/SessionProvider'
import { More, Share } from '../components/Icons'
import { DEVICE, IOS_OTHER_BROWSER, useInstallPrompt } from '../lib/install'
import {
  bumpSettingsRevision,
  currentSettingsRevision,
  MOVE_INTERVALS,
  saveMoveInterval,
} from '../lib/settings'
import { STANDALONE } from '../lib/standalone'
import { IN_TELEGRAM } from '../lib/telegram'
import { errorText, Waiting } from './Account'
import PageShell, { Card, Note, Row } from './Page'
import './Settings.css'

/** Если браузер не умеет перечислять пояса — короткий список СНГ. */
const FALLBACK_ZONES = [
  'Europe/Kaliningrad',
  'Europe/Moscow',
  'Europe/Kyiv',
  'Europe/Minsk',
  'Europe/Samara',
  'Asia/Yekaterinburg',
  'Asia/Omsk',
  'Asia/Novosibirsk',
  'Asia/Krasnoyarsk',
  'Asia/Almaty',
  'Asia/Bishkek',
  'Asia/Tashkent',
  'Asia/Baku',
  'Asia/Tbilisi',
  'Asia/Yerevan',
  'Asia/Irkutsk',
  'Asia/Yakutsk',
  'Asia/Vladivostok',
  'Asia/Magadan',
  'Asia/Kamchatka',
]

function zones(): string[] {
  try {
    const list = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.(
      'timeZone',
    )
    if (list?.length) return list
  } catch {
    /* старый браузер — обойдёмся коротким списком */
  }
  return FALLBACK_ZONES
}

const ALL_ZONES = zones()

/** Сколько «Сохранено» висит на экране. */
const NOTE_MS = 2500
/** Ползунок громкости дёргается на каждый пиксель — в сеть идём реже. */
const VOLUME_DELAY_MS = 500

/** Якорь карточки «Приложение на телефоне»: ссылка /settings#app. */
const APP_ANCHOR = 'app'

export default function Settings() {
  const { me, setMe } = useSession()

  // Открыли по ссылке /settings#app — сразу к карточке «Приложение на
  // телефоне». Пока профиля нет, на экране ожидание и карточки ещё нет:
  // прокручиваем, когда профиль пришёл (ready). Ровно раз — каждая правка
  // настройки меняет me, но не ready, и экран не дёргается обратно к якорю.
  const { hash } = useLocation()
  const ready = Boolean(me)
  useEffect(() => {
    if (!ready || hash !== `#${APP_ANCHOR}`) return
    // Кадр на раскладку, как у /#about на лендинге: шрифты ещё могли сдвигать
    // высоту карточек выше.
    const timer = window.setTimeout(
      () => document.getElementById(APP_ANCHOR)?.scrollIntoView({ block: 'start' }),
      120,
    )
    return () => window.clearTimeout(timer)
  }, [ready, hash])

  const [saved, setSaved] = useState('')
  const [failed, setFailed] = useState<{ key: string; text: string } | null>(null)
  // Ползунок ведём локально, чтобы он двигался без задержек сети.
  const [volume, setVolume] = useState(me?.settings.music_volume ?? 80)
  const noteTimer = useRef<number | null>(null)
  const volumeTimer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (noteTimer.current) clearTimeout(noteTimer.current)
      if (volumeTimer.current) clearTimeout(volumeTimer.current)
    },
    [],
  )

  if (!me) return <Waiting />
  const s = me.settings

  const done = (key: string) => {
    setSaved(key)
    if (noteTimer.current) clearTimeout(noteTimer.current)
    noteTimer.current = window.setTimeout(() => setSaved(''), NOTE_MS)
  }

  const patch = async (key: string, body: PatchSettingsBody) => {
    const before = me.settings
    // Номер правки: ответ ляжет в профиль, только если свежее правок не было
    // (src/lib/settings.ts). Экран к ответу может быть уже закрыт — человек
    // выключил музыку и сразу ушёл в тренировку, а там включил её кнопкой.
    const revision = bumpSettingsRevision()
    setFailed(null)
    setMe({ ...me, settings: { ...before, ...body } })
    try {
      const next = await api.patchSettings(body)
      // Ответ устарел: свежую правку не откатываем, её подтвердит свой ответ.
      if (currentSettingsRevision() !== revision) return
      setMe({ ...me, settings: next })
      if (body.move_interval_seconds) saveMoveInterval(next.move_interval_seconds)
      done(key)
    } catch (e) {
      if (currentSettingsRevision() !== revision) return
      setMe({ ...me, settings: before })
      setVolume(before.music_volume)
      setFailed({ key, text: errorText(e) })
    }
  }

  const patchZone = async (timezone: string) => {
    setFailed(null)
    try {
      setMe(await api.patchMe({ timezone }))
      done('zone')
    } catch (e) {
      setFailed({ key: 'zone', text: errorText(e) })
    }
  }

  /** Громкость: на экране сразу, в сеть — через полсекунды после остановки. */
  const slide = (value: number) => {
    setVolume(value)
    if (volumeTimer.current) clearTimeout(volumeTimer.current)
    volumeTimer.current = window.setTimeout(() => void patch('music', { music_volume: value }), VOLUME_DELAY_MS)
  }

  const note = (key: string) => (
    <>
      {failed?.key === key && <Note kind="bad">{failed.text}</Note>}
      {saved === key && !failed && <Note kind="ok">Сохранено</Note>}
    </>
  )

  return (
    <PageShell
      title="Настройки"
      lead="Всё, что влияет на тренировку. Изменения сохраняются сразу и работают на всех устройствах."
      tab="settings"
    >
      <Card title="Тренировка" text="Через сколько плеер переключает движение в круге.">
        <div className="chips" role="radiogroup" aria-label="Менять упражнение каждые">
          {MOVE_INTERVALS.map((i) => (
            <button
              key={i.seconds}
              role="radio"
              aria-checked={i.seconds === s.move_interval_seconds}
              className={`chip ${i.seconds === s.move_interval_seconds ? 'is-on' : ''}`}
              onClick={() => void patch('interval', { move_interval_seconds: i.seconds })}
            >
              {i.label}
            </button>
          ))}
        </div>
        {note('interval')}
      </Card>

      <Card title="Музыка">
        <Row label="Музыка в плеере" hint="Выключите, если хотите двигаться под своё.">
          <Switch
            label="Музыка в плеере"
            on={s.music_enabled}
            onChange={(on) => void patch('music', { music_enabled: on })}
          />
        </Row>
        <Row label="Громкость" hint={`${volume} из 100`}>
          <input
            className="range"
            type="range"
            min={0}
            max={100}
            step={1}
            value={volume}
            disabled={!s.music_enabled}
            aria-label="Громкость музыки"
            onChange={(e) => slide(Number(e.target.value))}
          />
        </Row>
        {note('music')}
      </Card>

      <Card title="Мотивация">
        <Row label="Фразы над кругом" hint="Короткие подбадривания во время движения.">
          <Switch
            label="Фразы над кругом"
            on={s.motivation_enabled}
            onChange={(on) => void patch('motivation', { motivation_enabled: on })}
          />
        </Row>
        {note('motivation')}
      </Card>

      <Card
        title="Часовой пояс"
        text="По нему считается «сегодня» и «вчера». Прошлые дни при смене пояса не пересчитываются."
      >
        <Row label="Ваш пояс" hint={me.user.timezone}>
          <select
            className="select"
            value={me.user.timezone}
            aria-label="Часовой пояс"
            onChange={(e) => void patchZone(e.target.value)}
          >
            {(ALL_ZONES.includes(me.user.timezone) ? ALL_ZONES : [me.user.timezone, ...ALL_ZONES]).map(
              (z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ),
            )}
          </select>
        </Row>
        {note('zone')}
      </Card>

      <Card title="Письма">
        <Row label="Напоминания о тренировках" hint="Изредка и только по делу.">
          <Switch
            label="Напоминания о тренировках"
            on={s.email_reminders}
            onChange={(on) => void patch('mail', { email_reminders: on })}
          />
        </Row>
        {note('mail')}
      </Card>

      <AppCard />

      {/* Кнопки «Вернуться к тренировке» здесь больше нет: в тренировку
          ведёт вкладка «Тренировка» в панели вкладок. */}
    </PageShell>
  )
}

/** Переключатель «да/нет». Обычная кнопка: чекбокс не даёт нужного вида. */
function Switch({
  label,
  on,
  onChange,
}: {
  label: string
  on: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`switch ${on ? 'is-on' : ''}`}
      onClick={() => onChange(!on)}
    >
      <span className="switch__dot" />
    </button>
  )
}

/* ─────────────  Карточка «Приложение на телефоне»  ───────────── */

/** Чья инструкция на экране. Компьютера среди них нет: ставят на телефон. */
type Platform = 'iphone' | 'android'

const PLATFORMS: { key: Platform; label: string }[] = [
  { key: 'iphone', label: 'iPhone' },
  { key: 'android', label: 'Android' },
]

/** Адрес сайта для копирования — рабочий, на демо GitHub Pages вместе с подпапкой. */
const SITE_URL = window.location.origin + import.meta.env.BASE_URL
/** Он же целиком, но без последней «/» — если скопировать не вышло, выделяют его. */
const SITE_URL_SHOWN = SITE_URL.replace(/\/+$/, '')
/** Он же в тексте шагов: без https:// — «ritmritm.ru». */
const SITE_NAME = (window.location.host + import.meta.env.BASE_URL).replace(/\/+$/, '')

/**
 * Как поставить «Мой ритм» на экран телефона: шаги для iPhone и Android.
 *
 * Сразу открыта инструкция для телефона, с которого зашли (DEVICE в
 * src/lib/install.ts); на компьютере — для iPhone. Переключатель ничего не
 * сохраняет: на другой день человек может прийти с другого телефона.
 *
 * Над шагами — подсказка, если здесь шаги не сработают: зашли с компьютера,
 * на айфоне не из Safari или на Android из Telegram. С ней — «Скопировать
 * адрес», чтобы открыть сайт там, где сработают.
 *
 * На Android Chrome (и Яндекс, Samsung) сам предлагает установку — тогда над
 * шагами кнопка «Установить приложение» в одно касание. Только на самом
 * Android-телефоне: на компьютере Chrome тоже присылает предложение, но
 * поставил бы приложение на компьютер, а не на телефон, о котором речь.
 */
function AppCard() {
  const [platform, setPlatform] = useState<Platform>(DEVICE === 'android' ? 'android' : 'iphone')
  const { canInstall, installed, install } = useInstallPrompt()

  if (STANDALONE) {
    return (
      <Card id={APP_ANCHOR} title="Приложение на телефоне" text="Готово: вы открыли «Мой ритм» как приложение." />
    )
  }

  const oneTap = DEVICE === 'android' && platform === 'android'

  let hint = ''
  if (DEVICE === 'computer') {
    hint = `Откройте ${SITE_NAME} на телефоне и сделайте так:`
  } else if (platform === 'iphone' && DEVICE === 'iphone' && (IOS_OTHER_BROWSER || IN_TELEGRAM)) {
    hint = 'Добавить на экран „Домой“ можно только из Safari. Скопируйте адрес и откройте его в Safari.'
  } else if (platform === 'android' && DEVICE === 'android' && IN_TELEGRAM) {
    hint = `Из Telegram не получится — откройте ${SITE_NAME} в Chrome.`
  }

  return (
    <Card
      id={APP_ANCHOR}
      title="Приложение на телефоне"
      text="Добавьте «Мой ритм» на экран телефона — он откроется как обычное приложение: на весь экран, без адресной строки, в одно касание."
    >
      <div className="app-guide">
        <div className="chips app-guide__chips" role="radiogroup" aria-label="Ваш телефон">
          {PLATFORMS.map((p) => (
            <button
              key={p.key}
              role="radio"
              aria-checked={p.key === platform}
              className={`chip ${p.key === platform ? 'is-on' : ''}`}
              onClick={() => setPlatform(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {hint && (
          <>
            <p className="app-guide__hint">{hint}</p>
            <CopyAddress />
          </>
        )}

        {oneTap && installed ? (
          <Note kind="ok">Готово: значок «Мой ритм» появится на экране телефона.</Note>
        ) : (
          <>
            {oneTap && canInstall && (
              <>
                {/* Окно браузера показывается только в касании — install()
                    зовём прямо из обработчика. */}
                <button type="button" className="btn btn--pink app-guide__install" onClick={() => void install()}>
                  Установить приложение
                </button>
                <p className="app-guide__or">Или вручную:</p>
              </>
            )}
            {platform === 'iphone' ? <IphoneSteps /> : <AndroidSteps />}
          </>
        )}
      </div>
    </Card>
  )
}

/**
 * Шаги для Safari. Сейчас «Поделиться» спрятана в меню «•••» внизу справа, в
 * старых iOS — сразу внизу экрана; называем оба пути. Рядом с названиями —
 * значки кнопок: так их легче найти на экране. Смысл несёт текст, значки
 * скрыты от экранного диктора.
 */
function IphoneSteps() {
  return (
    <ol className="app-guide__steps">
      <li>Откройте {SITE_NAME} в Safari.</li>
      <li>
        Нажмите{' '}
        <span className="app-guide__key">
          «•••»
          <More className="app-guide__icon" />
        </span>{' '}
        внизу справа, затем{' '}
        <span className="app-guide__key">
          «Поделиться»
          <Share className="app-guide__icon" />
        </span>
        . В старых версиях iOS кнопка «Поделиться» (квадрат со стрелкой вверх) — сразу внизу экрана.
      </li>
      <li>Пролистайте меню и выберите «На экран „Домой“».</li>
      <li>Оставьте включённым «Открыть как веб-приложение» и нажмите «Добавить».</li>
    </ol>
  )
}

/** Шаги для Chrome. Пункт меню у разных версий называется по-разному — даём оба. */
function AndroidSteps() {
  return (
    <ol className="app-guide__steps">
      <li>Откройте {SITE_NAME} в Chrome.</li>
      <li>Нажмите «⋮» вверху справа.</li>
      <li>Выберите «Добавить на главный экран» или «Установить приложение», затем «Установить».</li>
    </ol>
  )
}

/**
 * «Скопировать адрес» — чтобы открыть сайт в нужном браузере или на телефоне.
 * Получилось — на NOTE_MS «Адрес скопирован», как «Сохранено» у настроек.
 * Не получилось — показываем сам адрес: его можно выделить и скопировать руками.
 */
function CopyAddress() {
  const [copy, setCopy] = useState<'idle' | 'done' | 'failed'>('idle')

  useEffect(() => {
    if (copy !== 'done') return
    const timer = window.setTimeout(() => setCopy('idle'), NOTE_MS)
    return () => window.clearTimeout(timer)
  }, [copy])

  return (
    <>
      <button
        type="button"
        className="page__link app-guide__copy"
        aria-live="polite"
        onClick={() => void copyText(SITE_URL).then((ok) => setCopy(ok ? 'done' : 'failed'))}
      >
        {copy === 'done' ? 'Адрес скопирован' : 'Скопировать адрес'}
      </button>
      {copy === 'failed' && (
        <p className="app-guide__url">
          Скопировать не вышло — выделите адрес: <span className="app-guide__url-text">{SITE_URL_SHOWN}</span>
        </p>
      )}
    </>
  )
}

/**
 * Строку — в буфер обмена. Clipboard API есть не везде: без https, в старом
 * браузере или во встроенном (Telegram) его нет или он отказывает — тогда
 * старый путь: невидимое поле, выделить, execCommand('copy'). false — не
 * вышло ни так, ни так.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* отказал — пробуем по-старому */
  }
  const field = document.createElement('textarea')
  try {
    field.value = text
    // readonly — чтобы на телефоне не выезжала клавиатура; 16 px — иначе
    // айфон зумит страницу при выделении. За экраном его не видно.
    field.setAttribute('readonly', '')
    field.style.cssText = 'position:fixed;top:0;left:-9999px;font-size:16px;opacity:0'
    document.body.appendChild(field)
    field.select()
    // Айфон выделяет текст в поле только так.
    field.setSelectionRange(0, text.length)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    field.remove()
  }
}
