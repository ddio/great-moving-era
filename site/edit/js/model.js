// 編輯器內部的專案格式 <-> 網頁用的 window.MOVE_DATA（與 build.py 產出相同）
//
// 專案格式和 MOVE_DATA 幾乎一樣，差別只有：
//   - 說明（notes）存成純文字，一行一點，行首空兩格是子項目
//   - 照片只存 { id, caption }，檔案本身放在 IndexedDB；檔名與編號在匯出時才決定

export const PLACE_FIELDS = [
  ["address", "地址", "寫到路段就好，例如：新店區北新路三段"],
  ["floor", "樓層", "例：5F（共 12 層）"],
  ["elevator", "電梯", "例：有，轎廂 100 × 140 × 220 cm，門寬 80 cm"],
  ["parking", "停車", "例：貨車可停大門口，距大門約 8 公尺"],
  ["stairs", "樓梯", "例：樓梯寬 95 cm，每層一個轉角"],
  ["access", "出入", "例：管理室需前一天登記，限 09:00–17:00"],
];

export const ROOM_PRESETS = ["玄關", "客廳", "餐廳", "廚房", "主臥", "次臥", "書房", "浴室", "陽台", "儲藏室"];

export function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function place(label) {
  const o = { label };
  for (const [k] of PLACE_FIELDS) o[k] = "";
  return o;
}

export function emptyProject() {
  return {
    version: 1,
    title: "搬家說明",
    subtitle: "提供給搬家公司線上估價使用",
    updated: today(),
    contact: { name: "", phone: "", note: "" },
    logistics: { from: place("舊址"), to: place("新址"), preferredDate: "", notes: "" },
    overview: { notes: "", images: [] },
    furniture: [],
    rooms: [],
  };
}

export function uid(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function newRoomId(project) {
  let n = project.rooms.length + 1;
  const used = new Set(project.rooms.map((r) => r.id));
  while (used.has("room" + n)) n++;
  return "room" + n;
}

/* --------------------------------------------------------- 說明文字 */

const CHILD = /^([ \t　]+|[-－・•]\s*)/;

/** 「一行一點，行首空兩格為子項目」 -> [{ text, children }] */
export function parseNotes(text) {
  const out = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const isChild = /^[ \t　]/.test(line) && out.length;
    const clean = line.replace(CHILD, "").trim();
    if (!clean) continue;
    if (isChild) out[out.length - 1].children.push(clean);
    else out.push({ text: clean, children: [] });
  }
  return out;
}

export function notesToText(notes) {
  return (notes || []).map((n) =>
    [n.text, ...(n.children || []).map((c) => "  " + c)].join("\n")).join("\n");
}

/* ------------------------------------------------------------ 照片 */

export function imageGroups(project) {
  const groups = [{ owner: "overview", kind: "plan", list: project.overview.images }];
  for (const r of project.rooms) {
    groups.push({ owner: r.id, kind: "layout", list: r.layout });
    groups.push({ owner: r.id, kind: "detail", list: r.detail });
  }
  return groups;
}

/** 匯出時的檔名：<房間id>-<類型>-<兩位數編號>.<副檔名>，與 CLI 流程一致 */
export function assignFiles(project, meta) {
  const files = new Map();      // image id -> { file, no }
  for (const g of imageGroups(project)) {
    g.list.forEach((img, i) => {
      const m = meta.get(img.id);
      const no = i + 1;
      files.set(img.id, { file: `${g.owner}-${g.kind}-${String(no).padStart(2, "0")}.${m ? m.ext : "jpg"}`, no });
    });
  }
  return files;
}

