#!/usr/bin/env python3
"""content/site.yaml  ->  data/data.js

同時檢查 images/full/ 底下的圖片是否與 YAML 宣告一致：
  - YAML 宣告了但檔案不存在  -> 錯誤，build 失敗
  - 檔案存在但 YAML 沒提到    -> 警告，提醒補圖說
  - 缺少對應縮圖              -> 警告，提醒跑 tools/thumbs.py
"""
import datetime
import glob
import json
import os
import re
import sys

import yaml

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "content", "site.yaml")
OUT = os.path.join(ROOT, "data", "data.js")
FULL_DIR = os.path.join(ROOT, "images", "full")
THUMB_DIR = os.path.join(ROOT, "images", "thumb")
EXTS = ("jpg", "jpeg", "png", "webp", "JPG", "JPEG", "PNG", "WEBP")

errors, warnings = [], []


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
            out.append({"text": str(item), "children": []})
        elif isinstance(item, dict) and len(item) == 1:
            key, val = next(iter(item.items()))
            kids = []
            if isinstance(val, list):
                kids = [str(v) for v in val if v is not None]
            elif val is not None:
                kids = [str(val)]
            out.append({"text": str(key), "children": kids})
        else:
            err(f"{where}: 看不懂的說明項目 {item!r}（若文字中有半形冒號請用引號包起來）")
    return out


# --------------------------------------------------------------- images
def resolve_file(stem, where):
    """用 <stem>.* 找出實際檔案，回傳檔名（含副檔名）。"""
    hits = sorted(
        {os.path.basename(p) for e in EXTS for p in glob.glob(os.path.join(FULL_DIR, f"{stem}.{e}"))}
    )
    if not hits:
        err(f"{where}: 找不到圖片 images/full/{stem}.(jpg|png|webp)")
        return None
    if len(hits) > 1:
        warn(f"{where}: {stem} 有多個副檔名 {hits}，採用 {hits[0]}")
    return hits[0]


def parse_images(owner_id, kind, raw, where):
    """一項 = 圖說（編號自動遞增），或 `編號: 圖說`（指定編號）。"""
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
            caption = "" if val is None else str(val)
        else:
            err(f"{where}: 看不懂的圖片項目 {item!r}")
            continue

        stem = f"{owner_id}-{kind}-{n:02d}"
        fname = resolve_file(stem, f"{where} 第 {n} 張")
        if fname:
            out.append({"file": fname, "caption": caption, "no": n})
    return out


# ---------------------------------------------------------------- items
VOL_RE = re.compile(
    r"(\d+(?:\.\d+)?)\s*[×xX*]\s*(\d+(?:\.\d+)?)\s*[×xX*]\s*(\d+(?:\.\d+)?)"
)


# 常見標準容器，讓紙箱也能計入材積（車次評估用）
SIZE_ALIASES = {
    "標準箱": "60×40×40",
    "標準紙箱": "60×40×40",
    "標準吊衣箱": "50×50×100",
    "吊衣箱": "50×50×100",
}


def volume_m3(size):
    """'210×90×85cm' 或 '標準箱' -> 材積（立方公尺）；無法解析回 None。"""
    size = (size or "").strip()
    size = SIZE_ALIASES.get(size, size)
    m = VOL_RE.search(size)
    if not m:
        return None
    w, d, h = (float(g) for g in m.groups())
    return round(w * d * h / 1_000_000, 4)


def parse_items(raw, where):
    out = []
    for item in raw or []:
        if isinstance(item, list):
            name, qty, size, note = (list(item) + ["", "", "", ""])[:4]
        elif isinstance(item, dict):
            name = item.get("name", "")
            qty = item.get("qty", 1)
            size = item.get("size", "")
            note = item.get("note", "")
        else:
            err(f"{where}: 看不懂的品項 {item!r}（格式為 [名稱, 數量, 尺寸, 備註]）")
            continue
        try:
            qty = int(qty)
        except (TypeError, ValueError):
            err(f"{where}: 品項「{name}」的數量 {qty!r} 不是數字")
            qty = 0
        size = str(size or "")
        out.append(
            {
                "name": str(name),
                "qty": qty,
                "size": size,
                "note": str(note or ""),
                "volume": volume_m3(size),
            }
        )
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
        "title": str(raw.get("title", "搬家說明")),
        "subtitle": str(raw.get("subtitle", "")),
        "updated": str(raw.get("updated", "")),
        "contact": raw.get("contact") or {},
        "logistics": raw.get("logistics") or {},
        "overview": {
            "notes": parse_notes(ov.get("notes"), "overview.notes"),
            "images": collect(parse_images("overview", "plan", ov.get("images"), "overview.images")),
        },
        "rooms": [],
    }
    site["logistics"]["notes"] = parse_notes(
        (raw.get("logistics") or {}).get("notes"), "logistics.notes"
    )

    seen_ids = set()
    for room in raw.get("rooms") or []:
        rid = str(room.get("id", "")).strip()
        name = str(room.get("name", rid))
        if not rid:
            err(f"房間「{name}」缺少 id")
            continue
        if not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", rid):
            err(f"房間 id「{rid}」請只用小寫英數與 - _（檔名會用到）")
        if rid in seen_ids:
            err(f"房間 id「{rid}」重複")
        seen_ids.add(rid)

        site["rooms"].append(
            {
                "id": rid,
                "name": name,
                "summary": str(room.get("summary", "")),
                "notes": parse_notes(room.get("notes"), f"{rid}.notes"),
                "items": parse_items(room.get("items"), f"{rid}.items"),
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
        warn(f"images/full/{orphan} 沒有寫在 site.yaml 裡，不會出現在頁面上")

    missing_thumb = [f for f in sorted(used) if not os.path.exists(os.path.join(THUMB_DIR, f))]
    if missing_thumb:
        warn(f"{len(missing_thumb)} 張圖尚未產生縮圖，請執行：python3 tools/thumbs.py")

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
    n_item = sum(len(r["items"]) for r in site["rooms"])
    print(
        f"✓ data/data.js 已更新："
        f"{len(site['rooms'])} 個房間、{n_img} 張圖片、{n_item} 項物品"
        f"{f'（{len(warnings)} 個警告）' if warnings else ''}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
