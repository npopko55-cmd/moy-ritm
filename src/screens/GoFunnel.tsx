/**
 * Вход по ссылке воронки: /go/<токен>.
 *
 * Ссылка приходит из Telegram (канал → бот). Сообщаем бэкенду о визите
 * (POST /funnel/visit с анонимным id посетителя), и если такая воронка есть —
 * запоминаем токен до регистрации: его отправит сама регистрация
 * (SessionProvider.signUp). Какая это воронка, фронтенд не решает.
 *
 *   • воронка есть, не вошёл → регистрация;
 *   • воронка есть, вошёл → главная (метку ставит только регистрация);
 *   • сервер ответил 404 FUNNEL_NOT_FOUND → главная;
 *   • сбой визита (сеть, таймаут, 429, 5xx) — как «воронка есть»: токен
 *     запоминаем, при регистрации его проверит сам сервер. Иначе моргнувшая
 *     сеть стоила бы метки, а человек зарегистрировался бы без воронки.
 *
 * Пока идёт запрос — пустой фон, без «Секунду…»: обычно это доли секунды.
 * Экран в основном бандле, а не отдельным куском: это первая страница
 * пришедшего из Telegram, и лишний запрос за кодом ей ни к чему.
 *
 * Хвост #tgWebAppData… мини-апа здесь не теряется: его ещё при загрузке
 * страницы прочитал src/lib/telegram.ts.
 */

import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useSession } from '../auth/SessionProvider'
import { forgetFunnelToken, isFunnelToken, saveFunnelToken, visitFunnel } from '../lib/funnel'
import { OFFLINE_WAITING, Waiting } from './Account'

export default function GoFunnel() {
  const { token = '' } = useParams()
  const { me, loading, offline } = useSession()
  const [found, setFound] = useState<boolean | null>(null)

  useEffect(() => {
    let alive = true
    void visitFunnel(token).then((result) => {
      // Сбой — не «ссылки нет»: токен правильного вида ведём дальше.
      if (alive) setFound(result === 'ok' || (result === 'error' && isFunnelToken(token)))
    })
    return () => {
      alive = false
    }
  }, [token])

  // Токен нужен только будущей регистрации. Уже вошёл — не храним: иначе он
  // пролежал бы в браузере и приклеился к чужой регистрации потом.
  useEffect(() => {
    if (!found || loading) return
    if (me) forgetFunnelToken()
    else saveFunnelToken(token)
  }, [found, loading, me, token])

  if (found === null) return null
  if (!found) return <Navigate to="/" replace />
  // Воронка есть — ждём ответа «вошёл ли» (в мини-апе это ещё и попытка
  // входа по Telegram: её сбой — просто «не вошёл»). «Нет связи» — только
  // когда не отвечают refresh или /me, как в защите маршрутов.
  if (loading) return offline ? <Waiting text={OFFLINE_WAITING} /> : null
  return <Navigate to={me ? '/' : '/register'} replace />
}
