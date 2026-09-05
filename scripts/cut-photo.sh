#!/usr/bin/env bash
# Вырезает человека из студийного снимка и кладёт результат на главную.
#
# Использование: bash scripts/cut-photo.sh /путь/к/фото.png
#
# Фон снимается системным фреймворком Apple Vision (scripts/cutout), затем
# кадр обрезается по фигуре и пережимается в WebP с прозрачностью.
# На ровной студийной подложке край получается чистым, без ореола — в отличие
# от роликов, снятых на бежевом фоне: там от вырезки отказались намеренно.
#
# Нужны ffmpeg и cwebp: brew install ffmpeg webp

set -euo pipefail
SRC="${1:?укажите путь к снимку}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
cleanup() { [ -d "$WORK" ] && find "$WORK" -mindepth 1 -delete && rmdir "$WORK"; }
trap cleanup EXIT

mkdir -p "$WORK/in" "$WORK/out" "$ROOT/public/hero"
cp "$SRC" "$WORK/in/photo.png"
"$ROOT/scripts/cutout" "$WORK/in" "$WORK/out"

# Границы фигуры по альфа-каналу.
CROP=$(ffmpeg -v info -loop 1 -i "$WORK/out/photo.png" -frames:v 4 \
       -vf "alphaextract,cropdetect=6:2:0" -f null - 2>&1 \
       | grep -o 'crop=[0-9]*:[0-9]*:[0-9]*:[0-9]*' | tail -1 | cut -d= -f2)
IFS=: read -r cw ch cx cy <<< "$CROP"
pad=12
cx=$(( cx > pad ? cx - pad : 0 )); cy=$(( cy > pad ? cy - pad : 0 ))
cw=$(( cw + pad * 2 )); ch=$(( ch + pad * 2 ))

ffmpeg -v error -y -i "$WORK/out/photo.png" \
  -vf "crop=${cw}:${ch}:${cx}:${cy},scale=-1:1100:flags=lanczos" \
  "$WORK/trimmed.png"
cwebp -quiet -q 84 -alpha_q 92 -m 6 "$WORK/trimmed.png" -o "$ROOT/public/hero/hero.webp"

echo "Готово: public/hero/hero.webp ($(du -h "$ROOT/public/hero/hero.webp" | cut -f1))"
