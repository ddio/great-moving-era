#!/usr/bin/env python3
"""組出 GitHub Pages 要發佈的整站：_site/

    site/              landing、編輯器、分享教學、404（原樣複製）
    /viewer/           網頁本體（index.html + assets/），編輯器預覽與匯出時抓這份
    /demo/             範例屋：demo/ 的 YAML 與名畫跑一次既有的 build 流程

    python3 tools/build_site.py            # 產生 _site/
    python3 tools/build_site.py --serve    # 產生後開 http://127.0.0.1:8778

GitHub Actions（.github/workflows/pages.yml）跑的也是這支。
"""
import argparse
import os
import shutil
import subprocess
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "_site")
DEMO = os.path.join(ROOT, "demo")

# 流量統計：只放在本站頁面上，使用者匯出的網站不會帶到
GOATCOUNTER = "https://great-moving-era.goatcounter.com/count"
GC_TAG = (f'<script data-goatcounter="{GOATCOUNTER}" '
          'async src="//gc.zgo.at/count.js"></script>')
GC_MARK = "<!-- goatcounter -->"

VIEWER_FILES = ["index.html", "assets/style.css", "assets/app.js", "assets/blur.css"]

DEMO_BANNER = """
<div class="demo-banner" style="background:#23201b;color:#fff;font-size:14px;line-height:1.5;
  padding:10px 16px;text-align:center">
  這是範例屋：照片由名畫代打，人物、地址、電話都是虛構的。
  <a href="../edit/" style="color:#f0e8d0;font-weight:600;margin-left:6px">做一份自己的</a>
  <span style="opacity:.6;margin:0 6px">|</span>
  <a href="../" style="color:#f0e8d0">回首頁</a>
</div>
"""


# 範例屋的標題與分享卡（viewer 的標題由 JS 設定，社群平台的爬蟲不會執行 JS）
DEMO_HEAD = """<title>範例屋：考古學者的搬家說明｜我想搬出去！</title>
<meta name="description" content="書很多、拓本很脆弱，其餘都好說。看看一份搬家公司看了就能報價的家當說明長什麼樣子。">
<meta property="og:type" content="website">
<meta property="og:site_name" content="我想搬出去！">
<meta property="og:locale" content="zh_TW">
<meta property="og:url" content="https://great-moving-era.ddio.io/demo/">
<meta property="og:title" content="範例屋：考古學者的搬家說明">
<meta property="og:description" content="書很多、拓本很脆弱，其餘都好說。照片由梵谷、維梅爾代打。">
<meta property="og:image" content="https://great-moving-era.ddio.io/assets/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">"""


def copy_viewer(dst):
    for rel in VIEWER_FILES:
        os.makedirs(os.path.dirname(os.path.join(dst, rel)), exist_ok=True)
        shutil.copy2(os.path.join(ROOT, rel), os.path.join(dst, rel))


def build_demo():
    env = dict(os.environ, MOVE_ROOT=DEMO)
    for cmd in (["tools/images.py"], ["build.py"]):
        subprocess.run([sys.executable, *cmd], cwd=ROOT, env=env, check=True)

    dst = os.path.join(OUT, "demo")
    copy_viewer(dst)
    os.makedirs(os.path.join(dst, "data"), exist_ok=True)
    shutil.copy2(os.path.join(DEMO, "data", "data.js"), os.path.join(dst, "data", "data.js"))
    for size in ("full", "thumb"):
        shutil.copytree(os.path.join(DEMO, "images", size), os.path.join(dst, "images", size))

    # 範例屋要讓人搜得到，也要帶統計與導覽列
    path = os.path.join(dst, "index.html")
    with open(path, encoding="utf-8") as fh:
        html = fh.read()
    html = html.replace('<meta name="robots" content="noindex">\n', "")
    html = html.replace("<title>搬家估價說明</title>", DEMO_HEAD, 1)
    html = html.replace("</head>", GC_MARK + "\n</head>", 1)
    html = html.replace("<body>", "<body>" + DEMO_BANNER, 1)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(html)


def inject_counter():
    for base, dirs, files in os.walk(OUT):
        if os.path.relpath(base, OUT).split(os.sep)[0] == "viewer":
            continue
        for f in files:
            if not f.endswith(".html"):
                continue
            path = os.path.join(base, f)
            with open(path, encoding="utf-8") as fh:
                html = fh.read()
            if GC_MARK in html:
                with open(path, "w", encoding="utf-8") as fh:
                    fh.write(html.replace(GC_MARK, GC_TAG))


def serve(port):
    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self, *a, **k):
            pass

    srv = ThreadingHTTPServer(("127.0.0.1", port), partial(Quiet, directory=OUT))
    print(f"→ http://127.0.0.1:{port}/   （Ctrl+C 結束）")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--serve", action="store_true")
    ap.add_argument("--port", type=int, default=8778)
    args = ap.parse_args()

    shutil.rmtree(OUT, ignore_errors=True)
    shutil.copytree(os.path.join(ROOT, "site"), OUT)
    copy_viewer(os.path.join(OUT, "viewer"))
    build_demo()
    inject_counter()
    print(f"✓ {os.path.relpath(OUT, ROOT)}/ 已產生")

    if args.serve:
        serve(args.port)
    return 0


if __name__ == "__main__":
    sys.exit(main())
