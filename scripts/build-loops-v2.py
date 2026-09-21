#!/usr/bin/env python3
"""Собирает ролики с движениями второго поколения: 3D-маскот из Higgsfield.

Источник. ~/Downloads/archive-3/*.mp4 — 47 генераций Higgsfield: 720×1280
(один 960×960), 97 кадров, 24 к/с, 4,04 с. Героиня везде одна — девушка-маскот
в жёлтой форме на светлом студийном фоне, движение повторяется по кругу.
Фон. ~/Downloads/env.png — та же светлая тёплая студия, 2048×2048.

Петля. Генерация не зациклена: первый и последний кадры не совпадают, и
плеер с атрибутом loop дёргался бы на стыке. Поэтому из ролика вырезается
отрезок [i, j), где кадр j почти повторяет кадр i: после j−1 снова идёт i,
и шов выглядит как обычная смена соседних кадров. Кадры сравниваются
уменьшенными до 90 px по ширине, в оттенках серого, по MSE. Одной позы мало:
на стыке должно совпадать и направление движения (рука, идущая вверх, не
должна продолжиться рукой, идущей вниз), поэтому к MSE(i, j) добавляется
среднее MSE соседей — (i+1, j+1) и (i−1, j−1). Петля не короче секунды
(j − i ≥ 24). Из почти равных (не хуже лучшей в 1,3 раза) берётся та, что
начинается не раньше 4-го кадра — у генераций бывает «разгон», — а если среди
них есть в 1,6 раза длиннее (два цикла движения вместо одного), то она: так
повтор меньше бросается в глаза. Шов чистый, если MSE(i, j) не больше двух
медиан MSE соседних кадров того же ролика. Ролики без чистого шва не
собираются: кроссфейд на стыке дал бы полупрозрачную «двойную» фигуру.

Квадрат. Плеер показывает ролик в круге, а вертикальная фигура в квадрат
по ширине кадра не влезает. Поэтому ролик кладётся поверх env.png:
  • рамка фигуры ищется по всем кадрам петли — пиксели, заметно отличающиеся
    от фона своей строки (фон берётся по краям кадра);
  • сторона квадрата — высота рамки / 0,9 (фигура ≈ 90 % высоты, как у
    роликов первого поколения), центр по вертикали — центр рамки, по
    горизонтали — центр кадра или рамки, если фигура смещена;
  • env.png масштабируется в квадрат этой стороны, ролик — по центру;
  • цвет ролика подгоняется к фону поканально — «фон / ролик», — но плавной
    картой, а не одним числом: у генераций свой прожектор, центр светлее
    краёв, и общий коэффициент по краям оставлял светлую полосу вокруг
    фигуры. Студия ролика без фигуры — попиксельный максимум по кадрам петли
    с заполнением того, что фигура не открывает; карта = размытый env.png /
    размытая студия ролика. Шов проверяется на полосах 25, 50 и 85 % высоты:
    где растушёвка кончается, яркость ролика должна совпасть с фоном;
  • края ролика растворяются: 110 px исходника с каждой стороны по кривой
    (x/110)^1,6.
Если квадрат уже помещается в кадр (исходник 960×960), фон не нужен:
ролик просто обрезается до квадрата.

Выход — public/loops/<id>.mp4 (H.264 High, CRF 24, preset slow, tune animation,
640×640, yuv420p, faststart, без звука; под loop — без B-кадров, с одним опорным
кадром и без edit list, почему — в build()) и постер <id>.webp — первый кадр
петли, 320×320, cwebp -q 75. Таблица найденных петель и рамок пишется
в scripts/loops-v2-manifest.json.

Зависимости: ffmpeg, cwebp и Pillow (numpy не нужен).

Запуск:
    python3 scripts/build-loops-v2.py              # все ролики из SOURCES
    python3 scripts/build-loops-v2.py --only 1,5   # по номерам исходников
    python3 scripts/build-loops-v2.py --analyze    # только петли и рамки
    python3 scripts/build-loops-v2.py --src DIR --env FILE
"""

import argparse
import json
import os
import statistics
import subprocess
import sys
import tempfile

from PIL import Image, ImageChops, ImageFilter, ImageMath, ImageStat

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'loops')
MANIFEST = os.path.join(ROOT, 'scripts', 'loops-v2-manifest.json')

