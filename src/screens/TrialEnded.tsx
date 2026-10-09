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
 *
 * С 09.10.2026 (Дима: «после пробного периода нужно оставить 5 бесплатных
 * движений, чтобы человек не уходил совсем») под тарифами — неброская ссылка
 * «Продолжить бесплатно — 5 движений»: число — free_tier.exercise_limit из
 * ответа сервера (afterTrialMoves). Страница при этом отмечается как
 * показанная (markTrialEndedSeen), и дальше охранник ведёт сразу в плеер.
 * По прямому адресу страница открывается и потом — с той же ссылкой. Сервер
 * прислал лимит 0 (настройка TRIAL3D_AFTER_EXERCISES выключена) — ссылки нет,
 * и всё как раньше: тренировка закрыта.
 */

import { useEffect } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useFlowStart } from '../auth/guards'
import { useSession } from '../auth/SessionProvider'
import TariffPlans from '../components/TariffPlans'
import { plural } from '../lib/date'
import { afterTrialMoves, markTrialEndedSeen, trialBlocks, useRecheckOnReturn, useTrialPage } from '../lib/trial'
import PageShell from './Page'
import './Trial.css'

const TEXT = { title: 'Бесплатный доступ истёк', lead: 'Чтобы продолжить шагать, выберите удобный тариф' }

export default function TrialEnded() {
  const navigate = useNavigate()
  const goFlow = useFlowStart()
  const { access, me } = useSession()
  const userId = me?.user.id
  const { trial, known, failed } = useTrialPage()
  useRecheckOnReturn()

  const blocks = known && trialBlocks(trial, access)
  // Сколько движений остаётся бесплатно после пробного; 0 — закрыто всё.
  const moves = blocks ? afterTrialMoves(trial) : 0

  // Страницу увидели — в следующий раз охранник пустит сразу в плеер.
  // Отмечаем, только когда есть куда пускать: лимит 0 сменится на 5 —
  // человек увидит страницу ещё раз, уже со ссылкой.
  useEffect(() => {
    if (moves > 0) markTrialEndedSeen(userId)
  }, [moves, userId])

  // Пока не знаем, чем кончился пробный период, — пустой фон, как у
  // подгрузки экрана: заголовок не должен смениться на глазах.
  if (!known && !failed) return null
  // Оплатили или пробного периода нет — здесь делать нечего.
  if (known && !blocks) return <Navigate to="/" replace />

  return (
    <PageShell
      title={TEXT.title}
      lead={TEXT.lead}
      // На лендинг, как и раньше: «Влиться в поток» оттуда пустит в плеер с
      // бесплатными движениями, если они остались, или вернёт сюда.
      back={{ label: '← На главную', go: () => navigate('/') }}
      wide
    >
      <TariffPlans />

      <div className="trial__foot">
        {moves > 0 && (
          // Запасной выход, а не второе главное действие: тарифы — первыми и
          // ярче. Ведёт туда же, куда «Влиться в поток» (отсчёт или идущий
          // заход), и в том же касании разблокирует медиа (useFlowStart).
          // Отметка ещё раз — на случай, если эффект выше не успел.
          <button
            className="trial__free"
            type="button"
            onClick={() => {
              markTrialEndedSeen(userId)
              goFlow(undefined, { replace: true })
            }}
          >
            Продолжить бесплатно — {plural(moves, 'движение', 'движения', 'движений')}
          </button>
        )}
        <Link className="trial__help" to="/help">
          Помощь
        </Link>
      </div>
    </PageShell>
  )
}
