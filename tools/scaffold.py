#!/usr/bin/env python3
"""依 images/src/ 的檔名，產生待填圖說的 site.yaml 骨架。

    python3 tools/scaffold.py                       # 印出來看
    python3 tools/scaffold.py -o content/site.yaml  # 寫入（不覆蓋既有檔案）
    python3 tools/scaffold.py -o content/site.yaml --force
    python3 tools/scaffold.py --auto                # 不逐張列，改用 auto

房間順序依檔名排序，請自行調整成實際走動的順序。
既有的 content/site.yaml 不會被合併，重跑前請自行備份。
"""
import argparse
import os
import re
import sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, "images", "src")
PATTERN = re.compile(r"^(?P<room>.+)-(?P<kind>layout|detail|plan)-(?P<no>\d+)\.[^.]+$")

HEADER = """\
# 完整的欄位說明與寫法請看 content/site.example.yaml
#
# 圖說寫在編號後面，例如：
#     - 1: 從玄關看向客廳全景
# 編號對應 images/src/<房間>-<類型>-<編號>.jpg
# 不需要出現在頁面上的照片，把整行刪掉即可。
#
# 不想寫圖說：冒號後面留空就好，頁面上只會顯示編號。
# 整個區塊都不寫圖說，可以直接改成一行 auto，照片會自動全部帶入：
#     layout: auto
"""


def scan():
    rooms = defaultdict(lambda: defaultdict(list))
    unmatched = []
    for name in sorted(os.listdir(SRC_DIR)):
        if name.startswith(".") or not os.path.isfile(os.path.join(SRC_DIR, name)):
            continue
        m = PATTERN.match(name)
        if not m:
            unmatched.append(name)
            continue
        rooms[m["room"]][m["kind"]].append(int(m["no"]))
    return rooms, unmatched


def image_lines(numbers, auto):
    if auto:
        return None          # 由呼叫端改寫成 `layout: auto`
    return [f"      - {n}:" for n in sorted(numbers)]


def build(rooms, auto=False):
    out = [HEADER]
    out.append("title: OO 路 → XX 路 搬家說明")
    out.append("subtitle: 提供給搬家公司線上估價使用")
    out.append("updated: 2026-09-22")
    out.append("contact:\n  name:\n  phone:\n  note:\n")

    out.append("logistics:")
    for key, label in (("from", "舊址"), ("to", "新址")):
        out.append(f"  {key}:")
        out.append(f"    label: {label}")
        for field in ("address", "floor", "elevator", "parking", "stairs", "access"):
            out.append(f"    {field}:")
    out.append("  preferredDate:")
    out.append("  notes:\n    #- \n")

    overview = rooms.pop("overview", {})
    out.append("overview:")
    out.append("  notes:\n    #- ")
    out.append("  images:")
    if overview.get("plan"):
        out.extend(f"    - {n}:" for n in sorted(overview["plan"]))
    else:
        out.append("    #（把平面圖命名為 overview-plan-01.jpg 放進 images/src/）")
    out.append("")

    out.append("# 大型家具與需特別留意的物品（不分房間）")
    out.append("#   寫法： 名稱  /  [名稱, 尺寸]  /  [名稱, 尺寸, 附註]")
    out.append("#   紙箱與細項不用寫，讓搬家公司看照片評估")
    out.append("furniture:")
    out.append("  #- 三人座布沙發")
    out.append("  #- [雙門冰箱, 70×70×180cm]")
    out.append("  #- [四門衣櫃, 200×60×220cm, 可拆板]")
    out.append("  #- [鋼琴, \"\", 需另計]")
    out.append("")
    out.append("rooms:")
    for room in sorted(rooms):
        kinds = rooms[room]
        total = sum(len(v) for v in kinds.values())
        out.append(f"  # ── {room}：共 {total} 張照片 ──")
        out.append(f"  - id: {room}")
        out.append(f"    name: {room}")
        out.append("    summary:")
        out.append("    notes:\n      #- ")
        for kind in ("layout", "detail"):
            nums = kinds.get(kind, [])
            if not nums:
                out.append(f"    #{kind}:（這個房間沒有這類照片）")
            elif auto:
                out.append(f"    {kind}: auto")
            else:
                out.append(f"    {kind}:")
                out.extend(image_lines(nums, False))
        out.append("")
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("-o", "--out")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--auto", action="store_true",
                    help="圖片區塊只寫 auto，不逐張列出編號（不打算寫圖說時用）")
    args = ap.parse_args()

    if not os.path.isdir(SRC_DIR):
        print(f"找不到 {SRC_DIR}", file=sys.stderr)
        return 1

    rooms, unmatched = scan()
    if unmatched:
        print("⚠  檔名不符規則、已略過：", file=sys.stderr)
        for n in unmatched:
            print(f"     {n}", file=sys.stderr)
        print("   規則為 <房間>-layout|detail-<編號>.jpg，"
              "整體平面圖為 overview-plan-<編號>.jpg\n", file=sys.stderr)
    if not rooms:
        print("images/src/ 裡沒有符合命名規則的照片", file=sys.stderr)
        return 1

    text = build(rooms, auto=args.auto)
    if not args.out:
        print(text)
        return 0

    path = os.path.join(ROOT, args.out)
    if os.path.exists(path) and not args.force:
        print(f"{args.out} 已存在，加 --force 才會覆蓋", file=sys.stderr)
        return 1
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)
    n_room = len(rooms)
    n_img = sum(len(v) for k in rooms.values() for v in k.values())
    print(f"✓ 已寫入 {args.out}：{n_room} 個房間、{n_img} 個待填圖說")
    return 0


if __name__ == "__main__":
    sys.exit(main())