SIZE = 640
POSTER_SIZE = 320
FPS = 24

MIN_LOOP = 24          # петля не короче секунды
NEAR_BEST = 1.3        # «почти так же хороша», как лучшая
LONGER = 1.6           # во столько раз длиннее — значит, два цикла, а не один
SKIP_HEAD = 4          # первые кадры генерации — «разгон»
CLEAN_SEAM = 2.0       # шов чистый, если MSE ≤ 2 медианы соседних кадров
FIGURE_SHARE = 0.9     # доля высоты квадрата под фигуру
FEATHER = 110          # растушёвка краёв ролика, px исходника
FEATHER_CURVE = 1.6
COLOR_LEVELS = (0.25, 0.5, 0.85)
SAT_STEP = 35          # рамка фигуры: насыщеннее фона строки на столько
DARK_STEP = 45         # …или темнее на столько (0–255)
GAIN_GRID = 8          # карта подгонки цвета считается на сетке 1/8 кадра
GAIN_BLUR = 1          # и чуть размывается от шума сжатия

# Исходник → id движения. Ключ — первые 8 знаков uuid в имени файла
# hf_<дата>_<время>_<uuid>.mp4, в комментарии — номер исходника по порядку
# имён (он же в --only и в манифесте). Исходника нет в таблице — он не собирается
# (в --analyze всё равно попадёт в манифест).
SOURCES = {
    '1b4e3fec': 'knee-lifts',           # 1
    '890239e0': 'alternate-reach',      # 2
    '468e0d28': 'step-out-arms',        # 3
    '59a6ee5c': 'knee-to-elbow',        # 4
    '3acd9157': 'elbow-raises',         # 5
    '8291a22a': 'arms-up-steps',        # 6
    '22153e03': 'run-in-place',         # 7
    '9d8345c6': 'march',                # 8
    '7124b209': 'punches-up',           # 9
    '2106638c': 'arm-crosses',          # 10
    'a295ad66': 'arm-crosses-steps',    # 11
    '13b8c67a': 'twist',                # 12
    '364debe4': 'side-knee-crunch',     # 13
    'e3eaf841': 'step-out-bent-arms',   # 14
    'f9bc4930': 'dance-steps',          # 15
    'efde4621': 'steps-arm-swings',     # 16
    # 17 34dcce72 — чистой петли нет: движение не повторяется за 4 с
    '78df2dcb': 'side-steps',           # 18
    'a0780bf4': 'boxer-bounce',         # 19
    '4e2e453d': 'punches',              # 20
    '72e0cca7': 'arms-to-shoulders',    # 21
    '7dab1595': 'side-step-reach',      # 22
    'b739b692': 'jog',                  # 23
    '6fc5e6b0': 'squat-steps',          # 24
    'cd3af0bc': 'step-arm-swing',       # 25
    '3f68995f': 'steps-reach-up',       # 26
    # 27 13d7cfc4 — чистой петли нет: шов в 4 раза больше шага между кадрами
    '5fa85d80': 'walk-in-place',        # 28
    'ae5bc555': 'twist-knee',           # 29
    'ba6f1ecc': 'arm-scissors',         # 30
    '3d74ed97': 'boxer-steps',          # 31
    '049c2397': 'arm-swings-clap',      # 32
    '3752bc68': 'overhead-press',       # 33
    '5ec7a411': 'chest-crosses',        # 34
    '302afd4e': 'chest-crosses-steps',  # 35
    'c30a5f2a': 'jumping-jacks',        # 36
    '11cbf1c4': 'low-crosses',          # 37
    'f9c2668f': 'diagonal-swings',      # 38
    '15ee98fd': 'step-arm-out',         # 39
    '1c9b90ca': 'light-jog',            # 40
    '7aeb4ce1': 'step-clap',            # 41
    '47779d66': 'side-pushes',          # 42
    'edbebea4': 'arms-up',              # 43
    '12fa060c': 'diagonal-punches',     # 44
    'bbe86f52': 'side-lunges',          # 45
    '914f4603': 'jazz-hands',           # 46
    'fe399d16': 'twist-steps',          # 47
}


# ─────────────  Кадры  ─────────────

def probe(path):
    out = subprocess.run(
        ['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries',
         'stream=width,height', '-of', 'csv=p=0', path],
        capture_output=True, text=True, check=True).stdout
    w, h = out.strip().split(',')[:2]
    return int(w), int(h)


