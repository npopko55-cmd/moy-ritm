/**
 * Предложение тарифов в челлендже «21 день» (воронка trial20): через три дня
 * после регистрации (TRIAL20_OFFER_AFTER_DAYS на бэкенде).
 *
 * Страница, а не окно (окон на сайте нет). Показывается один раз: охранник
 * тренировки (RequireTrial) уводит сюда вместо отсчёта, когда в bootstrap
 * пришло offer_due. При открытии сообщаем бэкенду, что предложение показано
 * (POST /funnel/offer-seen), — и больше оно не появится. «Продолжить
 * бесплатную тренировку» ведёт в обычный отсчёт: бесплатные движения
 * челленджа остаются без срока.
 */

import { useEffect, useRef } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { hasAccess } from '../api/types'
import { FIRST_STREAM, useFlowStart } from '../auth/guards'
import { useSession } from '../auth/SessionProvider'
import TariffPlans from '../components/TariffPlans'
import { plural } from '../lib/date'
import { CATALOG_MOVES_TEXT, challengeMoves, markOfferSeen, trialExpired, useRecheckOnReturn, useTrialPage } from '../lib/trial'
import PageShell from './Page'
import './Trial.css'

export default function Offer() {
  const navigate = useNavigate()
  const goFlow = useFlowStart()
  const { access } = useSession()
  const { trial, known, failed } = useTrialPage()
  useRecheckOnReturn()

  // Отметка «показано» — один раз и только если предложение и правда было
  // положено. Локально гасим сразу: иначе «Продолжить» снова привело бы сюда.
  // Не дошла до сервера — не беда: он покажет предложение ещё раз.
  const sent = useRef(false)
  useEffect(() => {
    if (sent.current || !trial?.offer_due) return
    sent.current = true
    markOfferSeen()
    api.funnelOfferSeen().catch((e) => {
      if (import.meta.env.DEV) console.warn('offer-seen не отправился', e)
    })
  }, [trial?.offer_due])

  // Сервер не ответил — предложение показать не из чего: пускаем в
  // тренировку, как и охранник.
  if (!known) return failed ? <Navigate to={FIRST_STREAM} replace /> : null
  if (trialExpired(trial) && !hasAccess(access)) return <Navigate to="/trial-ended" replace />
  if (hasAccess(access) || trial?.funnel !== 'trial20' || trial.state !== 'active') {
    return <Navigate to="/" replace />
  }

  const free = plural(challengeMoves(), 'движение', 'движения', 'движений')

  return (
    <PageShell
      title={`Откройте все ${CATALOG_MOVES_TEXT} движений`}
      lead={`В челлендже бесплатно ${free} — они остаются с вами. Полный доступ открывает все ${CATALOG_MOVES_TEXT}`}
      back={{ label: '← На главную', go: () => navigate('/') }}
      wide
    >
      <TariffPlans />

      <div className="trial__foot">
        {/* Вместо отсчёта сюда — значит, и дальше в отсчёт, а не назад сюда. */}
        <button
          className="page__btn trial__continue"
          type="button"
          onClick={() => goFlow(FIRST_STREAM, { replace: true })}
        >
          Продолжить бесплатную тренировку
        </button>
      </div>
    </PageShell>
  )
}
