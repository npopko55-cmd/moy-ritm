/**
 * Яркий блок разблокировки — единственный вход в тарифы из продукта.
 *
 * Вида два (правки заказчика 26.09.2026):
 *
 *   • открыты не все движения (без воронки — 5 бесплатных, челлендж
 *     trial20 — 10) — плашка «Разнообразь тренировки и открой все 40
 *     движений!» и кнопка «Открыть». Без цены и без второй строки: заказчик
 *     убрал «от … в месяц», текст заголовка дал владелец. В плеере она стоит
 *     вверху, сразу под карточкой музыки, — «чтобы прям в глаза бросалась»;
 *     на паузе — под полосой дня. Показ и нажатие уходят в журнал воронок
 *     (POST /funnel/banner): по ним в админке видно, сколько людей плашку
 *     увидели и сколько нажали «Открыть»;
 *   • идёт trial3d и открыты все движения — прежний блок «Шагайте без
 *     ограничений» со строкой «Пробный доступ: ещё 2 дня, открыты все
 *     движения»: обещать «все 40» тут нечего, они и так открыты. Он остался
 *     на прежнем месте — в правой колонке плеера (на телефоне — последним в
 *     ленте статистики) и на паузе — и не изменился.
 *
 * Оплатившим блок не показывают: его не ставят ни плеер, ни пауза.
 *
 * Кнопка ведёт на тарифы сайта. В Telegram Mini App платить нельзя (правила
 * Telegram): там она открывает тарифы сайта во внешнем браузере.
 */

import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import type { BannerPlace } from '../api/types'
import { useSession } from '../auth/SessionProvider'
import { plural } from '../lib/date'
import { reportBannerClick, reportBannerShown } from '../lib/funnel'
import { loadTariffs } from '../lib/tariffs'
import { openTariffsOnSite, useInTelegram } from '../lib/telegram'
import { CATALOG_MOVES_TEXT, trialHint, trialOpensAll, useTrialState } from '../lib/trial'
import './Unlock.css'

/**
 * Тарифы — заранее, один раз за жизнь страницы, как раньше их грузила цена
 * «от … в месяц»: «Открыть» ведёт на страницу тарифов, и она откроется уже
 * с ними. Не вышло — не повторяем на каждом экране паузы. В мини-апе тарифы
 * открываются во внешнем браузере — грузить их здесь незачем.
 */
let tariffsWarmed = false

function warmTariffs(): void {
  if (tariffsWarmed) return
  tariffsWarmed = true
  loadTariffs().catch(() => undefined)
}

/**
 * Заголовок плашки — дословно текст владельца. Число — обещание
 * (CATALOG_MOVES_TEXT = 40), а не длина каталога: «Разнообразь тренировки и
 * открой все 40 движений!».
 */
export const UNLOCK_TITLE = `Разнообразь тренировки и открой все ${plural(
  CATALOG_MOVES_TEXT,
  'движение',
  'движения',
  'движений',
)}!`

type Props = {
  /**
   * Где стоит блок: в плеере или на экране паузы. На паузе прежний блок
   * trial3d идёт строкой (там мало места по высоте), а метрика плашки
   * помечает, где её увидели.
   */
  place: BannerPlace
}

export default function Unlock({ place }: Props) {
  const { access } = useSession()
  const { trial } = useTrialState()
  const inTelegram = useInTelegram()

  useEffect(() => {
    if (!inTelegram) warmTariffs()
  }, [inTelegram])

  return trialOpensAll(trial, access) ? (
    <TrialUnlock compact={place === 'pause'} hint={trialHint(trial, access)} />
  ) : (
    <UnlockBanner place={place} />
  )
}

/**
 * Плашка «Разнообразь тренировки и открой все 40 движений!».
 *
 * Показ засчитывается, когда плашка на экране и пробный период известен:
 * без него это мог оказаться trial3d, у которого через миг встанет прежний
 * блок. Дальше — раз в сутки (reportBannerShown в src/lib/funnel.ts).
 */
function UnlockBanner({ place }: { place: BannerPlace }) {
  const { me } = useSession()
  const { known } = useTrialState()
  const inTelegram = useInTelegram()
  const userId = me?.user.id

  useEffect(() => {
    if (known) reportBannerShown(place, userId)
  }, [known, place, userId])

  return (
    <div className={`unlock-banner unlock-banner--${place}`}>
      <p className="unlock-banner__title">{UNLOCK_TITLE}</p>
      {inTelegram ? (
        <button
          className="unlock-banner__cta"
          type="button"
          onClick={() => {
            // Метрика — первой и без ожидания: переход её не ждёт.
            reportBannerClick(place)
            openTariffsOnSite()
          }}
        >
          Открыть
        </button>
      ) : (
        <Link className="unlock-banner__cta" to="/tariffs" onClick={() => reportBannerClick(place)}>
          Открыть
        </Link>
      )}
    </div>
  )
}

/**
 * trial3d, открыто всё: «Шагайте без ограничений» и строка о пробном
 * периоде. Цены здесь не было и нет — её место занимает эта строка.
 */
function TrialUnlock({ compact, hint }: { compact: boolean; hint: string | null }) {
  const inTelegram = useInTelegram()
  return (
    <div className={`unlock ${compact ? 'unlock--compact' : ''}`}>
      <span className="unlock__text">
        <span className="unlock__title">Шагайте без ограничений</span>
        {hint && <span className="unlock__price">{hint}</span>}
      </span>
      {inTelegram ? (
        <button className="unlock__cta" type="button" onClick={openTariffsOnSite}>
          Оформить на сайте
        </button>
      ) : (
        <Link className="unlock__cta" to="/tariffs">
          Открыть
        </Link>
      )}
    </div>
  )
}
