"""Compose Chrome Web Store images from the captures in store/raw/.

Outputs (store/):
  screenshot-1-light-vs-dark.png   1280x800
  screenshot-2-amoled.png          1280x800
  screenshot-3-dark.png            1280x800
  promo-small-440x280.png          440x280

The captures are of the public LSU Moodle front page, with the profile picture and
cookie banner hidden. Fonts are Windows' Segoe UI; adjust FONT_DIR elsewhere.

Usage:  python store/make_store_images.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent
RAW = HERE / "raw"
FONT_DIR = Path("C:/Windows/Fonts")
BG = (11, 10, 15)
TEXT = (231, 228, 238)
MUTED = (168, 162, 184)
GOLD = (253, 208, 35)
PURPLE = (70, 29, 124)

def font(bold, size):
    return ImageFont.truetype(str(FONT_DIR / ("segoeuib.ttf" if bold else "segoeui.ttf")), size)

def capture(name):
    im = Image.open(RAW / f"{name}.jpg").convert("RGB")
    return im.crop((0, 0, im.width - 12, im.height - 4))  # drop scrollbar/edge pixels

def rounded(im, radius):
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, *im.size), radius, fill=255)
    out = Image.new("RGBA", im.size)
    out.paste(im, (0, 0), mask)
    return out

def frame(shot, title, subtitle):
    W, H = 1280, 800
    canvas = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(canvas)
    d.text((64, 48), title, font=font(True, 44), fill=TEXT)
    d.text((64, 108), subtitle, font=font(False, 24), fill=MUTED)
    d.rectangle((64, 150, 124, 154), fill=GOLD)
    w = W - 128
    h = round(shot.height * w / shot.width)
    shot = rounded(shot.resize((w, h), Image.LANCZOS), 14)
    canvas.paste(shot, (64, H - h - 48), shot)
    return canvas

light, dark, amoled = capture("light"), capture("dark"), capture("amoled")

# 1. Light vs dark: left half light, right half dark, gold divider
split = light.copy()
half = split.width // 2
split.paste(dark.crop((half, 0, dark.width, dark.height)), (half, 0))
ImageDraw.Draw(split).rectangle((half - 2, 0, half + 2, split.height), fill=GOLD)
frame(split, "Dark mode for LSU Moodle", "Light on the left, dark on the right. One click in the toolbar.") \
    .save(HERE / "screenshot-1-light-vs-dark.png")

frame(amoled, "AMOLED black", "True-black background: OLED pixels switch off, saving battery.") \
    .save(HERE / "screenshot-2-amoled.png")

frame(dark, "Readable everywhere", "Leftover light boxes and low-contrast text are fixed automatically.") \
    .save(HERE / "screenshot-3-dark.png")

# Small promo tile: icon + name on LSU purple
tile = Image.new("RGB", (440, 280), PURPLE)
icon = Image.open(HERE.parent / "icons" / "icon-128.png").convert("RGBA")
icon = icon.crop((16, 16, 112, 112)).resize((120, 120), Image.LANCZOS)  # drop store padding
tile.paste(icon, (36, 80), icon)
d = ImageDraw.Draw(tile)
d.text((180, 92), "Moodle Dark", font=font(True, 34), fill=(255, 255, 255))
d.text((181, 140), "Dark & AMOLED theme", font=font(False, 20), fill=GOLD)
d.text((181, 168), "for LSU Moodle", font=font(False, 20), fill=GOLD)
d.text((181, 206), "Unofficial", font=font(False, 14), fill=(200, 190, 225))
tile.save(HERE / "promo-small-440x280.png")

for p in sorted(HERE.glob("*.png")):
    print("wrote", p.relative_to(HERE.parent), Image.open(p).size)
