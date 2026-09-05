#!/usr/bin/env bash
# Готовит ролики с движениями для круга в плеере.
#
# Вырезки фона здесь нет намеренно: на светлом фоне сайта было заметно, что
# персонаж обведён по контуру. Вместо этого исходное видео целиком кладётся
# в круглую рамку, а фон ролика становится частью картинки.
#
# Рядом с каждым роликом кладётся постер <id>.webp — первый кадр. Он весит
# пару килобайт и закрывает круг, пока видео ещё качается: без него на
# медленной сети круг пустеет на несколько секунд при каждой смене движения.
#
# Запуск: bash scripts/build-loops.sh "/путь/к/ЛУПЫ ГОТОВЫЕ/Один цикл"

set -euo pipefail

SRC_DIR="${1:-$HOME/Downloads/ЛУПЫ ГОТОВЫЕ/Один цикл}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/public/loops"
SIZE=640
POSTER_SIZE=320
TMP="$(mktemp -d)"
trap 'rm -f "$TMP"/*.png; rmdir "$TMP"' EXIT

mkdir -p "$OUT"

slug_for() {
  case "$1" in
    *бег-высокие-колени*)      echo high-knees ;;
    *бег-на-месте-2*)          echo run-in-place-2 ;;
    *бег-на-месте*)            echo run-in-place ;;
    *бег-трусцой*)             echo jog ;;
    *махи-руками*)             echo arm-swings ;;
    *приставные-шаги*)         echo side-steps ;;
    *прыжки-руки-вверх*)       echo jumps-arms-up ;;
    *прыжки-руки-над-головой*) echo jumping-jacks ;;
    *руки-в-стороны*)          echo arms-to-sides ;;
    *руки-вверх*)              echo arms-up ;;
    *руки-к-плечам*)           echo arms-to-shoulders ;;
    *танцевальные-шаги*)       echo dance-steps ;;
    *удары-руками*)            echo punches ;;
    *шаги-с-руками*)           echo steps-with-arms ;;
    *)                         echo "" ;;
  esac
}

for f in "$SRC_DIR"/*.mp4; do
  [ -e "$f" ] || continue
  slug="$(slug_for "$(basename "$f")")"
  [ -n "$slug" ] || { echo "· пропуск: $(basename "$f")"; continue; }

  ffmpeg -v error -y -i "$f" \
    -vf "scale=${SIZE}:${SIZE}:flags=lanczos" \
    -c:v libx264 -profile:v high -crf 24 -preset slow \
    -pix_fmt yuv420p -movflags +faststart -an \
    "$OUT/$slug.mp4"

  # Постер: первый кадр. ffmpeg собран без libwebp, поэтому через png и cwebp.
  ffmpeg -v error -y -i "$OUT/$slug.mp4" -frames:v 1 \
    -vf "scale=${POSTER_SIZE}:${POSTER_SIZE}:flags=lanczos" "$TMP/$slug.png"
  cwebp -quiet -q 75 "$TMP/$slug.png" -o "$OUT/$slug.webp"

  printf '▸ %-20s %6s + постер %s\n' "$slug" \
    "$(du -h "$OUT/$slug.mp4" | cut -f1)" "$(du -h "$OUT/$slug.webp" | cut -f1)"
done

echo "Готово. Ролики и постеры в $OUT"
