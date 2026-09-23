// 編輯器主程式：表單、照片、自動儲存、預覽、下載
import * as store from "./store.js";
import { processImage, ImageError } from "./images.js";
import {
  emptyProject, newRoomId, uid, today, toData, assignFiles, checklist, PLACE_FIELDS, ROOM_PRESETS,
} from "./model.js";
import { buildSiteZip, importZip, importFolder, importDemo, loadImages } from "./io.js";

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let P = null;                 // 目前的專案
const thumbURL = new Map();   // image id -> object URL
let busy = 0;                 // 處理照片中，離開頁面要警告

/* ------------------------------------------------------------ 統計 */
function track(path, title) {
  try {
    if (window.goatcounter && window.goatcounter.count) {
      window.goatcounter.count({ path: "event/" + path, title, event: true });
    }
  } catch (e) { /* 統計失敗不影響使用 */ }
}

/* ------------------------------------------------------------ 儲存 */
const statusEl = $("#save-status");
let saveTimer = null;

function hhmm() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function scheduleSave() {
  statusEl.textContent = "儲存中…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 400);
}

async function saveNow() {
  clearTimeout(saveTimer);
  try {
    await store.saveProject(P);
    statusEl.textContent = `已存在這台電腦 ${hhmm()}`;
  } catch (e) {
    statusEl.textContent = "儲存失敗：瀏覽器空間可能不足";
  }
}

/* ----------------------------------------------------- 路徑存取 */
function getAt(path) {
  return path.split(".").reduce((o, k) => (o == null ? o : o[k]), P);
}
function setAt(path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  const obj = keys.reduce((o, k) => o[k], P);
  obj[last] = value;
}

/* ------------------------------------------------------------ 對話框 */
const dlg = $("#dlg");

function ask(msg, buttons) {
  return new Promise((res) => {
    $("#dlg-msg").textContent = msg;
    const box = $("#dlg-actions");
    box.innerHTML = "";
    for (const b of buttons) {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "btn btn-small" + (b.primary ? " btn-primary" : "") + (b.danger ? " btn-danger" : "");
      el.textContent = b.label;
      el.onclick = () => { dlg.close(); res(b.value); };
      box.appendChild(el);
    }
    dlg.onclose = () => res(null);
    dlg.showModal();
  });
}

function confirmBox(msg, okLabel, danger) {
  return ask(msg, [
    { label: "取消", value: false },
    { label: okLabel, value: true, primary: !danger, danger },
  ]);
}

function progress(msg) {
  $("#dlg-msg").textContent = msg;
  $("#dlg-actions").innerHTML = "";
  dlg.oncancel = (e) => e.preventDefault();
  if (!dlg.open) dlg.showModal();
  return {
    set: (m) => { $("#dlg-msg").textContent = m; },
    done: () => { dlg.oncancel = null; dlg.close(); },
  };
}

function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

