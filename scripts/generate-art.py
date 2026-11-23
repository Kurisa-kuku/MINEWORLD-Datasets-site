#!/usr/bin/env python3
"""Generate the deterministic pixel-art covers used by the demo catalog.

The source art is drawn at 320x180 and upscaled 4x with nearest-neighbour
resampling, which keeps every edge crisp. Real uploads are processed separately
by scripts/process-covers.mjs (sharp -> WebP + thumbnail).

Run: python scripts/generate-art.py
"""
from __future__ import annotations

import math
import random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
COVERS = ROOT / "public" / "covers"
IMAGES = ROOT / "public" / "images"
COVERS.mkdir(parents=True, exist_ok=True)
IMAGES.mkdir(parents=True, exist_ok=True)

W, H = 320, 180
SCALE = 4


def rand(seed: int) -> random.Random:
    return random.Random(seed)


def canvas(top: tuple[int, int, int], bottom: tuple[int, int, int], seed: int = 1) -> Image.Image:
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / max(H - 1, 1)
        color = tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(3))
        d.line([(0, y), (W, y)], fill=color)
    # ordered-dither texture
    r = rand(seed)
    for y in range(H):
        for x in range(W):
            if (x + y) % 3 == 0 and r.random() < 0.18:
                p = img.getpixel((x, y))
                delta = 4 if r.random() > 0.5 else -4
                img.putpixel((x, y), tuple(max(0, min(255, c + delta)) for c in p))
    return img


def px(d: ImageDraw.ImageDraw, x: int, y: int, color: tuple[int, ...], size: int = 1) -> None:
    d.rectangle([x, y, x + size - 1, y + size - 1], fill=color)


