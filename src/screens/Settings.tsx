import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Logo from '../components/Logo'
import WaveBg from '../components/WaveBg'
import { ArrowRight } from '../components/Icons'
import { getStream } from '../data/streams'
import { MOVE_INTERVALS, loadMoveInterval, saveMoveInterval } from '../lib/settings'
import '../components/Logo.css'
import './Settings.css'

/** Из какого потока пришли — чтобы «Назад» вернул в ту же тренировку. */
type FromState = { from?: string } | null

export default function Settings() {
  const navigate = useNavigate()
  const { state } = useLocation() as { state: FromState }
  const stream = getStream(state?.from ?? undefined)

  const [moveInterval, setMoveInterval] = useState(loadMoveInterval)

  const choose = (seconds: number) => {
    setMoveInterval(seconds)
    saveMoveInterval(seconds)
  }

  const back = () => navigate(`/player/${stream.id}`)

  return (
    <div className="settings">
      <WaveBg opacity={0.85} />

      <header className="settings__header">
        <Logo />
        <button className="btn btn--ghost" onClick={back}>
          ← К тренировке
        </button>
      </header>

      <main className="settings__main">
        <h1 className="settings__title">Настройки</h1>
        <p className="settings__lead">Всё, что влияет на тренировку. Изменения сохраняются сразу.</p>

        <section className="settings__card">
          <h2 className="settings__card-title">Смена упражнения</h2>
          <p className="settings__card-text">Через сколько плеер переключает движение в круге.</p>

          <div className="chips" role="radiogroup" aria-label="Менять упражнение каждые">
            {MOVE_INTERVALS.map((i) => (
              <button
                key={i.seconds}
                role="radio"
                aria-checked={i.seconds === moveInterval}
                className={`chip ${i.seconds === moveInterval ? 'is-on' : ''}`}
                onClick={() => choose(i.seconds)}
              >
                {i.label}
              </button>
            ))}
          </div>
        </section>

        <div className="settings__actions">
          <button className="btn btn--pink-lg" onClick={back}>
            Вернуться к тренировке
            <span className="settings__arrow">
              <ArrowRight />
            </span>
          </button>
        </div>
      </main>
    </div>
  )
}