function safeName(s) {
  return (String(s || "搬家說明").replace(/[/\\?%*:|"<>]/g, "-").trim() || "搬家說明").slice(0, 60);
}

/* ------------------------------------------------------------ 表單 */
function field(label, path, { hint = "", placeholder = "", type = "text", wide = false } = {}) {
  const v = getAt(path) || "";
  const input = type === "textarea"
    ? `<textarea data-path="${path}" rows="4" placeholder="${esc(placeholder)}">${esc(v)}</textarea>`
    : `<input type="text" data-path="${path}" value="${esc(v)}" placeholder="${esc(placeholder)}">`;
  return `<label class="field${wide ? " wide" : ""}"><span class="field-label">${esc(label)}</span>${input}` +
    (hint ? `<span class="hint">${esc(hint)}</span>` : "") + "</label>";
}

// 電腦的檔案視窗預設點一下只選一張，要提示按鍵；手機的相簿挑選器本來就能多選
const MULTI_KEY = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘ 或 Shift" : "Ctrl 或 Shift";

const NOTES_HINT = "一行一點。行首空兩格，會變成上一點底下的子項目。";

function notesField(label, path, placeholder) {
  return field(label, path, { type: "textarea", hint: NOTES_HINT, placeholder, wide: true });
}

function photoZone(listPath, kind) {
  const labels = {
    plan: ["平面圖", "有平面圖最好，沒有的話手繪拍照也可以"],
    layout: ["大格局", "站在門口或角落，拍整個房間。一間 1–3 張"],
    detail: ["細節照片", "難搬、易碎、要拆的東西，或櫃子裡有多少東西"],
  }[kind];
  return `<div class="zone-wrap">
    <div class="zone-head"><strong>${labels[0]}</strong><span class="hint">${labels[1]}</span></div>
    <div class="zone" data-zone="${listPath}">${zoneInner(listPath)}</div>
  </div>`;
}

function zoneInner(listPath) {
  const list = getAt(listPath) || [];
  const isRoom = /^rooms\.\d+\.(layout|detail)$/.test(listPath);
  const other = listPath.endsWith("layout") ? "細節" : "大格局";
  const tiles = list.map((img, i) => `
    <figure class="tile" data-img="${img.id}">
      <div class="tile-img"><span class="no">${i + 1}</span><img alt="" data-thumb="${img.id}"></div>
      <input type="text" class="caption" data-path="${listPath}.${i}.caption" value="${esc(img.caption)}"
             placeholder="寫一句圖說（可不填）" aria-label="第 ${i + 1} 張的圖說">
      <div class="tile-tools">
        <button type="button" data-act="img-left" data-list="${listPath}" data-i="${i}" ${i === 0 ? "disabled" : ""} aria-label="往前">←</button>
        <button type="button" data-act="img-right" data-list="${listPath}" data-i="${i}" ${i === list.length - 1 ? "disabled" : ""} aria-label="往後">→</button>
        ${isRoom ? `<button type="button" data-act="img-swap" data-list="${listPath}" data-i="${i}">移到${other}</button>` : ""}
        <button type="button" data-act="img-del" data-list="${listPath}" data-i="${i}" class="danger">刪除</button>
      </div>
    </figure>`).join("");
  return tiles + `<button type="button" class="tile add" data-act="add-photos" data-list="${listPath}">
      <span class="plus">＋</span><span>加照片</span><span class="hint">可以一次選很多張，<br>或直接把照片拖進來</span>
      <span class="hint multi-key">按住 ${MULTI_KEY} 可多選</span>
    </button>`;
}

function placeCard(key) {
  const base = `logistics.${key}`;
  return `<div class="place">
    <label class="field place-label"><input type="text" data-path="${base}.label" value="${esc(getAt(base + ".label"))}" aria-label="名稱"></label>
    ${PLACE_FIELDS.map(([k, label, ph]) => field(label, `${base}.${k}`, { placeholder: ph })).join("")}
  </div>`;
}

function furnitureRows() {
  if (!P.furniture.length) {
    return `<p class="empty">還沒有任何項目。沙發、冰箱、洗衣機、衣櫃、床墊、鋼琴這類最影響報價。</p>`;
  }
  return `<div class="furn-head"><span>品項</span><span>尺寸</span><span>說明</span><span></span></div>` +
    P.furniture.map((f, i) => `<div class="furn-row">
      <input type="text" data-path="furniture.${i}.name" value="${esc(f.name)}" placeholder="例：雙門冰箱" aria-label="品項">
      <input type="text" data-path="furniture.${i}.size" value="${esc(f.size)}" placeholder="長×寬×高cm" aria-label="尺寸">
      <input type="text" data-path="furniture.${i}.note" value="${esc(f.note)}" placeholder="例：可拆、易碎、約 60kg" aria-label="說明">
      <span class="row-tools">
        <button type="button" data-act="furn-up" data-i="${i}" ${i === 0 ? "disabled" : ""} aria-label="上移">↑</button>
        <button type="button" data-act="furn-del" data-i="${i}" class="danger" aria-label="刪除">✕</button>
      </span>
    </div>`).join("");
}

function roomSection(r, i) {
  return `<section class="card room" id="room-${esc(r.id)}">
    <div class="room-head">
      <input type="text" class="room-name" data-path="rooms.${i}.name" value="${esc(r.name)}" placeholder="房間名稱" aria-label="房間名稱">
      <span class="row-tools">
        <button type="button" data-act="room-up" data-i="${i}" ${i === 0 ? "disabled" : ""}>上移</button>
        <button type="button" data-act="room-down" data-i="${i}" ${i === P.rooms.length - 1 ? "disabled" : ""}>下移</button>
        <button type="button" data-act="room-del" data-i="${i}" class="danger">刪除房間</button>
      </span>
    </div>
    ${field("一句話重點", `rooms.${i}.summary`, { placeholder: "例：家具都不帶走，只有書要打包", wide: true })}
    ${notesField("說明", `rooms.${i}.notes`, "例：\n衣櫃可拆，需要拆裝\n書約 10 箱\n  都是小箱，偏重")}
    ${photoZone(`rooms.${i}.layout`, "layout")}
    ${photoZone(`rooms.${i}.detail`, "detail")}
  </section>`;
}

function doneSection() {
  const items = checklist(P);
  const list = items.length
    ? `<ul class="check">${items.map((c) => `<li class="${c.level}">${esc(c.text)}</li>`).join("")}</ul>`
    : `<p class="all-good">看起來都齊了，可以下載給搬家公司了。</p>`;
  return `<section class="card done" id="sec-done">
    <h2>完成：給搬家公司</h2>
    <h3>還可以補充的地方</h3>
    ${list}
    <div class="done-grid">
      <div>
        <h3>下載 PDF</h3>
        <p>最適合直接用 LINE 或 Email 傳。第一次會下載中文字型（約 6MB）。</p>
        <button type="button" class="btn btn-primary" data-act="pdf">下載 PDF</button>
      </div>
      <div>
        <h3>下載網站檔</h3>
        <p>解壓縮後，點兩下裡面的 <code>index.html</code> 就能在自己電腦上看，不用網路。想給一個網址，就把它放到免費的網頁空間，<a href="../publish/">步驟在這裡</a>。這個檔案也是你的備份，之後可以匯入繼續編輯。</p>
        <button type="button" class="btn" data-act="zip">下載網站檔（zip）</button>
      </div>
    </div>
    <div class="after-move">
      <h3>搬完家了？</h3>
      <p>這些內容和照片存在這台電腦的瀏覽器裡，不用了可以刪掉。已經下載的檔案，以及放上網路的網站（<a href="../publish/#safety">怎麼刪</a>），要另外處理。</p>
      <button type="button" class="btn btn-small danger-outline" data-act="delete">刪除這台電腦上的資料</button>
    </div>
  </section>`;
}

function renderForm() {
  const f = $("#form");
  f.innerHTML = `
    <section class="card" id="sec-basic">
      <h2>基本資料</h2>
      <div class="grid2">
        ${field("標題", "title", { placeholder: "例：板橋 → 新店 搬家說明", wide: true })}
        ${field("副標", "subtitle", { wide: true })}
        ${field("聯絡人", "contact.name", { hint: "不用寫全名，「王小姐」就夠了", placeholder: "例：王小姐" })}
        ${field("電話或 LINE ID", "contact.phone", { hint: "搬家公司要能回覆你報價", placeholder: "例：LINE ID：moving-wang" })}
        ${field("方便聯絡的時間", "contact.note", { placeholder: "例：平日 19:00 後" })}
        ${field("更新日期", "updated", { placeholder: today() })}
      </div>
    </section>

    <section class="card" id="sec-logistics">
      <h2>搬運條件</h2>
      <p class="sec-lede">估人力和車次最關鍵的一段。<strong>地址寫到路段就好</strong>，搬家公司真正需要的是樓層、電梯和貨車能停多近。</p>
      <div class="places">${placeCard("from")}${placeCard("to")}</div>
      <div class="grid2">
        ${field("希望搬遷日期", "logistics.preferredDate", { placeholder: "例：11/8（六）或 11/9（日），上午開始", wide: true })}
        ${notesField("其他注意事項", "logistics.notes", "例：\n新址全程走樓梯，這是報價重點\n希望一天內完成")}
      </div>
    </section>

    <section class="card" id="sec-furniture">
      <h2>大型家具與特別的物品</h2>
      <p class="sec-lede">不分房間，列出最影響報價的東西就好。紙箱與零碎物品不用列，搬家公司會看照片評估。</p>
      <div class="furn">${furnitureRows()}</div>
      <button type="button" class="btn btn-small" data-act="furn-add">＋ 新增一項</button>
    </section>

    <section class="card" id="sec-overview">
      <h2>整體說明與平面圖</h2>
      ${notesField("整體說明", "overview.notes", "例：\n舊址 2 房 2 廳，約 22 坪\n紙箱預估 45–55 箱\n  書約 18 箱，偏重")}
      ${photoZone("overview.images", "plan")}
    </section>

    ${P.rooms.map(roomSection).join("")}

    <section class="card add-room" id="sec-add-room">
      <h2>新增房間</h2>
      <div class="chips">
        ${ROOM_PRESETS.map((n) => `<button type="button" data-act="room-add" data-name="${n}">${n}</button>`).join("")}
        <button type="button" data-act="room-add" data-name="">其他…</button>
      </div>
    </section>

    ${doneSection()}
  `;
  renderNav();
  hydrateThumbs();
}

function renderNav() {
  const n = (r) => r.layout.length + r.detail.length;
  $("#nav").innerHTML = `
    <a href="#sec-basic">基本資料</a>
    <a href="#sec-logistics">搬運條件</a>
    <a href="#sec-furniture">大型家具${P.furniture.length ? `<span class="count">${P.furniture.length}</span>` : ""}</a>
    <a href="#sec-overview">整體說明</a>
    <div class="nav-rooms">
      ${P.rooms.map((r) => `<a href="#room-${esc(r.id)}" data-room-nav="${esc(r.id)}">${esc(r.name || "未命名房間")}<span class="count">${n(r)}</span></a>`).join("")}
      <a href="#sec-add-room" class="nav-add">＋ 新增房間</a>
    </div>
    <a href="#sec-done" class="nav-done">完成：給搬家公司</a>`;
}

function refreshDone() {
  const old = $("#sec-done");
  if (old) old.outerHTML = doneSection();
}

async function hydrateThumbs(root = document) {
  for (const img of root.querySelectorAll("img[data-thumb]")) {
    const id = img.dataset.thumb;
    if (!thumbURL.has(id)) {
      const rec = await store.getImage(id);
      if (!rec) continue;
      thumbURL.set(id, URL.createObjectURL(rec.thumb));
    }
    img.src = thumbURL.get(id);
  }
}

function renderZone(listPath) {
  const z = document.querySelector(`[data-zone="${listPath}"]`);
  if (!z) return;
  z.innerHTML = zoneInner(listPath);
  hydrateThumbs(z);
}

/* ------------------------------------------------------------ 照片 */
let pickTarget = null;

async function addPhotos(listPath, files) {
  const list = getAt(listPath);
  const z = document.querySelector(`[data-zone="${listPath}"]`);
  const imgs = [...files].filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|hei[cf])$/i.test(f.name));
  if (!imgs.length) return;

  busy += 1;
  const errors = [];
  const note = document.createElement("p");
  note.className = "zone-status";
  z.parentElement.appendChild(note);
  for (const [i, file] of imgs.entries()) {
    note.textContent = `處理照片 ${i + 1}/${imgs.length}：縮小、轉正、移除 GPS…`;
    try {
      const out = await processImage(file);
      const id = uid("img");
      await store.putImage({ id, ...out });
      list.push({ id, caption: "" });
      await saveNow();
      renderZone(listPath);
    } catch (e) {
      errors.push(`${file.name}：${e instanceof ImageError ? e.message : "處理失敗"}`);
    }
  }
  note.remove();
  busy -= 1;
  renderNav();
  refreshDone();
  if (errors.length) {
    await ask(`有 ${errors.length} 張照片沒有加進來：\n\n${errors.join("\n")}`, [{ label: "知道了", value: true, primary: true }]);
  }
}

/* ------------------------------------------------------------ 預覽 */
let previewURLs = [];

async function openPreview() {
  const meta = await loadImages(P);
  const D = toData(P, meta);
  const urls = new Map();
  previewURLs.forEach(URL.revokeObjectURL);
  previewURLs = [];
  for (const [id, n] of assignFiles(P, meta)) {
    const rec = meta.get(id);
    if (!rec) continue;
    const t = URL.createObjectURL(rec.thumb);
    const f = URL.createObjectURL(rec.full);
    previewURLs.push(t, f);
    urls.set(n.file, { thumb: t, full: f });
  }
  window.__PREVIEW = {
    data: D,
    url: (size, file) => (urls.get(file) || {})[size] || "",
  };

  const abs = (p) => new URL("../viewer/" + p, location.href).href;
  let html = await (await fetch("../viewer/index.html")).text();
  html = html
    .replace('href="assets/style.css"', `href="${abs("assets/style.css")}"`)
    .replace('<script src="data/data.js"></script>',
      "<script>window.MOVE_DATA=parent.__PREVIEW.data;window.MOVE_IMG_URL=parent.__PREVIEW.url;</script>")
    .replace('src="assets/app.js"', `src="${abs("assets/app.js")}"`);
  // blob 網址的文件，錨點連結才會留在同一頁捲動
  const doc = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  previewURLs.push(doc);
  $("#preview-frame").src = doc;
  $("#preview").hidden = false;
  document.body.classList.add("previewing");
  track("preview", "預覽");
}

function closePreview() {
  $("#preview").hidden = true;
  $("#preview-frame").src = "about:blank";
  document.body.classList.remove("previewing");
}

/* ------------------------------------------------------------ 下載 */
async function doPdf() {
  await saveNow();
  const pg = progress("準備中…");
  try {
    const { buildPdf } = await import("./pdf.js");
    const blob = await buildPdf(P, pg.set);
    pg.done();
    download(blob, safeName(P.title) + ".pdf");
    track("pdf", "下載 PDF");
  } catch (e) {
    pg.done();
    await ask("PDF 產生失敗：" + (e.message || e), [{ label: "知道了", value: true, primary: true }]);
  }
}

async function doZip() {
  await saveNow();
  const pg = progress("打包網站檔…");
  try {
    const blob = await buildSiteZip(P, (i, n) => pg.set(`打包照片 ${i}/${n}…`));
    pg.done();
    download(blob, `${safeName(P.title)}（網站檔）.zip`);
    track("zip", "下載網站檔");
  } catch (e) {
    pg.done();
    await ask("打包失敗：" + (e.message || e), [{ label: "知道了", value: true, primary: true }]);
  }
}

/* ------------------------------------------------------------ 匯入 */
async function replaceWith(label, fn) {
  if (P && (P.rooms.length || P.furniture.length)) {
    const ok = await confirmBox(`${label}會取代目前的內容和照片。要先下載網站檔備份嗎？`, "直接取代", true);
    if (!ok) return;
  }
  const pg = progress(label + "…");
  try {
    for (const u of thumbURL.values()) URL.revokeObjectURL(u);
    thumbURL.clear();
    const { project, warnings } = await fn((i, n) => pg.set(`${label}：照片 ${i}/${n}`), pg.set);
    P = project;
    pg.done();
    showEditor();
    if (warnings.length) {
      await ask(warnings.slice(0, 12).join("\n") + (warnings.length > 12 ? `\n…還有 ${warnings.length - 12} 則` : ""),
        [{ label: "知道了", value: true, primary: true }]);
    }
  } catch (e) {
    pg.done();
    await ask(`${label}失敗：${e.message || e}`, [{ label: "知道了", value: true, primary: true }]);
    const saved = await store.loadProject();
    if (saved) { P = saved; showEditor(); }
  }
}

async function deleteAll() {
  const ok = await confirmBox(
    "要刪除這台電腦上的所有內容和照片嗎？刪除後沒辦法復原，需要的話請先「下載網站檔」備份。\n\n" +
    "已經下載的 PDF、網站檔，以及放上網路的網站，不會跟著刪除。",
    "刪除", true);
  if (!ok) return;
  closePreview();
  previewURLs.forEach(URL.revokeObjectURL);
  previewURLs = [];
  delete window.__PREVIEW;
  for (const u of thumbURL.values()) URL.revokeObjectURL(u);
  thumbURL.clear();
  await store.destroy();
  P = null;
  $("#deleted").hidden = false;
  showStart();
  track("delete", "刪除資料");
}

/* ------------------------------------------------------------ 結構操作 */
function move(arr, i, d) {
  const j = i + d;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
}

async function removeImage(listPath, i) {
  const list = getAt(listPath);
  const [img] = list.splice(i, 1);
  if (img) {
    await store.deleteImage(img.id);
    if (thumbURL.has(img.id)) { URL.revokeObjectURL(thumbURL.get(img.id)); thumbURL.delete(img.id); }
  }
}

const actions = {
  async "start-blank"() {
    P = emptyProject();
    await saveNow();
    showEditor();
    track("start-blank", "從空白開始");
  },
  demo() {
    replaceWith("載入範例屋", (cb, say) => importDemo(cb, (i, n) => say(`下載範例照片 ${i}/${n}…`)))
      .then(() => track("start-demo", "載入範例屋"));
  },
  "import-zip"() { $("#pick-zip").click(); },
  "import-folder"() { $("#pick-folder").click(); },
  preview: openPreview,
  "close-preview": closePreview,
  pdf: doPdf,
  zip: doZip,
  delete: deleteAll,

  "add-photos"(el) { pickTarget = el.dataset.list; $("#pick-photos").click(); },
  "img-left"(el) { move(getAt(el.dataset.list), +el.dataset.i, -1); scheduleSave(); renderZone(el.dataset.list); },
  "img-right"(el) { move(getAt(el.dataset.list), +el.dataset.i, 1); scheduleSave(); renderZone(el.dataset.list); },
  "img-swap"(el) {
    const from = el.dataset.list;
    const to = from.endsWith("layout") ? from.replace(/layout$/, "detail") : from.replace(/detail$/, "layout");
    const [img] = getAt(from).splice(+el.dataset.i, 1);
    getAt(to).push(img);
    scheduleSave();
    renderZone(from);
    renderZone(to);
  },
  async "img-del"(el) {
    const ok = await confirmBox("刪除這張照片？", "刪除", true);
    if (!ok) return;
    await removeImage(el.dataset.list, +el.dataset.i);
    await saveNow();
    renderZone(el.dataset.list);
    renderNav();
    refreshDone();
  },

  "furn-add"() {
    P.furniture.push({ name: "", size: "", note: "" });
    scheduleSave();
    renderForm();
    const rows = document.querySelectorAll(".furn-row input[data-path$='.name']");
    if (rows.length) rows[rows.length - 1].focus();
  },
  "furn-up"(el) { move(P.furniture, +el.dataset.i, -1); scheduleSave(); renderForm(); },
  "furn-del"(el) { P.furniture.splice(+el.dataset.i, 1); scheduleSave(); renderForm(); },

  "room-add"(el) {
    const id = newRoomId(P);
    P.rooms.push({ id, name: el.dataset.name || "", summary: "", notes: "", layout: [], detail: [] });
    scheduleSave();
    renderForm();
    const sec = document.getElementById("room-" + id);
    sec.scrollIntoView({ behavior: "smooth", block: "start" });
    if (!el.dataset.name) $(".room-name", sec).focus();
  },
  "room-up"(el) { move(P.rooms, +el.dataset.i, -1); scheduleSave(); renderForm(); },
  "room-down"(el) { move(P.rooms, +el.dataset.i, 1); scheduleSave(); renderForm(); },
  async "room-del"(el) {
    const r = P.rooms[+el.dataset.i];
    const n = r.layout.length + r.detail.length;
    const ok = await confirmBox(`刪除「${r.name || "未命名房間"}」${n ? `和裡面的 ${n} 張照片` : ""}？`, "刪除", true);
    if (!ok) return;
    for (const img of [...r.layout, ...r.detail]) await store.deleteImage(img.id);
    P.rooms.splice(+el.dataset.i, 1);
    await saveNow();
    renderForm();
  },
};

/* ------------------------------------------------------------ 事件 */
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el || el.disabled) return;
  const menu = el.closest("details.menu");
  if (menu) menu.open = false;
  const fn = actions[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el); }
});