def frames(path, w, h, mode='L', start=None, end=None, crop=None):
    """Кадры ролика, уменьшенные до w×h; start/end — отрезок [start, end),
    crop — (ширина, высота, x, y) уже уменьшенного кадра."""
    vf = f'scale={w}:{h}:flags=area' if mode == 'L' else f'scale={w}:{h}:flags=lanczos'
    if crop:
        vf += ',crop={}:{}:{}:{}'.format(*crop)
        w, h = crop[0], crop[1]
    if start is not None:
        vf = f'trim=start_frame={start}:end_frame={end},' + vf
    pix = 'gray' if mode == 'L' else 'rgb24'
    data = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', path, '-vf', vf, '-fps_mode', 'passthrough',
         '-f', 'rawvideo', '-pix_fmt', pix, '-'],
        capture_output=True, check=True).stdout
    size = w * h * (1 if mode == 'L' else 3)
    return [Image.frombytes(mode, (w, h), data[k:k + size]) for k in range(0, len(data) - size + 1, size)]


def mse(a, b):
    stat = ImageStat.Stat(ImageChops.difference(a, b))
    return sum(stat.sum2) / (a.width * a.height * len(stat.sum2))


# ─────────────  Петля  ─────────────

def find_loop(path, w, h):
    small = frames(path, 90, round(90 * h / w))
    n = len(small)
    m = [[0.0] * n for _ in range(n)]
    for a in range(n):
        for b in range(a + 1, n):
            m[a][b] = m[b][a] = mse(small[a], small[b])
    adjacent = statistics.median(m[k][k + 1] for k in range(n - 1))

    cands = []
    for i in range(n):
        for j in range(i + MIN_LOOP, n):
            around = [m[i + 1][j + 1]] if j + 1 < n else []
            if i > 0:
                around.append(m[i - 1][j - 1])
            if not around:
                continue
            direction = sum(around) / len(around)
            cands.append({'i': i, 'j': j, 'seam': m[i][j], 'dir': direction,
                          'score': m[i][j] + direction})
    best = min(c['score'] for c in cands)
    pool = [c for c in cands if c['score'] <= best * NEAR_BEST]
    late = [c for c in pool if c['i'] >= SKIP_HEAD]
    pool = late or pool
    base = min(pool, key=lambda c: c['score'])
    longer = [c for c in pool if c['j'] - c['i'] >= LONGER * (base['j'] - base['i'])]
    pick = min(longer, key=lambda c: c['score']) if longer else base
    return {
        'i': pick['i'], 'j': pick['j'], 'frames': pick['j'] - pick['i'],
        'seconds': round((pick['j'] - pick['i']) / FPS, 3),
        'seam_mse': round(pick['seam'], 1), 'direction_mse': round(pick['dir'], 1),
        'adjacent_median': round(adjacent, 1),
        'clean': pick['seam'] <= CLEAN_SEAM * adjacent,
        'total_frames': n,
    }


# ─────────────  Рамка фигуры  ─────────────

def figure_box(path, w, h, i, j):
    """Рамка фигуры по всем кадрам петли, в пикселях исходника.

    Фигура — то, что заметно насыщеннее или темнее фона своей строки: волосы
    рыжие, форма жёлтая, кожа тёплая, у белых кроссовок темнее подошва и тень
    под ними. Фон строки берётся по крайним полосам кадра. «Светлее фона» не
    считается: к центру кадра студия светлее, чем у краёв, и это давало
    ложную рамку до верха кадра.
    """
    q = 4
    bw, bh = w // q, h // q
    shots = [f.convert('HSV') for f in frames(path, bw, bh, 'RGB', i, j)]
    rows = [[] for _ in range(bh)]
    for f in shots:
        for x0 in (0, bw - 6):
            strip = f.crop((x0, 0, x0 + 6, bh)).resize((1, bh), Image.BOX).load()
            for y in range(bh):
                rows[y].append(strip[0, y])
    bg_col = Image.new('HSV', (1, bh))
    bg_col.putdata([tuple(int(statistics.median(p[c] for p in r)) for c in range(3)) for r in rows])
    _, bg_s, bg_v = bg_col.resize((bw, bh), Image.NEAREST).split()
    union = Image.new('L', (bw, bh), 0)
    for f in shots:
        _, s, v = f.split()
        saturated = ImageChops.subtract(s, bg_s).point(lambda d: 255 if d > SAT_STEP else 0)
        darker = ImageChops.subtract(bg_v, v).point(lambda d: 255 if d > DARK_STEP else 0)
        union = ImageChops.lighter(union, ImageChops.lighter(saturated, darker))
    union = union.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    box = union.getbbox() or (0, 0, bw, bh)
    return [box[0] * q, box[1] * q, box[2] * q, box[3] * q]


