// 直接在瀏覽器組出 PDF，不經過列印對話框。
//
// 列印對話框的縮放只要不是 100%，Chrome 就會把照片重新取樣成無損點陣圖，
// PDF 從幾 MB 變成幾百 MB（見 tools/make_pdf.py）。這裡用 pdf-lib 把縮圖的 JPEG
// 原封不動嵌進去，檔案大小可預期。代價是版面要自己排，比網頁陽春一點。

import { toData, assignFiles } from "./model.js";
import { loadImages } from "./io.js";

// Noto Sans TC 轉成 TrueType 輪廓的版本（約 6.4MB，由本站提供，見 vendor/README.md）。
// pdf-lib 自己的子集化會產出壞檔，所以先用 HarfBuzz 裁出用到的字，再整套嵌入。
const FONT_URL = "fonts/NotoSansTC-Regular.ttf";
const FONT_SIZE = 6_661_404;

const A4 = [595.28, 841.89];
const M = 44;                       // 頁邊
const FOOT = 26;                    // 頁尾保留高度
const GAP = 12;

// 版面上固定會出現的字，和使用者內容一起送去裁字型
const LABELS = "搬運條件希望搬遷日期：大型家具與需特別留意的物品件品項尺寸說明整體說明平面圖" +
  "張照片大格局細節更新日期聯絡人地址樓層電梯停車樓梯出入第頁 　•–" +
  Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join("");

let libsP = null;
let fontP = null;
let hbP = null;

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = res;
    s.onerror = () => rej(new Error("載入 PDF 工具失敗，請確認網路連線"));
    document.head.appendChild(s);
  });
}

function loadLibs() {
  if (!libsP) {
    libsP = Promise.all([loadScript("vendor/pdf-lib.min.js"), loadScript("vendor/fontkit.umd.min.js")])
      .catch((e) => { libsP = null; throw e; });
  }
  return libsP;
}

function loadHb() {
  if (!hbP) {
    hbP = fetch("vendor/hb-subset.wasm")
      .then((r) => { if (!r.ok) throw new Error("載入字型工具失敗，請確認網路連線"); return r.arrayBuffer(); })
      .then((buf) => WebAssembly.instantiate(buf))
      .then((m) => m.instance.exports)
      .catch((e) => { hbP = null; throw e; });
  }
  return hbP;
}

function loadFont(onStatus) {
  if (!fontP) {
    fontP = (async () => {
      const res = await fetch(FONT_URL);
      if (!res.ok || !res.body) throw new Error("下載中文字型失敗，請確認網路連線");
      const total = Number(res.headers.get("content-length")) || FONT_SIZE;
      const reader = res.body.getReader();
      const chunks = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        got += value.length;
        onStatus(`下載中文字型 ${Math.min(99, Math.round((got / total) * 100))}%（約 6MB，只需要一次）`);
      }
      const out = new Uint8Array(got);
      let o = 0;
      for (const c of chunks) { out.set(c, o); o += c.length; }
      return out;
    })().catch((e) => { fontP = null; throw e; });
  }
  return fontP;
}

/** HarfBuzz：只留下 text 裡用到的字 */
function subsetFont(hb, fontBytes, text) {
  const ptr = hb.malloc(fontBytes.byteLength);
  new Uint8Array(hb.memory.buffer).set(fontBytes, ptr);
  const blob = hb.hb_blob_create(ptr, fontBytes.byteLength, 2 /* WRITABLE */, 0, 0);
  const face = hb.hb_face_create(blob, 0);
  hb.hb_blob_destroy(blob);
  const input = hb.hb_subset_input_create_or_fail();
  const unicodes = hb.hb_subset_input_unicode_set(input);
  for (const ch of new Set(text)) hb.hb_set_add(unicodes, ch.codePointAt(0));
  // 拿掉排版表：fontkit 排英數字時會套 GSUB 換成替代字形，那組字形在 PDF 裡
  // 字寬不對（「64x78」會變成「6 4 x7 8」）。中文用不到連字與字距微調。
  const drop = hb.hb_subset_input_set(input, 3 /* HB_SUBSET_SETS_DROP_TABLE_TAG */);
  for (const tag of ["GSUB", "GPOS", "GDEF"]) {
    hb.hb_set_add(drop, [...tag].reduce((n, c) => (n << 8) | c.charCodeAt(0), 0) >>> 0);
  }
  const sub = hb.hb_subset_or_fail(face, input);
  hb.hb_subset_input_destroy(input);
  const rb = hb.hb_face_reference_blob(sub);
  const off = hb.hb_blob_get_data(rb, 0);
  const len = hb.hb_blob_get_length(rb);
  // wasm 記憶體可能在 malloc 時長大，要重新取 buffer
  const out = new Uint8Array(hb.memory.buffer).slice(off, off + len);
  hb.hb_blob_destroy(rb);
  hb.hb_face_destroy(sub);
  hb.hb_face_destroy(face);
  hb.free(ptr);
  if (!len) throw new Error("字型處理失敗");
  return out;
}