// 點選單以外的地方就收起來
document.addEventListener("click", (e) => {
  const menu = $("details.menu");
  if (menu && menu.open && !e.target.closest("details.menu")) menu.open = false;
});

document.addEventListener("input", (e) => {
  const path = e.target.dataset && e.target.dataset.path;
  if (!path || !P) return;
  setAt(path, e.target.value);
  scheduleSave();
  const m = path.match(/^rooms\.(\d+)\.name$/);
  if (m) {
    const r = P.rooms[+m[1]];
    const a = document.querySelector(`[data-room-nav="${CSS.escape(r.id)}"]`);
    if (a) a.firstChild.textContent = r.name || "未命名房間";
  }
});

// 離開欄位時更新「還可以補充的地方」
document.addEventListener("change", (e) => { if (e.target.dataset && e.target.dataset.path) refreshDone(); });

$("#pick-photos").addEventListener("change", (e) => {
  const files = [...e.target.files];
  e.target.value = "";
  if (pickTarget) addPhotos(pickTarget, files);
});
$("#pick-zip").addEventListener("change", (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (f) replaceWith("匯入網站檔", (cb) => importZip(f, cb));
});
$("#pick-folder").addEventListener("change", (e) => {
  const files = [...e.target.files];
  e.target.value = "";
  if (files.length) replaceWith("匯入資料夾", (cb) => importFolder(files, cb));
});

