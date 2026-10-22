/**
 * Тихая строка ссылок на документы: «Оферта · Политика обработки данных ·
 * Согласие на обработку данных · Согласие на рекламу».
 *
 * Стоит внизу главной, помощи и тарифов. Мелко и серым: это подвал, а не
 * призыв, но найти документы должно быть легко с любой открытой страницы.
 * С 22.10.2026 здесь все четыре документа юристов: оба согласия тоже должны
 * быть доступны до регистрации, а не только по ссылке из её галочек.
 *
 * Адреса — прямо здесь, а не из src/data/legal.ts: тот файл с текстами
 * (~120 КБ) должен грузиться только вместе с экраном документа.
 */

import { Link } from 'react-router-dom'
import './LegalLinks.css'

export default function LegalLinks({ className = '' }: { className?: string }) {
  return (
    <nav className={`legal-links ${className}`} aria-label="Документы">
      <Link to="/oferta">Оферта</Link>
      <span aria-hidden="true">·</span>
      <Link to="/privacy">Политика обработки данных</Link>
      <span aria-hidden="true">·</span>
      <Link to="/consent">Согласие на обработку данных</Link>
      <span aria-hidden="true">·</span>
      <Link to="/ads-consent">Согласие на рекламу</Link>
    </nav>
  )
}
