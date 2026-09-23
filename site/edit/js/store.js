// 資料只存在這台電腦的瀏覽器（IndexedDB），不會送到任何伺服器。
//   kv/project        專案內容（JSON）
//   images/<id>       照片：{ id, full, thumb, w, h, ext }

const DB_NAME = "great-moving-era";
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore("kv");
      db.createObjectStore("images", { keyPath: "id" });
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  return dbp;
}

function run(store, mode, fn) {
  return open().then((db) => new Promise((res, rej) => {
    const tx = db.transaction(store, mode);
    const out = fn(tx.objectStore(store));
    tx.oncomplete = () => res(out && "result" in out ? out.result : undefined);
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error || new Error("儲存失敗，可能是瀏覽器空間不足"));
  }));
}

export const loadProject = () => run("kv", "readonly", (s) => s.get("project"));
export const saveProject = (p) => run("kv", "readwrite", (s) => s.put(p, "project"));

export const getImage = (id) => run("images", "readonly", (s) => s.get(id));
export const putImage = (rec) => run("images", "readwrite", (s) => s.put(rec));
export const deleteImage = (id) => run("images", "readwrite", (s) => s.delete(id));
export const allImageIds = () => run("images", "readonly", (s) => s.getAllKeys());

export async function clearAll() {
  await run("kv", "readwrite", (s) => s.clear());
  await run("images", "readwrite", (s) => s.clear());
}

/** 請瀏覽器不要在空間吃緊時自動清掉資料 */
export async function askPersist() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch (e) { /* 不支援就算了 */ }
  return false;
}
