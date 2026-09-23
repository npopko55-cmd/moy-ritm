/**
 * Тихая строка ссылок на документы: «Оферта · Политика конфиденциальности».
 *
 * Стоит внизу главной, помощи и тарифов. Мелко и серым: это подвал, а не
 * призыв, но найти документы должно быть легко с любой открытой страницы.
 * Согласие на обработку данных отдельной ссылкой здесь не нужно: на него
 * ведёт галочка в регистрации, а сам документ связан с политикой.
 */

import { Link } from 'react-router-dom'
import './LegalLinks.css'

export default function LegalLinks({ className = '' }: { className?: string }) {
  return (
    <nav className={`legal-links ${className}`} aria-label="Документы">
      <Link to="/oferta">Оферта</Link>
      <span aria-hidden="true">·</span>
      <Link to="/privacy">Политика конфиденциальности</Link>
    </nav>
  )
}
