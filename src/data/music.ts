/**
 * Плейлисты тренировки: свой у «Размять спину», общий у остальных потоков
 * (playlistFor ниже).
 *
 * Файлы в public/music/ — HE-AAC v1 40 кбит/с в .m4a. Исходные mp3 кардио
 * весили 41 МБ, после сжатия около 11 МБ, и грузится всегда только текущий
 * трек. Пересборка: scripts/build-music.sh
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
 * Порог «долгого вступления», секунды.
 *
 * С «разгара» всегда включается только первый трек захода — чтобы поток
 * начался сразу. Следующие идут с начала: человек уже в движении, разгонять
 * его не надо. Исключение — треки, у которых до разгара больше этого порога:
 * полминуты тихого вступления посреди тренировки слушать незачем, поэтому
 * такие тоже включаются с разгара.
 */
export const LONG_INTRO_SECONDS = 30

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

/**
 * Спокойный плейлист «Размять спину» — прислал Никита 28.10.2026: под
 * разминку спины бодрые дропы кардио не годятся.
 *
 * Разгар тем же скриптом, но правило другое: в этой музыке громкость почти
 * ровная, и «разгар», найденный по медиане (способ relaxed), — случайная
 * точка, а не припев. Поэтому startAt взят только там, где за вступлением
 * явный подъём громкости и он не дальше LONG_INTRO_SECONDS: Assol (тихое
 * вступление, к 25-й секунде громче на 16 LU) и Mount Eminest (на 7 LU к
 * 30-й). Остальные — с начала: у Dmxr, Pokesh, Lamp Camp и Sweep Sleep
 * музыка звучит в полную силу с первых секунд; у Abilene вступление
 * минута, и с разгара (69 с) она игралась бы при каждом включении —
 * спокойному треку незачем терять первую минуту.
 */
export const BACK_TRACKS: Track[] = [
  { id: 'mount-eminest-morning-breeze', title: "Morning Breeze (feat. Simonas)", artist: "Mount Eminest", duration: 118.0, startAt: 27 },
  { id: 'dmxr-lofi-sleep', title: "Lofi Sleep", artist: "Dmxr", duration: 168.1, startAt: 0 },
  { id: 'abilene-sweetest-rain', title: "Sweetest Rain", artist: "Abilene", duration: 157.8, startAt: 0 },
  { id: 'sweep-sleep-night-light', title: "Night Light", artist: "Sweep Sleep", duration: 171.2, startAt: 0 },
  { id: 'lamp-camp-empty-reading-room', title: "Empty Reading Room", artist: "Lamp Camp", duration: 162.7, startAt: 0 },
  { id: 'pokesh-goodbye-sea', title: "Goodbye, Sea!", artist: "Pokesh", duration: 147.1, startAt: 0 },
  { id: 'assol-lunar-rain', title: "Lunar Rain", artist: "Assol", duration: 165.1, startAt: 24 },
]

/** Потоки со своей музыкой. Кого здесь нет — играют TRACKS. */
const STREAM_PLAYLISTS: Record<string, Track[]> = {
  back: BACK_TRACKS,
}

/**
 * Плейлист потока. Один и тот же массив для потоков с общей музыкой: по
 * нему проигрыватель понимает, что при переходе между ними менять нечего.
 */
export function playlistFor(streamId: string): Track[] {
  return STREAM_PLAYLISTS[streamId] ?? TRACKS
}

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
