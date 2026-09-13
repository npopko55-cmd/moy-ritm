#!/usr/bin/env bash
#
# Выкладка фронтенда на боевой сервер «Моего ритма».
#
#   scripts/deploy-server.sh                      # на ritmritm.ru
#   SERVER=root@1.2.3.4 scripts/deploy-server.sh  # на другой хост
#   scripts/deploy-server.sh root@1.2.3.4         # то же самое параметром
#
# Что делает: собирает статику с боевым адресом API и синхронизирует dist/ в
# /opt/moyritm/www на сервере. Куски кода прошлых сборок в assets/ сразу не
# удаляет — держит неделю (шаг 4). Сборку для GitHub Pages не трогает — это
# другая команда (GITHUB_PAGES=true npm run build) и другое место.
#
# Переменные:
#   SERVER      куда класть, в виде user@host        (root@ritmritm.ru)
#   REMOTE_DIR  каталог статики на сервере            (/opt/moyritm/www)
#   VITE_API_URL адрес API вместе с версией           (https://ritmritm.ru/api/v1)
#   DRY_RUN=1   показать, что изменится, и не менять
#
# Сайт и API живут на одном хосте, поэтому адрес API — относительный по домену
# (/api/v1 у того же ritmritm.ru), а не api.ritmritm.ru: так cookie
# refresh-токена остаётся однодоменной, а CORS вообще не участвует.

set -euo pipefail

SERVER="${1:-${SERVER:-root@ritmritm.ru}}"
REMOTE_DIR="${REMOTE_DIR:-/opt/moyritm/www}"
export VITE_API_URL="${VITE_API_URL:-https://ritmritm.ru/api/v1}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$ROOT/dist"

log()  { printf '\n\033[1m== %s\033[0m\n' "$*"; }
info() { printf '   %s\n' "$*"; }
die()  { printf '\nОШИБКА: %s\n' "$*" >&2; exit 1; }

cd "$ROOT"

# ── 1. Сборка ────────────────────────────────────────────────────────────────
log "1/4 Сборка с VITE_API_URL=$VITE_API_URL"
# GITHUB_PAGES снимаем явно: если он остался в окружении от прошлой команды,
# сборка уедет с базой /moy-ritm/ и на своём сервере не найдёт ни одного файла.
unset GITHUB_PAGES
npm run build

# ── 2. Проверки перед отправкой ──────────────────────────────────────────────
log "2/4 Проверяю сборку"
[ -f "$DIST/index.html" ] || die "нет $DIST/index.html"
[ -f "$DIST/sw.js" ]      || die "нет $DIST/sw.js — не отработал scripts/build-sw.mjs"

# База должна быть корневой. Ссылки вида /moy-ritm/assets/... — это сборка для
# GitHub Pages, на своём сервере она отдаст пустую страницу.
if grep -q '"/moy-ritm/\|src="/moy-ritm/\|href="/moy-ritm/' "$DIST/index.html"; then
    die "в index.html база /moy-ritm/ — это сборка для GitHub Pages"
fi
grep -q "const BASE = '/'" "$DIST/sw.js" || die "в sw.js база не корневая"

# Адрес API не должен указывать на ноутбук разработчика.
if grep -rl 'localhost:8000\|127\.0\.0\.1:8000' "$DIST/assets" >/dev/null 2>&1; then
    die "в бандле остался адрес localhost — проверьте VITE_API_URL и .env.local"
fi
grep -rq "$VITE_API_URL" "$DIST/assets" \
    || die "в бандле нет адреса $VITE_API_URL — сборка ушла в демо-режим"

info "index.html и sw.js с базой /, адрес API в бандле: $VITE_API_URL"

# ── 3. Отправка ──────────────────────────────────────────────────────────────
log "3/4 Отправляю в $SERVER:$REMOTE_DIR"
# Два прохода, и порядок важен.
#
# Сначала assets/ — без --delete. Новые куски должны лежать на сервере раньше,
# чем приедет index.html, который на них ссылается. А старые удалять сразу
# нельзя: вкладка, открытая до выкладки, при переходе на другой экран попросит
# свой старый кусок и получила бы 404. Их через неделю убирает шаг 4.
#
# Потом всё остальное — с --delete: каталог остаётся зеркалом dist, иначе
# sw.js кэшировал бы то, чего уже нет в index.html. assets/ в этом проходе
# исключён, а исключённое rsync не удаляет (без --delete-excluded).
#
# Флаги нарочно самые простые: на маке rsync версии 2.6.9, и --info= он не
# знает. Поэтому и два прохода с --exclude, а не правила --filter.
RSYNC_FLAGS=(-az)
[ "${DRY_RUN:-0}" = "1" ] && RSYNC_FLAGS+=(-n -v)

ssh -o BatchMode=yes "$SERVER" "mkdir -p '$REMOTE_DIR/assets'"
rsync "${RSYNC_FLAGS[@]}" "$DIST/assets"/ "$SERVER:$REMOTE_DIR/assets"/
rsync "${RSYNC_FLAGS[@]}" --delete --exclude='/assets/' "$DIST"/ "$SERVER:$REMOTE_DIR"/

if [ "${DRY_RUN:-0}" = "1" ]; then
    info "это была примерка (DRY_RUN=1), на сервере ничего не изменилось"
    exit 0
fi

# Статику читает nginx от www-data, а владельцем каталога должен остаться
# пользователь сервиса.
ssh -o BatchMode=yes "$SERVER" "chown -R moyritm:moyritm '$REMOTE_DIR' && find '$REMOTE_DIR' -type d -exec chmod 755 {} + && find '$REMOTE_DIR' -type f -exec chmod 644 {} +"

# ── 4. Уборка старых кусков ─────────────────────────────────────────────────
log "4/4 Убираю из assets/ старые куски"
# Удаляем только то, что одновременно старше семи дней и не упомянуто ни в
# текущем index.html, ни в текущем sw.js (там перечислены все куски сборки).
# rsync -a приносит файлы со временем сборки, поэтому куски текущей выкладки
# под «старше недели» не попадают, а проверка ссылок — вторая страховка.
ssh -o BatchMode=yes "$SERVER" "cd '$REMOTE_DIR' && find assets -type f -mtime +7 | while IFS= read -r f; do grep -qF \"\${f#assets/}\" index.html sw.js || rm -f -- \"\$f\"; done"

info "готово. Проверить: curl -sI https://ritmritm.ru/ | head -3"
