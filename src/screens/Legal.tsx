/**
 * Документы: публичная оферта (/oferta), политика обработки персональных
 * данных (/privacy), согласие на обработку персональных данных (/consent) и
 * согласие на получение рекламных сообщений (/ads-consent).
 *
 * Оболочка — как у служебных страниц (Page.tsx): волны, логотип, кнопка
 * возврата и колонка по центру. Документ — одним листом-карточкой: вводные
 * абзацы, разделы с заголовками, пункты и таблицы; внизу — реквизиты и
 * ссылки на другие документы. Тексты юристов — дословно в src/data/legal.ts:
 * номера пунктов там часть текста, страница их не считает, а только выносит
 * ведущий номер («4.4.1.») в свою колонку, чтобы текст шёл ровным краем.
 *
 * Открыты всем, без входа: на них ссылаются регистрация, строка под
 * тарифами и подвал. Пришли со страницы сайта — «← Назад» возвращает туда
 * же, и регистрация при этом не теряет введённое (черновик формы живёт в
 * памяти страницы, src/screens/Register.tsx). Открыли по прямой ссылке —
 * обычная кнопка оболочки. В мини-апе назад ведёт и кнопка Telegram.
 */

import { useLayoutEffect, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LEGAL_DOCS, LEGAL_EDITION, OPERATOR, type LegalBlock } from '../data/legal'
import LegalLinks from '../components/LegalLinks'
import PageShell, { Card } from './Page'
import './Legal.css'

/** [текст](адрес) внутри пункта. */
const LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/g

/** Домены самого сайта: ссылки на них — переход внутри сайта, а не новая вкладка. */
const OWN_HOSTS = new Set(['ritmritm.ru', 'www.ritmritm.ru'])

/**
 * Путь внутри сайта для ссылки на свой сайт, иначе null.
 *
 * «/privacy» — уже путь. «https://ritmritm.ru/tariffs» — тоже свой сайт:
 * отдаём «/tariffs». Раньше такие адреса (реквизиты «Сайт: ritmritm.ru»)
 * открывались с target="_blank", и в приложении, поставленном на экран
 * «Домой», iPhone выкидывал человека из приложения в Safari. Переход внутри
 * сайта оставляет его в приложении. Чужие домены (Telegram, GetCourse) —
 * по-прежнему в новой вкладке.
 */
function ownPath(href: string): string | null {
  if (href.startsWith('/')) return href
  try {
    const url = new URL(href)
    if ((url.protocol === 'https:' || url.protocol === 'http:') && OWN_HOSTS.has(url.hostname)) {
      return `${url.pathname}${url.search}${url.hash}` || '/'
    }
  } catch {
    /* не адрес — значит, не наш сайт */
  }
  return null
}

/** Ссылка документа: свой сайт — переходом внутри сайта, чужой — в новой вкладке. */
function DocLink({ href, children }: { href: string; children: ReactNode }) {
  const path = ownPath(href)
  return path !== null ? (
    <Link to={path}>{children}</Link>
  ) : (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  )
}

/** Пункт со ссылками: свои адреса — переходом внутри сайта, чужие — в новой вкладке. */
function withLinks(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let at = 0
  for (const match of text.matchAll(LINK_RE)) {
    const [whole, label, href] = match
    const start = match.index ?? 0
    if (start > at) out.push(text.slice(at, start))
    out.push(
      <DocLink key={start} href={href}>
        {label}
      </DocLink>,
    )
    at = start + whole.length
  }
  if (at < text.length) out.push(text.slice(at))
  return out
}

/** Ведущий номер пункта: «1.1.», «4.4.1.», «10.2.» — и остальной текст. */
const NUM_RE = /^(\d+(?:\.\d+)+\.)\s+([\s\S]*)$/

/**
 * Блок раздела. Пункт с номером — номер в своей колонке; абзац без номера
 * (реквизиты в конце оферты) — во всю ширину; таблица — с прокруткой по
 * горизонтали внутри себя, чтобы на телефоне не ехала вся страница.
 */
function Block({ block }: { block: LegalBlock }) {
  if (typeof block !== 'string') {
    const { head, rows } = block.table
    return (
      <li className="legal__table-wrap">
        <table className="legal__table">
          <thead>
            <tr>
              {head.map((cell) => (
                <th key={cell} scope="col">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.join('|')}>
                {row.map((cell, k) => (
                  <td key={k}>{withLinks(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </li>
    )
  }
  const numbered = NUM_RE.exec(block)
  if (!numbered) return <li className="legal__item legal__item--plain">{withLinks(block)}</li>
  return (
    <li className="legal__item">
      <span className="legal__num">{numbered[1]}</span>
      <span>{withLinks(numbered[2])}</span>
    </li>
  )
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
        {doc.intro.length > 0 && (
          <div className="legal__intro">
            {doc.intro.map((text, i) => (
              <p key={i}>{withLinks(text)}</p>
            ))}
          </div>
        )}
        {doc.sections.map((section) => (
          <section key={section.title} className="legal__section">
            {/* Номер раздела — в самом заголовке, как у юристов. */}
            <h2 className="legal__title">{section.title}</h2>
            {/* Номера пунктов — часть текста, поэтому список без своих номеров. */}
            <ul className="legal__items">
              {section.blocks.map((block, j) => (
                <Block key={j} block={block} />
              ))}
            </ul>
          </section>
        ))}
      </article>

      <Card title={doc.requisitesTitle ?? 'Другие документы'}>
        {/* У оферты реквизиты — её собственный раздел 11: второй раз не повторяем. */}
        {doc.requisitesTitle !== null && (
          <ul className="legal__req">
            <li>{OPERATOR.name}</li>
            <li>ИНН {OPERATOR.inn}</li>
            <li>ОГРНИП {OPERATOR.ogrnip}</li>
            <li>
              Связь: Telegram{' '}
              <DocLink href={OPERATOR.telegram}>{OPERATOR.telegramName}</DocLink>
            </li>
            <li>
              {/* Свой сайт — внутри приложения, не в Safari (ownPath выше). */}
              Сайт: <DocLink href={OPERATOR.site}>ritmritm.ru</DocLink>
              , мини-приложение в Telegram — бот {OPERATOR.bot}
            </li>
          </ul>
        )}
        <p className={`legal__docs ${doc.requisitesTitle === null ? 'legal__docs--alone' : ''}`}>
          {others.map((d, i) => (
            <span key={d.path}>
              {i > 0 && ' · '}
              <Link to={d.path}>{d.short}</Link>
            </span>
          ))}
        </p>
      </Card>

      {/* Подвал с продавцом и ценами — и здесь: Продамус проверяет оферту. */}
      <LegalLinks className="legal__foot" />
    </PageShell>
  )
}
