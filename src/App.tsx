import { Routes, Route, Navigate } from 'react-router-dom'
import Landing from './screens/Landing'
import Countdown from './screens/Countdown'
import Player from './screens/Player'
import Settings from './screens/Settings'
import Tariffs from './screens/Tariffs'
import { MusicProvider } from './music/MusicProvider'

export default function App() {
  return (
    <MusicProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/start/:streamId" element={<Countdown />} />
        <Route path="/player/:streamId" element={<Player />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/tariffs" element={<Tariffs />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </MusicProvider>
  )
}
