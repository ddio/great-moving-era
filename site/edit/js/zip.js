// 最小的 zip 讀寫，不靠第三方套件。
// 寫：一律不壓縮（照片本來就壓過了，再壓也不會變小）。
//     非 ASCII 檔名同時設 UTF-8 旗標與 Info-ZIP Unicode Path 欄位（0x7075），
//     並標成 Unix 產生：Debian 的 unzip 會忽略「DOS 產生」zip 的 UTF-8 旗標。
// 讀：支援不壓縮與 deflate（使用者自己用系統重新壓縮過的檔案），
//     deflate 交給瀏覽器內建的 DecompressionStream。

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

const enc = new TextEncoder();

/** Info-ZIP Unicode Path Extra Field：version 1 + 原檔名欄位的 CRC + UTF-8 檔名 */
function unicodePath(name) {
  const out = new DataView(new ArrayBuffer(9 + name.length));
  out.setUint16(0, 0x7075, true);
  out.setUint16(2, 5 + name.length, true);
  out.setUint8(4, 1);
  out.setUint32(5, crc32(name), true);
  const bytes = new Uint8Array(out.buffer);
  bytes.set(name, 9);
  return bytes;
}

/** files: [{ path, data: Uint8Array | Blob | string }] -> Blob */
export async function makeZip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  const { time, date } = dosTime(new Date());

  for (const f of files) {
    let data = f.data;
    if (typeof data === "string") data = enc.encode(data);
    else if (data instanceof Blob) data = new Uint8Array(await data.arrayBuffer());
    const name = enc.encode(f.path);
    const crc = crc32(data);
    const extra = /^[\x20-\x7e]*$/.test(f.path) ? new Uint8Array(0) : unicodePath(name);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);           // 檔名是 UTF-8（房間名可能是中文）
    local.setUint16(8, 0, true);                // 不壓縮
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, extra.length, true);
    parts.push(local, name, extra, data);

    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, (3 << 8) | 20, true);    // 產生者：Unix
    cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true);
    cen.setUint16(10, 0, true);
    cen.setUint16(12, time, true);
    cen.setUint16(14, date, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, data.length, true);
    cen.setUint32(24, data.length, true);
    cen.setUint16(28, name.length, true);
    cen.setUint16(30, extra.length, true);
    cen.setUint32(38, (0o100644 << 16) >>> 0, true);   // 一般檔案 rw-r--r--
    cen.setUint32(42, offset, true);
    central.push(cen, name, extra);

    offset += 30 + name.length + extra.length + data.length;
  }

  const cenSize = central.reduce((s, p) => s + p.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cenSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: "application/zip" });
}

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Blob/File -> Map<path, Blob>（略過資料夾與 macOS 的 __MACOSX 垃圾） */
export async function readZip(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const dv = new DataView(buf.buffer);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("這不是 zip 檔，或檔案已經損壞");

  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const utf8 = new TextDecoder("utf-8", { fatal: true });
  const big5 = new TextDecoder("big5");
  // 沒設 UTF-8 旗標的檔名：先試 UTF-8，不行就當成繁中 Windows 的 Big5
  const decodeName = (bytes, flags) => {
    if (flags & 0x0800) return new TextDecoder().decode(bytes);
    try { return utf8.decode(bytes); } catch (e) { return big5.decode(bytes); }
  };
  const out = new Map();

  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("zip 目錄格式不對");
    const flags = dv.getUint16(p + 8, true);
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localAt = dv.getUint32(p + 42, true);
    const name = decodeName(buf.subarray(p + 46, p + 46 + nameLen), flags);
    p += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith("/") || name.startsWith("__MACOSX/") || /(^|\/)\._/.test(name)) continue;
    const lNameLen = dv.getUint16(localAt + 26, true);
    const lExtraLen = dv.getUint16(localAt + 28, true);
    const start = localAt + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + csize);

    let data;
    if (method === 0) data = raw;
    else if (method === 8) data = await inflateRaw(raw);
    else throw new Error(`不支援的壓縮方式（${method}）：${name}`);
    out.set(name, new Blob([data]));
  }
  return out;
}