// 拖照片進照片區
document.addEventListener("dragover", (e) => {
  const z = e.target.closest && e.target.closest("[data-zone]");
  if (!z) return;
  e.preventDefault();
  z.classList.add("drop");
});
document.addEventListener("dragleave", (e) => {
  const z = e.target.closest && e.target.closest("[data-zone]");
  if (z && !z.contains(e.relatedTarget)) z.classList.remove("drop");
});
document.addEventListener("drop", (e) => {
  const z = e.target.closest && e.target.closest("[data-zone]");
  if (!z) { if (e.dataTransfer.files.length) e.preventDefault(); return; }
  e.preventDefault();
  z.classList.remove("drop");
  addPhotos(z.dataset.zone, e.dataTransfer.files);
});
// 拖到照片區以外的地方，不要讓瀏覽器直接打開照片、離開編輯器
window.addEventListener("dragover", (e) => e.preventDefault());

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("#preview").hidden) closePreview();
});

// 另一個分頁刪除了資料
window.addEventListener("store-deleted", () => {
  clearTimeout(saveTimer);
  P = null;
  closePreview();
  if (dlg.open) dlg.close();
  $("#deleted").hidden = false;
  showStart();
});

window.addEventListener("beforeunload", (e) => {
  if (busy) { e.preventDefault(); e.returnValue = ""; }
});