def square_for(w, h, box):
    """Сторона квадрата и его центр в пикселях исходника."""
    left, top, right, bottom = box
    side = min(round((bottom - top) / FIGURE_SHARE), h)
    cx = (left + right) / 2
    if abs(cx - w / 2) < 0.03 * w:
        cx = w / 2
    cy = min(max((top + bottom) / 2, side / 2), h - side / 2)
    if side <= w:
        cx = min(max(cx, side / 2), w - side / 2)
    return side, cx, cy


# ─────────────  Сборка кадра  ─────────────

def edge_mask(vw, vh, left, right, feather):
    """Маска ролика: растворяются только те края, что лежат внутри квадрата."""
    ramp = []
    for x in range(vw):
        a = 1.0
        if left and x < feather:
            a = min(a, (x / feather) ** FEATHER_CURVE)
        if right and vw - 1 - x < feather:
            a = min(a, ((vw - 1 - x) / feather) ** FEATHER_CURVE)
        ramp.append(round(255 * a))
    row = Image.new('L', (vw, 1))
    row.putdata(ramp)
    return row.resize((vw, vh), Image.NEAREST)


def band_mean(img, x0, x1, yc, half=8):
    box = (max(0, x0), max(0, yc - half), min(img.width, x1), min(img.height, yc + half))
    return ImageStat.Stat(img.crop(box)).mean


def empty_studio(shots):
    """Фон ролика без фигуры, уменьшенный в GAIN_GRID раз.

    Фигура темнее и насыщеннее студии, поэтому попиксельный максимум по кадрам
    петли — это студия везде, откуда фигура хоть раз ушла. Где не ушла
    (туловище, голова), пиксели заметно насыщеннее или темнее фона строки —
    их заполняем по строке между соседними пикселями студии.
    """
    top = shots[0]
    for f in shots[1:]:
        top = ImageChops.lighter(top, f)
    w, h = top.size
    px = top.load()
    hsv = top.convert('HSV').load()
    fig = Image.new('L', (w, h), 0)
    fpx = fig.load()
    for y in range(h):
        s_bg = (hsv[0, y][1] + hsv[w - 1, y][1]) / 2
        v_bg = (hsv[0, y][2] + hsv[w - 1, y][2]) / 2
        for x in range(w):
            if hsv[x, y][1] - s_bg > SAT_STEP or v_bg - hsv[x, y][2] > DARK_STEP:
                fpx[x, y] = 255
    fpx = fig.filter(ImageFilter.MaxFilter(3)).load()
    for y in range(h):
        x = 0
        while x < w:
            if not fpx[x, y]:
                x += 1
                continue
            end = x
            while end < w and fpx[end, y]:
                end += 1
            a = px[x - 1, y] if x > 0 else None
            b = px[end, y] if end < w else None
            for t in range(x, end):
                if a is None or b is None:
                    px[t, y] = a or b
                else:
                    u = (t - x + 1) / (end - x + 1)
                    px[t, y] = tuple(round(a[c] + (b[c] - a[c]) * u) for c in range(3))
            x = end
    return top


