/**
 * «Бесплатный доступ истёк» — страница, а не окно (окон на сайте нет).
 *
 * Сюда уводит охранник тренировки (RequireTrial в auth/guards.tsx), когда
 * пробный период воронки кончился, а оплаченного доступа нет: «Влиться в
 * поток» на главной, в «Моём прогрессе», в меню, возврат в поток, отсчёт и
 * плеер по прямой ссылке.
 *
 * Кончается только пробный доступ trial3d: у челленджа trial20 срока нет, и
 * сюда он не попадает. Заголовок — текст владельца, дословно; первое
 * предложение — заголовком, второе — строкой под ним. Под ними те же карточки, что на
 * странице тарифов. Оплата пришла (в том числе с сайта, пока мини-ап ждал в
 * Telegram) — страница уводит на главную сама.
 */

import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useSession } from '../auth/SessionProvider'
import TariffPlans from '../components/TariffPlans'
import { trialBlocks, useRecheckOnReturn, useTrialPage } from '../lib/trial'
import PageShell from './Page'
import './Trial.css'

const TEXT = { title: 'Бесплатный доступ истёк', lead: 'Чтобы продолжить шагать, выберите удобный тариф' }

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

  return (
    <PageShell
      title={TEXT.title}
      lead={TEXT.lead}
      // «Главная» вошедшего — тренировка, а она закрыта: ведём на лендинг.
      back={{ label: '← На главную', go: () => navigate('/') }}
      wide
    >
      <TariffPlans />

      <div className="trial__foot">
        <Link className="trial__help" to="/help">
          Помощь
        </Link>
      </div>
    </PageShell>
  )
}
