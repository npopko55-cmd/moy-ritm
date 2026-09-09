/**
 * Яркий блок разблокировки — единственный вход в тарифы из продукта.
 *
 * Живёт там, где человек упирается в границу бесплатного уровня: в сайдбаре
 * плеера под карточками потоков и на экране паузы. Больше на тарифы из
 * тренировки попасть неоткуда: ни регистрация, ни вход туда не уводят.
 *
 * Число движений и цена берутся из данных, а не из текста, чтобы блок не
 * начал врать, когда появятся новые ролики или изменится тариф.
 */

import { Link } from 'react-router-dom'
import { ALL_MOVES } from '../data/streams'
import { TARIFFS, rub } from '../data/tariffs'
import './Unlock.css'

/** Самый короткий тариф: от него и считается «от … в месяц». */
const FROM_PRICE = (TARIFFS.find((t) => t.code === 'month') ?? TARIFFS[0]).price

type Props = {
  /** Строкой, а не столбиком: для экрана паузы, где места по высоте мало. */
  compact?: boolean
  /** Подсветить: человек ткнул в закрытый поток и его сюда привели. */
  pulse?: boolean
}

export default function Unlock({ compact = false, pulse = false }: Props) {
  return (
    <div className={`unlock ${compact ? 'unlock--compact' : ''} ${pulse ? 'is-pulse' : ''}`}>
      <span className="unlock__text">
        <span className="unlock__title">Откройте все потоки и {ALL_MOVES.length} движений</span>
        <span className="unlock__price">от {rub(FROM_PRICE)} в месяц</span>
      </span>
      <Link className="unlock__cta" to="/tariffs">
        Открыть
      </Link>
    </div>
  )
}
