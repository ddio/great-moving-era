#!/usr/bin/env python3
"""images/full/ -> images/thumb/   （長邊 1000px、quality 78）

只處理縮圖不存在或比原圖舊的檔案，可重複執行。
    python3 tools/thumbs.py          # 增量
    python3 tools/thumbs.py --force  # 全部重做
"""
import os
import sys

from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FULL_DIR = os.path.join(ROOT, "images", "full")
THUMB_DIR = os.path.join(ROOT, "images", "thumb")
MAX_EDGE = 1000
QUALITY = 78
EXTS = {".jpg", ".jpeg", ".png", ".webp"}


def main():
    force = "--force" in sys.argv
    os.makedirs(THUMB_DIR, exist_ok=True)
    if not os.path.isdir(FULL_DIR):
        print(f"找不到 {FULL_DIR}", file=sys.stderr)
        return 1

    names = sorted(
        f for f in os.listdir(FULL_DIR) if os.path.splitext(f)[1].lower() in EXTS
    )
    done = skipped = 0
    src_bytes = out_bytes = 0

    for name in names:
        src = os.path.join(FULL_DIR, name)
        dst = os.path.join(THUMB_DIR, name)
        if not force and os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
            skipped += 1
            continue

        with Image.open(src) as im:
            im = ImageOps.exif_transpose(im)          # 修正手機拍照方向
            im.thumbnail((MAX_EDGE, MAX_EDGE), Image.LANCZOS)
            ext = os.path.splitext(name)[1].lower()
            if ext in (".jpg", ".jpeg"):
                im.convert("RGB").save(
                    dst, "JPEG", quality=QUALITY, optimize=True, progressive=True
                )
            elif ext == ".png":
                im.convert("RGB" if im.mode == "RGBA" else im.mode).save(
                    dst, "PNG", optimize=True
                )
            else:
                im.save(dst, quality=QUALITY, method=6)

        src_bytes += os.path.getsize(src)
        out_bytes += os.path.getsize(dst)
        done += 1
        print(f"  {name}  {os.path.getsize(src)//1024}K → {os.path.getsize(dst)//1024}K")

    # 清掉原圖已刪除的殘留縮圖
    stale = [f for f in os.listdir(THUMB_DIR) if f not in set(names)]
    for f in stale:
        os.remove(os.path.join(THUMB_DIR, f))

    msg = f"✓ 縮圖完成：新增/更新 {done}、沿用 {skipped}"
    if stale:
        msg += f"、清除 {len(stale)}"
    if done:
        msg += f"（{src_bytes//1024}K → {out_bytes//1024}K，省 {100 - out_bytes*100//max(src_bytes,1)}%）"
    print(msg)
    return 0


if __name__ == "__main__":
    sys.exit(main())
