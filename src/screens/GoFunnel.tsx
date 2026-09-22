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
 *   • незнакомый токен или сбой → главная.
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
import { api } from '../api/client'
import { useSession } from '../auth/SessionProvider'
import { anonId, saveFunnelToken } from '../lib/funnel'

/** Один визит на токен за жизнь страницы: StrictMode не должен считать дважды. */
const visits = new Map<string, Promise<boolean>>()

function visit(token: string): Promise<boolean> {
  let job = visits.get(token)
  if (!job) {
    job = api.funnelVisit(token, anonId()).then(
      () => {
        saveFunnelToken(token)
        return true
      },
      () => false,
    )
    visits.set(token, job)
  }
  return job
}

export default function GoFunnel() {
  const { token = '' } = useParams()
  const { me, loading } = useSession()
  const [found, setFound] = useState<boolean | null>(null)

  useEffect(() => {
    let alive = true
    void visit(token).then((ok) => {
      if (alive) setFound(ok)
    })
    return () => {
      alive = false
    }
  }, [token])

  // Ждём и визит, и ответ «вошёл ли» (в мини-апе это ещё и вход по Telegram).
  if (found === null || loading) return null
  return <Navigate to={found && !me ? '/register' : '/'} replace />
}
