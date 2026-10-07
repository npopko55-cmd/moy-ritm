/**
 * Гостевой вход: /play/<токен>_<метка> — сразу в плеер, без регистрации
 * (src/lib/guest.ts). Ссылка для блога Димы: /play/hx4q7m2p_dima-blog.
 *
 * Как /go (GoFunnel.tsx): визит уходит в фоне (с meta.guest), токен
 * воронки запоминаем до регистрации — её предложит окно посреди тренировки,
 * и человек получит метку воронки, как пришедший по /go. Отличие одно: не
 * вошедший попадает не на регистрацию, а в плеер гостя.
 *
 *   • уже вошёл → обычный плеер (метку ставит только регистрация, токен ему
 *     не храним);
 *   • сервер ответил, что такой ссылки нет, → на главную;
 *   • токен неправильного вида → на главную.
 *
 * Экран в основном бандле, как GoFunnel: это первая страница пришедшего из
 * блога. Сам плеер подгружается своим куском (src/lib/screens.tsx), и ответ
 * guest-bootstrap спрашиваем заранее, пока качается его код.
 */

import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useSession } from '../auth/SessionProvider'
import { forgetFunnelToken, isFunnelToken, readFunnelToken, saveFunnelToken, visitFunnel } from '../lib/funnel'
import { GUEST_NEXT, loadGuestBootstrap } from '../lib/guest'
import { player } from '../lib/screens'
import { OFFLINE_WAITING, Waiting } from './Account'

const Player = player.Screen

export default function PlayGuest() {
  const { token = '' } = useParams()
  const { me, loading, offline } = useSession()
  const valid = isFunnelToken(token)
  const [missing, setMissing] = useState(false)

  // Визит — один раз на токен, в фоне: плеер его не ждёт.
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
  if (loading) return offline ? <Waiting text={OFFLINE_WAITING} /> : null
  if (me) return <Navigate to={GUEST_NEXT} replace />
  return <Player />
}