def layout(path, w, h, env, loop, box):
    """Где лежит ролик в квадрате, его маска и карта подгонки цвета."""
    side, cx, cy = square_for(w, h, box)
    k = SIZE / side
    vw, vh = round(w * k), round(h * k)
    x0 = round(SIZE / 2 - cx * k)
    y0 = min(max(round(SIZE / 2 - cy * k), SIZE - vh), 0)
    if vw >= SIZE:
        x0 = min(max(x0, SIZE - vw), 0)
    # Часть ролика, видная в квадрате: остальное не нужно ни кодеку, ни подгонке.
    left_x, right_x = max(x0, 0), min(x0 + vw, SIZE)
    crop = (right_x - left_x, SIZE, left_x - x0, -y0)
    left, right = x0 > 0, x0 + vw < SIZE
    feather = max(1, round(FEATHER * k))
    bg = env.resize((SIZE, SIZE), Image.LANCZOS)
    lay = {'side': side, 'vw': vw, 'vh': vh, 'crop': crop, 'x': left_x, 'w': crop[0],
           'left': left, 'right': right, 'feather': feather, 'bg': bg, 'gain': None}
    if not (left or right):
        return lay

    # Подгонка цвета — поканальное «среднее фона / среднее ролика», но не одним
    # числом на ролик, а плавной картой: у генераций свой прожектор, центр
    # кадра светлее краёв на 20–30 уровней, и общий коэффициент, подогнанный
    # по краям, оставлял вокруг фигуры светлую полосу.
    cw = crop[0]
    gw, gh = max(4, cw // GAIN_GRID), SIZE // GAIN_GRID
    shots = [f.resize((gw, gh), Image.BOX) for f in frames(path, vw, vh, 'RGB', loop['i'], loop['j'], crop)]
    studio = empty_studio(shots).filter(ImageFilter.GaussianBlur(GAIN_BLUR))
    under = bg.crop((left_x, 0, right_x, SIZE)).resize((gw, gh), Image.BOX).filter(ImageFilter.GaussianBlur(GAIN_BLUR))
    # Отношение считается на сетке и только потом растягивается: размывать
    # саму студию по краю кадра нельзя — там у неё крутой спад яркости, и
    # размытие занижало бы подгонку ровно там, где ролик встречается с фоном.
    lay['gain'] = [
        ImageMath.lambda_eval(
            lambda a: a['min'](a['max'](a['e'] / (a['v'] + 0.5), 0.6), 1.6),
            e=e.convert('F'), v=v.convert('F')).resize((cw, SIZE), Image.BICUBIC)
        for e, v in zip(under.split(), studio.split())
    ]
    lay['mask'] = edge_mask(cw, SIZE, left, right, feather)
    return lay


def compose(frame, lay):
    if not lay['gain']:
        return frame
    graded = Image.merge('RGB', [
        ImageMath.lambda_eval(lambda a: a['c'] * a['g'], c=c, g=g).convert('L')
        for c, g in zip(frame.split(), lay['gain'])
    ])
    canvas = lay['bg'].copy()
    canvas.paste(graded, (lay['x'], 0), lay['mask'])
    return canvas


def seam_check(shots, lay):
    """Шов на готовом квадрате: яркость ролика там, где растушёвка кончается,
    против яркости фона на том же месте. Худшая из полос на 25, 50 и 85 %
    высоты. По кадрам берётся самый светлый: рука или тень на полу, зашедшие
    в полосу, только темнят её, а шов — это студия ролика против env.png."""
    env = lay['bg'].convert('L')
    worst = 0.0
    for level in COLOR_LEVELS:
        y = round(SIZE * level)
        bands = []
        if lay['left']:
            bands.append(lay['x'] + lay['feather'])
        if lay['right']:
            bands.append(lay['x'] + lay['w'] - lay['feather'] - 8)
        for bx in bands:
            ref = band_mean(env, bx, bx + 8, y)[0]
            got = max(band_mean(s.convert('L'), bx, bx + 8, y)[0] for s in shots)
            worst = max(worst, abs(got - ref))
    return round(worst, 1)


def build(path, w, h, env, loop, box, slug):
    lay = layout(path, w, h, env, loop, box)
    shots = frames(path, lay['vw'], lay['vh'], 'RGB', loop['i'], loop['j'], lay['crop'])
    out = os.path.join(OUT, f'{slug}.mp4')
    # Кодирование — под атрибут loop: на каждом круге браузер возвращается к
    # началу ролика, а круг короче двух секунд, так что заминка на стыке видна
    # всё время. С B-кадрами первый пакет шёл с отрицательным DTS, а MP4 нёс
    # edit list, сдвигающий начало, — через этот сдвиг браузер и спотыкался.
    # Поэтому без B-кадров (-bf 0), опорный кадр один — первый (-g по длине
    # петли, без смены сцены), edit list не пишется вовсе. Без B-кадров файл
    # крупнее; -tune animation (у нас 3D-мультфильм) это почти отыгрывает: при
    # том же CRF 24 ролики в сумме больше прежних на ~5 %, а SSIM не ниже.
    gop = str(len(shots))
    enc = subprocess.Popen(
        ['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
         '-s', f'{SIZE}x{SIZE}', '-r', str(FPS), '-i', '-',
         '-c:v', 'libx264', '-profile:v', 'high', '-crf', '24', '-preset', 'slow',
         '-tune', 'animation', '-bf', '0', '-g', gop, '-keyint_min', gop, '-sc_threshold', '0',
         '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-use_editlist', '0', '-an', out],
        stdin=subprocess.PIPE)
    checked = []
    for n, f in enumerate(shots):
        img = compose(f, lay)
        if n % 6 == 0:
            checked.append(img)
        enc.stdin.write(img.tobytes())
    enc.stdin.close()
    if enc.wait() != 0:
        raise RuntimeError(f'ffmpeg не собрал {out}')

    # Постер: первый кадр готового ролика, как в build-loops.sh.
    with tempfile.TemporaryDirectory() as tmp:
        png = os.path.join(tmp, f'{slug}.png')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', out, '-frames:v', '1',
                        '-vf', f'scale={POSTER_SIZE}:{POSTER_SIZE}:flags=lanczos', png], check=True)
        subprocess.run(['cwebp', '-quiet', '-q', '75', png, '-o', os.path.join(OUT, f'{slug}.webp')], check=True)
    blended = lay['left'] or lay['right']
    gain = [ImageStat.Stat(g).extrema[0] for g in lay['gain']] if lay['gain'] else []
    return {'square_side': lay['side'],
            'color_gain': [[round(lo, 2), round(hi, 2)] for lo, hi in gain],
            'feather_px_out': lay['feather'] if blended else 0,
            'edge_luma_diff': seam_check(checked, lay) if blended else 0.0,
            'mp4_kb': round(os.path.getsize(out) / 1024, 1),
            'webp_kb': round(os.path.getsize(os.path.join(OUT, f'{slug}.webp')) / 1024, 1)}


