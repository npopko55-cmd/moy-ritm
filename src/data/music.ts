/**
 * Плейлист тренировки.
 *
 * Файлы в public/music/ — AAC 64 кбит/с в .m4a. Исходные mp3 весили 41 МБ,
 * после сжатия около 17 МБ, и грузится всегда только текущий трек.
 * Пересборка: scripts/build-music.sh
 */

import { asset } from '../lib/asset'

export type Track = {
  id: string
  title: string
  artist: string
  duration: number
}

export const TRACKS: Track[] = [
  { id: 'dark-eyes-speed', title: "Speed", artist: "Dark Eyes", duration: 182.4 },
  { id: 'findmyname-rebel', title: "Rebel", artist: "Findmyname", duration: 181.1 },
  { id: 'hugel-movin-to-the-sun', title: "Movin' To The Sun", artist: "HUGEL", duration: 142.2 },
  { id: 'imael-angel-bad-times', title: "Bad Times", artist: "Imael Angel", duration: 167.4 },
  { id: 'jim-funk-beat-the-heat-waves', title: "Beat The Heat Waves", artist: "Jim Funk", duration: 199.7 },
  { id: 'john-balaya-nicoteen', title: "Nicoteen", artist: "John Balaya", duration: 157.0 },
  { id: 'kean-dysso-vibemaster', title: "Vibemaster", artist: "Kean Dysso", duration: 149.1 },
  { id: 'moonlght-free-bird', title: "Free Bird", artist: "Moonlght", duration: 114.5 },
  { id: 'pelyuh-bad', title: "Bad", artist: "Pelyuh", duration: 171.0 },
  { id: 'radwulf-no-stopping', title: "No Stopping", artist: "Radwulf", duration: 248.1 },
  { id: 'ryan-blyth-show-me', title: "Show Me", artist: "Ryan Blyth", duration: 179.5 },
  { id: 'ship-wrek-stimulate', title: "Stimulate", artist: "Ship Wrek", duration: 182.9 },
  { id: 'tony-dark-eyes-games', title: "Games", artist: "Tony Dark Eyes", duration: 129.8 },
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
