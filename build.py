#!/usr/bin/env python3
"""content/site.yaml  ->  data/data.js

同時檢查 images/full/ 底下的圖片是否與 YAML 宣告一致：
  - YAML 宣告了但檔案不存在  -> 錯誤，build 失敗
  - 檔案存在但 YAML 沒提到    -> 警告，提醒補圖說
  - 缺少對應縮圖              -> 警告，提醒跑 tools/images.py
"""
import datetime
import glob
import json
import os
import re
import sys

import yaml
from PIL import Image

# MOVE_ROOT：改用別的資料夾（例如 demo/），結構同專案根目錄
ROOT = os.environ.get("MOVE_ROOT") or os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "content", "site.yaml")
OUT = os.path.join(ROOT, "data", "data.js")
FULL_DIR = os.path.join(ROOT, "images", "full")
THUMB_DIR = os.path.join(ROOT, "images", "thumb")
EXTS = ("jpg", "jpeg", "png", "webp", "JPG", "JPEG", "PNG", "WEBP")

errors, warnings = [], []


def text(v):
    """YAML 空欄位會是 None，直接 str() 會印出字面的 "None"。"""
    return "" if v is None else str(v)


def err(msg):
    errors.append(msg)


def warn(msg):
    warnings.append(msg)


# ---------------------------------------------------------------- notes
def parse_notes(raw, where):
    """字串 -> bullet；單鍵 mapping -> bullet + 子 bullets（最多兩層）。"""
    out = []
    for item in raw or []:
        if item is None:
            continue
        if isinstance(item, (str, int, float, datetime.date)):
            out.append({"text": text(item), "children": []})
        elif isinstance(item, dict) and len(item) == 1:
            key, val = next(iter(item.items()))
            kids = []
            if isinstance(val, list):
                kids = [text(v) for v in val if v is not None]
            elif val is not None:
                kids = [text(val)]
            out.append({"text": text(key), "children": kids})
        else:
            err(f"{where}: 看不懂的說明項目 {item!r}（若文字中有半形冒號請用引號包起來）")
    return out


# --------------------------------------------------------------- images
def dimensions(fname):
    """給前端排版用，避免圖片載入前後跳版。"""
    try:
        with Image.open(os.path.join(FULL_DIR, fname)) as im:
            return im.size
    except Exception:
        return (4, 3)


def resolve_file(stem, where):
    """用 <stem>.* 找出實際檔案，回傳檔名（含副檔名）。"""
    hits = sorted(
        {os.path.basename(p) for e in EXTS for p in glob.glob(os.path.join(FULL_DIR, f"{stem}.{e}"))}
    )
    if not hits:
        err(f"{where}: 找不到圖片 images/full/{stem}.(jpg|png|webp)"
            f"（原始檔放進 images/src/ 後執行 python3 tools/images.py）")
        return None
    if len(hits) > 1:
        warn(f"{where}: {stem} 有多個副檔名 {hits}，採用 {hits[0]}")
    return hits[0]


def scan_images(owner_id, kind):
    """images/full 裡所有 <owner>-<kind>-<編號> 的檔案，依編號排序。"""
    found = {}
    for e in EXTS:
        for path in glob.glob(os.path.join(FULL_DIR, f"{owner_id}-{kind}-*.{e}")):
            name = os.path.basename(path)
            m = re.fullmatch(rf"{re.escape(owner_id)}-{kind}-(\d+)\.[^.]+", name)
            if m:
                found[int(m.group(1))] = name
    out = []
    for n in sorted(found):
        w, h = dimensions(found[n])
        out.append({"file": found[n], "caption": "", "no": n, "w": w, "h": h})
    return out


def parse_images(owner_id, kind, raw, where):
    """三種寫法：
       auto            -> 自動帶入該房間這一類的所有照片，不附圖說
       - 圖說           -> 編號自動遞增
       - 編號: 圖說     -> 指定編號
    """
    if isinstance(raw, str):
        if raw.strip().lower() != "auto":
            err(f"{where}: 只認得 auto，或改成一行一張的圖說清單")
            return []
        found = scan_images(owner_id, kind)
        if not found:
            warn(f"{where}: 寫了 auto，但 images/full 裡沒有 {owner_id}-{kind}-* 的照片")
        return found

    out, n = [], 0
    for item in raw or []:
        if item is None or isinstance(item, str):
            n += 1
            caption = item or ""
        elif isinstance(item, dict) and len(item) == 1:
            key, val = next(iter(item.items()))
            if not isinstance(key, int):
                err(f"{where}: 「{key}」不是編號。圖說若含半形冒號請用引號包起來，例如 \"抽屜：線材\"")
                continue
            n = key
            caption = text(val)
        else:
            err(f"{where}: 看不懂的圖片項目 {item!r}")
            continue

        stem = f"{owner_id}-{kind}-{n:02d}"
        fname = resolve_file(stem, f"{where} 第 {n} 張")
        if fname:
            w, h = dimensions(fname)
            out.append({"file": fname, "caption": caption, "no": n, "w": w, "h": h})
    return out


