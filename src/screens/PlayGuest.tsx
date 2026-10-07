/**
 * Гостевой вход: /play/<токен>_<метка> — без регистрации (src/lib/guest.ts).
 * Ссылка для блога Димы: /play/hx4q7m2p_dima-blog.
 *
 * Правка Димы 06.10.2026: «точно нужна главная — там хоть какое-то
 * объяснение о сервисе; после нажатия на кнопку просто включается отсчёт и
 * сразу тренировка». Поэтому экранов у гостя три, и все под этим же токеном:
 *
 *   • /play/<токен>        — главная (Landing) в гостевом режиме: «Включить
 *     эфир» ведёт не на вход, а в отсчёт гостя;
 *   • /play/<токен>/start  — отсчёт, тот же, что у вошедшего;
 *   • /play/<токен>/live   — плеер гостя. После отсчёта тренировка идёт сама
 *     (startState), открытый иначе — на паузе, как и раньше.
 *
 * Главная остаётся по своему адресу, без переходов на /: токен с меткой
 * когорты живёт в адресе, перезагрузка его не теряет, а перенаправлять
 * некуда — значит, и закольцеваться нечему.
 *
 * Как /go (GoFunnel.tsx): визит уходит в фоне (с meta.guest), токен
 * воронки запоминаем до регистрации — её предложит окно посреди тренировки,
 * и человек получит метку воронки, как пришедший по /go. Это делает любой из
 * трёх экранов: на отсчёт гостя ведёт и кнопка с / («Сначала гость»,
 * GUEST_FIRST_ENABLED), минуя гостевую главную.
 *
 *   • уже вошёл → обычный плеер (метку ставит только регистрация, токен ему
 *     не храним);
 *   • сервер ответил, что такой ссылки нет, → на главную;
 *   • токен неправильного вида → на главную.
 *
 * Экран в основном бандле, как GoFunnel и Landing: это первая страница
 * пришедшего из блога. Отсчёт и плеер подгружаются своими кусками
 * (src/lib/screens.tsx), и ответ guest-bootstrap спрашиваем заранее, пока
 * человек читает главную.
 */

import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useSession } from '../auth/SessionProvider'
import { forgetFunnelToken, isFunnelToken, readFunnelToken, saveFunnelToken, visitFunnel } from '../lib/funnel'
import { GUEST_NEXT, loadGuestBootstrap } from '../lib/guest'
import { countdown, player } from '../lib/screens'
import { OFFLINE_WAITING, Waiting } from './Account'
import Landing from './Landing'

const Countdown = countdown.Screen
const Player = player.Screen

/** Какой из экранов гостя открыт: главная, отсчёт или плеер. */
export type GuestScreen = 'home' | 'start' | 'live'

export default function PlayGuest({ screen }: { screen: GuestScreen }) {
  const { token = '' } = useParams()
  const { me, loading, offline } = useSession()
  const valid = isFunnelToken(token)
  const [missing, setMissing] = useState(false)

  // Визит — один раз на токен за жизнь страницы (visitFunnel), в фоне: экраны его не ждут.
  useEffect(() => {
    if (!valid) return
    void visitFunnel(token, true).then((result) => {
      if (result !== 'not_found') return
      if (readFunnelToken() === token) forgetFunnelToken()
      setMissing(true)
    })
  }, [token, valid])

  // Гостю — токен до регистрации и ответ плеера заранее; вошедшему токен не храним.
  useEffect(() => {
    if (!valid || loading) return
    if (me) {
      forgetFunnelToken()
      return
    }
    saveFunnelToken(token, true)
    loadGuestBootstrap(token).catch(() => undefined)
  }, [token, valid, loading, me])

  if (!valid || missing) return <Navigate to="/" replace />
  // Главная видна сразу, не дожидаясь ответа о входе, — как на /. Вошёл —
  // уведём, когда это станет известно.
  if (screen === 'home' && !me) return <Landing guestToken={token} />
  if (loading) return offline ? <Waiting text={OFFLINE_WAITING} /> : null
  if (me) return <Navigate to={GUEST_NEXT} replace />
  return screen === 'start' ? <Countdown /> : <Player />
}
