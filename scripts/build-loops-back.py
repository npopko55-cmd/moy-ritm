#!/usr/bin/env python3
"""Собирает зацикленные ролики нового потока — по умолчанию «Размять спину».

Зачем отдельный скрипт. scripts/build-loops-v2.py собрал 45 движений
девушки-маскота и держит их петли в loops-v2-manifest.json. Его поведение
трогать нельзя: перезапуск с другим источником переписал бы чужой манифест
и мог бы пересобрать готовые ролики. Поэтому здесь только то, что у нового
потока своё, а вся математика — оценка стыка S, кодирование под loop,
постер — берётся из build-loops-v2.py как есть (импорт, без копии кода):
одна формула S на все потоки, и вердикты «чисто/на грани/рвано» сравнимы.

Чем новый поток отличается от v2:
  • источник — квадрат 940×940, 24 к/с, но длина разная: 112–281 кадр
    (4,7–11,7 с), а не ровно 97. Петля ищется по всей длине ролика;
  • маскот — парень в синей кофте и тёмных джинсах на светлой студии.
    Синяя кофта ловится насыщенностью, как жёлтая форма у v2. А тёмно-синие
    джинсы почти не насыщенные и в упражнениях на спину почти не двигаются:
    медиана кадров там — сами джинсы, и «отличие от пустой студии» их не
    видит. Поэтому в маску фигуры добавлено «темнее FIG_DARK» — на светлой
    студии темнее только фигура и её тень у ног;
  • длинные ролики (8–11 с) — в них движение повторяется 2–3 раза. Петля не
    длиннее MAX_LOOP (6 с): дольше одного-двух повторов смотреть незачем,
    а длинный отрезок захватывает «разгон» генерации. Из чистых петель
    берётся самая длинная — повтор меньше бросается в глаза, — но не ценой
    шва: S не хуже лучшей больше чем на LONGER_COST;
  • фон не нужен: квадрат уже квадрат, ролик целиком масштабируется до
    640×640 (ветка «квадрат помещается в кадр» из v2, env.png не участвует,
    почему без обрезки по фигуре — в process());
  • имена движений и найденные петли — в своём манифесте
    (scripts/loops-<поток>-manifest.json), id — с префиксом потока.

Проверка готового ролика — независимая от S: готовый mp4 склеивается сам
с собой (concat ×2, как его крутит браузер с атрибутом loop), и разница
кадров на стыке сравнивается с обычной разницей соседних кадров — простое
среднее модуля разности по всему кадру 160×160 в оттенках серого, без
маски и допусков. loop_check ≈ 1 — стык не отличить от обычного шага,
loop_check_p90 — то же к 90-му процентилю соседних разниц.

Рваный стык не замазывается кроссфейдом (правило владельца): такой ролик
собирается по лучшей петле и остаётся с вердиктом «рвано» в манифесте.

Запуск (из папки frontend):
    python3 scripts/build-loops-back.py                     # поток «спина»
    python3 scripts/build-loops-back.py --analyze           # только петли, без сборки
    python3 scripts/build-loops-back.py --only 3,7          # по номерам исходников
    python3 scripts/build-loops-back.py --src DIR --prefix neck \\
        --manifest scripts/loops-neck-manifest.json         # следующий поток

Имена. В манифесте у каждого исходника есть id и title. Для нового потока
манифеста ещё нет — id выдаются как <префикс>-01, -02… по порядку имён, title
пустой. Чтобы переименовать: вписать id и title в манифест и запустить
с --only N --rebuild — ролик пересоберётся под новым именем (старые
<префикс>-NN.* удалить руками).

Скрипт не пишет в public/loops ничего, что не начинается с «<префикс>-»:
чужие ролики не перезаписываются даже по ошибке в манифесте.
"""

import argparse
import importlib.util
import json
import os
import statistics
import subprocess
import sys
import tempfile
from concurrent.futures import ProcessPoolExecutor

from PIL import Image, ImageChops, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location('loops_v2', os.path.join(HERE, 'build-loops-v2.py'))
v2 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(v2)

MAX_LOOP = 6 * v2.FPS     # петля не длиннее 6 с
LONGER_COST = 0.2         # за длину петли платим не больше 0,2 к S лучшей
FIG_DARK = 90             # фигура — ещё и всё, что темнее этого (0–255, max канал)
MIN_SPAN = 0.5            # петля захватывает не меньше половины размаха движения ролика
SPAN_STRIDE = 3           # размах считается по кадрам через столько


