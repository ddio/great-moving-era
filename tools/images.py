#!/usr/bin/env python3
"""images/src/（你給的原始檔）-> images/full/ + images/thumb/

    images/full/   長邊 3000px、JPEG quality 75   網頁點圖放大與列印用
    images/thumb/  長邊 1000px、JPEG quality 78   網頁預設顯示用

一律移除 EXIF（含 GPS 定位）、依原始方向轉正；
若原始檔帶 ICC 色彩描述（iPhone 多為 Display P3）會先轉成 sRGB，
避免拔掉描述檔後顏色跑掉。

PNG 原始檔（平面圖、截圖等）維持 PNG 輸出，保留透明背景；
原圖色數在 256 色以內者（線稿類）輸出為索引色 PNG，檔案會小很多。

    python3 tools/images.py            # 增量，只處理新的或改過的
    python3 tools/images.py --force    # 全部重做
"""
import io
import os
import shutil
import sys

from PIL import Image, ImageCms, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, "images", "src")
OUT = [
    (os.path.join(ROOT, "images", "full"), 3000, 75),
    (os.path.join(ROOT, "images", "thumb"), 1000, 78),
]
READABLE = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".bmp"}
# 這些欄位可能夾帶拍攝地點、器材與個資，一律不寫進輸出檔
META_KEYS = ("exif", "icc_profile", "xmp", "photoshop", "comment", "iptc", "adobe")


def out_name(src_name):
    """PNG 維持 PNG（線稿），其餘一律轉 JPEG。"""
    stem, ext = os.path.splitext(src_name)
    return stem + (".png" if ext.lower() == ".png" else ".jpg")


def to_srgb(im, keep_alpha):
    icc = im.info.get("icc_profile")
    if not icc:
        return im
    try:
        src = ImageCms.ImageCmsProfile(io.BytesIO(icc))
        return ImageCms.profileToProfile(
            im, src, ImageCms.createProfile("sRGB"),
            outputMode="RGBA" if keep_alpha else "RGB")
    except Exception:
        return im  # 描述檔壞掉就照原樣處理，頂多顏色略有差異


def save_png(im):
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def render(src_path, dst_path, max_edge, quality):
    as_png = dst_path.lower().endswith(".png")
    with Image.open(src_path) as im:
        im = ImageOps.exif_transpose(im)   # 把拍攝方向烘進像素

        alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
        if im.mode in ("P", "L", "LA", "1", "I", "F"):
            im = im.convert("RGBA" if alpha else "RGB")
        if alpha and im.getchannel("A").getextrema() == (255, 255):
            im = im.convert("RGB")      # 整張都不透明，留著 alpha 只是浪費
            alpha = False
        im = to_srgb(im, alpha)

        # 縮圖會做內插、把線稿的色數撐開，所以要在縮之前判斷
        line_art = as_png and im.getcolors(maxcolors=256) is not None

        # 只小一點點就不要重新取樣：平面圖這類平坦色塊被內插後，
        # PNG 反而會變大（實測 1026px→1000px：48K 變成 147K）
        if max(im.size) > max_edge * 1.1:
            im.thumbnail((max_edge, max_edge), Image.LANCZOS)

        if not as_png:
            im = im.convert("RGB")
        elif not alpha:
            im = im.convert("RGB")

        for k in META_KEYS:            # 落地前清掉所有中介資料
            im.info.pop(k, None)

        if as_png:
            # 索引色不一定比較小：縮圖經過內插後色階變多，索引色反而會變肥。
            # 兩種都存進記憶體，取較小的那個。
            options = [save_png(im)]
            if line_art:
                # 透明圖只有 FASTOCTREE 能處理；線稿不抖動比較乾淨
                options.append(save_png(im.quantize(
                    colors=256,
                    method=Image.FASTOCTREE if alpha else Image.MEDIANCUT,
                    dither=Image.NONE,
                )))
            with open(dst_path, "wb") as fh:
                fh.write(min(options, key=len))
        else:
            im.save(dst_path, "JPEG", quality=quality, optimize=True, progressive=True)


def main():
    force = "--force" in sys.argv
    if not os.path.isdir(SRC_DIR):
        print(f"找不到 {SRC_DIR}\n請把原始照片放進 images/src/", file=sys.stderr)
        return 1
    for d, _, _ in OUT:
        os.makedirs(d, exist_ok=True)

    names = sorted(f for f in os.listdir(SRC_DIR)
                   if os.path.splitext(f)[1].lower() in READABLE)
    skipped_types = sorted(
        f for f in os.listdir(SRC_DIR)
        if not f.startswith(".") and os.path.splitext(f)[1].lower() not in READABLE
        and os.path.isfile(os.path.join(SRC_DIR, f))
    )

    done = reused = 0
    src_bytes = out_bytes = 0
    failed = []
    oversized = []

    for name in names:
        src = os.path.join(SRC_DIR, name)
        dst_name = out_name(name)
        targets = [(os.path.join(d, dst_name), edge, q) for d, edge, q in OUT]

        if not force and all(
            os.path.exists(p) and os.path.getmtime(p) >= os.path.getmtime(src)
            for p, _, _ in targets
        ):
            reused += 1
            continue

        try:
            for dst, edge, q in targets:
                render(src, dst, edge, q)
        except Exception as e:
            failed.append(f"{name}：{e}")
            continue

        # 保險：縮圖若反而比大圖大（PNG 常見），直接沿用大圖的檔案
        for (prev, _, _), (cur, _, _) in zip(targets, targets[1:]):
            if os.path.getsize(cur) > os.path.getsize(prev):
                shutil.copyfile(prev, cur)

        sizes = [os.path.getsize(p) for p, _, _ in targets]
        if sizes[0] > 1_500_000:
            oversized.append(f"{out_name(name)}（大圖 {sizes[0]//1024}K）")
        src_bytes += os.path.getsize(src)
        out_bytes += sum(sizes)
        done += 1
        print(f"  {name}  {os.path.getsize(src)//1024}K → "
              f"大圖 {sizes[0]//1024}K + 縮圖 {sizes[1]//1024}K")

    # 原始檔已刪除的，清掉對應輸出
    wanted = {out_name(n) for n in names}
    pruned = 0
    for d, _, _ in OUT:
        for f in os.listdir(d):
            if f not in wanted:
                os.remove(os.path.join(d, f))
                pruned += 1

    if skipped_types:
        print(f"  ⚠  跳過不支援的格式：{', '.join(skipped_types)}", file=sys.stderr)
        print("     （iPhone 的 .HEIC 請先在手機或 Finder 轉成 JPEG）", file=sys.stderr)
    if oversized:
        print(f"  ⚠  輸出偏大：{'、'.join(oversized)}", file=sys.stderr)
        print("     照片類的原始檔請存成 JPEG，PNG 適合平面圖與線稿", file=sys.stderr)
    for f in failed:
        print(f"  ✗  {f}", file=sys.stderr)

    msg = f"✓ 圖片處理完成：新增/更新 {done}、沿用 {reused}"
    if pruned:
        msg += f"、清除 {pruned}"
    if done:
        msg += f"（{src_bytes//1024}K → {out_bytes//1024}K，省 {100 - out_bytes*100//max(src_bytes,1)}%）"
    print(msg)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
