import { Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Landing from './screens/Landing'
import { SessionProvider } from './auth/SessionProvider'
import { RequireAuth } from './auth/guards'
import { FlowProvider } from './flow/FlowSession'
import { MusicProvider } from './music/MusicProvider'
import {
  confirmEmail,
  confirmNewEmail,
  countdown,
  deleteAccount,
  forgotPassword,
  help,
  login,
  paymentSuccess,
  player,
  profile,
  progress,
  register,
  resetPassword,
  settings,
  tariffs,
} from './lib/screens'

// Лендинг — в основном бандле: это первый экран. Остальные экраны
// подгружаются по маршруту (src/lib/screens.tsx).
const Countdown = countdown.Screen
const Player = player.Screen
const Settings = settings.Screen
const Tariffs = tariffs.Screen
const Login = login.Screen
const Register = register.Screen
const ConfirmEmail = confirmEmail.Screen
const ConfirmNewEmail = confirmNewEmail.Screen
const DeleteAccount = deleteAccount.Screen
const ForgotPassword = forgotPassword.Screen
const ResetPassword = resetPassword.Screen
const PaymentSuccess = paymentSuccess.Screen
const Profile = profile.Screen
const Progress = progress.Screen
const Help = help.Screen

export default function App() {
  return (
    <SessionProvider>
      <MusicProvider>
        {/* Тренировка живёт выше маршрутов: плеер размонтируется при уходе
            в меню, а заход при этом не заканчивается. */}
        <FlowProvider>
        {/* Пока скачивается код экрана — пустой фон страницы, без спиннеров:
            обычно это доли секунды, и мигание было бы заметнее ожидания. */}
        <Suspense fallback={null}>
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
          <Route path="/delete-account" element={<DeleteAccount />} />

          {/* FAQ открыт всем: он нужен и до входа. Форма обращения внутри
              появляется только вошедшим — её ручка требует входа. */}
          <Route path="/help" element={<Help />} />

          <Route path="/tariffs" element={<Tariffs />} />
          <Route
            path="/payment/success"
            element={
              <RequireAuth>
                <PaymentSuccess />
              </RequireAuth>
            }
          />

          {/* Тренировка открыта любому вошедшему. Без оплаты в плеере
              доступен бесплатный поток из нескольких движений, остальные —
              с замком; на тарифы ведёт только яркий блок разблокировки.
              Пускать или нет по-прежнему решает бэкенд: контентные ручки
              отвечают 403 access_required. */}
          <Route
            path="/start/:streamId"
            element={
              <RequireAuth>
                <Countdown />
              </RequireAuth>
            }
          />
          <Route
            path="/player/:streamId"
            element={
              <RequireAuth>
                <Player />
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
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <Profile />
              </RequireAuth>
            }
          />
          {/* Статистику видно и с закончившимся доступом: иначе непонятно,
              ради чего продлевать. */}
          <Route
            path="/progress"
            element={
              <RequireAuth>
                <Progress />
              </RequireAuth>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
        </FlowProvider>
      </MusicProvider>
    </SessionProvider>
  )
}
