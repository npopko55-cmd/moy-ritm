#!/usr/bin/env python3
"""Возвращает нормальные пропорции сплющенным роликам «Спины».

Зачем. Часть роликов потока «Размять спину» сгенерировалась сплющенной по
высоте: парень в них ниже и шире, голова крупнее, а буквы «МОЙ РИТМ» на
кофте заметно шире и ниже, чем в остальных роликах (тестирование 28.10 и
задача Софии 02.11.2026: «убрать сжатую версию, привести к единому
формату»). Эталон — «Раскрытие рук в стороны» и другие ролики первой партии.

Как правим. Кадр сужается по ширине в FACTOR раз (по высоте не трогаем —
голова и кроссовки остаются на своих местах), а освободившиеся поля слева и
справа заполняются продолжением крайних столбцов кадра: у краёв там пустая
студия, и граница поля не видна. Коэффициент 1,35 подобран по буквам
логотипа и силуэту рядом с эталонами. Правка покадровая, поэтому петля
остаётся петлёй: стык не меняется.

Источник — готовый ролик из public/loops (уже вырезанная петля 640×640), а
не исходник генерации: так не нужно заново искать петлю. Кодирование — как у
scripts/build-loops-v2.py (H.264 High, CRF 24, preset slow, tune animation,
без звука), постер — первый кадр 320×320, cwebp -q 75.

Сделанное отмечается в манифесте полем "unsquash": повторный запуск тот же
ролик второй раз не сузит. Если ролик пересобран build-loops-back.py заново
(--rebuild), сборщик пишет его сплющенным и снимает отметку — тогда этот
скрипт нужно запустить снова.

После правки поднимите rev у ролика в src/data/loops.ts: адрес ролика
меняется (?v=…), иначе телефоны неделю показывают старую версию из кэша.

Запуск (из папки frontend):
    python3 scripts/unsquash-back-loops.py back-shoulder-rotations back-palm-turns
"""

import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'loops')
MANIFEST = os.path.join(HERE, 'loops-back-manifest.json')
SIDE = 640
FACTOR = 1.35


def narrow_width() -> tuple[int, int]:
    """Ширина сжатого кадра и поле с каждой стороны — чётные: так требует yuv420p."""
    width = int(SIDE / FACTOR) // 4 * 4
    return width, (SIDE - width) // 2


def fix(slug: str) -> None:
    src = os.path.join(OUT, f'{slug}.mp4')
    width, pad = narrow_width()
    tmp = tempfile.mkdtemp()
    mp4 = os.path.join(tmp, f'{slug}.mp4')
    graph = (
        f'scale={width}:{SIDE}:flags=lanczos,format=yuv444p,'
        f'pad={SIDE}:{SIDE}:{pad}:0,fillborders=left={pad}:right={pad}:mode=smear,'
        'format=yuv420p'
    )
    subprocess.run(
        ['ffmpeg', '-v', 'error', '-y', '-i', src, '-vf', graph,
         '-c:v', 'libx264', '-profile:v', 'high', '-crf', '24', '-preset', 'slow',
         '-tune', 'animation', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
         '-use_editlist', '0', '-an', mp4],
        check=True,
    )
    png = os.path.join(tmp, 'poster.png')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', mp4, '-frames:v', '1',
                    '-vf', 'scale=320:320', png], check=True)
    subprocess.run(['cwebp', '-quiet', '-q', '75', png, '-o',
                    os.path.join(OUT, f'{slug}.webp')], check=True)
    os.replace(mp4, src)


def main() -> None:
    slugs = sys.argv[1:]
    if not slugs:
        sys.exit(__doc__)
    with open(MANIFEST, encoding='utf-8') as fh:
        manifest = json.load(fh)
    by_id = {entry.get('id'): entry for entry in manifest.values()}
    for slug in slugs:
        entry = by_id.get(slug)
        if entry is None:
            sys.exit(f'{slug}: такого ролика в манифесте «Спины» нет')
        if entry.get('unsquash'):
            print(f'{slug}: уже исправлен (×{entry["unsquash"]}), пропускаю')
            continue
        fix(slug)
        entry['unsquash'] = FACTOR
        print(f'{slug}: ×{FACTOR} по высоте, ролик и постер пересобраны')
    with open(MANIFEST, 'w', encoding='utf-8') as fh:
        json.dump(dict(sorted(manifest.items())), fh, ensure_ascii=False, indent=2)
        fh.write('\n')


if __name__ == '__main__':
    main()