# ─────────────  Запуск  ─────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default=os.path.expanduser('~/Downloads/archive-3'))
    ap.add_argument('--env', default=os.path.expanduser('~/Downloads/env.png'))
    ap.add_argument('--only', default='', help='номера исходников через запятую (по порядку имён)')
    ap.add_argument('--analyze', action='store_true', help='только петли и рамки, без кодирования')
    args = ap.parse_args()

    names = sorted(f for f in os.listdir(args.src) if f.endswith('.mp4'))
    only = {int(x) for x in args.only.split(',') if x.strip()}
    manifest = {}
    if os.path.exists(MANIFEST):
        with open(MANIFEST, encoding='utf-8') as fh:
            manifest = json.load(fh)
    env = Image.open(args.env).convert('RGB')
    os.makedirs(OUT, exist_ok=True)

    for num, name in enumerate(names, 1):
        if only and num not in only:
            continue
        key = name.split('_')[3][:8] if name.count('_') >= 3 else name
        slug = SOURCES.get(key)
        path = os.path.join(args.src, name)
        w, h = probe(path)
        loop = find_loop(path, w, h)
        box = figure_box(path, w, h, loop['i'], loop['j'])
        entry = {'n': num, 'id': slug, 'size': [w, h], **loop, 'figure_box': box}
        mark = 'чисто' if loop['clean'] else 'ШОВ'
        line = (f"{num:2d} {key} i={loop['i']:2d} j={loop['j']:2d} {loop['seconds']:.2f}с "
                f"шов {loop['seam_mse']:7.1f} напр {loop['direction_mse']:7.1f} "
                f"соседи {loop['adjacent_median']:6.1f} {mark:5s} рамка {box}")
        if slug and loop['clean'] and not args.analyze:
            entry.update(build(path, w, h, env, loop, box, slug))
            line += f" → {slug} {entry['mp4_kb']} КБ, шов по краю ±{entry['edge_luma_diff']}"
        manifest[name] = entry
        print(line, flush=True)

    with open(MANIFEST, 'w', encoding='utf-8') as fh:
        json.dump(dict(sorted(manifest.items())), fh, ensure_ascii=False, indent=2)
        fh.write('\n')


if __name__ == '__main__':
    sys.exit(main())
