#!/usr/bin/env bash
# Сжимает музыку для плеера.
#
# Исходники — mp3 128 кбит/с (~41 МБ на 13 треков). На выходе AAC 64 кбит/с
# в .m4a через кодировщик Apple AudioToolbox: он заметно лучше встроенного
# на низком битрейте, а формат понимают все браузеры без исключений.
#
# Запуск: bash scripts/build-music.sh "/путь/к/Архив 2"

set -euo pipefail

SRC_DIR="${1:-$HOME/Downloads/Архив 2}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/public/music"
BITRATE=64k

mkdir -p "$OUT"

# Кодировщик Apple, если доступен, иначе встроенный.
if ffmpeg -hide_banner -encoders 2>/dev/null | grep -q aac_at; then
  ENC=(-c:a aac_at -b:a "$BITRATE")
else
  ENC=(-c:a aac -b:a "$BITRATE")
fi

slug_for() {
  case "$1" in
    Dark\ Eyes\ Speed*)   echo dark-eyes-speed ;;
    Findmyname\ Rebel*)   echo findmyname-rebel ;;
    Hugel\ Movin*)        echo hugel-movin-to-the-sun ;;
    Imael\ Angel\ Bad*)   echo imael-angel-bad-times ;;
    Jim\ Funk\ Beat*)     echo jim-funk-beat-the-heat-waves ;;
    John\ Balaya*)        echo john-balaya-nicoteen ;;
    Kean\ Dysso*)         echo kean-dysso-vibemaster ;;
    Moonlght\ Free\ Bird*) echo moonlght-free-bird ;;
    Pelyuh\ Bad*)         echo pelyuh-bad ;;
    Radwulf\ No\ Stopping*) echo radwulf-no-stopping ;;
    Ryan\ Blyth\ Show\ Me*) echo ryan-blyth-show-me ;;
    Ship\ Wrek\ Stimulate*) echo ship-wrek-stimulate ;;
    Tony\ Dark\ Eyes\ Games*) echo tony-dark-eyes-games ;;
    *)                    echo "" ;;
  esac
}

for f in "$SRC_DIR"/*.mp3; do
  [ -e "$f" ] || continue
  base="$(basename "$f")"
  slug="$(slug_for "$base")"
  [ -n "$slug" ] || { echo "· пропуск: $base"; continue; }

  # -map_metadata -1 убирает обложки: они весят больше самого звука.
  ffmpeg -v error -y -i "$f" -vn -map_metadata -1 \
    "${ENC[@]}" -ar 44100 -ac 2 -movflags +faststart \
    "$OUT/$slug.m4a"

  printf '▸ %-32s %6s -> %s\n' "$slug" "$(du -h "$f" | cut -f1)" "$(du -h "$OUT/$slug.m4a" | cut -f1)"
done

echo "Готово. Музыка в $OUT"
