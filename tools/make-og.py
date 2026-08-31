#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
og-image.png 생성기 (1200x630)

링크를 공유했을 때 뜨는 미리보기 카드를 만든다. 색은 사이트와 같은 방식으로
CIELAB → LCH에서 계산하므로, index.html의 TYPES/HUES를 바꾸면 여기 값도
같이 맞춰야 카드와 사이트의 색이 어긋나지 않는다.

    python tools/make-og.py
"""
import math
import os

from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
RIBBON = 170                      # 하단 색 리본 높이
OUT = os.path.join(os.path.dirname(__file__), "..", "og-image.png")

# ── 색채 수학 : index.html과 동일한 변환 ──────────────────────────
Xn, Yn, Zn = 0.95047, 1.0, 1.08883


def _finv(t):
    c = t ** 3
    return c if c > 0.008856 else (t - 16 / 116) / 7.787


def lab2rgb(L, a, b):
    fy = (L + 16) / 116
    fx, fz = fy + a / 500, fy - b / 200
    X, Y, Z = Xn * _finv(fx), Yn * _finv(fy), Zn * _finv(fz)
    return (
        3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z,
        -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z,
        0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z,
    )


def _enc(c):
    c = max(0.0, min(1.0, c))
    return 1.055 * (c ** (1 / 2.4)) - 0.055 if c > 0.0031308 else 12.92 * c


def lch_rgb(L, C, h):
    """색역을 벗어나면 채도를 0.5씩 낮춰 sRGB 안으로 넣는다."""
    while C > 0:
        a, b = C * math.cos(math.radians(h)), C * math.sin(math.radians(h))
        if all(-0.002 <= c <= 1.002 for c in lab2rgb(L, a, b)):
            break
        C -= 0.5
    a, b = C * math.cos(math.radians(h)), C * math.sin(math.radians(h))
    return tuple(round(_enc(c) * 255) for c in lab2rgb(L, a, b))


# ── 리본에 쓸 4계절 대표 타입 (index.html의 TYPES/HUES와 동일) ────
SEASON_HUES = {
    "spring": [32, 48, 64, 84, 104, 136, 162, 192, 216, 244, 332, 352],
    "summer": [344, 320, 292, 266, 240, 214, 194, 170, 146, 12, 32, 64],
    "autumn": [26, 42, 58, 74, 92, 112, 150, 180, 202, 340, 14, 300],
    "winter": [356, 334, 310, 286, 260, 234, 210, 186, 160, 140, 20, 44],
}
REPS = [                                  # (계절, L*, C*, 색상 편향)
    ("spring", 70, 66, 6),
    ("summer", 80, 28, -8),
    ("autumn", 52, 54, 10),
    ("winter", 52, 90, -14),
]


def palette(season, L, C, bias):
    out = []
    for i, hue in enumerate(SEASON_HUES[season]):
        jitter = (i % 3 - 1) * 3          # index.html의 buildPalette와 동일
        out.append(lch_rgb(max(14, min(94, L + jitter)), C, (hue + bias) % 360))
    return out


# ── 폰트 ──────────────────────────────────────────────────────────
FONTS = "C:/Windows/Fonts/"


def font(name, size, index=0):
    path = FONTS + name
    if not os.path.exists(path):
        raise SystemExit("폰트를 찾을 수 없습니다: " + path)
    return ImageFont.truetype(path, size, index=index)


def tracked_width(d, text, f, spacing=0):
    return sum(d.textlength(ch, font=f) + spacing for ch in text) - spacing


def tracked(d, xy, text, f, fill, spacing=0):
    """자간을 준 텍스트. 계측 라벨에 쓴다."""
    x, y = xy
    for ch in text:
        d.text((x, y), ch, font=f, fill=fill)
        x += d.textlength(ch, font=f) + spacing
    return x


def center(d, y, text, f, fill):
    d.text(((W - d.textlength(text, font=f)) / 2, y), text, font=f, fill=fill)


def main():
    GROUND, INK, INK2, INK3 = "#E6E6E8", "#17171A", "#54545D", "#87878F"
    RULE, ACCENT = "#CFCFD5", "#2F615C"

    img = Image.new("RGB", (W, H), GROUND)
    d = ImageDraw.Draw(img)

    serif = font("batang.ttc", 88)         # 바탕 — 사이트의 Gowun Batang 대응
    sans = font("malgun.ttf", 33)
    sans_sm = font("malgun.ttf", 21)
    mono = font("consola.ttf", 21)

    # 중앙 정렬 — 일부 플랫폼이 카드를 중앙 크롭하므로 가장자리를 비워 둔다
    label = "CIELAB · ITA° · D65"
    tracked(d, ((W - tracked_width(d, label, mono, 3)) / 2, 74),
            label, mono, INK3, spacing=3)

    center(d, 124, "퍼스널컬러 측정실", serif, INK)
    d.rectangle([(W - 132) / 2, 256, (W + 132) / 2, 261], fill=ACCENT)

    center(d, 296, "사진의 피부 화소를 재서 4계절 12타입을 판정합니다", sans, INK2)

    # 지표 칩 — 한 줄로 묶어 가운데 배치
    labels = ("L* 명도", "h° 색상각", "C* 채도", "ITA° 심도")
    widths = [d.textlength(t, font=sans_sm) + 30 for t in labels]
    x = (W - (sum(widths) + 12 * (len(labels) - 1))) / 2
    for t, w in zip(labels, widths):
        d.rectangle([x, 384, x + w, 426], outline="#B4B4BC", width=2)
        d.text((x + 15, 393), t, font=sans_sm, fill=INK2)
        x += w + 12

    # 하단 리본 — 4계절 대표 타입의 생성 팔레트 48색
    chips = []
    for season, L, C, bias in REPS:
        chips += palette(season, L, C, bias)
    top = H - RIBBON
    cw = W / len(chips)
    for i, rgb in enumerate(chips):
        d.rectangle([int(i * cw), top, int((i + 1) * cw) + 1, H], fill=rgb)
    d.rectangle([0, top - 1, W, top], fill=RULE)

    img.save(os.path.abspath(OUT), "PNG", optimize=True)
    print("생성:", os.path.abspath(OUT), img.size,
          str(os.path.getsize(OUT) // 1024) + "KB")


if __name__ == "__main__":
    main()
