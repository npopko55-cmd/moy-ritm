/**
 * Путь к файлу из public/.
 *
 * На GitHub Pages сайт живёт в подпапке (/moy-ritm/), поэтому абсолютные
 * пути вида "/loops/x.webm" там ведут в никуда. BASE_URL подставляет
 * нужный префикс и локально, и на Pages.
 */
export function asset(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`
}
