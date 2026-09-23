// 下載網站檔、匯入網站檔 / 資料夾 / 範例屋
//
// 下載的網站檔就是備份檔：裡面的 data/data.js + images/ 足以還原整個專案，
// 所以只有一種格式，使用者不用分辨「網站」和「備份」。

import { makeZip, readZip } from "./zip.js";
import { toData, fromData, parseDataJs, dataJs, imageGroups, assignFiles } from "./model.js";
import * as store from "./store.js";
import { makeThumb, dimensions } from "./images.js";

// 資料夾與說明檔用英文名：各家解壓縮工具對中文檔名的處理不一致
export const ZIP_ROOT = "moving-site";
const VIEWER = ["index.html", "assets/style.css", "assets/app.js", "assets/blur.css"];

const README = `這個資料夾是一個完整的網站，也是你的備份檔。

■ 想給搬家公司一個網址
  把整個資料夾拖到免費的網頁空間，例如 Netlify Drop（https://app.netlify.com/drop）。
  詳細步驟：https://great-moving-era.ddio.io/publish/

■ 想在自己電腦上看
  先把 zip 解壓縮，再點兩下資料夾裡的 index.html，不需要網路。
  （在 zip 裡面直接點開的話，照片會出不來）

■ 想繼續編輯
  到 https://great-moving-era.ddio.io/edit/ 按「匯入」，選這個 zip 檔或這個資料夾。

提醒：放上網路後，拿到網址的人都看得到全部內容。搬完家記得把網站刪掉。
`;

const escHtml = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** 標題平常由 JS 設定，但 LINE、Facebook 抓預覽時不執行 JS，所以寫死在 HTML。
 *  刻意不放預覽圖：家裡的照片不該出現在聊天室的連結預覽上 */
function withTitle(html, D) {
  const title = escHtml(D.title || "搬家說明");
  const desc = escHtml(D.subtitle || "搬家估價說明");
  return html.replace(/<title>[^<]*<\/title>/,
    `<title>${title}</title>\n<meta property="og:title" content="${title}">\n` +
    `<meta property="og:description" content="${desc}">`);
}

/** 專案裡用到的照片 -> Map<id, 照片紀錄> */
export async function loadImages(project) {
  const meta = new Map();
  for (const g of imageGroups(project)) {
    for (const img of g.list) {
      const rec = await store.getImage(img.id);
      if (rec) meta.set(img.id, rec);
    }
  }
  return meta;
}

export async function buildSiteZip(project, onProgress) {
  const meta = await loadImages(project);
  const D = toData(project, meta);
  const files = [];

  for (const rel of VIEWER) {
    const res = await fetch("../viewer/" + rel);
    if (!res.ok) throw new Error(`下載網頁檔案失敗（${rel}），請確認網路連線`);
    const data = rel === "index.html"
      ? withTitle(await res.text(), D)
      : new Uint8Array(await res.arrayBuffer());
    files.push({ path: `${ZIP_ROOT}/${rel}`, data });
  }
  files.push({ path: `${ZIP_ROOT}/data/data.js`, data: dataJs(D) });
  files.push({ path: `${ZIP_ROOT}/robots.txt`, data: "User-agent: *\nDisallow: /\n" });
  files.push({ path: `${ZIP_ROOT}/README.txt`, data: README });

  const names = assignFiles(project, meta);     // 與 toData 用同一份檔名
  const used = imageGroups(project).flatMap((g) => g.list).filter((i) => meta.has(i.id));
  used.forEach((img, i) => {
    const rec = meta.get(img.id);
    const file = names.get(img.id).file;
    files.push({ path: `${ZIP_ROOT}/images/full/${file}`, data: rec.full });
    files.push({ path: `${ZIP_ROOT}/images/thumb/${file}`, data: rec.thumb });
    if (onProgress) onProgress(i + 1, used.length);
  });

  return makeZip(files);
}

/* ------------------------------------------------------------ 匯入 */

/** Map<path, Blob> -> 寫進 IndexedDB，回傳 { project, warnings } */
async function importEntries(entries, onProgress) {
  let prefix = null;
  for (const path of entries.keys()) {
    const m = path.match(/^(.*?)data\/data\.js$/);
    if (m && (prefix === null || m[1].length < prefix.length)) prefix = m[1];
  }
  if (prefix === null) {
    throw new Error("找不到 data/data.js。請選擇從這裡下載的網站檔（zip），或解壓縮後的整個資料夾。");
  }

  const D = parseDataJs(await entries.get(prefix + "data/data.js").text());
  const { project, wanted } = fromData(D);
  const warnings = [];
  const missing = new Set();

  await store.clearAll();
  let done = 0;
  for (const w of wanted) {
    const full = entries.get(`${prefix}images/full/${w.file}`);
    let thumb = entries.get(`${prefix}images/thumb/${w.file}`);
    const ext = /\.png$/i.test(w.file) ? "png" : "jpg";
    const main = full || thumb;
    if (!main) {
      missing.add(w.id);
      warnings.push(`找不到照片 ${w.file}，已略過`);
      continue;
    }
    let dim;
    if (!thumb) {
      const t = await makeThumb(main, ext);
      thumb = t.thumb;
      dim = { w: t.w, h: t.h };
    } else if (w.w && w.h && full) {
      dim = { w: w.w, h: w.h };           // data.js 已經記了長寬，不用再解碼大圖（手機上很慢）
    } else {
      dim = await dimensions(main);
    }
    await store.putImage({ id: w.id, full: main, thumb, w: dim.w, h: dim.h, ext });
    done += 1;
    if (onProgress) onProgress(done, wanted.length);
  }

  if (missing.size) {
    for (const g of imageGroups(project)) {
      const keep = g.list.filter((i) => !missing.has(i.id));
      g.list.splice(0, g.list.length, ...keep);
    }
  }
  await store.saveProject(project);
  return { project, warnings };
}

export async function importZip(file, onProgress) {
  return importEntries(await readZip(file), onProgress);
}

/** <input webkitdirectory> 選的資料夾 */
export async function importFolder(fileList, onProgress) {
  const entries = new Map();
  for (const f of fileList) entries.set(f.webkitRelativePath || f.name, f);
  return importEntries(entries, onProgress);
}

/** 範例屋只是讓人看每一欄怎麼寫，不需要大圖：只下載縮圖並拿來當大圖用，
 *  同時抓 6 張。手機上從 7MB、依序下載，變成 1.6MB。 */
export async function importDemo(onProgress, onDownload) {
  const base = "../demo/";
  const res = await fetch(base + "data/data.js");
  if (!res.ok) throw new Error("載入範例屋失敗，請確認網路連線");
  const text = await res.text();
  const D = parseDataJs(text);
  const entries = new Map([["data/data.js", new Blob([text])]]);
  const files = [D.overview.images, ...D.rooms.flatMap((r) => [r.layout, r.detail])].flat();

  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < files.length) {
      const img = files[next++];
      const r = await fetch(`${base}images/thumb/${encodeURIComponent(img.file)}`);
      if (r.ok) {
        const blob = await r.blob();
        entries.set(`images/full/${img.file}`, blob);
        entries.set(`images/thumb/${img.file}`, blob);
      }
      done += 1;
      if (onDownload) onDownload(done, files.length);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return importEntries(entries, onProgress);
}
