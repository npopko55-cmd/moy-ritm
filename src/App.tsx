import { Suspense, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom'
import { pageView } from './lib/analytics'
import Landing from './screens/Landing'
import GoFunnel from './screens/GoFunnel'
import PlayGuest from './screens/PlayGuest'
import TelegramBridge from './components/TelegramBridge'
import ConsentBanner from './components/ConsentBanner'
import PageMeta from './components/PageMeta'
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
  pay,
  paymentSuccess,
  player,
  profile,
  progress,
  register,
  resetPassword,
  settings,
  subscription,
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
const Pay = pay.Screen
const Profile = profile.Screen
const Subscription = subscription.Screen
const Progress = progress.Screen
const Help = help.Screen
const TrialEnded = trialEnded.Screen
const Offer = offer.Screen
const Admin = admin.Screen
const Legal = legal.Screen

/**
 * Плеер потока — свой на каждый поток (key). Переключатель над кругом с
 * 28.10.2026 ведёт из плеера прямо в плеер другого потока, без отсчёта
 * (openStream в src/screens/Player.tsx), и адрес меняется на том же
 * маршруте. Плеер же рассчитан на один поток за всю жизнь: колода, куски,
 * сохранённая тренировка, ролики в круге. С ключом он открывается заново,
 * как раньше после отсчёта; элементы <video> при этом живут в пуле
 * (src/media/videoPool.ts) и не пересоздаются.
 */
function StreamPlayer() {
  const { streamId } = useParams()
  return <Player key={streamId} />
}

/**
 * Хит страницы в счётчики рекламы на каждую смену адреса (src/lib/analytics.ts):
 * страница у сайта одна, и сами счётчики переходов внутри приложения не видят.
 * Без id счётчиков в сборке ничего не делает.
 */
function PageViews() {
  const { pathname, search } = useLocation()
  useEffect(() => {
    pageView()
  }, [pathname, search])
  return null
}

export default function App() {
  return (
    <SessionProvider>
      <MusicProvider>
        {/* Тренировка живёт выше маршрутов: плеер размонтируется при уходе
            в меню, а заход при этом не заканчивается. */}
        <FlowProvider>
        {/* Кнопка «Назад» Telegram Mini App. Вне Telegram ничего не делает. */}
        <TelegramBridge />
        {/* Заголовок, описание и канонический адрес по маршруту (для поиска). */}
        <PageMeta />
        <PageViews />
        {/* Пока скачивается код экрана — пустой фон страницы, без спиннеров:
            обычно это доли секунды, и мигание было бы заметнее ожидания. */}
        <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Landing />} />

          {/* Ссылка входа тестовой воронки из Telegram: /go/<токен>. */}
          <Route path="/go/:token" element={<GoFunnel />} />
          {/* Гостевой вход: главная → отсчёт → плеер без регистрации,
              регистрацию предложит окно посреди тренировки (src/lib/guest.ts,
              src/screens/PlayGuest.tsx). */}
          <Route path="/play/:token" element={<PlayGuest screen="home" />} />
          <Route path="/play/:token/start" element={<PlayGuest screen="start" />} />
          <Route path="/play/:token/live" element={<PlayGuest screen="live" />} />

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
              под тарифами, настройки и подвал. Экран один, документ — по
              адресу; /ads-consent — согласие на рекламные сообщения. */}
          <Route path="/oferta" element={<Legal />} />
          <Route path="/privacy" element={<Legal />} />
          <Route path="/consent" element={<Legal />} />
          <Route path="/ads-consent" element={<Legal />} />

          <Route path="/tariffs" element={<Tariffs />} />
          {/* Оплата выбранного тарифа: карточка и встроенная форма GetCourse.
              Гость уходит на вход и возвращается сюда же (next). */}
          <Route
            path="/pay/:code"
            element={
              <RequireAuth>
                <Pay />
              </RequireAuth>
            }
          />
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
              отсчёта и плеера «Бесплатный доступ истёк» (trial3d), у
              челленджа trial20 через три дня — один раз предложение тарифов
              перед новым заходом: перед отсчётом и перед плеером, если
              тренировки ещё нет (главная и вкладка «Тренировка» ведут прямо
              в плеер на паузе). */}
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
                <RequireTrial start>
                  <StreamPlayer />
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
          {/* Подписка через Продамус: оформление с согласием на автосписание,
              отмена в один клик, переход на год (backend/docs/PRODAMUS.md). */}
          <Route
            path="/subscription"
            element={
              <RequireAuth>
                <Subscription />
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

          {/* Админка для владельца: главная — единое окно аналитики, рядом
              оплаты и посты. Ссылок на неё нет; вход — свой,
              администраторский (src/api/admin.ts). Прежние разделы
              «Воронки», «Поведение» и «Опрос» убраны 22.10.2026 — их адреса
              ведут на главную админки, чтобы старые закладки не вели на
              лендинг. */}
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/posts" element={<Admin />} />
          <Route path="/admin/payments" element={<Admin />} />
          <Route path="/admin/funnels" element={<Navigate to="/admin" replace />} />
          <Route path="/admin/behavior" element={<Navigate to="/admin" replace />} />
          <Route path="/admin/survey" element={<Navigate to="/admin" replace />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
        {/* Выбор про счётчики рекламы (src/components/ConsentBanner.tsx). Без
            id счётчиков, в админке и на тренировке не показывается. */}
        <ConsentBanner />
        </FlowProvider>
      </MusicProvider>
    </SessionProvider>
  )
}
