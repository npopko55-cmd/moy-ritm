/**
 * Яркий блок разблокировки — единственный вход в тарифы из продукта.
 *
 * Живёт там, где человек упирается в границу бесплатного уровня: в правой
 * колонке плеера и на экране паузы. Больше на тарифы из тренировки попасть
 * неоткуда: ни регистрация, ни вход туда не уводят.
 *
 * Число движений и цена берутся из данных, а не из текста, чтобы блок не
 * начал врать, когда появятся новые ролики или изменится тариф. Цена — самая
 * низкая цена месяца из тарифов сервера; локальные тарифы — запасной вариант.
 */

import { Link } from 'react-router-dom'
import { ALL_MOVES } from '../data/streams'
import { TARIFFS, rub } from '../data/tariffs'
import { useFromPrice } from '../lib/tariffs'
import './Unlock.css'

/** Пока тарифы сервера не пришли: самая низкая цена месяца из локальных. */
const FALLBACK_PRICE = Math.min(...TARIFFS.map((t) => t.per_month))

type Props = {
  /** Строкой, а не столбиком: для экрана паузы, где места по высоте мало. */
  compact?: boolean
}

export default function Unlock({ compact = false }: Props) {
  const fromPrice = useFromPrice(FALLBACK_PRICE)
  return (
    <div className={`unlock ${compact ? 'unlock--compact' : ''}`}>
      <span className="unlock__text">
        <span className="unlock__title">Откройте все {ALL_MOVES.length} движений</span>
        <span className="unlock__price">от {rub(fromPrice)} в месяц</span>
      </span>
      <Link className="unlock__cta" to="/tariffs">
        Открыть
      </Link>
    </div>
  )
}
