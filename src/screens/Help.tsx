/**
 * «Нужна помощь?» (раздел 5.4 архитектуры).
 *
 * FAQ — статика фронтенда, бэкенду он не нужен. Обращение принимает
 * POST /support/requests, и оно требует входа: почту, тариф и срок доступа
 * сервер подставляет сам, подделать их нельзя.
 *
 * Контакты приходят только в me.support, то есть тоже после входа. Поэтому
 * гостю показываем FAQ и приглашение войти, а не пустые кнопки.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { SupportTopic } from '../api/types'
import { useSession } from '../auth/SessionProvider'
import { nextParam } from '../auth/guards'
import { errorText, FormError, FormOk } from './Account'
import PageShell, { Card, Row } from './Page'
import './Account.css'
import './Help.css'

const MIN_MESSAGE = 10
const MAX_MESSAGE = 2000

const TOPICS: { code: SupportTopic; label: string }[] = [
  { code: 'payment', label: 'Оплата' },
  { code: 'access', label: 'Доступ' },
  { code: 'music', label: 'Музыка' },
  { code: 'other', label: 'Другое' },
]

const FAQ = [
  {
    q: 'Как оплатить и что будет после оплаты?',
    a: 'Выберите тариф на странице «Тарифы» — откроется оплата. После неё вернётесь к нам, и доступ появится сам, обычно за несколько секунд. Автосписаний нет: продление всегда вручную.',
  },
  {
    q: 'Оплатил, но доступа нет',
    a: 'Подождите: обычно доступ открывается сразу, но в редких случаях сверка догоняет оплату в течение часа. На странице «Проверяем оплату» есть кнопка проверки. Если через час доступа нет — напишите нам, мы найдём платёж по почте, с которой вы оплачивали.',
  },
  {
    q: 'Музыка не играет',
    a: 'Браузер не включает звук сам, пока вы ничего не нажали: нажмите на плитку трека справа вверху в плеере. Проверьте, что звук устройства не выключен, а в настройках включена «Музыка в плеере». Той же плиткой переключается трек.',
  },
  {
    q: 'Как менять упражнение реже или чаще?',
    a: 'В «Настройках», раздел «Тренировка»: 15 секунд, 30 секунд, 1 минута или 2 минуты. Настройка хранится в профиле и работает на всех ваших устройствах.',
  },
  {
    q: 'Как продлить доступ?',
    a: 'Тем же способом, что и в первый раз: «Тарифы» → выбрать тариф. Дни прибавляются к тому сроку, что уже оплачен, — платить в последний день не обязательно.',
  },
  {
    q: 'Как сменить почту или пароль?',
    a: 'В «Профиле». Для смены почты нужен текущий пароль, ссылка уйдёт на новый адрес; до перехода по ней вход остаётся по старому. Смена пароля оставляет вас в системе на этом устройстве и выкидывает остальные.',
  },
  {
    q: 'Как удалить аккаунт и что останется?',
    a: 'В «Профиле», внизу. Мы пришлём письмо со ссылкой — она работает час и один раз. Удалятся имя, настройки и вся статистика тренировок; почта освободится. Записи об оплатах останутся обезличенными: это финансовые документы.',
  },
]

export default function Help() {
  const { me } = useSession()

  return (
    <PageShell
      title="Нужна помощь?"
      lead="Сначала короткие ответы — скорее всего, ваш вопрос здесь. Если нет, напишите нам."
    >
      <Card title="Частые вопросы">
        <div className="faq">
          {FAQ.map((item) => (
            <details key={item.q} className="faq__item">
              <summary className="faq__q">{item.q}</summary>
              <p className="faq__a">{item.a}</p>
            </details>
          ))}
        </div>
      </Card>

      {me ? (
        <>
          <Card title="Написать нам" text={`Ответим на ${me.user.email}. Тариф и срок доступа подставим сами.`}>
            <SupportForm email={me.user.email} />
          </Card>

          <Card title="Другие способы">
            <Row label="Почта поддержки" hint={me.support.email}>
              <a className="page__btn" href={`mailto:${me.support.email}`}>
                Написать письмо
              </a>
            </Row>
            {me.support.telegram_url && (
              <Row label="Telegram" hint="Ответим там же, где вам удобнее.">
                <a
                  className="page__btn"
                  href={me.support.telegram_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Открыть Telegram
                </a>
              </Row>
            )}
          </Card>
        </>
      ) : (
        <Card title="Написать нам">
          <div className="page__empty">
            <p>
              Войдите, чтобы написать нам: так мы сразу увидим вашу почту и тариф и не будем
              переспрашивать.
            </p>
            <Link className="btn btn--pink-lg" to={`/login${nextParam('/help')}`}>
              Войти
            </Link>
          </div>
        </Card>
      )}
    </PageShell>
  )
}

function SupportForm({ email }: { email: string }) {
  const [topic, setTopic] = useState<SupportTopic>('other')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [bad, setBad] = useState('')
  const [ok, setOk] = useState('')

  const submit = async () => {
    const text = message.trim()
    if (text.length < MIN_MESSAGE) {
      setBad(`Расскажите чуть подробнее — хотя бы ${MIN_MESSAGE} символов`)
      return
    }
    setBusy(true)
    setBad('')
    try {
      const res = await api.supportRequest(topic, text)
      setOk(`Отправлено, ответим на ${email}. Номер обращения — ${res.id}`)
      setMessage('')
    } catch (e) {
      setBad(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  if (ok) return <FormOk>{ok}</FormOk>

  return (
    <form
      className="form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <div className="chips" role="radiogroup" aria-label="Тема обращения">
        {TOPICS.map((t) => (
          <button
            key={t.code}
            type="button"
            role="radio"
            aria-checked={t.code === topic}
            className={`chip ${t.code === topic ? 'is-on' : ''}`}
            onClick={() => setTopic(t.code)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <label className="help__label" htmlFor="support-message">
        Что случилось
      </label>
      <textarea
        id="support-message"
        className="help__text"
        value={message}
        maxLength={MAX_MESSAGE}
        rows={6}
        placeholder="Опишите, что и когда произошло: так мы разберёмся с первого письма."
        onChange={(e) => setMessage(e.target.value)}
      />
      <p className="help__counter">
        {message.trim().length} из {MAX_MESSAGE}
      </p>

      <div className="form__actions">
        <button className="form__submit" type="submit" disabled={busy}>
          {busy ? 'Отправляем…' : 'Отправить'}
        </button>
      </div>
      <FormError>{bad}</FormError>
    </form>
  )
}