/* ------------------------------------------------------------ 排版 */

class Writer {
  constructor(doc, font, lib) {
    this.doc = doc;
    this.font = font;
    this.rgb = lib.rgb;
    this.C = {
      ink: lib.rgb(0.12, 0.14, 0.16),
      soft: lib.rgb(0.36, 0.39, 0.43),
      mute: lib.rgb(0.52, 0.55, 0.59),
      accent: lib.rgb(0.17, 0.31, 0.44),
      line: lib.rgb(0.82, 0.84, 0.86),
      warn: lib.rgb(0.6, 0.36, 0.12),
    };
    const cs = new Set(font.getCharacterSet());
    this.has = (ch) => cs.has(ch.codePointAt(0));
    this.W = A4[0] - M * 2;
    this.page = null;
    this.y = 0;
  }

  clean(s) {
    return Array.from(String(s == null ? "" : s).replace(/\t/g, " "))
      .filter((ch) => ch === "\n" || this.has(ch)).join("");
  }

  width(s, size) { return this.font.widthOfTextAtSize(s, size); }

  /** 中文可以任意斷，英數字盡量整個字一起換行 */
  wrap(text, size, maxW) {
    const lines = [];
    for (const para of this.clean(text).split("\n")) {
      const tokens = para.match(/[A-Za-z0-9.,:;%@/_+\-()'"×]+|\s+|./gu) || [""];
      let line = "";
      for (let tok of tokens) {
        if (this.width(line + tok, size) <= maxW) { line += tok; continue; }
        if (line.trim()) lines.push(line.trimEnd());
        line = "";
        if (/^\s+$/.test(tok)) continue;
        // 單一個字就超過寬度（很長的網址），硬切
        while (this.width(tok, size) > maxW) {
          let n = tok.length;
          while (n > 1 && this.width(tok.slice(0, n), size) > maxW) n--;
          lines.push(tok.slice(0, n));
          tok = tok.slice(n);
        }
        line = tok;
      }
      lines.push(line.trimEnd());
    }
    return lines;
  }

  newPage() {
    this.page = this.doc.addPage(A4);
    this.y = M;
  }

  room() { return A4[1] - M - FOOT - this.y; }

  need(h) { if (!this.page || h > this.room()) this.newPage(); }

  draw(str, x, size, color) {
    this.page.drawText(str, { x, y: A4[1] - this.y - size, size, font: this.font, color });
  }

  /** 換行文字，回傳用掉的高度 */
  text(str, { size = 10, color = this.C.ink, x = 0, width = this.W, lh = 1.5, after = 0 } = {}) {
    const lines = this.wrap(str, size, width);
    for (const l of lines) {
      this.need(size * lh);
      this.draw(l, M + x, size, color);
      this.y += size * lh;
    }
    this.y += after;
  }

  rule(color = this.C.line, thick = 0.8) {
    const y = A4[1] - this.y;
    this.page.drawLine({ start: { x: M, y }, end: { x: M + this.W, y }, thickness: thick, color });
  }

  heading(str, tag) {
    this.need(40);
    this.y += 6;
    this.draw(this.clean(str), M, 14, this.C.ink);
    if (tag) {
      const w = this.width(this.clean(str), 14);
      this.draw(this.clean(tag), M + w + 8, 9, this.C.mute);
    }
    this.y += 14 * 1.45;
    this.rule(this.C.mute, 0.6);
    this.y += 10;
  }

  sub(str) {
    this.need(40);
    this.y += 6;
    this.text(str, { size: 9, color: this.C.mute, after: 4 });
  }

  bullets(notes) {
    for (const n of notes || []) {
      this.need(16);
      this.draw("•", M + 2, 10, this.C.ink);
      this.text(n.text, { x: 14, width: this.W - 14 });
      for (const c of n.children || []) {
        this.need(15);
        this.draw("–", M + 18, 9.5, this.C.soft);
        this.text(c, { size: 9.5, color: this.C.soft, x: 30, width: this.W - 30 });
      }
      this.y += 2;
    }
  }

  footer(title) {
    const pages = this.doc.getPages();
    const t = this.clean(title);
    pages.forEach((p, i) => {
      const s = `${t}　第 ${i + 1} / ${pages.length} 頁`;
      const w = this.width(s, 8);
      p.drawText(s, { x: (A4[0] - w) / 2, y: M * 0.55, size: 8, font: this.font, color: this.C.mute });
    });
  }
}

/* ------------------------------------------------------------ 內容 */

function placeBlock(w, p, width) {
  const rows = [["地址", p.address], ["樓層", p.floor], ["電梯", p.elevator],
    ["停車", p.parking], ["樓梯", p.stairs], ["出入", p.access]].filter((r) => r[1]);
  const keyW = 30;
  const lines = rows.map(([k, v]) => ({ k, lines: w.wrap(v, 9.5, width - keyW) }));
  const h = 18 + lines.reduce((s, r) => s + r.lines.length * 14.5 + 2, 0);
  return { label: p.label || "", lines, h, keyW };
}

function drawPlace(w, blk, x) {
  let y = w.y;
  w.page.drawText(w.clean(blk.label), { x: M + x, y: A4[1] - y - 11, size: 11, font: w.font, color: w.C.accent });
  y += 18;
  for (const r of blk.lines) {
    w.page.drawText(r.k, { x: M + x, y: A4[1] - y - 9, size: 9, font: w.font, color: w.C.mute });
    for (const l of r.lines) {
      w.page.drawText(l, { x: M + x + blk.keyW, y: A4[1] - y - 9.5, size: 9.5, font: w.font, color: w.C.ink });
      y += 14.5;
    }
    y += 2;
  }
}

function logistics(w, D) {
  const L = D.logistics;
  w.heading("搬運條件");
  const colW = (w.W - 20) / 2;
  const a = placeBlock(w, L.from, colW);
  const b = placeBlock(w, L.to, colW);
  w.need(Math.max(a.h, b.h));
  drawPlace(w, a, 0);
  drawPlace(w, b, colW + 20);
  w.y += Math.max(a.h, b.h) + 6;
  if (L.preferredDate) w.text("希望搬遷日期：" + L.preferredDate, { size: 10.5, color: w.C.accent, after: 6 });
  w.bullets(L.notes);
}

function furniture(w, D) {
  const list = D.furniture;
  if (!list.length) return;
  w.y += 14;
  w.heading("大型家具與需特別留意的物品", `${list.length} 件`);
  const hasSize = list.some((f) => f.size);
  const hasNote = list.some((f) => f.note);
  const cols = [["品項", "name", hasNote ? 0.34 : 0.55]];
  if (hasSize) cols.push(["尺寸", "size", hasNote ? 0.26 : 0.45]);
  if (hasNote) cols.push(["說明", "note", hasSize ? 0.4 : 0.66]);
  const size = 9.5;
  const lh = 14;

  const header = () => {
    let x = 0;
    for (const [label, , frac] of cols) {
      w.draw(label, M + x, 8.5, w.C.mute);
      x += frac * w.W;
    }
    w.y += 16;
    w.rule();
    w.y += 5;
  };
  w.need(40);
  header();
  for (const f of list) {
    const cells = cols.map(([, key, frac]) => w.wrap(f[key] || "", size, frac * w.W - 8));
    const h = Math.max(...cells.map((c) => c.length)) * lh + 6;
    if (h > w.room()) { w.newPage(); header(); }
    let x = 0;
    cells.forEach((lines, i) => {
      const color = cols[i][1] === "note" ? w.C.warn : w.C.ink;
      lines.forEach((l, j) => {
        w.page.drawText(l, { x: M + x, y: A4[1] - w.y - size - j * lh, size, font: w.font, color });
      });
      x += cols[i][2] * w.W;
    });
    w.y += h;
    w.rule();
    w.y += 5;
  }
}

async function embed(w, cache, rec) {
  if (!cache.has(rec.id)) {
    const bytes = new Uint8Array(await rec.thumb.arrayBuffer());
    cache.set(rec.id, rec.ext === "png" ? await w.doc.embedPng(bytes) : await w.doc.embedJpg(bytes));
  }
  return cache.get(rec.id);
}

/** 照片兩欄排列；plan=true 時一張一列、放大（平面圖是拿來讀的） */
async function photos(w, list, lookup, cache, plan) {
  const cols = plan ? 1 : 2;
  const colW = (w.W - GAP * (cols - 1)) / cols;
  const maxH = plan ? 420 : 190;
  for (let i = 0; i < list.length; i += cols) {
    const row = list.slice(i, i + cols).map((img) => {
      const rec = lookup.get(img.file);
      const ar = img.w && img.h ? img.w / img.h : 4 / 3;
      let iw = colW;
      let ih = iw / ar;
      if (ih > maxH) { ih = maxH; iw = ih * ar; }
      const cap = w.wrap(img.caption || "", 8.5, colW - 20);
      return { img, rec, iw, ih, cap };
    });
    const h = Math.max(...row.map((r) => r.ih + 8 + Math.max(1, r.cap.length) * 12.5)) + GAP;
    w.need(h);
    for (let c = 0; c < row.length; c++) {
      const r = row[c];
      const x = M + c * (colW + GAP);
      if (r.rec) {
        const pic = await embed(w, cache, r.rec);
        w.page.drawImage(pic, { x, y: A4[1] - w.y - r.ih, width: r.iw, height: r.ih });
        w.page.drawRectangle({ x, y: A4[1] - w.y - r.ih, width: r.iw, height: r.ih,
          borderColor: w.C.line, borderWidth: 0.5 });
      }
      const cy = w.y + r.ih + 6;
      const no = String(r.img.no);
      w.page.drawText(no, { x, y: A4[1] - cy - 8.5, size: 8.5, font: w.font, color: w.C.accent });
      r.cap.forEach((l, j) => {
        w.page.drawText(l, { x: x + 16, y: A4[1] - cy - 8.5 - j * 12.5, size: 8.5, font: w.font, color: w.C.soft });
      });
    }
    w.y += h;
  }
}

export async function buildPdf(project, onStatus = () => {}) {
  onStatus("準備 PDF 工具…");
  const [, hb, fontBytes] = await Promise.all([loadLibs(), loadHb(), loadFont(onStatus)]);
  const lib = window.PDFLib;

  onStatus("排版中…");
  const meta = await loadImages(project);
  const D = toData(project, meta);
  const names = assignFiles(project, meta);
  const lookup = new Map();
  for (const [id, n] of names) if (meta.has(id)) lookup.set(n.file, { id, ...meta.get(id) });

  const doc = await lib.PDFDocument.create();
  doc.registerFontkit(window.fontkit);
  const font = await doc.embedFont(subsetFont(hb, fontBytes, JSON.stringify(D) + LABELS), { subset: false });
  const w = new Writer(doc, font, lib);
  const cache = new Map();

  // 頁首
  w.newPage();
  w.text(D.title, { size: 19, lh: 1.35, after: 4 });
  if (D.subtitle) w.text(D.subtitle, { size: 10.5, color: w.C.soft, after: 2 });
  const c = D.contact || {};
  const contact = [c.name ? "聯絡人 " + c.name : "", c.phone, c.note].filter(Boolean).join("　");
  if (D.updated) w.text("更新日期 " + D.updated, { size: 8.5, color: w.C.mute });
  if (contact) w.text(contact, { size: 9.5, color: w.C.soft });
  w.y += 8;
  w.rule(w.C.ink, 1.4);
  w.y += 16;

  logistics(w, D);
  furniture(w, D);

  // 整體說明
  if (D.overview.notes.length || D.overview.images.length) {
    w.newPage();
    w.heading("整體說明", D.overview.images.length ? "平面圖" : "");
    w.bullets(D.overview.notes);
    if (D.overview.images.length) {
      w.sub("平面圖");
      onStatus("放入平面圖…");
      await photos(w, D.overview.images, lookup, cache, true);
    }
  }

  // 各房間，一間一頁起
  for (const [i, r] of D.rooms.entries()) {
    onStatus(`放入照片：${r.name}（${i + 1}/${D.rooms.length}）`);
    w.newPage();
    const n = r.layout.length + r.detail.length;
    w.heading(r.name, n ? `${n} 張照片` : "");
    if (r.summary) w.text(r.summary, { size: 10, color: w.C.soft, after: 6 });
    w.bullets(r.notes);
    if (r.layout.length) { w.sub("大格局"); await photos(w, r.layout, lookup, cache, false); }
    if (r.detail.length) { w.sub("細節照片"); await photos(w, r.detail, lookup, cache, false); }
  }

  w.footer(D.title);
  doc.setTitle(D.title);
  doc.setCreator("我想搬出去！ great-moving-era.ddio.io");
  doc.setProducer("我想搬出去！");
  doc.setAuthor("");

  onStatus("存檔中…");
  const bytes = await doc.save();
  return new Blob([bytes], { type: "application/pdf" });
}
