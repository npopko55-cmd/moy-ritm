import { Routes, Route, Navigate } from 'react-router-dom'
import Landing from './screens/Landing'
import Countdown from './screens/Countdown'
import Player from './screens/Player'
import Settings from './screens/Settings'
import Tariffs from './screens/Tariffs'
import Login from './screens/Login'
import Register from './screens/Register'
import ConfirmEmail from './screens/ConfirmEmail'
import ConfirmNewEmail from './screens/ConfirmNewEmail'
import ForgotPassword from './screens/ForgotPassword'
import ResetPassword from './screens/ResetPassword'
import PaymentSuccess from './screens/PaymentSuccess'
import { SessionProvider } from './auth/SessionProvider'
import { RequireAccess, RequireAuth } from './auth/guards'
import { MusicProvider } from './music/MusicProvider'

export default function App() {
  return (
    <SessionProvider>
      <MusicProvider>
        <Routes>
          <Route path="/" element={<Landing />} />

          {/* Учётная запись. Адреса совпадают со ссылками в письмах —
              их строит бэкенд от PUBLIC_BASE_URL, см. docs/EMAILS.md. */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/confirm-email" element={<ConfirmEmail />} />
          <Route path="/confirm-new-email" element={<ConfirmNewEmail />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          <Route path="/tariffs" element={<Tariffs />} />
          <Route
            path="/payment/success"
            element={
              <RequireAuth>
                <PaymentSuccess />
              </RequireAuth>
            }
          />

          {/* Тренировка закрыта оплатой. Обёртки решают, какой экран
              показать; пускать или нет решает бэкенд — контентные ручки
              отвечают 403 access_required. */}
          <Route
            path="/start/:streamId"
            element={
              <RequireAuth>
                <RequireAccess>
                  <Countdown />
                </RequireAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/player/:streamId"
            element={
              <RequireAuth>
                <RequireAccess>
                  <Player />
                </RequireAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/settings"
            element={
              <RequireAuth>
                <Settings />
              </RequireAuth>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </MusicProvider>
    </SessionProvider>
  )
}