/** 專案 -> MOVE_DATA。meta: Map<image id, { w, h, ext }> */
export function toData(project, meta) {
  const files = assignFiles(project, meta);
  const imgs = (list) => list.filter((img) => meta.has(img.id)).map((img) => {
    const m = meta.get(img.id);
    const f = files.get(img.id);
    return { file: f.file, caption: img.caption || "", no: f.no, w: m.w, h: m.h };
  });
  const L = project.logistics;
  return {
    title: project.title || "搬家說明",
    subtitle: project.subtitle || "",
    updated: project.updated || "",
    contact: { ...project.contact },
    logistics: {
      from: { ...L.from }, to: { ...L.to },
      preferredDate: L.preferredDate || "",
      notes: parseNotes(L.notes),
    },
    overview: { notes: parseNotes(project.overview.notes), images: imgs(project.overview.images) },
    furniture: project.furniture
      .filter((f) => (f.name || "").trim())
      .map((f) => ({ name: f.name.trim(), size: (f.size || "").trim(), note: (f.note || "").trim() })),
    rooms: project.rooms.map((r) => ({
      id: r.id,
      name: r.name || r.id,
      summary: r.summary || "",
      notes: parseNotes(r.notes),
      layout: imgs(r.layout),
      detail: imgs(r.detail),
    })),
  };
}

/** MOVE_DATA -> 專案。回傳 { project, wanted: [{ id, file }] } 讓呼叫端去載入照片 */
export function fromData(D) {
  const p = emptyProject();
  const wanted = [];
  const imgs = (list) => (list || []).map((img) => {
    const id = uid("img");
    wanted.push({ id, file: img.file });
    return { id, caption: img.caption || "" };
  });
  const s = (v) => (v == null ? "" : String(v));

  p.title = s(D.title) || p.title;
  p.subtitle = s(D.subtitle);
  p.updated = s(D.updated) || today();
  Object.assign(p.contact, D.contact || {});
  const L = D.logistics || {};
  Object.assign(p.logistics.from, L.from || {});
  Object.assign(p.logistics.to, L.to || {});
  p.logistics.preferredDate = s(L.preferredDate);
  p.logistics.notes = notesToText(L.notes);
  p.overview.notes = notesToText((D.overview || {}).notes);
  p.overview.images = imgs((D.overview || {}).images);
  p.furniture = (D.furniture || []).map((f) => ({ name: s(f.name), size: s(f.size), note: s(f.note) }));
  p.rooms = (D.rooms || []).map((r) => ({
    id: s(r.id), name: s(r.name), summary: s(r.summary),
    notes: notesToText(r.notes), layout: imgs(r.layout), detail: imgs(r.detail),
  }));
  return { project: p, wanted };
}

/** data.js 的內容 -> MOVE_DATA（build.py 寫的是 window.MOVE_DATA = {JSON};） */
export function parseDataJs(text) {
  const m = text.match(/window\.MOVE_DATA\s*=\s*([\s\S]*?);?\s*$/);
  if (!m) throw new Error("data.js 格式不對，找不到 window.MOVE_DATA");
  return JSON.parse(m[1]);
}

export function dataJs(D) {
  return "/* 由「我想搬出去！」線上編輯器產生 */\n" +
    "window.MOVE_DATA = " + JSON.stringify(D, null, 2) + ";\n";
}

/* ------------------------------------------------------ 還缺什麼 */

/** 下載前的提醒清單：[{ level: "warn" | "tip", text }] */
export function checklist(project) {
  const out = [];
  const L = project.logistics;
  for (const [key, name] of [["from", "舊址"], ["to", "新址"]]) {
    const pl = L[key];
    if (!pl.floor) out.push({ level: "warn", text: `${name}還沒寫樓層` });
    if (!pl.elevator) out.push({ level: "warn", text: `${name}還沒寫有沒有電梯` });
    if (/\d+\s*號/.test(pl.address || "")) {
      out.push({ level: "tip", text: `${name}地址好像寫到門牌號碼了，建議只寫到路段` });
    }
  }
  if (!L.preferredDate) out.push({ level: "tip", text: "還沒寫希望的搬家日期" });
  if (!project.contact.phone && !project.contact.note) {
    out.push({ level: "tip", text: "還沒留聯絡方式，搬家公司不知道怎麼回報價" });
  }
  if (!project.rooms.length) out.push({ level: "warn", text: "還沒有任何房間" });
  const empty = project.rooms.filter((r) => !r.layout.length && !r.detail.length).map((r) => r.name || "未命名房間");
  if (empty.length) out.push({ level: "warn", text: `這些房間還沒有照片：${empty.join("、")}` });
  if (!project.furniture.some((f) => (f.name || "").trim())) {
    out.push({ level: "tip", text: "沒有列大型家具。沙發、冰箱、衣櫃這類最影響報價" });
  }
  return out;
}