class BackSeams(v2.Seams):
    """Seams из v2 с маской, которая видит тёмные джинсы, и поиском петли
    по фактической длине ролика с ограничением сверху."""

    def __init__(self, path, w, h):
        # Маска v2 строится в конструкторе родителя, а шаг фигуры M считается
        # там же по этой маске. Поэтому маску дополняем и M пересчитываем.
        super().__init__(path, w, h)
        grow = v2.ImageFilter.MaxFilter(2 * v2.SEAM_GROW + 1)
        for k, f in enumerate(self.shots):
            dark = v2.channel_max(f).point(lambda v: 255 if v < FIG_DARK else 0)
            dark = dark.filter(ImageFilter.MinFilter(3)).filter(grow)
            self.masks[k] = ImageChops.lighter(self.masks[k], dark)
        self.cache = {}
        self.step = max(statistics.median(self.dist(k, k + 1) for k in range(self.n - 1)), 0.05)

    def span(self, i, j):
        """Размах движения в петле [i, j): насколько дальше всего фигура
        уходит от кадра i (по кадрам через SPAN_STRIDE)."""
        return max(self.dist(i, k) for k in range(i, j, SPAN_STRIDE))

    def find(self):
        # Без проверки размаха поиск находил «петли» в неподвижной позе: у
        # «Наклонов с руками вверх» самой чистой оказалась секунда, когда парень
        # стоит с поднятыми руками в конце ролика, — шов идеальный, движения
        # нет. Поэтому петля должна захватывать не меньше MIN_SPAN размаха
        # всего ролика (самой большой разницы поз в нём).
        whole = max(self.dist(a, b) for a in range(0, self.n, SPAN_STRIDE)
                    for b in range(a + SPAN_STRIDE, self.n, SPAN_STRIDE))
        cands = [(self.score(i, j), i, j)
                 for i in range(1, self.n - 1)
                 for j in range(i + v2.MIN_LOOP, min(i + MAX_LOOP, self.n - 2) + 1)]
        moving = [c for c in cands if self.span(c[1], c[2]) >= MIN_SPAN * whole]
        cands = moving or cands
        self.whole = whole
        best = min(c[0] for c in cands)
        if best <= v2.SEAM_CLEAN:
            # Есть чистая петля: берём самую длинную из чистых, что хуже лучшей
            # не больше чем на LONGER_COST (или на 10 %, как в v2, если это больше).
            limit = min(v2.SEAM_CLEAN, max(best * v2.NEAR_BEST, best + LONGER_COST))
        else:
            limit = best * v2.NEAR_BEST
        pool = [c for c in cands if c[0] <= limit]
        score, i, j = max(pool, key=lambda c: (c[2] - c[1], -c[0]))
        return i, j, score


def mask_preview(path, w, h, out_png):
    """Контроль маски: 6 кадров, фигура по маске подсвечена красным."""
    seams = BackSeams(path, w, h)
    picks = [round(k * (seams.n - 1) / 5) for k in range(6)]
    tiles = []
    for k in picks:
        red = Image.new('RGB', seams.shots[k].size, (255, 0, 0))
        tiles.append(Image.composite(Image.blend(seams.shots[k], red, 0.45), seams.shots[k], seams.masks[k]))
    sheet = Image.new('RGB', (tiles[0].width * 6, tiles[0].height))
    for n, t in enumerate(tiles):
        sheet.paste(t, (n * t.width, 0))
    sheet.save(out_png)


# ─────────────  Независимая проверка готового ролика  ─────────────

def loop_check(mp4):
    """Ролик ×2 через concat: разница кадров на стыке к обычной разнице соседних."""
    with tempfile.TemporaryDirectory() as tmp:
        lst = os.path.join(tmp, 'list.txt')
        with open(lst, 'w') as fh:
            # Путь в списке concat считается от папки списка — поэтому абсолютный.
            fh.write("file '{0}'\nfile '{0}'\n".format(os.path.abspath(mp4).replace("'", "'\\''")))
        side = 160
        data = subprocess.run(
            ['ffmpeg', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', lst,
             '-vf', f'scale={side}:{side}:flags=area', '-fps_mode', 'passthrough',
             '-f', 'rawvideo', '-pix_fmt', 'gray', '-'],
            capture_output=True, check=True).stdout
    size = side * side
    shots = [data[k:k + size] for k in range(0, len(data) - size + 1, size)]
    n = len(shots) // 2

    def mad(a, b):
        return sum(abs(x - y) for x, y in zip(a, b)) / size

    # Соседние пары внутри одного прохода — без пары на стыке.
    inner = [mad(shots[k], shots[k + 1]) for k in range(n - 1)]
    seam = mad(shots[n - 1], shots[n])
    med = max(statistics.median(inner), 0.01)
    p90 = max(sorted(inner)[int(0.9 * (len(inner) - 1))], 0.01)
    return {'frames_x2': len(shots), 'seam_mad': round(seam, 2), 'adjacent_mad_median': round(med, 2),
            'loop_check': round(seam / med, 2), 'loop_check_p90': round(seam / p90, 2)}


# ─────────────  Один исходник  ─────────────

