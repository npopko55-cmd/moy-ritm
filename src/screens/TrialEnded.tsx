/**
 * «Бесплатный доступ истёк» — страница, а не окно (окон на сайте нет).
 *
 * Сюда уводит охранник тренировки (RequireTrial в auth/guards.tsx), когда
 * пробный период воронки кончился, а оплаченного доступа нет: «Влиться в
 * поток» на главной, в «Моём прогрессе», в меню, возврат в поток, отсчёт и
 * плеер по прямой ссылке.
 *
 * Заголовок — текст владельца по воронке, дословно; первое предложение —
 * заголовком, второе — строкой под ним. Под ними те же карточки, что на
 * странице тарифов. Оплата пришла (в том числе с сайта, пока мини-ап ждал в
 * Telegram) — страница уводит на главную сама.
 */

import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useSession } from '../auth/SessionProvider'
import TariffPlans from '../components/TariffPlans'
import { trialBlocks, useRecheckOnReturn, useTrialPage } from '../lib/trial'
import PageShell from './Page'
import './Trial.css'

const TEXT = {
  trial3d: { title: 'Бесплатный доступ истёк', lead: 'Чтобы продолжить шагать, выберите удобный тариф' },
  trial20: {
    title: 'Бесплатные тренировки закончились',
    lead: 'Чтобы продолжить шагать, выберите удобный тариф',
  },
} as const

export default function TrialEnded() {
  const navigate = useNavigate()
  const { access } = useSession()
  const { trial, known, failed } = useTrialPage()
  useRecheckOnReturn()

  // Пока не знаем, чем кончился пробный период, — пустой фон, как у
  // подгрузки экрана: заголовок не должен смениться на глазах.
  if (!known && !failed) return null
  // Оплатили или пробного периода нет — здесь делать нечего.
  if (known && !trialBlocks(trial, access)) return <Navigate to="/" replace />

  const text = TEXT[trial?.funnel ?? 'trial3d']

  return (
    <PageShell
      title={text.title}
      lead={text.lead}
      // «Главная» вошедшего — тренировка, а она закрыта: ведём на лендинг.
      back={{ label: '← На главную', go: () => navigate('/') }}
      wide
    >
      <TariffPlans from="/trial-ended" />

      <div className="trial__foot">
        <Link className="trial__help" to="/help">
          Помощь
        </Link>
      </div>
    </PageShell>
  )
}
