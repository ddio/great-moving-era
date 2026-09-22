#!/usr/bin/env python3
"""發佈到 surge.sh。

只上傳網頁需要的檔案，其餘一律不進 dist/：
原始照片 images/src/（約 180MB）、content/site.yaml、產出的 PDF、
工具程式與 README 都不會被公開。

    python3 tools/publish.py --domain xxxx.surge.sh   # 第一次，網域會記在 .surge-domain
    python3 tools/publish.py                          # 之後沿用同一個網域
    python3 tools/publish.py --dry-run                # 只產 dist/，不上傳
"""
import argparse
import os
import re
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist")
DOMAIN_FILE = os.path.join(ROOT, ".surge-domain")

# 白名單：沒列在這裡的東西不會被公開
INCLUDE_FILES = ["index.html", "assets/style.css", "assets/app.js",
                 "assets/blur.css", "data/data.js"]
INCLUDE_DIRS = ["images/full", "images/thumb"]

ROBOTS = "User-agent: *\nDisallow: /\n"


def human(n):
    return f"{n/1048576:.1f} MB" if n >= 1048576 else f"{n/1024:.0f} KB"


def tree_size(path):
    total = 0
    for dirpath, _, names in os.walk(path):
        for n in names:
            total += os.path.getsize(os.path.join(dirpath, n))
    return total


def build():
    for script in ("tools/images.py", "build.py"):
        p = subprocess.run([sys.executable, os.path.join(ROOT, script)],
                           cwd=ROOT, capture_output=True, text=True)
        out = (p.stdout + p.stderr).strip()
        if out:
            print("  " + out.replace("\n", "\n  "))
        if p.returncode != 0:
            print(f"{script} 失敗，停止發佈", file=sys.stderr)
            return False
    return True


def stage(domain):
    if os.path.exists(DIST):
        shutil.rmtree(DIST)
    os.makedirs(DIST)

    missing = []
    for rel in INCLUDE_FILES:
        src = os.path.join(ROOT, rel)
        if not os.path.exists(src):
            missing.append(rel)
            continue
        dst = os.path.join(DIST, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)
    for rel in INCLUDE_DIRS:
        src = os.path.join(ROOT, rel)
        if not os.path.isdir(src):
            missing.append(rel)
            continue
        shutil.copytree(src, os.path.join(DIST, rel))

    if missing:
        print(f"缺少 {', '.join(missing)}，請先執行 ./build.sh", file=sys.stderr)
        return False

    with open(os.path.join(DIST, "robots.txt"), "w", encoding="utf-8") as fh:
        fh.write(ROBOTS)
    with open(os.path.join(DIST, "CNAME"), "w", encoding="utf-8") as fh:
        fh.write(domain + "\n")
    return True


def summary():
    print("\n  dist/ 內容：")
    for rel in INCLUDE_FILES + ["robots.txt", "CNAME"]:
        p = os.path.join(DIST, rel)
        if os.path.exists(p):
            print(f"    {rel:22s} {human(os.path.getsize(p))}")
    for rel in INCLUDE_DIRS:
        p = os.path.join(DIST, rel)
        n = len(os.listdir(p))
        print(f"    {rel + '/':22s} {human(tree_size(p))}  （{n} 個檔案）")
    print(f"    {'合計':22s} {human(tree_size(DIST))}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--domain")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    domain = args.domain
    if not domain and os.path.exists(DOMAIN_FILE):
        domain = open(DOMAIN_FILE, encoding="utf-8").read().strip()
    if not domain:
        print("第一次發佈請指定網域：--domain xxxx.surge.sh", file=sys.stderr)
        return 1
    if not re.fullmatch(r"[a-z0-9][a-z0-9.-]*\.[a-z]{2,}", domain):
        print(f"網域格式怪怪的：{domain}", file=sys.stderr)
        return 1

    if not build():
        return 1
    if not stage(domain):
        return 1
    summary()

    if args.dry_run:
        print(f"\n（--dry-run，沒有上傳）預計網址：https://{domain}")
        return 0

    print(f"\n上傳到 https://{domain} …")
    p = subprocess.run(["npx", "--yes", "surge", DIST, domain], cwd=ROOT)
    if p.returncode != 0:
        return p.returncode

    with open(DOMAIN_FILE, "w", encoding="utf-8") as fh:
        fh.write(domain + "\n")
    print(f"\n✓ https://{domain}")
    print("  網址沒有密碼保護，任何知道網址的人都看得到內容。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
