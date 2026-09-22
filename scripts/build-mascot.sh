#!/usr/bin/env bash
# Готовит ролик «маскот разминается» для главного экрана.
#
# Исходник — ProRes 4444 с настоящим альфа-каналом (yuva444p12le, 960x960,
# 24 к/с, 241 кадр, ~130 МБ). Из него получается семь файлов:
#
#   warmup.webm           VP9 + альфа   — Chrome, Firefox, Android
#   warmup-small.webm     то же, 480p   — телефоны
#   warmup-anim.webp      анимированный WebP, 480p — Safari, iPhone и мини-ап Telegram
#   warmup-anim-lg.webp   то же, 672x934           — они же на широком экране
#   warmup.mov            HEVC + альфа  — сайтом не используется, см. «HEVC»
#   warmup-small.mov      то же, 480p
#   warmup-poster.webp    первый кадр   — стоит вместо анимации, пока она качается
#
# ── HEVC ────────────────────────────────────────────────────────────────────
# Ролики .mov с альфой раньше брали Safari и iPhone: альфу в VP9 Safari не
# показывает. Сам файл исправен (AVFoundation видит альфу, угол прозрачный),
# но во вьюхе Telegram на iPhone видео рисуется непрозрачным слоем — за
# фигурой встаёт прямоугольник. Поэтому WebKit и мини-ап теперь получают
# анимированный WebP (см. src/lib/mascot.ts), а .mov собираются по-прежнему,
# но в выбор источников не входят.
#
# ── Анимированный WebP ──────────────────────────────────────────────────────
# Тот же исходник и та же чистка каймы, что у роликов. Отличия:
# · 12 к/с — каждый второй кадр. 15 к/с пришлось бы брать шагом 1,6 кадра,
#   то через один, то подряд, и движение шло бы рывками.
# · Кадр 240 выброшен: он почти равен кадру 0 (см. «Петля»). На 12 к/с петля
#   идёт 0, 2 … 238 → 0, шаг на стыке такой же, как везде; с кадром 240 фигура
#   замирала бы на стыке на 170 мс. Итого 120 кадров, петля ровно 10 с.
# · Альфа < 16 обнуляется, > 240 становится 255. Lanczos при уменьшении даёт
#   звон — около 2 тыс. пикселей на кадр с альфой 1–15, глазу не видных, а
#   байтов в канале альфы они стоят заметно.
# · Кодирует Pillow, а не img2webp: img2webp не умеет сжимать альфу с
#   потерями, а без этого альфа — 40 % веса кадра. alpha_quality 10 — это
#   четыре уровня прозрачности на кромке: даже на тёмном фоне при увеличении
#   втрое край не отличить от исходника.
# · quality 40 — полка по весу: 480p весит ~700 КБ (q 50 — ~850 КБ, q 30 уже
#   мылит кудри). Межкадровое сжатие почти не помогает: фигура движется вся,
#   анимация всего на 5 % легче суммы отдельных кадров.
#
# ── Петля ───────────────────────────────────────────────────────────────────
# Ролик берётся целиком, без обрезки. Кадр 240 почти совпадает с кадром 0
# (SSIM 0.996 по цвету, 0.998 по альфе): движение к концу затухает и приходит
# в стартовую позу. Разница на стыке 240→0 (RMSE 1.98 на белом) МЕНЬШЕ, чем
# между любыми соседними кадрами в конце (239→240 даёт 3.11), то есть шва не
# видно, а кадр 240 — не дубль кадра 0 и выбрасывать его не надо.
#
# ── Кадрирование ────────────────────────────────────────────────────────────
# Прогон по всем 241 кадрам (объединение bbox по альфе > 0) дал прямоугольник
# 151,1 — 807,926. С полем 8 px, обрезкой по границам кадра и округлением до
# чётного получилось 672x934 + 143 + 0. Это 68% площади исходника: лишний
# прозрачный воздух в кодек не попадает. Если исходник заменят — пересчитайте
# (см. блок «bbox» ниже).
#
# ── Грабли ──────────────────────────────────────────────────────────────────
# · -auto-alt-ref 0 обязателен: без него libvpx молча выбрасывает альфу.
# · ffprobe показывает у webm pix_fmt=yuv420p; альфа лежит отдельным слоем,
#   её видно по тегу alpha_mode=1 и при декодировании через -c:v libvpx-vp9.
# · HEVC с альфой умеет только hevc_videotoolbox (аппаратный, macOS).
#   Он заметно прожорливее VP9: тот же кадр стоит ~1.7 МБ против ~0.9 МБ.
# · ffmpeg собран без libwebp, поэтому постер идёт через png и cwebp.
#
# ── Зелёная кайма ───────────────────────────────────────────────────────────
# По контуру фигуры остался хромакей. Снимаем в два приёма, до масштабирования:
# despill гасит зелень на полупрозрачном крае, поджим альфы на 1 px срезает то,
# что осталось на непрозрачной кромке. Метрики на пяти кадрах исходника
# (зелёность = G − (R+B)/2; пояс ±3 px от контура, вес по альфе):
#
#   вариант                       пояс   кромка   ошибка фигуры
#   как было                      8.02    12.43         —
#   только despill                3.20     6.72        0.27
#   только поджим альфы           2.07     2.17        0.00
#   despill + поджим (взято)      1.67     1.85        0.04
#
# mix=0.85 — компромисс: ниже 0,8 despill начинает съедать зелень из кожи и
# одежды (при mix=0.3 ошибка фигуры 9.31 из 255), выше 0,95 почти не работает.
#
# Запуск: bash scripts/build-mascot.sh "$HOME/Downloads/МАСКОТ_разминка_ALPHA_v2.mov"
#
# Второй аргумент anim собирает только анимированный WebP, ролики не трогает
# (VP9 на -cpu-used 0 кодируется минутами):
#   bash scripts/build-mascot.sh "$HOME/Downloads/МАСКОТ_разминка_ALPHA_v2.mov" anim

