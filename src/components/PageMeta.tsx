/**
 * Заголовок вкладки, описание и канонический адрес открытых страниц.
 *
 * index.html у сайта один на все адреса (nginx отдаёт его на любой путь), и
 * в нём заголовок и описание главной. Поисковик, который выполняет код
 * (Google, частично Яндекс), видит у /tariffs, /help и документов свои
 * заголовок и описание — их ставит этот компонент при каждой смене адреса.
 *
 * <link rel="canonical"> в index.html нет намеренно: там он указывал бы на
 * главную и у /tariffs, и у /help — поисковик склеил бы их с главной. Здесь
 * он ставится только у открытых страниц (те же, что в public/sitemap.xml и
 * Allow в public/robots.txt), всегда без ?параметров и / в конце; у
 * служебных страниц (вход, плеер, кабинет) его нет вовсе.
 *
 * Тексты документов — короткие, свои: импорт src/data/legal.ts утянул бы
 * тексты юристов (~72 КБ) в основной бандл.
 */

import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const SITE = 'https://ritmritm.ru'

/** Как в index.html: главная и все служебные страницы. */
const HOME_TITLE = 'Мой ритм — поток движений под музыку'
const HOME_DESCRIPTION =
  'Короткие тренировки под музыку: включайте поток и двигайтесь в ритме. В любое время, в любом месте.'

type Meta = { title: string; description: string }

const PAGES: Record<string, Meta> = {
  '/': { title: HOME_TITLE, description: HOME_DESCRIPTION },
  '/tariffs': {
    title: 'Тарифы — Мой ритм',
    description:
      'Тарифы «Моего ритма»: все движения и всё новое сразу ваши. Выберите срок доступа к тренировкам под музыку.',
  },
  '/help': {
    title: 'Помощь — Мой ритм',
    description:
      'Ответы на частые вопросы о «Моём ритме»: оплата и доступ, музыка в тренировке, смена почты и пароля, удаление аккаунта. Поддержка в Telegram.',
  },
  '/oferta': {
    title: 'Публичная оферта — Мой ритм',
    description: 'Договор об обучении в проекте «Мой ритм»: тарифы, доступ, возврат.',
  },
  '/privacy': {
    title: 'Политика обработки персональных данных — Мой ритм',
    description: 'Как проект «Мой ритм» обрабатывает и защищает персональные данные.',
  },
  '/consent': {
    title: 'Согласие на обработку персональных данных — Мой ритм',
    description: 'Согласие на обработку персональных данных, которое дают при регистрации в «Моём ритме».',
  },
  '/ads-consent': {
    title: 'Согласие на рекламные сообщения — Мой ритм',
    description: 'Необязательное согласие на получение рекламных сообщений от проекта «Мой ритм».',
  },
}

function setDescription(text: string) {
  let meta = document.head.querySelector<HTMLMetaElement>('meta[name="description"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'description'
    document.head.appendChild(meta)
  }
  meta.content = text
}

function setCanonical(href: string | null) {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (href === null) {
    link?.remove()
    return
  }
  if (!link) {
    link = document.createElement('link')
    link.rel = 'canonical'
    document.head.appendChild(link)
  }
  link.href = href
}

export default function PageMeta() {
  const { pathname } = useLocation()

  useEffect(() => {
    // «/help/» и «/help» — одна страница, как и в Legal.tsx.
    const path = pathname.replace(/\/+$/, '') || '/'
    const page = PAGES[path]
    document.title = page?.title ?? HOME_TITLE
    setDescription(page?.description ?? HOME_DESCRIPTION)
    setCanonical(page ? SITE + (path === '/' ? '/' : path) : null)
  }, [pathname])

  return null
}
