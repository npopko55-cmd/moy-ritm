import { Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Landing from './screens/Landing'
import GoFunnel from './screens/GoFunnel'
import TelegramBridge from './components/TelegramBridge'
import { SessionProvider } from './auth/SessionProvider'
import { RequireAuth, RequireTrial } from './auth/guards'
import { FlowProvider } from './flow/FlowSession'
import { MusicProvider } from './music/MusicProvider'
import {
  admin,
  confirmEmail,
  confirmNewEmail,
  countdown,
  deleteAccount,
  forgotPassword,
  help,
  legal,
  login,
  offer,
  paymentSuccess,
  player,
  profile,
  progress,
  register,
  resetPassword,
  settings,
  tariffs,
  trialEnded,
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
const TrialEnded = trialEnded.Screen
const Offer = offer.Screen
const Admin = admin.Screen
const Legal = legal.Screen

export default function App() {
  return (
    <SessionProvider>
      <MusicProvider>
        {/* Тренировка живёт выше маршрутов: плеер размонтируется при уходе
            в меню, а заход при этом не заканчивается. */}
        <FlowProvider>
        {/* Кнопка «Назад» Telegram Mini App. Вне Telegram ничего не делает. */}
        <TelegramBridge />
        {/* Пока скачивается код экрана — пустой фон страницы, без спиннеров:
            обычно это доли секунды, и мигание было бы заметнее ожидания. */}
        <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Landing />} />

          {/* Ссылка входа тестовой воронки из Telegram: /go/<токен>. */}
          <Route path="/go/:token" element={<GoFunnel />} />

          {/* Учётная запись. Адреса совпадают со ссылками в письмах —
              их строит бэкенд от PUBLIC_BASE_URL, см. docs/EMAILS.md. */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/confirm-email" element={<ConfirmEmail />} />
          <Route path="/confirm-new-email" element={<ConfirmNewEmail />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/delete-account" element={<DeleteAccount />} />

          {/* Помощь открыта всем: она нужна и до входа. */}
          <Route path="/help" element={<Help />} />

          {/* Документы — без входа: на них ссылаются регистрация, строка
              под тарифами и подвал. Экран один, документ — по адресу. */}
          <Route path="/oferta" element={<Legal />} />
          <Route path="/privacy" element={<Legal />} />
          <Route path="/consent" element={<Legal />} />

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
              отвечают 403 access_required.
              RequireTrial — пробный период воронки: кончился — вместо
              отсчёта и плеера «Бесплатный доступ истёк», у trial20 после
              10-й тренировки — один раз предложение тарифов перед отсчётом. */}
          <Route
            path="/start/:streamId"
            element={
              <RequireAuth>
                <RequireTrial start>
                  <Countdown />
                </RequireTrial>
              </RequireAuth>
            }
          />
          <Route
            path="/player/:streamId"
            element={
              <RequireAuth>
                <RequireTrial>
                  <Player />
                </RequireTrial>
              </RequireAuth>
            }
          />
          <Route
            path="/trial-ended"
            element={
              <RequireAuth>
                <TrialEnded />
              </RequireAuth>
            }
          />
          <Route
            path="/offer"
            element={
              <RequireAuth>
                <Offer />
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

          {/* Аналитика воронок для владельца. Ссылок на неё нет; вход —
              свой, администраторский (src/api/admin.ts). */}
          <Route path="/admin" element={<Admin />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
        </FlowProvider>
      </MusicProvider>
    </SessionProvider>
  )
}
