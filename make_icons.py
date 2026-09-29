"""Draw the extension icons (icons/icon-{16,32,48,128}.png).

An LSU-purple rounded tile with a gold crescent moon: original artwork, not LSU's logo.
Drawn at high resolution and downscaled for smooth edges. The 128px icon follows the
Chrome Web Store guideline of 96px artwork inside 16px transparent padding.

Usage:  python make_icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

PURPLE = (70, 29, 124, 255)   # LSU purple
GOLD = (253, 208, 35, 255)    # LSU gold
SS = 1024                     # supersampled canvas

def draw(padding_ratio):
    img = Image.new("RGBA", (SS, SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = int(SS * padding_ratio)
    tile = (pad, pad, SS - pad, SS - pad)
    size = SS - 2 * pad
    d.rounded_rectangle(tile, radius=int(size * 0.22), fill=PURPLE)

    # Crescent: a gold disc with an offset purple disc cut out of it
    cx, cy, r = SS / 2 - size * 0.02, SS / 2, size * 0.30
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=GOLD)
    ox, oy, orr = cx + r * 0.52, cy - r * 0.38, r * 0.86
    d.ellipse((ox - orr, oy - orr, ox + orr, oy + orr), fill=PURPLE)
    return img

out = Path(__file__).parent / "icons"
out.mkdir(exist_ok=True)
for px in (16, 32, 48, 128):
    # Toolbar sizes fill the square; the 128 store icon keeps 16/128 padding.
    img = draw(0.125 if px == 128 else 0.02).resize((px, px), Image.LANCZOS)
    img.save(out / f"icon-{px}.png")
    print(f"wrote icons/icon-{px}.png")
