/**
 * Мягкое окно гостя — первое предложение зарегистрироваться (с 12.11.2026).
 *
 * Встаёт на минуте движения (GUEST_FIRST_PROMPT_SECONDS в src/lib/guest.ts),
 * раньше полного окна, которое было на 1:30 и ставило тренировку на паузу:
 * большинство гостей до него не доходило. Это окно тренировку не трогает —
 * ролик, таймер и музыка идут дальше, фокус оно не забирает и прокрутку не
 * запрещает. Карточка внизу экрана над панелью вкладок; крестик убирает её,
 * кнопка ведёт на регистрацию (что делать — решает плеер).
 *
 * Обещание трёх дней — только гостю воронки trial3d: их даёт регистрация с
 * её токеном. Остальным — только про сохранение минут: они и правда
 * переходят в аккаунт после регистрации в этом браузере (finishGuest).
 */

import { useEffect, useId } from 'react'
import { prefetchImages } from '../lib/prefetch'
import { GUEST_PROMPT_HEROINE } from './GuestPrompt'
import { Close } from './Icons'
import './GuestNudge.css'
import { CARD_TRIAL_TEXT, useCardTrialOnly } from '../lib/cardTrial'

type Props = {
  /** Ссылка гостя даёт 3 дня пробного (воронка trial3d). */
  trial3d: boolean
  /** Крестик — окно уходит, тренировка как шла, так и идёт. */
  onClose(): void
  /** Кнопка — на регистрацию. */
  onCta(): void
}

export default function GuestNudge({ trial3d, onClose, onCta }: Props) {
  const titleId = useId()
  // Следом через 1:30 придёт короткое окно (GuestPrompt) — его героиню качаем заранее.
  useEffect(() => prefetchImages([GUEST_PROMPT_HEROINE]), [])
  // «3 дня за 1 ₽» вместо бесплатных дней — только когда сервер так говорит (src/lib/cardTrial.ts).
  const card = useCardTrialOnly()
  return (
    <aside className="gn" role="dialog" aria-modal="false" aria-labelledby={titleId}>
      <div className="gn__text">
        {/* ТЕКСТ: на вычитку */}
        <p id={titleId} className="gn__title">
          Сохраним твои минуты и шаги
        </p>
        {/* ТЕКСТ: на вычитку */}
        <p className="gn__lead">
          {card
            ? CARD_TRIAL_TEXT.nudgeLead
            : trial3d
            ? 'После регистрации перенесём их в аккаунт и откроем все движения на 3 дня бесплатно, без привязки карты.'
            : 'После регистрации перенесём их в аккаунт, а ты вернёшься в тренировку.'}
        </p>
      </div>
      {/* ТЕКСТ: на вычитку */}
      <button type="button" className="btn btn--pink-lg gn__cta" onClick={onCta}>
        {card ? CARD_TRIAL_TEXT.nudgeCta : trial3d ? 'Получить 3 дня бесплатно' : 'Сохранить прогресс'}
      </button>
      {/* ТЕКСТ: на вычитку (подпись для экранных читалок) */}
      <button
        type="button"
        className="gn__close"
        onClick={onClose}
        aria-label="Закрыть окно, тренировка и музыка идут дальше"
      >
        <Close size={18} />
      </button>
    </aside>
  )
}
