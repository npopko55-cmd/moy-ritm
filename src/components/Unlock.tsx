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
 *
 * Третий вид — у гостя в плеере (GuestUnlock ниже, макет Димы 14.10.2026):
 * «Открой весь функционал Ритма!» и «Попробовать 3 дня бесплатно →». Он тоже
 * ведёт на тарифы, но там первой карточкой у гостя стоит «3 дня бесплатно»
 * (TariffPlans), и метрики плашки у него нет.
 */

import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import type { BannerPlace } from '../api/types'
import { useSession } from '../auth/SessionProvider'
import { plural } from '../lib/date'
import { reportBannerClick, reportBannerShown } from '../lib/funnel'
import { loadTariffs, RENEW_TITLE } from '../lib/tariffs'
import { openTariffsOnSite, useInTelegram } from '../lib/telegram'
import { CATALOG_MOVES_TEXT, trialHint, trialOpensAll, useTrialState } from '../lib/trial'
import { Lock } from './Icons'
import './Unlock.css'
import { CARD_TRIAL_TEXT, useCardTrialOnly } from '../lib/cardTrial'

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
  /**
   * Поток без шагов («Размять спину»): «Шагайте без ограничений» там не к
   * месту (тестирование 28.10.2026) — тот же блок зовёт «Заниматься».
   */
  noSteps?: boolean
}

export default function Unlock({ place, noSteps = false }: Props) {
  const { access } = useSession()
  const { trial } = useTrialState()
  const inTelegram = useInTelegram()

  useEffect(() => {
    if (!inTelegram) warmTariffs()
  }, [inTelegram])

  return trialOpensAll(trial, access) ? (
    <TrialUnlock
      compact={place === 'pause'}
      hint={trialHint(trial, access)}
      title={noSteps ? 'Занимайтесь без ограничений' : 'Шагайте без ограничений'}
    />
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
 * trial3d, открыто всё: «Шагайте без ограничений» («Занимайтесь…» в потоке
 * без шагов) и строка о пробном
 * периоде. Цены здесь не было и нет — её место занимает эта строка.
 */
function TrialUnlock({
  compact,
  hint,
  title,
}: {
  compact: boolean
  hint: string | null
  title: string
}) {
  const inTelegram = useInTelegram()
  return (
    <div className={`unlock ${compact ? 'unlock--compact' : ''}`}>
      <span className="unlock__text">
        <span className="unlock__title">{title}</span>
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

/**
 * Доступ кончается (expiring) или уже кончился и идёт grace — плашка
 * «Продлить» (правка тестировщицы 04.11.2026). Раньше это была тихая
 * оранжевая строка в левой колонке плеера; теперь она того же вида, что
 * блок trial3d выше (TrialUnlock): заголовок, строка-пояснение и кнопка, и
 * стоит на его месте — под «Управлением» в правой колонке, на телефоне —
 * сразу под кругом (Player.css, .player--notice). С блоком trial3d они не
 * встречаются: тот — при «доступа нет», эта — при оплаченном доступе.
 *
 * Заголовок — RENEW_TITLE (им же встречают продление на тарифах), строка —
 * прежний текст плашки («Доступ заканчивается через 2 дня»), кнопка —
 * прежняя «Продлить». Ведёт на тарифы, как и раньше, в том числе в мини-апе:
 * там тарифы сами отправляют платить на сайт.
 */
export function RenewUnlock({ hint }: { hint: string }) {
  const inTelegram = useInTelegram()

  useEffect(() => {
    if (!inTelegram) warmTariffs()
  }, [inTelegram])

  return (
    <div className="unlock unlock--renew">
      <span className="unlock__text">
        <span className="unlock__title">{RENEW_TITLE}</span>
        <span className="unlock__price">{hint}</span>
      </span>
      <Link className="unlock__cta" to="/tariffs">
        Продлить
      </Link>
    </div>
  )
}

/**
 * Подписка Продамуса, а очередное автосписание не прошло (past_due): вместо
 * «Продлить» — короткое предупреждение того же вида и ссылка на /subscription,
 * где видно состояние и есть отмена. Разовое «Продлить» подписчику не
 * предлагаем: Продамус сам попробует списать ещё раз. Тексты — через na-pero
 * (12.11.2026), на вычитку.
 */
export function SubscriptionFailedUnlock() {
  return (
    <div className="unlock unlock--renew">
      <span className="unlock__text">
        <span className="unlock__title">Оплата не прошла</span>
        <span className="unlock__price">Попробуем списать ещё раз. Проверьте карту</span>
      </span>
      <Link className="unlock__cta" to="/subscription">
        К подписке
      </Link>
    </div>
  )
}

/**
 * Гость в плеере — всё время, пока он тренируется (Дима, 14.10.2026, по его
 * макету): замок, «Открой весь функционал Ритма!», строка о том, что даст
 * регистрация, кнопка «Попробовать 3 дня бесплатно →» и под ней мелко «Без
 * привязки карты» (Никита 29.10: «без автосписаний» убрать). Остальные
 * тексты Димины, дословно.
 *
 * Кнопка ведёт туда же, куда «Попробовать» в окне гостя: на тарифы, где
 * первой стоит карточка «3 дня бесплатно» (владелец, 21.10.2026; раньше —
 * сразу на регистрацию). Переход делает плеер (onCta) — токен воронки у
 * него, и запомнить его до регистрации должен он. Метрики
 * здесь нет: показ и нажатие плашки (POST /funnel/banner) пишутся только у
 * вошедших, а prompt_cta бэкенд принимает лишь от окна, с kind full/short.
 */
export function GuestUnlock({ onCta }: { onCta(): void }) {
  // «3 дня за 1 ₽» вместо бесплатных дней — только когда сервер так говорит (src/lib/cardTrial.ts).
  const card = useCardTrialOnly()
  return (
    <div className="unlock-guest">
      <div className="unlock-guest__head">
        <span className="unlock-guest__lock">
          <Lock size={22} />
        </span>
        <span className="unlock-guest__text">
          <span className="unlock-guest__title">Открой весь функционал Ритма!</span>
          <span className="unlock-guest__sub">Все потоки, все движения и сохранение прогресса</span>
        </span>
      </div>
      <div className="unlock-guest__action">
        <button className="unlock-guest__cta" type="button" onClick={onCta}>
          {card ? CARD_TRIAL_TEXT.unlockCta : 'Попробовать 3 дня бесплатно →'}
        </button>
        <span className="unlock-guest__fine">{card ? CARD_TRIAL_TEXT.unlockNote : 'Без привязки карты'}</span>
      </div>
    </div>
  )
}
