/**
 * Яркий блок разблокировки — единственный вход в тарифы из продукта.
 *
 * Живёт там, где человек упирается в границу бесплатного уровня: в правой
 * колонке плеера и на экране паузы. Больше на тарифы из тренировки попасть
 * неоткуда: ни регистрация, ни вход туда не уводят.
 *
 * Число движений и цена берутся из данных, а не из текста, чтобы блок не
 * начал врать, когда появятся новые ролики или изменится тариф. Цена —
 * стоимость самого короткого тарифа (месяц) из тарифов сервера, пока они не
 * пришли — локального месячного тарифа.
 *
 * Идёт пробный период воронки — вместо цены строка о нём: «Пробный доступ:
 * ещё 2 дня, открыты все движения» (trial3d) или «Челлендж: 10 движений
 * бесплатно. Все 40 — в полном доступе» (trial20). У trial3d все движения и
 * так открыты, поэтому и заголовок другой — «Шагайте без ограничений»: после
 * трёх дней их закроет срок. У челленджа заголовок «Откройте все движения»
 * без числа: число — в строке под ним.
 * В Telegram Mini App платить нельзя: кнопка «Оформить на сайте»
 * открывает тарифы сайта во внешнем браузере.
 */

import { Link } from 'react-router-dom'
import { useSession } from '../auth/SessionProvider'
import { TARIFFS, rub } from '../data/tariffs'
import { plural } from '../lib/date'
import { useFromPrice } from '../lib/tariffs'
import { openTariffsOnSite, useInTelegram } from '../lib/telegram'
import { CATALOG_MOVES_TEXT, trialHint, trialOpensAll, useTrial } from '../lib/trial'
import './Unlock.css'

/**
 * Самый короткий тариф: от него и считается «от … в месяц». Скидочную цену
 * месяца внутри длинного пакета здесь не показываем — это принятое решение.
 * Пока тарифы сервера не пришли — локальный месячный.
 */
const FALLBACK_PRICE = (TARIFFS.find((t) => t.code === 'month') ?? TARIFFS[0]).price

type Props = {
  /** Строкой, а не столбиком: для экрана паузы, где места по высоте мало. */
  compact?: boolean
}

export default function Unlock({ compact = false }: Props) {
  const fromPrice = useFromPrice(FALLBACK_PRICE)
  const { access } = useSession()
  const trial = useTrial()
  const hint = trialHint(trial, access)
  const inTelegram = useInTelegram()
  return (
    <div className={`unlock ${compact ? 'unlock--compact' : ''}`}>
      <span className="unlock__text">
        {/* Число — обещание владельца (CATALOG_MOVES_TEXT = 40), а не длина каталога. */}
        <span className="unlock__title">
          {trialOpensAll(trial, access)
            ? 'Шагайте без ограничений'
            : hint
              ? 'Откройте все движения'
              : `Откройте все ${plural(CATALOG_MOVES_TEXT, 'движение', 'движения', 'движений')}`}
        </span>
        <span className="unlock__price">{hint ?? `от ${rub(fromPrice)} в месяц`}</span>
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