# ------------------------------------------------------------ 大型家具
def parse_furniture(raw, where):
    """一項可以是：
         名稱
         [名稱, 尺寸]
         [名稱, 尺寸, 附註]
         {name:, size:, note:}
       尺寸與附註都可以不填。
    """
    out = []
    for item in raw or []:
        if item is None:
            continue
        if isinstance(item, str):
            name, size, note = item, "", ""
        elif isinstance(item, list):
            name, size, note = (list(item) + ["", "", ""])[:3]
        elif isinstance(item, dict):
            name = item.get("name", "")
            size = item.get("size", "")
            note = item.get("note", "")
        else:
            err(f"{where}: 看不懂的項目 {item!r}（格式為 名稱 或 [名稱, 尺寸, 附註]）")
            continue
        name = text(name).strip()
        if not name:
            err(f"{where}: 有一項沒有名稱")
            continue
        out.append({"name": name, "size": text(size).strip(), "note": text(note).strip()})
    return out


# ----------------------------------------------------------------- main
def main():
    with open(SRC, encoding="utf-8") as fh:
        raw = yaml.safe_load(fh)

    used = set()

    def collect(imgs):
        for i in imgs:
            used.add(i["file"])
        return imgs

    ov = raw.get("overview") or {}
    site = {
        "title": text(raw.get("title")) or "搬家說明",
        "subtitle": text(raw.get("subtitle")),
        "updated": text(raw.get("updated")),
        "contact": raw.get("contact") or {},
        "logistics": raw.get("logistics") or {},
        "overview": {
            "notes": parse_notes(ov.get("notes"), "overview.notes"),
            "images": collect(parse_images("overview", "plan", ov.get("images"), "overview.images")),
        },
        "furniture": parse_furniture(raw.get("furniture"), "furniture"),
        "rooms": [],
    }
    site["logistics"]["notes"] = parse_notes(
        (raw.get("logistics") or {}).get("notes"), "logistics.notes"
    )

    seen_ids = set()
    for room in raw.get("rooms") or []:
        rid = text(room.get("id")).strip()
        name = text(room.get("name")) or rid
        if not rid:
            err(f"房間「{name}」缺少 id")
            continue
        if re.search(r'[\s/\\?#%:*"<>|]', rid) or rid[0] in ".-":
            err(f"房間 id「{rid}」含有不能用在檔名或網址的字元"
                f"（空白與 / \\ ? # % : * \" < > | 都不行）")
        if rid in seen_ids:
            err(f"房間 id「{rid}」重複")
        seen_ids.add(rid)

        if room.get("items"):
            err(f"{rid}: items 已取消，請把大型家具移到最外層的 furniture:（不分房間）")

        site["rooms"].append(
            {
                "id": rid,
                "name": name,
                "summary": text(room.get("summary")),
                "notes": parse_notes(room.get("notes"), f"{rid}.notes"),
                "layout": collect(parse_images(rid, "layout", room.get("layout"), f"{rid}.layout")),
                "detail": collect(parse_images(rid, "detail", room.get("detail"), f"{rid}.detail")),
            }
        )

    # 對帳：資料夾裡有、YAML 沒提到的圖
    on_disk = {
        os.path.basename(p)
        for e in EXTS
        for p in glob.glob(os.path.join(FULL_DIR, f"*.{e}"))
    }
    for orphan in sorted(on_disk - used):
        warn(f"{orphan} 沒有寫在 site.yaml 裡，不會出現在頁面上")

    missing_thumb = [f for f in sorted(used) if not os.path.exists(os.path.join(THUMB_DIR, f))]
    if missing_thumb:
        warn(f"{len(missing_thumb)} 張圖尚未產生縮圖，請執行：python3 tools/images.py")

    for w in warnings:
        print(f"  ⚠  {w}", file=sys.stderr)
    for e in errors:
        print(f"  ✗  {e}", file=sys.stderr)
    if errors:
        print(f"\nbuild 失敗：{len(errors)} 個錯誤", file=sys.stderr)
        return 1

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    body = json.dumps(site, ensure_ascii=False, indent=2, default=str)
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write("/* 由 build.py 自動產生，請勿手動修改；請改 content/site.yaml */\n")
        fh.write(f"window.MOVE_DATA = {body};\n")

    n_img = len(used)
    n_item = len(site["furniture"])
    print(
        f"✓ data/data.js 已更新："
        f"{len(site['rooms'])} 個房間、{n_img} 張圖片、{n_item} 件大型家具"
        f"{f'（{len(warnings)} 個警告）' if warnings else ''}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