def process(job):
    """Петля, сборка и проверка одного ролика. Возвращает запись манифеста и строку лога."""
    path, name, num, slug, title, prev, opts = job
    w, h = v2.probe(path)
    seams = BackSeams(path, w, h)
    best = v2.loop_entry(path, w, h, seams, *seams.find()[:2])
    out = os.path.join(v2.OUT, f'{slug}.mp4')
    # Петля, уже собранная и записанная в манифест, остаётся — если не просили
    # --rebuild: повторный прогон не должен молча менять готовые ролики.
    keep = prev and 'i' in prev and os.path.exists(out) and not opts['rebuild']
    loop = v2.loop_entry(path, w, h, seams, prev['i'], prev['j']) if keep else best
    entry = {'n': num, 'source': name, 'id': slug, 'title': title, 'size': [w, h],
             **loop, 'motion_span': round(seams.span(loop['i'], loop['j']) / seams.whole, 2),
             'best_found': {'i': best['i'], 'j': best['j'], 'seam_score': best['seam_score']}}
    line = (f"{num:2d} {slug:24s} {loop['i']:3d}–{loop['j']:3d} ({loop['seconds']:.2f} с из "
            f"{seams.n / v2.FPS:.1f}) S {loop['seam_score']:5.2f} {loop['seam']:8s} размах {entry['motion_span']}")
    if opts['analyze']:
        return entry, line
    if keep:
        entry.update({k: prev[k] for k in ('square_side', 'mp4_kb', 'webp_kb', 'check') if k in prev})
        return entry, line + ' → оставлен'
    # Кадр берётся целиком, без обрезки по рамке фигуры. Рамка v2 ищет фигуру
    # по «насыщеннее или темнее фона» и не видит белых кроссовок на светлом
    # полу: у «Вращений в плечах» квадрат срезал ступни. К тому же обрезка у
    # каждого ролика своя, и в круге плеера парень менял бы рост от движения
    # к движению. Генерации потока сняты одним планом — фигура и так занимает
    # кадр по высоте, поэтому рамка = весь кадр (сторона квадрата = высота).
    box = [0, 0, w, h]
    blank = Image.new('RGB', (8, 8))   # фон не участвует: квадрат помещается в кадр
    built = v2.build(path, w, h, blank, loop, box, slug)
    entry.pop('figure_box', None)
    entry['square_side'] = built['square_side']
    entry['mp4_kb'] = built['mp4_kb']
    entry['webp_kb'] = built['webp_kb']
    entry['check'] = loop_check(out)
    return entry, line + f" → {built['mp4_kb']} КБ, стык ×2 {entry['check']['loop_check']}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default=os.path.expanduser('~/Downloads/untitled folder'))
    ap.add_argument('--prefix', default='back', help='префикс id потока')
    ap.add_argument('--manifest', default=os.path.join(HERE, 'loops-back-manifest.json'))
    ap.add_argument('--only', default='', help='номера исходников через запятую (по порядку имён)')
    ap.add_argument('--analyze', action='store_true', help='только петли, без сборки и записи манифеста')
    ap.add_argument('--rebuild', action='store_true', help='пересобрать по лучшей петле, даже если ролик уже есть')
    ap.add_argument('--mask-preview', default='', help='папка для картинок контроля маски фигуры')
    ap.add_argument('--jobs', type=int, default=6)
    args = ap.parse_args()

    names = sorted(f for f in os.listdir(args.src) if f.endswith('.mp4'))
    only = {int(x) for x in args.only.split(',') if x.strip()}
    manifest = {}
    if os.path.exists(args.manifest):
        with open(args.manifest, encoding='utf-8') as fh:
            manifest = json.load(fh)
    os.makedirs(v2.OUT, exist_ok=True)
    opts = {'analyze': args.analyze, 'rebuild': args.rebuild}

    jobs = []
    for num, name in enumerate(names, 1):
        if only and num not in only:
            continue
        prev = manifest.get(name, {})
        slug = prev.get('id') or f'{args.prefix}-{num:02d}'
        if not slug.startswith(args.prefix + '-'):
            sys.exit(f'{name}: id «{slug}» без префикса «{args.prefix}-» — не собираю, чтобы не задеть чужие ролики')
        path = os.path.join(args.src, name)
        if args.mask_preview:
            os.makedirs(args.mask_preview, exist_ok=True)
            mask_preview(path, *v2.probe(path), os.path.join(args.mask_preview, f'{num:02d}.png'))
            continue
        jobs.append((path, name, num, slug, prev.get('title', ''), prev, opts))
    if args.mask_preview:
        return

    with ProcessPoolExecutor(max_workers=args.jobs) as pool:
        for entry, line in pool.map(process, jobs):
            print(line, flush=True)
            manifest[entry['source']] = entry

    if not args.analyze:
        with open(args.manifest, 'w', encoding='utf-8') as fh:
            json.dump(dict(sorted(manifest.items())), fh, ensure_ascii=False, indent=2)
            fh.write('\n')


if __name__ == '__main__':
    sys.exit(main())
