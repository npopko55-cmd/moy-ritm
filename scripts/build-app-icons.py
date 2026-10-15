#!/usr/bin/env python3
"""Собирает иконки сайта, установленного как приложение («На экран „Домой“»).

Источник. public/icons/icon-512.png — оранжевая звезда. Файл с альфа-каналом
(RGBA); на 15.10.2026 фон в нём белый и весь непрозрачный, но звезду могут
заменить и на прозрачном. В браузере и в превью ссылок прозрачность не
мешает, а на экране «Домой» мешает: айфон заливает прозрачное чёрным,
Android обрезает иконку маской (кругом, «каплей», скруглённым квадратом) по
своему вкусу. Поэтому звезда кладётся на непрозрачный белый фон — тот же,
что у экранов сайта (--bg в tokens.css), и сохраняется без альфа-канала:

  • public/icons/apple-touch-icon.png — 180×180, иконка айфона
    (<link rel="apple-touch-icon"> в index.html). Весь холст 512 ужимается
    до 180 как есть, звезда — в той же пропорции, что в исходнике; углы
    айфон скругляет сам.
  • public/icons/icon-maskable-512.png — 512×512, иконка с purpose
    "maskable" в manifest.webmanifest. Android вырезает из неё фигуру по
    своей маске, и гарантированно виден только круг в 80 % ширины по
    центру (безопасная зона: радиус 0,40 × 512 ≈ 205 px). Самая дальняя
    видимая точка звезды проверяется: вылезает за круг — звезда
    уменьшается вокруг центра холста ровно настолько, чтобы влезть, и
    скрипт об этом пишет.

Исходники icon-192.png и icon-512.png не меняются: они — иконки «как есть»
(purpose any) в манифесте и картинка превью ссылок (og:image).

Зависимости: python3 и Pillow.

Запуск (из папки frontend, после смены звезды в icon-512.png):
    python3 scripts/build-app-icons.py
"""

import math
import sys
from pathlib import Path

from PIL import Image

ICONS = Path(__file__).resolve().parent.parent / 'public' / 'icons'
SOURCE = ICONS / 'icon-512.png'
APPLE = ICONS / 'apple-touch-icon.png'
MASKABLE = ICONS / 'icon-maskable-512.png'

# Фон экранов сайта (--bg в src/styles/tokens.css).
BACKGROUND = (255, 255, 255)

# Иконка айфона: 180×180 — размер для экрана «Домой» на всех нынешних айфонах.
APPLE_SIZE = 180

# Безопасная зона маскируемой иконки: круг радиусом 40 % ширины по центру.
SAFE_RADIUS = 0.40

# Насколько точка должна отличаться от фона (0–255 по каналу), чтобы считаться
# частью звезды. Отличие в пару единиц глазу на белом не видно, и срез по
# такой точке никто не заметит; бледная кайма сглаживания отличается сильнее.
FAINT = 4


def on_background(image: Image.Image) -> Image.Image:
    """Картинка на непрозрачном белом фоне, RGB без альфы.

    Сначала накладываем на фон, потом (если надо) ужимаем: ужимать
    прозрачную картинку значит смешивать цвет края с «цветом» прозрачных
    пикселей, а это даёт тёмную кайму.
    """
    canvas = Image.new('RGBA', image.size, BACKGROUND + (255,))
    canvas.alpha_composite(image)
    return canvas.convert('RGB')


def reach(image: Image.Image) -> float:
    """Расстояние от центра холста до самой дальней видимой точки звезды.

    Смотрим на звезду уже на белом фоне: альфа тут ничего не скажет — в
    нынешнем исходнике она вся 255 вместе с белым фоном. Видимой считается
    точка, хоть немного отличная от фона (больше чем на FAINT по любому
    каналу), — и бледная кайма сглаживания тоже: обрезанная маской, она дала
    бы срез на кончике. Меряем до дальнего угла пикселя, а не до его
    середины, — с запасом.
    """
    flat = on_background(image)
    width, height = flat.size
    cx, cy = width / 2, height / 2
    data = flat.load()
    farthest = 0.0
    for y in range(height):
        dy = max(abs(y - cy), abs(y + 1 - cy))
        for x in range(width):
            pixel = data[x, y]
            if any(abs(pixel[i] - BACKGROUND[i]) > FAINT for i in range(3)):
                dx = max(abs(x - cx), abs(x + 1 - cx))
                farthest = max(farthest, math.hypot(dx, dy))
    return farthest


def fit_safe_zone(image: Image.Image) -> Image.Image:
    """Звезда, уложенная в безопасную зону: уменьшается вокруг центра холста, только если вылезает."""
    size = image.size[0]
    limit = SAFE_RADIUS * size
    farthest = reach(image)
    print(f'маскируемая: дальняя точка звезды — {farthest:.1f} px от центра, предел — {limit:.1f} px')
    if farthest <= limit:
        return image

    scale = limit / farthest
    # Ужимаем весь холст, а не вырезанную звезду: расстояния от центра
    # уменьшаются ровно в scale раз, как бы звезда ни стояла на холсте.
    # Округление вниз — чтобы не вылезти на пиксель.
    side = math.floor(size * scale)
    small = image.resize((side, side), Image.LANCZOS)
    fitted = Image.new('RGBA', image.size, (0, 0, 0, 0))
    offset = (size - side) // 2
    fitted.alpha_composite(small, (offset, offset))
    after = reach(fitted)
    print(f'маскируемая: звезда вылезала за безопасную зону — уменьшена до {scale:.1%}, теперь {after:.1f} px')
    if after > limit + 1:
        sys.exit('звезда не влезла в безопасную зону даже после уменьшения — проверьте исходник')
    return fitted


def main() -> None:
    source = Image.open(SOURCE).convert('RGBA')
    if source.size[0] != source.size[1]:
        sys.exit(f'{SOURCE.name}: ждали квадрат, а он {source.size[0]}×{source.size[1]}')

    apple = on_background(source).resize((APPLE_SIZE, APPLE_SIZE), Image.LANCZOS)
    apple.save(APPLE, optimize=True)
    print(f'{APPLE.relative_to(ICONS.parent.parent)} — {APPLE_SIZE}×{APPLE_SIZE}')

    maskable = on_background(fit_safe_zone(source))
    maskable.save(MASKABLE, optimize=True)
    print(f'{MASKABLE.relative_to(ICONS.parent.parent)} — {maskable.size[0]}×{maskable.size[1]}')


if __name__ == '__main__':
    main()
