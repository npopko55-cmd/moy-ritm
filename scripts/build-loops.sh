#!/usr/bin/env bash
# Готовит зацикленные ролики с прозрачным фоном для плеера.
#
#   исходник .mp4 (бежевый студийный фон)
#     -> кадры PNG
#     -> вырезка человека (Apple Vision, scripts/cutout)
#     -> обрезка по общему контуру + масштаб
#     -> public/loops/<slug>.webm  (VP9 + альфа: Chrome, Firefox, Edge)
#        public/loops/<slug>.mp4   (HEVC + альфа: Safari)
#
# Запуск:  bash scripts/build-loops.sh "/путь/к/ЛУПЫ ГОТОВЫЕ/Один цикл"

set -euo pipefail

SRC_DIR="${1:-$HOME/Downloads/ЛУПЫ ГОТОВЫЕ/Один цикл}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/public/loops"
CUTOUT="$ROOT/scripts/cutout"
WORK="$(mktemp -d)"
SIZE=720   # сторона итогового квадрата

# Промежуточные кадры лежат во временном каталоге и удаляются по выходу.
cleanup() { [ -d "$WORK" ] && find "$WORK" -mindepth 1 -delete && rmdir "$WORK"; }
trap cleanup EXIT

[ -x "$CUTOUT" ] || { echo "Нет бинарника $CUTOUT — соберите: swiftc -O scripts/cutout.swift -o scripts/cutout"; exit 1; }
mkdir -p "$OUT"

slug_for() {
  case "$1" in
    *бег-высокие-колени*)        echo high-knees ;;
    *бег-на-месте-2*)            echo run-in-place-2 ;;
    *бег-на-месте*)              echo run-in-place ;;
    *бег-трусцой*)               echo jog ;;
    *махи-руками*)               echo arm-swings ;;
    *приставные-шаги*)           echo side-steps ;;
    *прыжки-руки-вверх*)         echo jumps-arms-up ;;
    *прыжки-руки-над-головой*)   echo jumping-jacks ;;
    *руки-в-стороны*)            echo arms-to-sides ;;
    *руки-вверх*)                echo arms-up ;;
    *руки-к-плечам*)             echo arms-to-shoulders ;;
    *танцевальные-шаги*)         echo dance-steps ;;
    *удары-руками*)              echo punches ;;
    *шаги-с-руками*)             echo steps-with-arms ;;
    *)                           echo "" ;;
  esac
}

for f in "$SRC_DIR"/*.mp4; do
  [ -e "$f" ] || continue
  base="$(basename "$f")"
  slug="$(slug_for "$base")"
  if [ -z "$slug" ]; then echo "· пропуск (нет соответствия): $base"; continue; fi

  echo "▸ $base → $slug"
  IN="$WORK/$slug/in"; CUT="$WORK/$slug/out"
  mkdir -p "$IN" "$CUT"

  ffmpeg -v error -y -i "$f" "$IN/%04d.png"
  "$CUTOUT" "$IN" "$CUT" >/dev/null

  # Общий контур по всем кадрам: альфа -> яркость -> cropdetect.
  crop=$(ffmpeg -v info -i "$CUT/%04d.png" -vf "alphaextract,cropdetect=8:2:0" -f null - 2>&1 \
         | grep -o 'crop=[0-9]*:[0-9]*:[0-9]*:[0-9]*' | tail -1 | cut -d= -f2 || true)

  # Размер исходного кадра — обрезка не должна за него выходить.
  IW=$(ffprobe -v error -select_streams v:0 -show_entries stream=width \
       -of default=noprint_wrappers=1:nokey=1 "$f")
  IH=$(ffprobe -v error -select_streams v:0 -show_entries stream=height \
       -of default=noprint_wrappers=1:nokey=1 "$f")

  if [ -n "$crop" ]; then
    IFS=: read -r cw ch cx cy <<< "$crop"
    pad=$(( (cw + ch) / 24 ))                  # немного воздуха вокруг фигуры
    side=$(( cw > ch ? cw : ch ))
    side=$(( side + pad * 2 ))
    [ "$side" -gt "$IW" ] && side=$IW
    [ "$side" -gt "$IH" ] && side=$IH
    side=$(( side - side % 2 ))

    ox=$(( cx + cw / 2 - side / 2 ))
    oy=$(( cy + ch / 2 - side / 2 ))
    [ "$ox" -lt 0 ] && ox=0
    [ "$oy" -lt 0 ] && oy=0
    [ "$ox" -gt $(( IW - side )) ] && ox=$(( IW - side ))
    [ "$oy" -gt $(( IH - side )) ] && oy=$(( IH - side ))

    vf="crop=${side}:${side}:${ox}:${oy},scale=${SIZE}:${SIZE}:flags=lanczos"
  else
    vf="scale=${SIZE}:${SIZE}:flags=lanczos"
  fi

  # Chrome / Firefox / Edge — VP9 с альфой. alt-ref обязательно выключить.
  ffmpeg -v error -y -framerate 24 -i "$CUT/%04d.png" \
    -vf "$vf" -c:v libvpx-vp9 -pix_fmt yuva420p \
    -b:v 0 -crf 30 -auto-alt-ref 0 -row-mt 1 -an "$OUT/$slug.webm"

  # Safari — HEVC с альфой.
  ffmpeg -v error -y -framerate 24 -i "$CUT/%04d.png" \
    -vf "$vf" -c:v hevc_videotoolbox -allow_sw 1 -alpha_quality 0.9 \
    -pix_fmt bgra -tag:v hvc1 -q:v 55 -an "$OUT/$slug.mp4"

  printf '  webm %s  ·  mp4 %s\n' \
    "$(du -h "$OUT/$slug.webm" | cut -f1)" "$(du -h "$OUT/$slug.mp4" | cut -f1)"
done

echo "Готово. Файлы в $OUT"
