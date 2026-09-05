#!/usr/bin/env python3
"""Ищет для каждого трека секунду, с которой музыка уже «в разгаре».

Плеер включает трек не с начала, а с первого устойчиво громкого участка —
дропа или припева, — чтобы с первой секунды было ощущение потока. Эта секунда
записывается в src/data/music.ts полем startAt.

Как считаем. ffmpeg -af ebur128 печатает раз в 100 мс кратковременную
громкость S (окно 3 с, в LUFS) и накопленную интегральную I. Порог «разгара» —
80-й перцентиль S по треку, но не ниже I + 1 LU. Ищем самый ранний участок,
где S держится выше порога хотя бы 6 секунд подряд (провалы до 0,5 с не в счёт),
и берём его начало минус секунда: плавный вход плеера (~1 с) должен прийтись
на подъём, а не на уже играющий припев. Округляем до 0,5 с.

Если такого участка нет, порог опускается до медианы, а требование к длине —
до 4 с (способ relaxed). Если и это не сработало — 30 с или 20 % длительности,
что меньше (способ fallback); такие треки стоит послушать руками.

Зависимости: только ffmpeg и ffprobe (python-библиотеки не нужны).

Запуск:
    python3 scripts/find_music_start.py "/Users/nikitapopko/Downloads/Архив 2"
"""

import os
import re
import subprocess
import sys

# Те же правила «имя файла → id трека», что и в scripts/build-music.sh.
SLUG_RULES = [
    ("Dark Eyes Speed", "dark-eyes-speed"),
    ("Findmyname Rebel", "findmyname-rebel"),
    ("Hugel Movin", "hugel-movin-to-the-sun"),
    ("Imael Angel Bad", "imael-angel-bad-times"),
    ("Jim Funk Beat", "jim-funk-beat-the-heat-waves"),
    ("John Balaya", "john-balaya-nicoteen"),
    ("Kean Dysso", "kean-dysso-vibemaster"),
    ("Moonlght Free Bird", "moonlght-free-bird"),
    ("Pelyuh Bad", "pelyuh-bad"),
    ("Radwulf No Stopping", "radwulf-no-stopping"),
    ("Ryan Blyth Show Me", "ryan-blyth-show-me"),
    ("Ship Wrek Stimulate", "ship-wrek-stimulate"),
    ("Tony Dark Eyes Games", "tony-dark-eyes-games"),
]

MIN_START = 5.0           # раньше пятой секунды не стартуем
MAX_START_FRACTION = 0.45  # и не позже 45 % трека
MIN_TAIL = 60.0           # после старта должно остаться не меньше минуты
FADE_LEAD = 1.0           # запас на плавный вход плеера
GAP_TOLERANCE = 0.5       # провал ниже порога, который прощаем
GATE_LUFS = -70.0         # ниже этого ebur128 считает кадр тишиной

LINE_RE = re.compile(
    r"t:\s*(-?[\d.]+).*?S:\s*(-?[\d.]+).*?I:\s*(-?[\d.]+)"
)
SUMMARY_I_RE = re.compile(r"^\s*I:\s*(-?[\d.]+)\s*LUFS", re.MULTILINE)


def slug_for(basename):
    """id трека по имени mp3; None, если файл не из плейлиста."""
    for prefix, slug in SLUG_RULES:
        if basename.startswith(prefix):
            return slug
    return None


def probe_duration(path):
    out = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", path,
        ],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    return float(out)


