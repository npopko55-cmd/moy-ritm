import { Routes, Route, Navigate } from 'react-router-dom'
import Landing from './screens/Landing'
import Countdown from './screens/Countdown'
import Player from './screens/Player'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/start/:streamId" element={<Countdown />} />
      <Route path="/player/:streamId" element={<Player />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
