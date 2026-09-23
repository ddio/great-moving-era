/* 搬家估價說明 — 渲染、圖片品質切換、燈箱、列印 */
(function () {
  "use strict";

  var D = window.MOVE_DATA;
  if (!D) { document.getElementById("app").textContent = "找不到 data/data.js"; return; }

  // 畫面與列印都用 images/thumb（長邊 1000px）：列印版面每張最多 89mm 寬，
  // 1000px 已是 285–374 DPI。餵 3000px 給印表機只會讓 PDF 肥好幾倍，
  // 畫質完全看不出差別。點開燈箱才會載入 images/full。
  var GALLERY = [];          // 所有圖片的平面清單，燈箱用
  var isDesktop = window.matchMedia("(min-width: 721px)").matches;
  // 線上編輯器預覽時，照片在瀏覽器裡而不是 images/ 底下，由它換掉這個函式
  var imgURL = window.MOVE_IMG_URL || function (size, file) { return "images/" + size + "/" + file; };

  /* ---------------------------------------------------------- 小工具 */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmt(n, d) { return Number(n).toFixed(d == null ? 0 : d); }

  /* ------------------------------------------------------ 說明 bullets */
  function notesHTML(notes) {
    if (!notes || !notes.length) return "";
    return "<ul class=\"notes\">" + notes.map(function (n) {
      var kids = n.children && n.children.length
        ? "<ul>" + n.children.map(function (k) { return "<li>" + esc(k) + "</li>"; }).join("") + "</ul>"
        : "";
      return "<li>" + esc(n.text) + kids + "</li>";
    }).join("") + "</ul>";
  }

  /* ------------------------------------------------------------ 圖片 */
  function imagesHTML(images, group) {
    if (!images || !images.length) return "";
    return "<div class=\"img-grid\">" + images.map(function (img) {
      var idx = GALLERY.length;
      GALLERY.push({ file: img.file, caption: img.caption, group: group, no: img.no });
      var src = imgURL("thumb", img.file);
      var ar = (img.w && img.h) ? (img.w / img.h).toFixed(4) : "1.333";
      return '<figure class="shot" style="--ar:' + ar + '">' +
               '<button type="button" class="frame" data-idx="' + idx + '">' +
                 '<img src="' + esc(src) + '" alt="' + esc(img.caption || img.file) + '" ' +
                      'loading="lazy" decoding="async" data-file="' + esc(img.file) + '">' +
               "</button>" +
               '<figcaption><span class="no">' + fmt(img.no) + "</span>" +
                 esc(img.caption || "") + "</figcaption>" +
             "</figure>";
    }).join("") + "</div>";
  }

  /* ------------------------------------------------------ 搬運條件 */
  function placeHTML(p) {
    if (!p) return "";
    var rows = [["地址", p.address], ["樓層", p.floor], ["電梯", p.elevator],
                ["停車", p.parking], ["樓梯", p.stairs], ["出入", p.access]];
    return '<div class="logi-card"><h3>' + esc(p.label || "") + "</h3><dl>" +
      rows.filter(function (r) { return r[1]; }).map(function (r) {
        return "<dt>" + esc(r[0]) + "</dt><dd>" + esc(r[1]) + "</dd>";
      }).join("") + "</dl></div>";
  }

  function logisticsHTML() {
    var L = D.logistics || {};
    return '<section id="logistics"><h2>搬運條件</h2>' +
      '<p class="sec-summary">以下為兩地的出入與搬運動線條件。</p>' +
      '<div class="logi-grid">' + placeHTML(L.from) + placeHTML(L.to) + "</div>" +
      (L.preferredDate ? '<p class="logi-date">希望搬遷日期：<strong>' + esc(L.preferredDate) + "</strong></p>" : "") +
      notesHTML(L.notes) + "</section>";
  }

  /* ------------------------------------------------------ 大型家具 */
  function furnitureHTML() {
    var list = D.furniture || [];
    if (!list.length) return "";
    var hasSize = list.some(function (f) { return f.size; });
    var hasNote = list.some(function (f) { return f.note; });
    var rows = list.map(function (f) {
      return "<tr><td>" + esc(f.name) + "</td>" +
             (hasSize ? "<td>" + esc(f.size) + "</td>" : "") +
             (hasNote ? '<td class="note">' + esc(f.note) + "</td>" : "") + "</tr>";
    }).join("");
    return '<section id="furniture"><h2>大型家具與需特別留意的物品' +
      '<span class="tag">' + list.length + " 件</span></h2>" +
      '<p class="sec-summary">以下為需要搬運的大型或特殊物品；' +
      "紙箱數量與細項請由現場照片評估。</p>" +
      "<table><thead><tr><th>品項</th>" +
      (hasSize ? "<th>尺寸</th>" : "") +
      (hasNote ? "<th>說明</th>" : "") +
      "</tr></thead><tbody>" + rows + "</tbody></table></section>";
  }

  /* ------------------------------------------------------------ 房間 */
  function roomHTML(r) {
    var detail = r.detail && r.detail.length
      ? '<details class="detail-block"' + (isDesktop ? " open" : "") + ">" +
          "<summary>細節照片（" + r.detail.length + " 張）</summary>" +
          imagesHTML(r.detail, "room-" + r.id + "-detail") + "</details>"
      : "";
    return '<section class="room page-break" id="room-' + esc(r.id) + '">' +
      "<h2>" + esc(r.name) +
        (r.layout.length + r.detail.length
          ? '<span class="tag">' + (r.layout.length + r.detail.length) + " 張照片</span>" : "") +
      "</h2>" +
      (r.summary ? '<p class="sec-summary">' + esc(r.summary) + "</p>" : "") +
      notesHTML(r.notes) +
      (r.layout.length ? '<div class="sub-h">大格局</div>' + imagesHTML(r.layout, "room-" + r.id + "-layout") : "") +
      detail +
      "</section>";
  }

  /* ------------------------------------------------------------ 組裝 */
  function render() {
    document.title = D.title || "搬家估價說明";
    document.getElementById("site-title").textContent = D.title || "";
    document.getElementById("site-subtitle").textContent = D.subtitle || "";
    var c = D.contact || {};
    document.getElementById("site-meta").textContent =
      D.updated ? "更新日期 " + D.updated : "";
    // 聯絡資訊獨立一行：note 多半是可聯繫時間，要跟電話擺在一起才有用
    var contact = [c.name ? "聯絡人 " + c.name : "", c.phone, c.note]
      .filter(Boolean).join("　·　");
    document.getElementById("site-contact").textContent = contact;
    document.getElementById("foot-contact").textContent = contact;

    var ovHTML = '<section id="overview"><h2>整體說明<span class="tag">平面圖</span></h2>' +
      notesHTML(D.overview.notes) +
      (D.overview.images.length ? '<div class="sub-h">平面圖</div>' +
        imagesHTML(D.overview.images, "overview") : "") + "</section>";

    var body = ovHTML + (D.rooms || []).map(roomHTML).join("");
    document.getElementById("app").innerHTML = furnitureHTML() + body;

    var nav = (D.rooms || []).map(function (r) {
      return '<a href="#room-' + esc(r.id) + '">' + esc(r.name) + "</a>";
    }).join("");
    document.getElementById("room-nav").innerHTML =
      '<a href="#logistics">搬運條件</a>' +
      ((D.furniture || []).length ? '<a href="#furniture">大型家具</a>' : "") +
      '<a href="#overview">整體</a>' + nav;

    // 搬運條件放在最前面
    document.getElementById("app").insertAdjacentHTML("afterbegin", logisticsHTML());
  }

  /* ------------------------------------------------ 確保圖片載入完成 */
  function loadAll(onProgress) {
    var imgs = Array.prototype.slice.call(document.querySelectorAll("figure.shot img"));
    var total = imgs.length, done = 0;
    function tick() { done += 1; if (onProgress) onProgress(done, total); }

    var waits = imgs.map(function (im) {
      if (im.complete && im.naturalWidth > 0) return Promise.resolve().then(tick);
      im.loading = "eager";
      // 畫面外的延後載入圖不會自己開始抓，要重新指派 src 才會觸發
      im.src = im.getAttribute("src");
      return new Promise(function (res) {
        im.addEventListener("load", res, { once: true });
        im.addEventListener("error", res, { once: true });
      }).then(tick);
    });
    if (onProgress) onProgress(0, total);
    return Promise.race([
      Promise.all(waits),
      new Promise(function (res) { setTimeout(res, 60000); })   // 逾時保險
    ]);
  }

  /* ------------------------ 細節收合（列印與準備列印時全部展開）*/
  function setDetails(open) {
    Array.prototype.forEach.call(
      document.querySelectorAll("details.detail-block"),
      function (d) { d.open = open; }
    );
  }

  /* ---------------------------------------------------------- 燈箱 */
  var lb = document.getElementById("lightbox"), lbImg = document.getElementById("lb-img"),
      lbCap = document.getElementById("lb-caption"), lbCount = document.getElementById("lb-count"),
      lbIdx = -1;

  function siblings(i) {
    var g = GALLERY[i].group;
    return GALLERY.map(function (x, n) { return x.group === g ? n : -1; })
                  .filter(function (n) { return n >= 0; });
  }
  function openLB(i) {
    lbIdx = i;
    var g = GALLERY[i], sib = siblings(i);
    lbImg.src = imgURL("full", g.file);
    lbImg.alt = g.caption || g.file;
    lbCap.textContent = g.caption || "";
    lbCount.textContent = (sib.indexOf(i) + 1) + " / " + sib.length;
    lb.hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeLB() { lb.hidden = true; lbImg.removeAttribute("src"); document.body.style.overflow = ""; }
  function stepLB(d) {
    var sib = siblings(lbIdx), at = sib.indexOf(lbIdx);
    openLB(sib[(at + d + sib.length) % sib.length]);
  }

  /* ---------------------------------------------------------- 列印 */
  function preparePrint() {
    var btn = document.getElementById("print-btn");
    setDetails(true);
    btn.disabled = true;
    loadAll(function (done, total) {
      btn.textContent = "載入照片 " + done + "/" + total;
    }).then(function () {
      btn.disabled = false;
      btn.textContent = "列印";
      window.print();
    });
  }

  /* ------------------------------------------- 手機：左右滑動切換 */
  var touchX = 0, touchY = 0, touching = false, swiped = false;
  lb.addEventListener("touchstart", function (e) {
    if (e.touches.length !== 1) { touching = false; return; }
    touchX = e.touches[0].clientX;
    touchY = e.touches[0].clientY;
    touching = true;
    swiped = false;
  }, { passive: true });
  lb.addEventListener("touchend", function (e) {
    if (!touching || lb.hidden) return;
    touching = false;
    var t = e.changedTouches[0];
    var dx = t.clientX - touchX, dy = t.clientY - touchY;
    // 橫向位移夠大、且明顯比縱向多，才算滑動
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      swiped = true;      // 別讓接著送出的 click 被當成點背景關閉
      stepLB(dx < 0 ? 1 : -1);
    }
  }, { passive: true });

  /* ---------------------------------------------------------- 事件 */
  document.addEventListener("click", function (e) {
    var frame = e.target.closest(".frame");
    if (frame) { openLB(Number(frame.dataset.idx)); return; }
    if (e.target.closest(".lb-prev")) { stepLB(-1); return; }
    if (e.target.closest(".lb-next")) { stepLB(1); return; }
    if (e.target.closest(".lb-close") || e.target === lb) {
      if (!swiped) closeLB();
      swiped = false;
      return;
    }
    if (e.target.closest("#print-btn")) { preparePrint(); }
  });
  document.addEventListener("keydown", function (e) {
    if (lb.hidden) return;
    if (e.key === "Escape") closeLB();
    else if (e.key === "ArrowLeft") stepLB(-1);
    else if (e.key === "ArrowRight") stepLB(1);
  });
  window.addEventListener("beforeprint", function () { setDetails(true); });

  render();

  // ?blur=1：分享版面用，文字與照片全部糊掉、只留標題（見 assets/blur.css）
  if (/[?&]blur=1/.test(location.search)) {
    document.documentElement.dataset.blur = "1";
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "assets/blur.css";
    document.head.appendChild(link);
  }

  // ?print=1：展開細節、載入全部照片，給 tools/make_pdf.py 的無頭瀏覽器用
  if (/[?&]print=1/.test(location.search)) {
    setDetails(true);
    loadAll().then(function () { document.documentElement.dataset.printReady = "1"; });
  }
})();
