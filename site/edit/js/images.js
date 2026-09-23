// 照片處理：tools/images.py 的瀏覽器版。
//   full   長邊 3000px、JPEG q0.75   點圖放大用
//   thumb  長邊 1000px、JPEG q0.78   網頁顯示、PDF 用
// 經過 canvas 重新編碼，EXIF（含 GPS）、拍攝器材、時間一律不會留下；
// 依拍攝方向自動轉正；瀏覽器解碼時會把 Display P3 等色域轉成 sRGB。
// PNG（平面圖、截圖）維持 PNG 並保留透明背景。

export const FULL = 3000;
export const THUMB = 1000;

export class ImageError extends Error {}

function isPng(file) {
  return file.type === "image/png" || /\.png$/i.test(file.name || "");
}

function isHeic(file) {
  return /image\/hei[cf]/.test(file.type) || /\.hei[cf]$/i.test(file.name || "");
}

async function decode(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (e) {
    // 舊版 Safari 的 createImageBitmap 不吃 Blob 裡的某些格式，退回 <img>
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      return img;
    } catch (e2) {
      if (isHeic(file)) {
        throw new ImageError("這個瀏覽器讀不了 iPhone 的 HEIC 照片。請改用 Safari，或先把照片轉成 JPEG。");
      }
      throw new ImageError("讀不了這個檔案，請確認它是 JPEG、PNG 或 WebP 照片。");
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function sizeOf(src) {
  return { w: src.naturalWidth || src.width, h: src.naturalHeight || src.height };
}

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

// 一次縮太多倍會出現鋸齒，每次最多縮一半
function scaleTo(src, w, h, opaque) {
  let cur = src;
  let { w: cw, h: ch } = sizeOf(src);
  while (cw / 2 > w) {
    cw = Math.round(cw / 2);
    ch = Math.round(ch / 2);
    const c = canvas(cw, ch);
    const g = c.getContext("2d");
    g.imageSmoothingQuality = "high";
    g.drawImage(cur, 0, 0, cw, ch);
    cur = c;
  }
  const out = canvas(w, h);
  const g = out.getContext("2d");
  if (opaque) {                 // JPEG 沒有透明，透明處補白
    g.fillStyle = "#fff";
    g.fillRect(0, 0, w, h);
  }
  g.imageSmoothingQuality = "high";
  g.drawImage(cur, 0, 0, w, h);
  return out;
}

function fit(w, h, edge) {
  const long = Math.max(w, h);
  // 只大一點點就不縮：線稿被內插後反而變大（見 tools/images.py）
  if (long <= edge * 1.1) return { w, h };
  const r = edge / long;
  return { w: Math.round(w * r), h: Math.round(h * r) };
}

function toBlob(c, type, quality) {
  return new Promise((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new ImageError("照片轉檔失敗，可能是照片太大"))), type, quality));
}

/** File -> { full: Blob, thumb: Blob, w, h, ext } */
export async function processImage(file) {
  const src = await decode(file);
  const png = isPng(file);
  const type = png ? "image/png" : "image/jpeg";
  const { w, h } = sizeOf(src);

  const f = fit(w, h, FULL);
  const full = await toBlob(scaleTo(src, f.w, f.h, !png), type, 0.75);
  const t = fit(w, h, THUMB);
  const thumb = await toBlob(scaleTo(src, t.w, t.h, !png), type, 0.78);
  if (src.close) src.close();

  return { full, thumb, w: f.w, h: f.h, ext: png ? "png" : "jpg" };
}

/** 匯入既有網站時只有 full 沒有 thumb，從 full 產一張 */
export async function makeThumb(blob, ext) {
  const src = await decode(blob);
  const { w, h } = sizeOf(src);
  const t = fit(w, h, THUMB);
  const type = ext === "png" ? "image/png" : "image/jpeg";
  const thumb = await toBlob(scaleTo(src, t.w, t.h, ext !== "png"), type, 0.78);
  if (src.close) src.close();
  return { thumb, w, h };
}

export async function dimensions(blob) {
  const src = await decode(blob);
  const d = sizeOf(src);
  if (src.close) src.close();
  return d;
}