def loudness_curve(path):
    """Возвращает (кадры [(t, S)], интегральная громкость I)."""
    proc = subprocess.run(
        ["ffmpeg", "-nostats", "-i", path, "-af", "ebur128=peak=none",
         "-f", "null", "-"],
        capture_output=True, text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError("ffmpeg не смог прочитать %s" % path)

    log = proc.stderr
    frames = []
    last_i = None
    for line in log.splitlines():
        m = LINE_RE.search(line)
        if not m:
            continue
        t, s, i = float(m.group(1)), float(m.group(2)), float(m.group(3))
        frames.append((t, s))
        last_i = i

    summary = SUMMARY_I_RE.findall(log)
    integrated = float(summary[-1]) if summary else last_i
    return frames, integrated


def percentile(values, q):
    """Перцентиль (0..1) с линейной интерполяцией; values не обязан быть сортирован."""
    if not values:
        return float("-inf")
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    pos = q * (len(ordered) - 1)
    low = int(pos)
    high = min(low + 1, len(ordered) - 1)
    return ordered[low] + (ordered[high] - ordered[low]) * (pos - low)


def loud_regions(frames, threshold, step):
    """Участки, где S держится выше порога, с прощением коротких провалов.

    Возвращает список (начало, конец) в секундах; конец — последний громкий кадр.
    """
    gap_frames = max(1, int(round(GAP_TOLERANCE / step)))
    regions = []
    i = 0
    n = len(frames)
    while i < n:
        if frames[i][1] < threshold:
            i += 1
            continue
        start = frames[i][0]
        last_loud = i
        j = i + 1
        while j < n:
            if frames[j][1] >= threshold:
                last_loud = j
                j += 1
            elif j - last_loud <= gap_frames:
                j += 1
            else:
                break
        regions.append((start, frames[last_loud][0]))
        i = last_loud + 1
    return regions


def round_half(value):
    return round(value * 2.0) / 2.0


def pick_start(frames, threshold, min_length, duration, step):
    """Самый ранний участок нужной длины, укладывающийся в ограничения."""
    for begin, end in loud_regions(frames, threshold, step):
        if end - begin < min_length:
            continue
        start = round_half(max(begin - FADE_LEAD, MIN_START))
        if start > duration * MAX_START_FRACTION:
            continue
        if duration - start < MIN_TAIL:
            continue
        return start
    return None


def analyse(path):
    duration = probe_duration(path)
    frames, integrated = loudness_curve(path)
    if len(frames) < 2:
        raise RuntimeError("ebur128 не дал кривую для %s" % path)
    step = frames[1][0] - frames[0][0]

    # Кадры-тишину (S ниже абсолютного гейта) в статистику не берём: в начале
    # трека окно S ещё не заполнено и ebur128 печатает −120 LUFS.
    voiced = [s for _, s in frames if s > GATE_LUFS]

    p80 = percentile(voiced, 0.80)
    threshold = max(p80, integrated + 1.0)
    start = pick_start(frames, threshold, 6.0, duration, step)
    method = "main"

    if start is None:
        threshold = percentile(voiced, 0.50)
        start = pick_start(frames, threshold, 4.0, duration, step)
        method = "relaxed"

    if start is None:
        start = round_half(min(30.0, duration * 0.20))
        method = "fallback"

    return {
        "duration": duration,
        "integrated": integrated,
        "threshold": threshold,
        "start": start,
        "method": method,
    }


def main(argv):
    src_dir = argv[1] if len(argv) > 1 else os.path.expanduser("~/Downloads/Архив 2")
    if not os.path.isdir(src_dir):
        print("Нет такой папки: %s" % src_dir, file=sys.stderr)
        return 1

    files = sorted(f for f in os.listdir(src_dir) if f.lower().endswith(".mp3"))
    rows = []
    for name in files:
        slug = slug_for(name)
        if not slug:
            print("· пропуск: %s" % name, file=sys.stderr)
            continue
        info = analyse(os.path.join(src_dir, name))
        info["id"] = slug
        rows.append(info)

    if not rows:
        print("Не нашлось ни одного трека из плейлиста в %s" % src_dir, file=sys.stderr)
        return 1

    header = "%-30s %8s %8s %8s %8s  %s" % (
        "id", "длина", "I,LUFS", "порог", "старт", "способ")
    print(header)
    print("-" * len(header))
    for r in rows:
        print("%-30s %8.1f %8.1f %8.1f %8.1f  %s" % (
            r["id"], r["duration"], r["integrated"], r["threshold"],
            r["start"], r["method"]))

    print("\n// startAt для src/data/music.ts")
    for r in rows:
        start = r["start"]
        # 44.0 в TypeScript пишем как 44, а 44.5 оставляем как есть.
        text = "%d" % start if start == int(start) else "%s" % start
        print("  { id: '%s', startAt: %s }," % (r["id"], text))

    suspicious = [r for r in rows if r["method"] == "fallback" or r["start"] < 8.0]
    if suspicious:
        print("\nПослушать вручную: %s" % ", ".join(r["id"] for r in suspicious))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
