#!/usr/bin/env python3
"""開發用 server：檔案一改就自動 build、自動更新瀏覽器。

    python3 tools/dev.py            # http://localhost:8777
    python3 tools/dev.py --port 3000

監看行為：
    content/site.yaml   -> 跑 build.py -> 重整（失敗則在畫面上顯示錯誤）
    images/src/*        -> 跑 images.py + build.py -> 重整
    assets/style.css    -> 熱抽換樣式，不重整、不跳位
    assets/app.js
    index.html          -> 重整（保留捲動位置）

注入的開發用腳本只存在於這個 server，不會寫進 index.html，
所以部署到 surge 的檔案是乾淨的。
"""
import argparse
import glob
import json
import os
import queue
import subprocess
import sys
import threading
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
POLL = 0.25          # 秒
DEBOUNCE = 0.2       # 秒

clients = []
clients_lock = threading.Lock()


def broadcast(kind, **extra):
    msg = json.dumps(dict(type=kind, **extra))
    with clients_lock:
        for q in list(clients):
            q.put(msg)


def run(script):
    """跑 build 腳本，回傳 (成功, 輸出)。"""
    p = subprocess.run(
        [sys.executable, script], cwd=ROOT, capture_output=True, text=True
    )
    out = (p.stdout + p.stderr).strip()
    return p.returncode == 0, out


# ------------------------------------------------------------- 檔案監看
def snapshot():
    files = {}
    for rel in ("content/site.yaml", "index.html", "assets/app.js", "assets/style.css"):
        path = os.path.join(ROOT, rel)
        if os.path.exists(path):
            files[rel] = os.path.getmtime(path)
    for path in glob.glob(os.path.join(ROOT, "images", "src", "*")):
        files["images/src/" + os.path.basename(path)] = os.path.getmtime(path)
    return files


def watch():
    prev = snapshot()
    while True:
        time.sleep(POLL)
        cur = snapshot()
        changed = {
            k for k in set(prev) | set(cur) if prev.get(k) != cur.get(k)
        }
        if not changed:
            continue

        # 等檔案寫完再動作（存檔常常是連續好幾次 write）
        time.sleep(DEBOUNCE)
        cur = snapshot()
        changed |= {k for k in set(prev) | set(cur) if prev.get(k) != cur.get(k)}
        prev = cur

        names = sorted(changed)
        print(f"\n● 變更：{', '.join(names[:4])}{' …' if len(names) > 4 else ''}")

        need_images = any(n.startswith("images/src/") for n in changed)
        need_build = need_images or "content/site.yaml" in changed

        if need_images:
            ok, out = run(os.path.join(ROOT, "tools", "images.py"))
            print("  " + out.replace("\n", "\n  "))
            if not ok:
                broadcast("error", title="images.py 失敗", text=out)
                continue

        if need_build:
            ok, out = run(os.path.join(ROOT, "build.py"))
            print("  " + out.replace("\n", "\n  "))
            if not ok:
                broadcast("error", title="build.py 失敗", text=out)
                continue
            broadcast("reload", note=out.splitlines()[-1] if out else "")
            continue

        if changed == {"assets/style.css"}:
            broadcast("css")
        else:
            broadcast("reload")


# --------------------------------------------------------------- client
CLIENT_JS = r"""
(function () {
  var box = null;
  function overlay(title, text) {
    if (!box) {
      box = document.createElement("div");
      box.id = "__dev_overlay";
      box.style.cssText =
        "position:fixed;inset:0;z-index:99999;background:rgba(22,15,14,.985);color:#ffd9d2;" +
        "font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;padding:40px;overflow:auto;" +
        "white-space:pre-wrap;-webkit-user-select:text;user-select:text";
      document.body.appendChild(box);
    }
    box.textContent = "✗ " + title + "\n\n" + text + "\n\n（修好檔案後會自動消失）";
  }
  function clearOverlay() { if (box) { box.remove(); box = null; } }

  function hotCSS() {
    document.querySelectorAll('link[rel="stylesheet"]').forEach(function (l) {
      var u = new URL(l.href, location.href);
      u.searchParams.set("__dev", Date.now());
      l.href = u.pathname + u.search;
    });
    flash("樣式已更新");
  }

  function flash(msg) {
    var t = document.createElement("div");
    t.textContent = msg;
    t.style.cssText =
      "position:fixed;left:14px;bottom:14px;z-index:99998;background:#1f2328;color:#fff;" +
      "padding:6px 12px;border-radius:5px;font:12px/1.4 system-ui,sans-serif;opacity:.94";
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 1600);
  }

  function reload() {
    try { sessionStorage.setItem("__dev_scroll", String(window.scrollY)); } catch (e) {}
    location.reload();
  }
  window.addEventListener("load", function () {
    try {
      var y = sessionStorage.getItem("__dev_scroll");
      if (y !== null) {
        sessionStorage.removeItem("__dev_scroll");
        setTimeout(function () { window.scrollTo(0, Number(y)); }, 60);
      }
    } catch (e) {}
  });

  var down = false;
  function connect() {
    var es = new EventSource("/__dev/events");
    es.onopen = function () {
      if (down) { down = false; reload(); }       // server 重啟後自動接回
    };
    es.onerror = function () { down = true; };
    es.onmessage = function (ev) {
      var m = JSON.parse(ev.data);
      if (m.type === "error") { overlay(m.title, m.text); }
      else if (m.type === "css") { clearOverlay(); hotCSS(); }
      else if (m.type === "reload") { clearOverlay(); reload(); }
    };
  }
  connect();
})();
"""


class Handler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass  # 只留下 watcher 的訊息

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        SimpleHTTPRequestHandler.end_headers(self)

    def _send(self, body, ctype):
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?")[0]

        if path == "/__dev/client.js":
            return self._send(CLIENT_JS.encode("utf-8"), "application/javascript; charset=utf-8")

        if path == "/__dev/events":
            return self.sse()

        if path in ("/", "/index.html"):
            with open(os.path.join(ROOT, "index.html"), encoding="utf-8") as fh:
                html = fh.read()
            html = html.replace("</body>", '<script src="/__dev/client.js"></script>\n</body>')
            return self._send(html.encode("utf-8"), "text/html; charset=utf-8")

        return SimpleHTTPRequestHandler.do_GET(self)

    def sse(self):
        q = queue.Queue()
        with clients_lock:
            clients.append(q)
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        try:
            self.wfile.write(b": connected\n\n")
            self.wfile.flush()
            while True:
                try:
                    msg = q.get(timeout=15)
                    self.wfile.write(f"data: {msg}\n\n".encode("utf-8"))
                except queue.Empty:
                    self.wfile.write(b": ping\n\n")   # 保活
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            with clients_lock:
                if q in clients:
                    clients.remove(q)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8777)
    ap.add_argument("--host", default="127.0.0.1")
    args = ap.parse_args()
    sys.stdout.reconfigure(line_buffering=True)

    ok, out = run(os.path.join(ROOT, "build.py"))
    print(out)
    if not ok:
        print("（先修好上面的錯誤，改檔後會自動重試）\n")

    threading.Thread(target=watch, daemon=True).start()
    srv = ThreadingHTTPServer((args.host, args.port), partial(Handler, directory=ROOT))
    srv.daemon_threads = True
    print(f"▶ http://{args.host}:{args.port}   （Ctrl-C 結束）")
    print("  監看 content/site.yaml、images/src/、assets/、index.html")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n結束")


if __name__ == "__main__":
    main()
