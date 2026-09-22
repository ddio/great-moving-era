#!/usr/bin/env python3
"""產生要寄給搬家公司的 PDF。

不經過瀏覽器的列印對話框，所以不會被「符合頁面」之類的縮放設定影響——
對話框只要縮放不是 100%，Chrome 就會把每張照片重新取樣成無損點陣圖，
同一份內容可以從 27MB 變成 440MB。

    python3 tools/make_pdf.py                  # 輸出 <標題>.pdf
    python3 tools/make_pdf.py -o 給XX搬家.pdf
    python3 tools/make_pdf.py --compress       # 再用 ghostscript 壓一次
"""
import argparse
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser")


def find_chrome():
    for name in CHROME:
        path = shutil.which(name)
        if path:
            return path
    return None


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def serve():
    """純靜態 server：不注入開發腳本，也沒有 SSE 連線卡住無頭瀏覽器。"""
    port = free_port()

    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self, *a, **k):
            pass

    srv = ThreadingHTTPServer(("127.0.0.1", port),
                              partial(Quiet, directory=ROOT))
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, port


def default_name():
    try:
        with open(os.path.join(ROOT, "content", "site.yaml"), encoding="utf-8") as fh:
            title = (yaml.safe_load(fh) or {}).get("title") or "搬家說明"
    except Exception:
        title = "搬家說明"
    return re.sub(r'[/\\?%*:|"<>]', "-", str(title)).strip() + ".pdf"


def report(path, label):
    mb = os.path.getsize(path) / 1048576
    print(f"  {label}: {mb:.1f} MB")
    return mb


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("-o", "--out")
    ap.add_argument("--compress", action="store_true",
                    help="再用 ghostscript 壓一次（需要 gs）")
    ap.add_argument("--timeout", type=int, default=180)
    args = ap.parse_args()

    chrome = find_chrome()
    if not chrome:
        print("找不到 Chrome，請安裝 google-chrome 或 chromium", file=sys.stderr)
        return 1
    if not os.path.exists(os.path.join(ROOT, "data", "data.js")):
        print("還沒 build，請先執行 ./build.sh", file=sys.stderr)
        return 1

    out = os.path.abspath(args.out or os.path.join(ROOT, default_name()))
    srv, port = serve()
    tmp = tempfile.mkstemp(suffix=".pdf")[1]
    try:
        print(f"產生 PDF…（{os.path.basename(out)}）")
        cmd = [
            chrome, "--headless=new", "--disable-gpu", "--no-sandbox",
            "--virtual-time-budget=60000", "--no-pdf-header-footer",
            f"--print-to-pdf={tmp}",
            f"http://127.0.0.1:{port}/?print=1",
        ]
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=args.timeout)
        if not os.path.exists(tmp) or os.path.getsize(tmp) == 0:
            print("Chrome 沒有產生 PDF：", (p.stderr or "").strip()[:400], file=sys.stderr)
            return 1
        before = report(tmp, "Chrome 輸出")

        if args.compress:
            gs = shutil.which("gs")
            if not gs:
                print("  找不到 gs，略過壓縮", file=sys.stderr)
            else:
                small = tempfile.mkstemp(suffix=".pdf")[1]
                subprocess.run(
                    [gs, "-sDEVICE=pdfwrite", "-dCompatibilityLevel=1.7",
                     "-dPDFSETTINGS=/printer", "-dNOPAUSE", "-dBATCH", "-dQUIET",
                     f"-sOutputFile={small}", tmp],
                    check=False,
                )
                if os.path.exists(small) and 0 < os.path.getsize(small) < os.path.getsize(tmp):
                    report(small, "壓縮後  ")
                    os.replace(small, tmp)
                else:
                    print("  壓縮沒有變小，保留原檔")
                    if os.path.exists(small):
                        os.remove(small)

        shutil.move(tmp, out)
        print(f"✓ {out}  ({os.path.getsize(out)/1048576:.1f} MB)")
        return 0
    except subprocess.TimeoutExpired:
        print(f"Chrome 逾時（{args.timeout}s）", file=sys.stderr)
        return 1
    finally:
        srv.shutdown()
        if os.path.exists(tmp):
            os.remove(tmp)


if __name__ == "__main__":
    sys.exit(main())
