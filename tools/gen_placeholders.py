#!/usr/bin/env python3
"""依 content/site.yaml 產生假的「原始照片」到 images/src/（僅供開發預覽）

尺寸與手機直拍相同（4032×3024），並刻意寫入 GPS EXIF，
用來驗證 tools/images.py 有確實清除定位資訊。

真實照片就位後，清空 images/src/ 再放入真圖即可，本檔可一併刪除。
    python3 tools/gen_placeholders.py
"""
import os
import sys

import yaml
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "content", "site.yaml")
SRC_DIR = os.path.join(ROOT, "images", "src")

FONT_CANDIDATES = [
    os.path.expanduser("~/.fonts/TaipeiSansTCBeta-Regular.ttf"),
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/arphic/uming.ttc",
]
PALETTE = [
    (216, 226, 233), (226, 222, 213), (215, 228, 218), (233, 222, 226),
    (222, 220, 234), (229, 231, 214), (214, 229, 232), (232, 226, 216),
]


def font(size):
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def numbers(raw):
    """與 build.py 相同的編號規則：字串遞增、`編號: 圖說` 指定。"""
    out, n = [], 0
    for item in raw or []:
        if isinstance(item, dict) and len(item) == 1:
            key, val = next(iter(item.items()))
            if isinstance(key, int):
                n = key
                out.append((n, str(val or "")))
                continue
        n += 1
        out.append((n, item if isinstance(item, str) else ""))
    return out


def wrap(draw, text, fnt, width):
    lines, cur = [], ""
    for ch in text:
        if draw.textlength(cur + ch, font=fnt) > width:
            lines.append(cur)
            cur = ch
        else:
            cur += ch
    if cur:
        lines.append(cur)
    return lines[:4]


def fake_exif(orientation):
    """塞入 GPS（台北 101）與方向，模擬手機直拍的原始檔。"""
    exif = Image.Exif()
    exif[0x0112] = orientation                      # Orientation
    exif[0x010F] = "FakePhone"                      # Make
    exif[0x0110] = "Placeholder Cam"                # Model
    gps = exif.get_ifd(0x8825)
    gps[1] = "N"; gps[2] = (25, 2, 0)          # 25°02'00"N
    gps[3] = "E"; gps[4] = (121, 33, 54)        # 121°33'54"E
    return exif


def draw_image(path, w, h, bg, room, kind, no, caption):
    im = Image.new("RGB", (w, h), bg)
    d = ImageDraw.Draw(im)
    ink = (60, 68, 76)

    d.rectangle([24, 24, w - 24, h - 24], outline=(255, 255, 255), width=6)
    f_big, f_mid, f_small = font(int(h * 0.11)), font(int(h * 0.05)), font(int(h * 0.036))

    d.text((w // 2, int(h * 0.30)), room, font=f_big, fill=ink, anchor="mm")
    d.text((w // 2, int(h * 0.45)), f"{kind} {no:02d}", font=f_mid, fill=(120, 130, 140), anchor="mm")
    y = int(h * 0.60)
    for line in wrap(d, caption or "（未填圖說）", f_small, w * 0.8):
        d.text((w // 2, y), line, font=f_small, fill=(110, 118, 126), anchor="mm")
        y += int(h * 0.05)
    d.text((w // 2, h - 60), "PLACEHOLDER", font=f_small, fill=(180, 188, 196), anchor="mm")
    im.save(path, "JPEG", quality=88, exif=fake_exif(1))


def main():
    os.makedirs(SRC_DIR, exist_ok=True)
    with open(SRC, encoding="utf-8") as fh:
        raw = yaml.safe_load(fh)

    jobs = []
    ov = raw.get("overview") or {}
    for no, cap in numbers(ov.get("images")):
        jobs.append(("overview", "整體平面", "plan", no, cap, 0))
    for idx, room in enumerate(raw.get("rooms") or []):
        rid, name = room["id"], room.get("name", room["id"])
        for no, cap in numbers(room.get("layout")):
            jobs.append((rid, name, "layout", no, cap, idx + 1))
        for no, cap in numbers(room.get("detail")):
            jobs.append((rid, name, "detail", no, cap, idx + 1))

    kind_label = {"plan": "平面圖", "layout": "大格局", "detail": "細節"}
    for rid, name, kind, no, cap, ci in jobs:
        # 大格局橫幅、細節直幅，模擬實際拍攝
        w, h = (4032, 3024) if kind != "detail" else (3024, 4032)
        if kind == "detail" and no % 2 == 0:
            w, h = 4032, 3024
        path = os.path.join(SRC_DIR, f"{rid}-{kind}-{no:02d}.jpg")
        draw_image(path, w, h, PALETTE[ci % len(PALETTE)], name, kind_label[kind], no, cap)

    print(f"✓ 產生 {len(jobs)} 張假的原始照片到 images/src/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
