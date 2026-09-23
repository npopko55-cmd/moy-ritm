/**
 * Документы: публичная оферта (/oferta), политика конфиденциальности
 * (/privacy) и согласие на обработку персональных данных (/consent).
 *
 * Оболочка — как у служебных страниц (Page.tsx): волны, логотип, кнопка
 * возврата и колонка по центру. Документ — одним листом-карточкой: разделы с
 * заголовками и нумерованными пунктами; внизу — реквизиты и ссылки на два
 * других документа. Тексты — в src/data/legal.ts.
 *
 * Открыты всем, без входа: на них ссылаются регистрация, строка под
 * тарифами и подвал. Пришли со страницы сайта — «← Назад» возвращает туда
 * же, и регистрация при этом не теряет введённое (черновик формы живёт в
 * памяти страницы, src/screens/Register.tsx). Открыли по прямой ссылке —
 * обычная кнопка оболочки. В мини-апе назад ведёт и кнопка Telegram.
 */

import { useLayoutEffect, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LEGAL_DOCS, LEGAL_EDITION, OPERATOR } from '../data/legal'
import PageShell, { Card } from './Page'
import './Legal.css'

/** [текст](адрес) внутри пункта. */
const LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/g

/** Пункт со ссылками: свои адреса — переходом внутри сайта, чужие — в новой вкладке. */
function withLinks(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let at = 0
  for (const match of text.matchAll(LINK_RE)) {
    const [whole, label, href] = match
    const start = match.index ?? 0
    if (start > at) out.push(text.slice(at, start))
    out.push(
      href.startsWith('/') ? (
        <Link key={start} to={href}>
          {label}
        </Link>
      ) : (
        <a key={start} href={href} target="_blank" rel="noopener noreferrer">
          {label}
        </a>
      ),
    )
    at = start + whole.length
  }
  if (at < text.length) out.push(text.slice(at))
  return out
}

export default function Legal() {
  const { pathname, key } = useLocation()
  const navigate = useNavigate()
  const path = pathname.replace(/\/+$/, '')
  const doc = LEGAL_DOCS.find((d) => d.path === path) ?? LEGAL_DOCS[0]
  const others = LEGAL_DOCS.filter((d) => d !== doc)

  // Документ открывают и со страницы, прокрученной вниз (галочка согласия в
  // регистрации), — читать его нужно с начала.
  useLayoutEffect(() => {
    window.scrollTo(0, 0)
  }, [path])

  // Пришли со страницы сайта — назад туда же; по прямой ссылке истории нет
  // (ключ 'default') — тогда возврат оболочки: на главную.
  const back = key === 'default' ? undefined : { label: '← Назад', go: () => navigate(-1) }

  return (
    <PageShell
      title={doc.title}
      lead={
        <>
          {doc.lead}
          <br />
          Редакция от {LEGAL_EDITION}
        </>
      }
      back={back}
    >
      <article className="page__card legal">
        {doc.sections.map((section, i) => (
          <section key={section.title} className="legal__section">
            <h2 className="legal__title">
              {i + 1}. {section.title}
            </h2>
            <ol className="legal__items">
              {section.items.map((item, j) => (
                <li key={j} className="legal__item">
                  <span className="legal__num">
                    {i + 1}.{j + 1}.
                  </span>
                  <span>{withLinks(item)}</span>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </article>

      <Card title={doc.requisitesTitle}>
        <ul className="legal__req">
          <li>{OPERATOR.name}</li>
          <li>ИНН {OPERATOR.inn}</li>
          <li>ОГРНИП {OPERATOR.ogrnip}</li>
          <li>
            Связь: Telegram{' '}
            <a href={OPERATOR.telegram} target="_blank" rel="noopener noreferrer">
              {OPERATOR.telegramName}
            </a>
          </li>
          <li>
            Сайт:{' '}
            <a href={OPERATOR.site} target="_blank" rel="noopener noreferrer">
              ritmritm.ru
            </a>
            , мини-приложение в Telegram — бот {OPERATOR.bot}
          </li>
        </ul>
        <p className="legal__docs">
          {others.map((d, i) => (
            <span key={d.path}>
              {i > 0 && ' · '}
              <Link to={d.path}>{d.title}</Link>
            </span>
          ))}
        </p>
      </Card>
    </PageShell>
  )
}
