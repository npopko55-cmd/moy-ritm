/**
 * Настройки (раздел 5.2 архитектуры).
 *
 * Кнопки «Сохранить» нет: каждое изменение сразу уходит в PATCH и отвечает
 * строкой «Сохранено». Пока сервер думает, на экране уже новое значение —
 * не получилось, возвращаем прежнее и пишем почему.
 *
 * Источник истины — сервер. Интервал смены движения дублируется в
 * localStorage, но только как кэш для мгновенного старта плеера.
 */

import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import type { PatchSettingsBody } from '../api/client'
import { useSession } from '../auth/SessionProvider'
import { MOVE_INTERVALS, saveMoveInterval } from '../lib/settings'
import { ArrowRight } from '../components/Icons'
import { errorText, Waiting } from './Account'
import PageShell, { Card, Note, Row, useBack } from './Page'
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

export default function Settings() {
  const { me, setMe } = useSession()
  const back = useBack()

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
    setFailed(null)
    setMe({ ...me, settings: { ...before, ...body } })
    try {
      const next = await api.patchSettings(body)
      setMe({ ...me, settings: next })
      if (body.move_interval_seconds) saveMoveInterval(next.move_interval_seconds)
      done(key)
    } catch (e) {
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
      back={back}
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

      {back.fromPlayer && (
        <div className="page__actions">
          <button className="btn btn--pink-lg" onClick={back.go}>
            Вернуться к тренировке
            <span className="settings__arrow">
              <ArrowRight />
            </span>
          </button>
        </div>
      )}
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
