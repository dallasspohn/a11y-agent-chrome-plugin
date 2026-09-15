#!/usr/bin/env python3
"""Generate the placeholder media the test fixtures reference.

The fixtures ship without binaries, so every <img> 404s. A broken image renders
its alt text as visible chrome and collapses the layout, which makes the
extension's repairs look like layout damage on camera. These assets are
deliberately abstract -- no text is baked into any of them, since a page about
accessibility should not carry content only sighted users can read.

Usage: python3 scripts/make-fixture-assets.py
"""

from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "test" / "fixtures"

RED = (238, 0, 0)
SLATE = (38, 50, 56)
STEEL = (96, 125, 139)
MIST = (207, 216, 220)
SAND = (215, 204, 190)


def gradient(size, start, end, diagonal=True):
    w, h = size
    img = Image.new("RGB", size, start)
    d = ImageDraw.Draw(img)
    span = (w + h) if diagonal else h
    for i in range(span):
        t = i / max(span - 1, 1)
        c = tuple(round(start[j] + (end[j] - start[j]) * t) for j in range(3))
        if diagonal:
            d.line([(i, 0), (0, i)], fill=c)
        else:
            d.line([(0, i), (w, i)], fill=c)
    return img


def save(img, name, **kw):
    path = OUT / name
    img.save(path, **kw)
    print(f"  {name:28} {img.size[0]}x{img.size[1]}")


def logo():
    img = Image.new("RGBA", (160, 160), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([4, 4, 156, 156], radius=32, fill=RED)
    d.ellipse([44, 44, 116, 116], fill=(255, 255, 255))
    d.rectangle([44, 80, 116, 116], fill=RED)
    d.ellipse([44, 62, 116, 98], fill=(255, 255, 255))
    save(img.resize((40, 40), Image.LANCZOS), "logo.png")


def acme_logo():
    img = Image.new("RGBA", (560, 160), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse([12, 44, 84, 116], fill=RED)
    for i, w in enumerate((150, 110, 190)):
        y = 52 + i * 28
        d.rounded_rectangle([104, y, 104 + w, y + 16], radius=8, fill=SLATE)
    save(img.resize((140, 40), Image.LANCZOS), "acme-logo.png")


def cart_icon():
    img = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.line([(8, 14), (24, 14), (36, 62), (80, 62)], fill=SLATE, width=8, joint="curve")
    d.line([(24, 26), (84, 26), (76, 62)], fill=SLATE, width=8, joint="curve")
    d.ellipse([36, 72, 54, 90], fill=SLATE)
    d.ellipse([64, 72, 82, 90], fill=SLATE)
    save(img.resize((24, 24), Image.LANCZOS), "cart-icon.png")


def weather_icon():
    img = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse([16, 12, 60, 56], fill=(245, 166, 35))
    d.ellipse([20, 46, 60, 82], fill=STEEL)
    d.ellipse([44, 40, 88, 82], fill=STEEL)
    d.rectangle([40, 62, 68, 82], fill=STEEL)
    save(img.resize((24, 24), Image.LANCZOS), "weather-icon.png")


def submit_arrow():
    img = Image.new("RGBA", (72, 72), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.line([(14, 36), (54, 36)], fill=SLATE, width=8)
    d.polygon([(44, 18), (62, 36), (44, 54)], fill=SLATE)
    save(img.resize((18, 18), Image.LANCZOS), "submit-arrow.png")


def banner():
    img = gradient((800, 200), SLATE, RED)
    d = ImageDraw.Draw(img, "RGBA")
    for i, x in enumerate(range(480, 820, 60)):
        d.ellipse([x, -40 + i * 18, x + 180, 140 + i * 18], fill=(255, 255, 255, 18))
    save(img, "banner.jpg", quality=88)


def trading_floor():
    img = gradient((640, 360), (18, 24, 28), SLATE, diagonal=False)
    d = ImageDraw.Draw(img, "RGBA")
    bars = [70, 120, 95, 160, 140, 205, 180, 245, 225, 285, 260, 310]
    for i, h in enumerate(bars):
        x = 40 + i * 48
        d.rounded_rectangle([x, 340 - h, x + 30, 340], radius=4, fill=(255, 255, 255, 26))
    pts = [(55 + i * 48, 330 - h * 0.92) for i, h in enumerate(bars)]
    d.line(pts, fill=(80, 220, 160), width=5, joint="curve")
    for p in pts:
        d.ellipse([p[0] - 5, p[1] - 5, p[0] + 5, p[1] + 5], fill=(80, 220, 160))
    save(img, "trading-floor.jpg", quality=86)


def team_photo():
    img = gradient((600, 300), (236, 239, 241), MIST, diagonal=False)
    d = ImageDraw.Draw(img)
    tones = [(120, 144, 156), (144, 164, 174), (109, 131, 143), (158, 176, 186), (126, 150, 162)]
    for i, tone in enumerate(tones):
        cx = 78 + i * 112
        d.ellipse([cx - 34, 96, cx + 34, 164], fill=tone)
        d.pieslice([cx - 52, 168, cx + 52, 300], start=180, end=360, fill=tone)
    save(img, "team-photo.jpg", quality=86)


def shoe(size, seed):
    img = gradient(size, (250, 250, 250), (226, 232, 235), diagonal=False)
    d = ImageDraw.Draw(img, "RGBA")
    w, h = size
    body = [w * 0.12, h * 0.40, w * 0.88, h * 0.74]
    d.ellipse([body[0], body[1] + h * 0.04, body[2], body[3]], fill=(0, 0, 0, 18))
    accents = [(RED, SLATE), (SLATE, STEEL), (STEEL, SAND), (SAND, RED)]
    main, trim = accents[seed % len(accents)]
    d.rounded_rectangle(body, radius=h * 0.16, fill=main)
    d.rounded_rectangle(
        [body[0], body[3] - h * 0.10, body[2], body[3]], radius=h * 0.05, fill=trim
    )
    d.ellipse([w * 0.14, h * 0.30, w * 0.52, h * 0.60], fill=main)
    for i in range(4):
        x = w * (0.30 + i * 0.09)
        d.line([(x, h * 0.44), (x + w * 0.05, h * 0.60)], fill=(255, 255, 255, 190), width=3)
    return img


def trail_runners():
    save(shoe((480, 320), 0), "trail-runner-main.jpg", quality=88)
    for i in (1, 2, 3):
        save(shoe((120, 80), i), f"trail-runner-{i}.jpg", quality=86)


if __name__ == "__main__":
    print(f"Writing fixture assets to {OUT}")
    logo()
    acme_logo()
    cart_icon()
    weather_icon()
    submit_arrow()
    banner()
    trading_floor()
    team_photo()
    trail_runners()
    print("Done. Silent media (promo.mp4, markets-highlight.mp4,")
    print("product-film-intro.mp3) is generated by make-fixture-media.sh.")