set -euo pipefail

SRC="${1:-$HOME/Downloads/МАСКОТ_разминка_ALPHA_v2.mov}"
ONLY="${2:-all}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/public/mascot"

# bbox: подобран прогоном по всем кадрам исходника 960x960, см. шапку.
CROP_W=672
CROP_H=934
CROP_X=143
CROP_Y=0
CROP="crop=${CROP_W}:${CROP_H}:${CROP_X}:${CROP_Y}"

# Снятие зелёной каймы, см. шапку. Идёт до масштабирования: на маленькой
# версии поджимать альфу уже поздно — там 1 px это почти 3 px исходника.
DESPILL="despill=type=green:mix=0.85:expand=0.5:brightness=0"
ERODE="split[m][al];[al]alphaextract,erosion[e];[m][e]alphamerge"
CLEAN="${CROP},${DESPILL},${ERODE}"

# Высота маленькой версии; ширина считается из пропорций кадрированного кадра.
SMALL_H=480
SMALL_W=346   # round_even(672 * 480 / 934)

# Анимированный WebP, см. шапку: каждый второй кадр без кадра 240, альфа у
# краёв прижата к 0 и 255, с потерями сжаты и цвет, и альфа.
ANIM_FRAMES="select='not(mod(n\,2))*lt(n\,240)'"
ALPHA_SNAP="lutrgb=a='if(lt(val\,16)\,0\,if(gt(val\,240)\,255\,val))'"
ANIM_Q=40
ANIM_ALPHA_Q=10

TMP="$(mktemp -d)"
trap 'rm -f "$TMP"/*.png; rmdir "$TMP"' EXIT

[ -f "$SRC" ] || { echo "Нет исходника: $SRC" >&2; exit 1; }
case "$ONLY" in
  all | anim) ;;
  *) echo "Второй аргумент — all или anim, а не «$ONLY»." >&2; exit 1 ;;
esac

# Pillow с WebP нужен анимации. Проверяем сразу, а не после роликов.
python3 -c 'from PIL import features; raise SystemExit(not features.check("webp"))' 2>/dev/null || {
  echo "Нет Pillow с WebP: python3 -m pip install --user Pillow" >&2
  exit 1
}

# Проверка, что исходник тот же: иначе константы кадрирования врут.
IFS=, read -r SW SH <<<"$(ffprobe -v error -select_streams v:0 \
  -show_entries stream=width,height -of csv=p=0 "$SRC")"
if [ "$SW" != "960" ] || [ "$SH" != "960" ]; then
  echo "⚠ Исходник ${SW}x${SH}, а константы кадрирования считались для 960x960." >&2
  echo "  Пересчитайте bbox по альфе, прежде чем доверять результату." >&2
fi

mkdir -p "$OUT"

