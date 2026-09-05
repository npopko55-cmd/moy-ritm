/**
 * Плейлист тренировки.
 *
 * Файлы в public/music/ — HE-AAC v1 40 кбит/с в .m4a. Исходные mp3 весили
 * 41 МБ, после сжатия около 11 МБ, и грузится всегда только текущий трек.
 * Пересборка: scripts/build-music.sh
 */

import { asset } from '../lib/asset'

export type Track = {
  id: string
  title: string
  artist: string
  duration: number
  /** Секунда, с которой включать трек: первый устойчиво громкий участок. */
  startAt: number
}

/**
 * Треки стартуют не с начала, а с «разгара» — первого места, где музыка уже
 * набрала ход: дроп или припев. Так с первой секунды есть ощущение потока.
 *
 * Цифры startAt посчитаны 05.09.2026 скриптом scripts/find_music_start.py по
 * исходным mp3: он снимает кривую кратковременной громкости (ffmpeg ebur128,
 * окно 3 с), берёт порог на уровне 80-го перцентиля и ищет самый ранний
 * участок, где громкость держится выше порога 6 секунд подряд; от его начала
 * отнимает секунду на плавный вход плеера.
 *
 * Новый трек — прогнать тем же скриптом, руками цифру не выдумывать:
 *     python3 scripts/find_music_start.py "/путь/к/Архив 2"
 */
export const TRACKS: Track[] = [
  { id: 'dark-eyes-speed', title: "Speed", artist: "Dark Eyes", duration: 182.4, startAt: 44 },
  { id: 'findmyname-rebel', title: "Rebel", artist: "Findmyname", duration: 181.1, startAt: 73 },
  { id: 'hugel-movin-to-the-sun', title: "Movin' To The Sun", artist: "HUGEL", duration: 142.2, startAt: 52.5 },
  { id: 'imael-angel-bad-times', title: "Bad Times", artist: "Imael Angel", duration: 167.4, startAt: 45 },
  { id: 'jim-funk-beat-the-heat-waves', title: "Beat The Heat Waves", artist: "Jim Funk", duration: 199.7, startAt: 32.5 },
  { id: 'john-balaya-nicoteen', title: "Nicoteen", artist: "John Balaya", duration: 157.0, startAt: 60 },
  { id: 'kean-dysso-vibemaster', title: "Vibemaster", artist: "Kean Dysso", duration: 149.1, startAt: 33 },
  { id: 'moonlght-free-bird', title: "Free Bird", artist: "Moonlght", duration: 114.5, startAt: 21.5 },
  { id: 'pelyuh-bad', title: "Bad", artist: "Pelyuh", duration: 171.0, startAt: 48.5 },
  { id: 'radwulf-no-stopping', title: "No Stopping", artist: "Radwulf", duration: 248.1, startAt: 83.5 },
  { id: 'ryan-blyth-show-me', title: "Show Me", artist: "Ryan Blyth", duration: 179.5, startAt: 32.5 },
  { id: 'ship-wrek-stimulate', title: "Stimulate", artist: "Ship Wrek", duration: 182.9, startAt: 45.5 },
  { id: 'tony-dark-eyes-games', title: "Games", artist: "Tony Dark Eyes", duration: 129.9, startAt: 13 },
]

export function trackSrc(id: string): string {
  return asset(`music/${id}.m4a`)
}

/** Порядок треков перемешивается на каждый заход, чтобы не приедался. */
export function shuffled<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}
