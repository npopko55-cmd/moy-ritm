/**
 * Вход по ссылке воронки: /go/<токен>.
 *
 * Ссылка приходит из Telegram (канал → бот). Визит сообщаем бэкенду
 * (POST /funnel/visit с анонимным id посетителя), а токен запоминаем до
 * регистрации: его отправит сама регистрация (SessionProvider.signUp). Какая
 * это воронка, фронтенд не решает.
 *
 * Визит человека не задерживает. Раньше экран ждал ответа /funnel/visit, и на
 * медленной сети или через VPN человек смотрел на пустой экран по несколько
 * секунд — а то и уходил. Теперь:
 *   • токен правильного вида сразу запоминаем, визит уходит в фоне;
 *   • не вошёл → регистрация, вошёл → главная (метку ставит только
 *     регистрация, вошедшему токен не храним);
 *   • сервер потом ответил 404 FUNNEL_NOT_FOUND — токен забываем: такой
 *     ссылки нет, регистрация его всё равно не поставила бы. Сбой визита
 *     токен не трогает — при регистрации его проверит сам сервер;
 *   • токен неправильного вида — на главную.
 *
 * Ждём только ответа «вошёл ли» (в мини-апе это ещё и попытка входа по
 * Telegram). Обычно это доли секунды, поэтому первую секунду — пустой фон,
 * дальше — «Секунду…»; «Нет связи» — когда не отвечают refresh или /me, как
 * в защите маршрутов. Экран в основном бандле, а не отдельным куском: это
 * первая страница пришедшего из Telegram, и лишний запрос за кодом ей ни к чему.
 *
 * Хвост #tgWebAppData… мини-апа здесь не теряется: его ещё при загрузке
 * страницы прочитал src/lib/telegram.ts.
 */

import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useSession } from '../auth/SessionProvider'
import {
  forgetFunnelToken,
  isFunnelToken,
  readFunnelToken,
  saveFunnelToken,
  visitFunnel,
} from '../lib/funnel'
import { OFFLINE_WAITING, Waiting } from './Account'

/** Столько ждём молча, прежде чем показать «Секунду…». */
const QUIET_MS = 1000

export default function GoFunnel() {
  const { token = '' } = useParams()
  const { me, loading, offline } = useSession()
  const valid = isFunnelToken(token)
  const [slow, setSlow] = useState(false)

  // Токен — сразу, визит — в фоне: переход их не ждёт.
  useEffect(() => {
    if (!valid) return
    if (!me) saveFunnelToken(token)
    void visitFunnel(token).then((result) => {
      // Такой ссылки нет — и метки не будет. Токен за это время мог смениться
      // другой ссылкой: забываем только свой.
      if (result === 'not_found' && readFunnelToken() === token) forgetFunnelToken()
    })
    // Один раз на токен: вход, случившийся позже, разбирает эффект ниже.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, valid])

  // Токен нужен только будущей регистрации. Уже вошёл — не храним: иначе он
  // пролежал бы в браузере и приклеился к чужой регистрации потом.
  useEffect(() => {
    if (valid && !loading && me) forgetFunnelToken()
  }, [valid, loading, me])

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), QUIET_MS)
    return () => window.clearTimeout(timer)
  }, [])

  if (!valid) return <Navigate to="/" replace />
  // Ждём ответа «вошёл ли». «Нет связи» — только когда не отвечают refresh
  // или /me, как в защите маршрутов.
  if (loading) {
    if (offline) return <Waiting text={OFFLINE_WAITING} />
    return slow ? <Waiting /> : null
  }
  return <Navigate to={me ? '/' : '/register'} replace />
}