if [ "$ONLY" = all ]; then
  echo "▸ warmup.webm — VP9 с альфой, ${CROP_W}x${CROP_H}"
  ffmpeg -v error -y -i "$SRC" -vf "$CLEAN" \
    -c:v libvpx-vp9 -pix_fmt yuva420p -crf 28 -b:v 0 \
    -deadline good -cpu-used 0 -row-mt 1 -auto-alt-ref 0 -g 240 -an \
    "$OUT/warmup.webm"

  echo "▸ warmup-small.webm — то же, ${SMALL_W}x${SMALL_H}"
  # Масштаб идёт по yuva420p напрямую. Вариант premultiply → scale → unpremultiply
  # даёт край чуть чище (зелёность 3.65 против 4.64), но файл толще в 2,6 раза:
  # unpremultiply в полностью прозрачных местах делит на ноль и сеет шум,
  # который кодек потом честно кодирует. Не стоит того.
  ffmpeg -v error -y -i "$SRC" -vf "$CLEAN,scale=${SMALL_W}:${SMALL_H}:flags=lanczos" \
    -c:v libvpx-vp9 -pix_fmt yuva420p -crf 28 -b:v 0 \
    -deadline good -cpu-used 0 -row-mt 1 -auto-alt-ref 0 -g 240 -an \
    "$OUT/warmup-small.webm"

  echo "▸ warmup.mov — HEVC с альфой (сайтом не используется, см. «HEVC»)"
  # q:v 75 — полка качества этого кодировщика: на 85 файл толстеет до 3 МБ,
  # а видимых ошибок становится меньше всего на четверть процента.
  # alpha_quality 0.7 хватает: край альфы точнее, чем в VP9 (макс. ошибка 28 против 54).
  ffmpeg -v error -y -i "$SRC" -vf "$CLEAN" \
    -c:v hevc_videotoolbox -allow_sw 1 -alpha_quality 0.7 \
    -pix_fmt bgra -q:v 75 -tag:v hvc1 -movflags +faststart -an \
    "$OUT/warmup.mov"

  echo "▸ warmup-small.mov — HEVC с альфой, ${SMALL_W}x${SMALL_H}"
  # Те же настройки кодировщика, что у полной версии, только кадр меньше:
  # 0,9 МБ против 1,8 МБ. Масштаб — после чистки каймы, как у warmup-small.webm.
  ffmpeg -v error -y -i "$SRC" -vf "$CLEAN,scale=${SMALL_W}:${SMALL_H}:flags=lanczos" \
    -c:v hevc_videotoolbox -allow_sw 1 -alpha_quality 0.7 \
    -pix_fmt bgra -q:v 75 -tag:v hvc1 -movflags +faststart -an \
    "$OUT/warmup-small.mov"

  echo "▸ warmup-poster.webp — первый кадр"
  ffmpeg -v error -y -i "$SRC" -vf "$CLEAN" -frames:v 1 -pix_fmt rgba "$TMP/poster.png"
  cwebp -quiet -q 80 -alpha_q 90 "$TMP/poster.png" -o "$OUT/warmup-poster.webp"
fi

# Анимированный WebP: $1 — имя файла, $2 — фильтр масштаба (пусто — без него).
# Кадры идут в png, дальше их собирает Pillow: ffmpeg собран без libwebp.
anim() {
  local out="$1" scale="${2:+,$2}"
  rm -f "$TMP"/*.png
  ffmpeg -v error -y -i "$SRC" -vf "${ANIM_FRAMES},${CLEAN}${scale},format=rgba,${ALPHA_SNAP}" \
    -fps_mode passthrough -start_number 0 "$TMP/f%03d.png"
  python3 - "$TMP" "$OUT/$out" "$ANIM_Q" "$ANIM_ALPHA_Q" <<'PY'
import glob
import sys

from PIL import Image

tmp, out, quality, alpha_quality = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
frames = [Image.open(f).convert('RGBA') for f in sorted(glob.glob(tmp + '/f*.png'))]
# 12 к/с — это 83⅓ мс на кадр, а длительность в WebP целая: 83, 83 и 84 мс
# дают ровно 250 мс на три кадра, и петля из 120 кадров идёт ровно 10 с.
duration = [84 if i % 3 == 2 else 83 for i in range(len(frames))]
frames[0].save(
    out, 'WEBP', save_all=True, append_images=frames[1:], duration=duration, loop=0,
    lossless=False, quality=quality, alpha_quality=alpha_quality, method=6,
    background=(0, 0, 0, 0),
)
PY
}

echo "▸ warmup-anim.webp — анимированный WebP, ${SMALL_W}x${SMALL_H}, 12 к/с"
anim warmup-anim.webp "scale=${SMALL_W}:${SMALL_H}:flags=lanczos"

echo "▸ warmup-anim-lg.webp — то же, ${CROP_W}x${CROP_H}"
anim warmup-anim-lg.webp

echo
for f in warmup.webm warmup-small.webm warmup-anim.webp warmup-anim-lg.webp \
         warmup.mov warmup-small.mov warmup-poster.webp; do
  size="$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height \
          -of csv=p=0:s=x "$OUT/$f" 2>/dev/null || echo '?')"
  printf '  %-20s %7s KB  %s\n' "$f" \
    "$(( $(stat -f%z "$OUT/$f") / 1024 ))" "$size"
done

echo
echo "Готово. Файлы в $OUT"
echo "Проверить альфу в webm: ffmpeg -c:v libvpx-vp9 -i $OUT/warmup.webm -frames:v 1 -pix_fmt rgba /tmp/f0.png"
