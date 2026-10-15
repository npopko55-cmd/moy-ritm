/**
 * Сайт открыт как установленное приложение: на айфоне — «Поделиться → На
 * экран „Домой“», на Android — «Установить приложение». Адресной строки и
 * кнопок браузера тогда нет, и кое-что ведёт себя иначе:
 *   • полоса с часами красится в theme-color — розовый над белыми экранами
 *     смотрится чужим, поэтому там она белая (applyStandaloneLook ниже);
 *   • чужой домен (страница оплаты GetCourse) айфон открывает поверх
 *     приложения во встроенном браузере, а вернувшемуся перезагрузить
 *     страницу нечем, — оплату ждём сами (src/lib/sitePayment.ts,
 *     src/screens/Pay.tsx).
 *
 * Узнаём по двум признакам: navigator.standalone — старый флаг айфона, его
 * ставит только Safari для иконки с экрана «Домой»; (display-mode: standalone)
 * — общий способ, его понимают и свежие айфоны, и Android. Хватит любого.
 *
 * Флаг вычисляется один раз, при загрузке модуля: из браузера в приложение
 * без перезапуска не попасть. Телеметрия плеера (src/api/playerFault.ts)
 * считает своё — там нужно именно значение matchMedia.
 */

/** Сайт открыт как установленное приложение. Не меняется до перезагрузки. */
export const STANDALONE: boolean = (() => {
  try {
    if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true
    return window.matchMedia('(display-mode: standalone)').matches
  } catch {
    // Нет matchMedia или он бросил — считаем обычным браузером, как было.
    return false
  }
})()

/** Цвет полосы с часами в приложении — фон экранов (--bg в tokens.css). */
const STANDALONE_BAR = '#ffffff'

/**
 * Белая полоса с часами в установленном приложении. В index.html для этого уже
 * есть theme-color с media="(display-mode: standalone)", но не всякий
 * браузер разбирает media у theme-color и не всякий перечитывает его на ходу:
 * тогда бы остался розовый. Поэтому здесь все теги theme-color перекрашиваются
 * напрямую. В обычном браузере ничего не делает — там полоса розовая.
 */
export function applyStandaloneLook(): void {
  if (!STANDALONE) return
  try {
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
      meta.content = STANDALONE_BAR
    })
  } catch {
    /* не вышло — останется цвет из index.html */
  }
}