/* ------------------------------------------------------------ 啟動 */
function showStart() {
  $("#start").hidden = false;
  document.body.classList.add("starting");
  statusEl.textContent = "";
}

/* ------------------------------------------------------ 永久保存 */
// 只有 Firefox 會為了 navigator.storage.persist() 跳出授權視窗，
// 突然跳出來使用者不知道為什麼，所以先用我們自己的話說明，按了確認才去要。
// 拒絕也能繼續用：資料照樣存得進去，只是硬碟很滿時可能被清掉，改在頂端提醒備份。
const ASKS_USER = /Firefox\//.test(navigator.userAgent);
let persistChecked = false;

function showPersistWarning(show) {
  $("#persist-warning").hidden = !show;
}

async function ensurePersist() {
  if (persistChecked) return;
  persistChecked = true;
  const state = await store.persistState();
  if (state === "granted" || state === "unsupported") return;
  if (state === "denied") { showPersistWarning(true); return; }
  if (!ASKS_USER) { store.askPersist(); return; }   // 不會跳視窗，直接要

  await ask(
    "接下來瀏覽器會詢問：是否允許這個網站「在你的裝置上保存資料」。\n\n" +
    "你的內容和照片只存在這台電腦的瀏覽器裡。允許之後，瀏覽器在硬碟空間不足時就不會自動清掉它們。\n\n" +
    "建議按「允許」。不允許也能繼續使用，只是記得常常下載網站檔當備份。",
    [{ label: "好，我知道了", value: true, primary: true }]);
  const ok = await store.askPersist();
  showPersistWarning(!ok && (await store.persistState()) === "denied");
}

function showEditor() {
  $("#start").hidden = true;
  $("#deleted").hidden = true;
  document.body.classList.remove("starting");
  renderForm();
  statusEl.textContent = "已存在這台電腦";
  ensurePersist();
}

(async () => {
  try {
    P = await store.loadProject();
  } catch (e) {
    await ask("這個瀏覽器不能儲存資料（可能是無痕模式）。請改用一般視窗開啟。",
      [{ label: "知道了", value: true, primary: true }]);
  }
  if (P) showEditor();
  else showStart();
})();