def block(
    d: ImageDraw.ImageDraw,
    x: int,
    y: int,
    w: int,
    h: int,
    color: tuple[int, int, int],
    seed: int = 0,
    texture: float = 0.16,
    border: bool = True,
) -> None:
    r = rand(seed + x * 13 + y * 7)
    d.rectangle([x, y, x + w - 1, y + h - 1], fill=color)
    cells = max(1, w // 4)
    for yy in range(y, y + h, 4):
        for xx in range(x, x + w, 4):
            if r.random() < texture:
                shift = r.choice([-18, -11, 10, 16])
                c = tuple(max(0, min(255, v + shift)) for v in color)
                d.rectangle([xx, yy, min(xx + 3, x + w - 1), min(yy + 3, y + h - 1)], fill=c)
    if border:
        d.line([(x, y), (x + w - 1, y)], fill=tuple(min(255, c + 18) for c in color))
        d.line([(x, y + h - 1), (x + w - 1, y + h - 1)], fill=tuple(max(0, c - 22) for c in color))


def clouds(d: ImageDraw.ImageDraw, y: int, seed: int, tint=(255, 250, 240), scale=1) -> None:
    r = rand(seed)
    for _ in range(7):
        x = r.randint(-20, W)
        cy = y + r.randint(-12, 12)
        w = r.randint(20, 52) * scale
        h = r.randint(7, 12) * scale
        d.rectangle([x, cy, x + w, cy + h], fill=tint)
        d.rectangle([x + 8, cy - 4, x + w - 10, cy], fill=tint)
        d.rectangle([x + w // 4, cy + h, x + w // 2, cy + h + 3], fill=tuple(max(0, c - 16) for c in tint))


def tree(d: ImageDraw.ImageDraw, x: int, ground: int, seed: int, trunk=(102, 72, 44)) -> None:
    r = rand(seed)
    d.rectangle([x + 4, ground - 24, x + 8, ground], fill=trunk)
    d.rectangle([x + 4, ground - 24, x + 5, ground], fill=tuple(min(255, c + 12) for c in trunk))
    for yy, width in [(-30, 16), (-38, 22), (-46, 26), (-54, 20), (-62, 12)]:
        xx = x + 6 - width // 2
        d.rectangle([xx, ground + yy, xx + width, ground + yy + 9], fill=(46, 117, 48))
        for _ in range(8):
            lx = r.randint(xx, xx + width - 2)
            ly = r.randint(ground + yy, ground + yy + 8)
            d.rectangle([lx, ly, lx + 1, ly + 1], fill=r.choice([(73, 154, 62), (99, 178, 72), (36, 92, 40)]))
    d.rectangle([x + 6, ground - 27, x + 8, ground - 23], fill=(68, 143, 54))


def grass_terrain(
    d: ImageDraw.ImageDraw,
    base_y: int,
    seed: int,
    color_top=(83, 174, 67),
    color_side=(125, 88, 56),
    color_deep=(96, 94, 92),
    amplitude: int = 6,
) -> list[int]:
    r = rand(seed)
    heights = []
    current = base_y
    for x in range(0, W, 8):
        current += r.choice([-1, 0, 0, 1])
        current = max(base_y - amplitude, min(base_y + amplitude, current))
        heights.append(current)
        d.rectangle([x, current, x + 7, current + 5], fill=color_top)
        d.rectangle([x, current + 6, x + 7, current + 20], fill=color_side)
        block(d, x, current + 21, 8, H - current - 21, color_deep, seed + x, 0.25, border=False)
        if r.random() < 0.4:
            blade_x = x + r.randint(0, 4)
            d.rectangle([blade_x, current - 2, blade_x + r.randint(1, 3), current - 1], fill=(114, 190, 83))
    return heights


def vignette(img: Image.Image, strength: int = 42) -> Image.Image:
    mask = Image.new("L", (W, H), 0)
    md = ImageDraw.Draw(mask)
    for i in range(min(W, H) // 2):
        alpha = int(strength * (1 - i / (min(W, H) / 2)))
        md.rectangle([i, i, W - i - 1, H - i - 1], outline=alpha)
    dark = Image.new("RGB", (W, H), (8, 10, 14))
    return Image.composite(img, Image.blend(img, dark, 0.45), mask.filter(ImageFilter.GaussianBlur(10)))


def finish(img: Image.Image, name: str, *, thumb: bool = True) -> None:
    img = img.resize((W * SCALE, H * SCALE), Image.Resampling.NEAREST)
    path = COVERS / f"{name}.webp"
    img.save(path, "WEBP", quality=92, method=6)
    if thumb:
        img.resize((640, 360), Image.Resampling.LANCZOS).save(
            COVERS / f"{name}-thumb.webp", "WEBP", quality=88, method=6
        )
    print(f"wrote {path.relative_to(ROOT)}")


# ---------------------------------------------------------------------------
# 1. Skyblock dawn
# ---------------------------------------------------------------------------
img = canvas((43, 68, 139), (255, 160, 122), 11)
d = ImageDraw.Draw(img)
r = rand(12)
for _ in range(90):
    x, y = r.randint(0, W - 1), r.randint(0, 90)
    px(d, x, y, (240, 230, 200), 1)
for i in range(3, 0, -1):
    d.rectangle([246 - i * 4, 24 - i * 4, 266 + i * 4, 44 + i * 4], outline=(255, 211, 124))
block(d, 246, 24, 21, 21, (255, 226, 143), 2, 0.04)
clouds(d, 52, 13, (255, 229, 216), 1)
clouds(d, 96, 14, (251, 206, 188), 1)
# distant islands
for x, y, w in [(24, 93, 40), (277, 116, 32), (52, 127, 18)]:
    d.rectangle([x, y, x + w, y + 4], fill=(85, 150, 71))
    d.rectangle([x + 4, y + 5, x + w - 4, y + 13], fill=(121, 88, 60))
    if w >= 26:
        d.rectangle([x + 11, y + 14, x + w - 10, y + 22], fill=(99, 95, 91))
# main island
base = 132
island = [(104, 106, 140), (90, 116, 155), (82, 126, 166), (84, 136, 154), (94, 145, 132), (108, 152, 98)]
for x, y, w in island:
    d.rectangle([x, y, x + w, y + 11], fill=(101, 74, 50))
    block(d, x, y, min(w + 1, 60), 11, (101, 74, 50), x + y, 0.22, border=False)
d.rectangle([88, 112, 232, 122], fill=(90, 180, 67))
for x in range(88, 233, 8):
    d.rectangle([x, 112, x + 7, 116], fill=(104, 191, 79))
    if r.random() < 0.3:
        d.rectangle([x + 2, 109, x + 4, 111], fill=(70, 154, 60))
# dirt/stone under island
for y, x1, x2 in [(123, 92, 228), (132, 100, 218), (141, 112, 203), (149, 127, 187), (155, 145, 171), (160, 158, 160)]:
    block(d, x1, y, x2 - x1, 9, (113, 82, 55) if y < 145 else (91, 89, 88), y, 0.25, border=False)
tree(d, 158, 113, 21)
# waterfall
for y in range(114, 175, 6):
    d.rectangle([123, y, 129, y + 5], fill=(87, 176, 221))
    d.rectangle([123, y, 125, y + 5], fill=(168, 224, 243))
# flowers & torch
for x in [106, 190, 215]:
    d.rectangle([x, 108, x + 1, 111], fill=(58, 122, 49))
    d.rectangle([x - 1, 106, x + 1, 107], fill=r.choice([(240, 105, 104), (255, 217, 102), (213, 152, 237)]))
d.rectangle([201, 99, 203, 112], fill=(103, 72, 44))
d.rectangle([200, 97, 204, 99], fill=(255, 174, 63))
d.rectangle([199, 96, 205, 97], fill=(255, 221, 113))
# tiny floating crystals
for x, y in [(64, 77), (251, 87), (277, 72)]:
    d.rectangle([x, y, x + 5, y + 10], fill=(178, 133, 244))
    d.rectangle([x + 1, y - 3, x + 3, y + 1], fill=(210, 180, 252))
finish(vignette(img), "skyblock-dawn")

# ---------------------------------------------------------------------------
# 2. Nether expedition
# ---------------------------------------------------------------------------
img = canvas((35, 8, 18), (113, 31, 24), 31)
d = ImageDraw.Draw(img)
r = rand(32)
for _ in range(130):
    x, y = r.randint(0, W - 1), r.randint(0, 150)
    px(d, x, y, r.choice([(180, 62, 34), (255, 170, 79), (90, 24, 25)]), 1)
# ceiling
for x in range(0, W, 8):
    h = 10 + int(6 * math.sin(x / 32))
    block(d, x, 0, 8, h, (68, 24, 30), x, 0.25, border=False)
# lava sea
for y in range(143, H, 5):
    t = (y - 143) / max(1, H - 143)
    color = (int(199 + 56 * t), int(72 + 40 * (1 - t)), 22)
    d.rectangle([0, y, W, y + 4], fill=color)
for _ in range(45):
    x, y = r.randint(0, W), r.randint(145, H - 2)
    d.rectangle([x, y, x + r.randint(2, 8), y + 1], fill=r.choice([(255, 214, 75), (255, 139, 39)]))
# netherrack cliffs
for side, direction in [("left", 1), ("right", -1)]:
    for i in range(8):
        x = 0 + i * 13 if side == "left" else W - 13 - i * 13
        top = 38 + i * 11 + r.randint(-3, 4)
        block(d, x, top, 14, 140 - top, (96, 39, 39), 100 + i, 0.28, border=False)
        if i < 5:
            d.rectangle([x, top, x + 13, top + 4], fill=(133, 56, 44))
# central pillar and portal
block(d, 148, 44, 42, 96, (55, 24, 28), 77, 0.3, border=True)
for yy in range(53, 112, 7):
    d.rectangle([151, yy, 186, yy + 3], fill=(28, 13, 16))
block(d, 195, 72, 30, 66, (66, 57, 63), 78, 0.22)
# glowing portal
d.rectangle([137, 85, 148, 137], fill=(53, 19, 67))
d.rectangle([137, 85, 148, 137], outline=(189, 118, 245))
for _ in range(55):
    x, y = r.randint(139, 146), r.randint(87, 135)
    d.rectangle([x, y, x + 1, y + r.choice([2, 3, 5])], fill=r.choice([(167, 100, 232), (219, 174, 255), (98, 54, 152)]))
# glowstone clusters
for x, y in [(108, 27), (215, 31), (246, 54), (42, 66), (78, 22)]:
    d.rectangle([x, y, x + 11, y + 8], fill=(197, 130, 42))
    d.rectangle([x + 1, y + 1, x + 9, y + 6], fill=(255, 221, 94))
    d.rectangle([x + 3, y + 2, x + 7, y + 4], fill=(255, 246, 173))
    for _ in range(4):
        px(d, x + r.randint(2, 8), y + r.randint(2, 6), (255, 198, 66), 1)
# soul sand + basalt
for x, y, w, h in [(46, 122, 44, 16), (223, 132, 33, 12)]:
    block(d, x, y, w, h, (84, 66, 57), x, 0.3, border=False)
for x in [235, 251, 264]:
    block(d, x, 100 + r.randint(0, 14), 6, 42, (44, 43, 47), x, 0.15, border=False)
# embers
for _ in range(40):
    x, y = r.randint(0, W), r.randint(50, 150)
    s = r.choice([1, 1, 2])
    d.rectangle([x, y, x + s, y + s], fill=r.choice([(255, 168, 64), (255, 88, 46)]))
finish(vignette(img, 55), "nether-expedition")

# ---------------------------------------------------------------------------
# 3. End citadel
# ---------------------------------------------------------------------------
img = canvas((228, 208, 178), (121, 104, 118), 51)
d = ImageDraw.Draw(img)
r = rand(52)
for _ in range(55):
    x, y = r.randint(0, W - 1), r.randint(0, H - 20)
    px(d, x, y, (243, 232, 203), 1)
# void
d.rectangle([0, 157, W, H], fill=(15, 10, 22))
for y in range(157, H, 3):
    d.line([(0, y), (W, y)], fill=(17 + y % 5, 12 + y % 4, 26))
# distant islands
for x, y, w in [(38, 137, 46), (224, 121, 62), (143, 147, 28)]:
    d.rectangle([x, y, x + w, y + 3], fill=(213, 207, 165))
    d.polygon([(x + 5, y + 4), (x + w - 6, y + 4), (x + w // 2, y + 14)], fill=(174, 166, 129))
# city
for x, y, w, h in [(74, 88, 26, 65), (104, 107, 17, 46), (236, 81, 26, 74)]:
    block(d, x, y, w, h, (161, 148, 135), x, 0.18)
    block(d, x - 3, y - 8, w + 6, 9, (183, 170, 150), x + 2, 0.12)
    for wy in range(y + 8, y + h - 4, 12):
        d.rectangle([x + 5, wy, x + 8, wy + 5], fill=(230, 198, 248))
        d.rectangle([x + 13, wy, x + 16, wy + 5], fill=(230, 198, 248))
    d.rectangle([x + w // 2 - 1, y - 18, x + w // 2 + 1, y - 8], fill=(180, 158, 218))
    d.rectangle([x + w // 2 - 4, y - 20, x + w // 2 + 4, y - 18], fill=(199, 168, 249))
# end ship
d.rectangle([41, 68, 72, 78], fill=(119, 82, 98))
d.rectangle([45, 63, 65, 68], fill=(83, 59, 70))
d.rectangle([57, 54, 59, 62], fill=(80, 55, 62))
d.polygon([(59, 54), (72, 58), (59, 62)], fill=(191, 155, 212))
# main island
block(d, 68, 150, 195, 12, (204, 198, 155), 12, 0.22)
for x in range(76, 250, 8):
    d.rectangle([x, 148, x + 7, 150], fill=(226, 220, 179))
poly = [(68, 162), (263, 162), (239, 173), (103, 173), (79, 166)]
d.polygon(poly, fill=(152, 144, 112))
# chorus plants
for x, base in [(95, 149), (128, 149), (200, 149), (224, 149)]:
    d.rectangle([x, base - 35, x + 2, base], fill=(90, 67, 91))
    for yy in range(base - 35, base - 5, 11):
        d.rectangle([x - 7, yy, x - 2, yy + 5], fill=(119, 78, 133))
        d.rectangle([x + 2, yy + 4, x + 8, yy + 9], fill=(141, 91, 156))
    d.rectangle([x - 4, base - 42, x + 6, base - 33], fill=(184, 132, 194))
    d.rectangle([x - 2, base - 45, x + 3, base - 40], fill=(222, 188, 228))
# end portal
d.rectangle([146, 143, 161, 158], fill=(19, 9, 31))
d.rectangle([146, 143, 161, 158], outline=(61, 170, 122))
for _ in range(35):
    x, y = r.randint(148, 159), r.randint(145, 156)
    d.rectangle([x, y, x + 1, y + 1], fill=r.choice([(122, 239, 184), (64, 191, 136), (182, 255, 213)]))
# dragon silhouette
d.polygon([(272, 42), (291, 48), (283, 52), (300, 59), (278, 57), (276, 63), (269, 56), (261, 61), (265, 50)], fill=(34, 23, 40))
d.rectangle([258, 45, 266, 49], fill=(34, 23, 40))
for _ in range(24):
    x, y = r.randint(150, 310), r.randint(30, 130)
    px(d, x, y, (243, 224, 255), 1)
finish(vignette(img, 24), "end-citadel")

# ---------------------------------------------------------------------------
# 4. Village life
# ---------------------------------------------------------------------------
img = canvas((100, 155, 205), (255, 190, 129), 71)
d = ImageDraw.Draw(img)
r = rand(72)
for i in range(5):
    d.rectangle([0, 88 + i * 8, W, 94 + i * 8], fill=(255, 212, 152))
block(d, 255, 35, 18, 18, (255, 226, 150), 4, 0.04)
clouds(d, 38, 73, (255, 229, 207), 1)
clouds(d, 66, 74, (250, 212, 190), 1)
# hills
for x in range(0, W, 8):
    h = 94 + int(10 * math.sin(x / 39) + 5 * math.sin(x / 13))
    d.rectangle([x, h, x + 7, H], fill=(88, 151, 72))
    d.rectangle([x, h, x + 7, h + 3], fill=(118, 178, 84))
heights = grass_terrain(d, 122, 75, color_top=(112, 178, 77), color_side=(124, 89, 57), amplitude=4)
# river
for y in range(129, H):
    curve = int(20 * math.sin(y / 20))
    d.rectangle([18 + curve, y, 66 + curve, y + 1], fill=(89, 176, 207))
    d.rectangle([25 + curve, y, 60 + curve, y + 1], fill=(128, 205, 225))
# path
for y in range(127, H, 7):
    curve = int(16 * math.sin(y / 24))
    d.rectangle([170 + curve, y, 218 + curve, y + 6], fill=(183, 151, 100))
    d.rectangle([174 + curve, y + 1, 213 + curve, y + 2], fill=(200, 169, 113))
# houses
houses = [(94, 88, 53, 38), (203, 80, 47, 38), (249, 108, 34, 25)]
for i, (x, y, w, h) in enumerate(houses):
    block(d, x, y, w, h, (221, 208, 179), 80 + i, 0.1)
    # roof stepped
    for step in range(5):
        d.rectangle([x - 4 + step * 4, y - 12 + step * 3, x + w + 3 - step * 4, y - 8 + step * 3], fill=(125, 63, 46))
    d.rectangle([x + w // 2 - 5, y + h - 14, x + w // 2 + 5, y + h], fill=(87, 57, 38))
    d.rectangle([x + 8, y + 9, x + 16, y + 17], fill=(111, 184, 208))
    d.rectangle([x + 10, y + 11, x + 14, y + 15], fill=(184, 226, 231))
    d.rectangle([x + w - 16, y + 9, x + w - 8, y + 17], fill=(111, 184, 208))
    d.rectangle([x + 12, y - 18, x + 15, y - 12], fill=(157, 130, 100))
for i in range(6):
    x = 274 + (i % 2) * 4
    y = 70 - i * 7
    d.rectangle([x, y, x + 7, y + 5], fill=(232, 228, 221))
    d.rectangle([x + 2, y + 2, x + 5, y + 4], fill=(201, 197, 191))
# farm
for y in range(145, 167, 5):
    for x in range(108, 158, 7):
        d.rectangle([x, y, x + 5, y + 3], fill=(115, 76, 50))
        d.rectangle([x + 1, y - 3, x + 2, y], fill=(74, 131, 55))
        d.rectangle([x + 4, y - 4, x + 5, y], fill=(95, 157, 62))
# trees
tree(d, 35, 130, 76)
tree(d, 262, 136, 77)
# lights
for x, y in [(149, 121), (234, 112)]:
    d.rectangle([x, y - 12, x + 1, y], fill=(82, 60, 40))
    d.rectangle([x - 2, y, x + 3, y + 4], fill=(255, 193, 76))
    d.rectangle([x - 1, y + 1, x + 2, y + 2], fill=(255, 238, 174))
# birds
for x, y in [(120, 49), (130, 42), (73, 60)]:
    d.line([(x, y), (x + 3, y - 2), (x + 6, y)], fill=(63, 47, 48), width=1)
finish(vignette(img, 24), "village-life")

# ---------------------------------------------------------------------------
# 5. Amethyst cavern
# ---------------------------------------------------------------------------
img = canvas((17, 18, 30), (42, 34, 59), 91)
d = ImageDraw.Draw(img)
r = rand(92)
for _ in range(260):
    x, y = r.randint(0, W - 1), r.randint(0, H - 1)
    px(d, x, y, r.choice([(54, 51, 75), (31, 30, 47), (66, 60, 87)]), 1)
# cave mouth
d.rectangle([53, 24, 277, 154], fill=(27, 25, 41))
for i in range(8):
    inset = i * 6
    d.rectangle([53 + inset, 24 + inset // 2, 277 - inset, 154 - inset], fill=(27 + i, 25 + i, 41 + i))
# calcite / smooth basalt bands
for x in range(30, W, 18):
    y = 52 + (x * 7) % 72
    block(d, x, y, 13, 8, (213, 209, 202), x, 0.1, border=False)
for x in range(14, W, 27):
    y = 118 + (x * 5) % 34
    block(d, x, y, 18, 10, (72, 70, 79), x, 0.2, border=False)
# geodes
for (cx, cy, size) in [(122, 82, 1.4), (224, 100, 1.0), (164, 126, 0.75)]:
    rw, rh = int(34 * size), int(23 * size)
    d.ellipse([cx - rw, cy - rh, cx + rw, cy + rh], fill=(28, 24, 41))
    d.ellipse([cx - rw + 4, cy - rh + 4, cx + rw - 4, cy + rh - 4], fill=(79, 59, 111))
    for _ in range(int(18 * size)):
        ang = r.uniform(0, math.tau)
        rad = r.uniform(0.15, 0.72)
        x = int(cx + math.cos(ang) * rw * rad)
        y = int(cy + math.sin(ang) * rh * rad)
        h = r.randint(5, int(20 * size))
        w = r.choice([3, 4, 6])
        d.polygon([(x, y - h), (x + w, y - h // 2), (x + w - 1, y + 4), (x, y + 6)], fill=r.choice([(146, 91, 198), (181, 124, 233), (116, 72, 167)]))
        d.line([(x + 1, y - h + 3), (x + 1, y - 2)], fill=(223, 188, 250))
    for _ in range(6):
        ang = r.uniform(0, math.tau)
        px(d, int(cx + math.cos(ang) * rw * 0.9), int(cy + math.sin(ang) * rh * 0.9), (234, 208, 255), 1)
# underground lake
for y in range(144, H):
    t = (y - 144) / max(1, H - 144)
    d.rectangle([0, y, W, y], fill=(int(25 + 20 * t), int(71 + 35 * t), int(89 + 30 * t)))
for _ in range(35):
    x, y = r.randint(0, W), r.randint(147, H - 2)
    d.rectangle([x, y, x + r.randint(2, 7), y], fill=(101, 189, 195))
# torch
for x, y in [(90, 116), (265, 119)]:
    d.rectangle([x, y, x + 2, y + 16], fill=(92, 63, 42))
    d.rectangle([x - 2, y - 3, x + 4, y + 2], fill=(255, 174, 53))
    d.rectangle([x - 1, y - 2, x + 3, y], fill=(255, 235, 152))
    for _ in range(9):
        glow_x = x + r.randint(-8, 8)
        glow_y = y + r.randint(-10, 3)
        glow_w = r.randint(1, 5)
        glow_h = r.randint(1, 4)
        d.rectangle([glow_x, glow_y, glow_x + glow_w, glow_y + glow_h], fill=(255, 198, 81))
# glow berries
for x in [70, 84, 246, 257]:
    d.rectangle([x, 20, x + 1, 44], fill=(55, 92, 55))
    for yy in range(24, 43, 6):
        d.rectangle([x - 1, yy, x + 2, yy + 2], fill=(255, 210, 102))
finish(vignette(img, 35), "amethyst-cavern")

# ---------------------------------------------------------------------------
# 6. Redstone lab
# ---------------------------------------------------------------------------
img = canvas((37, 38, 44), (55, 53, 61), 111)
d = ImageDraw.Draw(img)
r = rand(112)
for x in range(0, W, 16):
    for y in range(0, H, 16):
        shade = r.choice([(78, 76, 80), (72, 70, 76), (84, 81, 87)])
        d.rectangle([x, y, x + 15, y + 15], fill=shade)
        d.rectangle([x, y, x + 15, y + 1], fill=(94, 91, 96))
        d.rectangle([x, y + 15, x + 15, y + 15], fill=(58, 56, 62))
# floor
d.rectangle([0, 139, W, H], fill=(47, 44, 51))
for x in range(0, W, 16):
    d.rectangle([x, 139, x + 15, 150], fill=(73, 68, 75))
    d.rectangle([x, 151, x + 15, H], fill=(55, 51, 58))
# big lamps
for x in [45, 137, 229]:
    d.rectangle([x, 51, x + 31, 82], fill=(77, 53, 35))
    d.rectangle([x + 3, 54, x + 28, 79], fill=(194, 115, 43))
    for yy in range(57, 78, 6):
        for xx in range(x + 6, x + 27, 6):
            d.rectangle([xx, yy, xx + 2, yy + 2], fill=(255, 222, 112))
# redstone lines
for y, x1, x2 in [(101, 45, 276), (117, 65, 250)]:
    d.rectangle([x1, y, x2, y + 1], fill=(116, 25, 26))
    d.rectangle([x1, y, x2, y], fill=(218, 53, 42))
    for x in range(x1, x2, 23):
        d.rectangle([x, y - 3, x + 5, y + 4], fill=(64, 62, 68))
        d.rectangle([x + 1, y - 2, x + 4, y + 3], fill=(232, 71, 54))
for x in [80, 192]:
    d.rectangle([x, 98, x + 11, 108], fill=(152, 145, 130))
    d.rectangle([x + 2, 100, x + 9, 106], fill=(208, 53, 39))
# machinery
for x, y in [(175, 63), (263, 77)]:
    block(d, x, y, 26, 26, (106, 104, 106), x, 0.2)
    d.rectangle([x + 6, y + 6, x + 19, y + 19], fill=(61, 59, 64))
    d.rectangle([x + 9, y + 9, x + 16, y + 16], fill=(220, 72, 50))
# chests
for x in [62, 108]:
    block(d, x, 118, 24, 20, (133, 91, 45), x, 0.12)
    d.rectangle([x, 118, x + 23, 122], fill=(167, 119, 58))
    d.rectangle([x + 10, 123, x + 13, 127], fill=(215, 181, 86))
# pipes
for x in [25, 295]:
    d.rectangle([x, 30, x + 5, 140], fill=(91, 86, 86))
    for y in range(40, 140, 18):
        d.rectangle([x - 3, y, x + 8, y + 5], fill=(122, 115, 110))
# rails on floor
for y in [160, 169]:
    d.rectangle([85, y, 245, y + 1], fill=(147, 142, 131))
for x in range(88, 245, 13):
    d.rectangle([x, 162, x + 2, 168], fill=(94, 72, 49))
# hanging wires
for x in [200, 211, 222]:
    d.line([(x, 0), (x, 20), (x + 12, 32)], fill=(54, 47, 51), width=1)
finish(vignette(img, 30), "redstone-lab")

# ---------------------------------------------------------------------------
# Default covers (used by deterministic hash when a dataset has no cover)
# ---------------------------------------------------------------------------
def iso_block(name: str, palette: dict[str, tuple[int, int, int]], seed: int) -> None:
    img = canvas(palette["sky_top"], palette["sky_bottom"], seed)
    d = ImageDraw.Draw(img)
    clouds(d, 38, seed + 2, palette["cloud"], 1)
    cx, cy = 160, 102
    s = 30
    top = [(cx, cy - 34), (cx + 34, cy - 16), (cx, cy + 2), (cx - 34, cy - 18)]
    left = [(cx - 34, cy - 18), (cx, cy + 2), (cx, cy + 34), (cx - 34, cy + 14)]
    right = [(cx, cy + 2), (cx + 34, cy - 16), (cx + 34, cy + 14), (cx, cy + 34)]
    d.polygon(top, fill=palette["top"])
    d.polygon(left, fill=palette["left"])
    d.polygon(right, fill=palette["right"])
    # block texture
    r = rand(seed + 4)
    for _ in range(40):
        u, v = r.random(), r.random()
        if u + v <= 1:
            x = cx - 34 + u * 68
            y = cy - 18 + v * 70
            if (u * 34 + v * 34) < 0.8:
                d.rectangle([int(x), int(y), int(x) + 1, int(y) + 1], fill=palette["speck"])
    # edge highlights
    d.line([(cx - 34, cy - 18), (cx, cy - 34), (cx + 34, cy - 16)], fill=palette["highlight"], width=2)
    d.line([(cx - 34, cy - 18), (cx, cy + 2), (cx, cy + 34)], fill=palette["edge"], width=2)
    # little particles
    for _ in range(24):
        x, y = r.randint(0, W - 1), r.randint(16, H - 16)
        if abs(x - cx) > 55:
            px(d, x, y, palette["speck"], r.choice([1, 2]))
    finish(vignette(img, 18), name, thumb=True)


iso_block(
    "default-grass",
    {
        "sky_top": (95, 175, 231),
        "sky_bottom": (205, 236, 249),
        "cloud": (255, 255, 250),
        "top": (101, 190, 72),
        "left": (126, 89, 56),
        "right": (107, 75, 48),
        "speck": (66, 145, 54),
        "highlight": (156, 219, 119),
        "edge": (87, 62, 40),
    },
    211,
)
iso_block(
    "default-netherrack",
    {
        "sky_top": (80, 17, 20),
        "sky_bottom": (242, 103, 35),
        "cloud": (140, 53, 36),
        "top": (128, 48, 42),
        "left": (96, 34, 33),
        "right": (78, 27, 29),
        "speck": (164, 73, 60),
        "highlight": (210, 106, 74),
        "edge": (49, 17, 20),
    },
    223,
)
iso_block(
    "default-endstone",
    {
        "sky_top": (60, 32, 84),
        "sky_bottom": (169, 148, 199),
        "cloud": (220, 207, 235),
        "top": (218, 215, 169),
        "left": (174, 169, 132),
        "right": (150, 146, 112),
        "speck": (239, 236, 198),
        "highlight": (243, 239, 204),
        "edge": (124, 120, 93),
    },
    227,
)
iso_block(
    "default-amethyst",
    {
        "sky_top": (24, 17, 38),
        "sky_bottom": (89, 58, 126),
        "cloud": (66, 48, 92),
        "top": (182, 139, 238),
        "left": (127, 83, 183),
        "right": (95, 57, 144),
        "speck": (225, 194, 251),
        "highlight": (235, 208, 255),
        "edge": (69, 40, 103),
    },
    229,
)

# Wide social preview.
social = Image.open(COVERS / "skyblock-dawn.webp").convert("RGB")
social = social.resize((1200, 675), Image.Resampling.LANCZOS)
social.save(ROOT / "public" / "og.png", "PNG", optimize=True)
print("wrote public/og.png")
