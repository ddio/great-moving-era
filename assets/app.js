/* 搬家估價說明 — 渲染、圖片品質切換、燈箱、列印 */
(function () {
  "use strict";

  var D = window.MOVE_DATA;
  if (!D) { document.getElementById("app").textContent = "找不到 data/data.js"; return; }

  var quality = "thumb";      // 畫面一律用縮圖，只有列印會暫時換成原圖
  var GALLERY = [];          // 所有圖片的平面清單，燈箱用
  var isDesktop = window.matchMedia("(min-width: 721px)").matches;

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
      var src = "images/" + (quality === "full" ? "full" : "thumb") + "/" + img.file;
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
      [D.updated ? "更新日期 " + D.updated : "", c.name ? "聯絡人 " + c.name : "", c.phone || ""]
        .filter(Boolean).join("　·　");
    document.getElementById("foot-contact").textContent =
      [c.name, c.phone, c.note].filter(Boolean).join("　·　");

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

  /* ---------------------------------- 圖片品質（僅列印時切換成原圖）*/
  function setQuality(q) {
    quality = q === "full" ? "full" : "thumb";
    var dir = "images/" + quality + "/";
    Array.prototype.forEach.call(document.querySelectorAll("figure.shot img"), function (img) {
      var next = dir + img.dataset.file;
      if (img.getAttribute("src") !== next) img.setAttribute("src", next);
    });
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
    lbImg.src = "images/full/" + g.file;
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
    var btn = document.getElementById("print-btn"), before = quality;
    btn.disabled = true; btn.textContent = "載入原圖…";
    setDetails(true);
    setQuality("full");
    var imgs = Array.prototype.slice.call(document.images);
    Promise.all(imgs.map(function (im) {
      return im.decode ? im.decode().catch(function () {}) : Promise.resolve();
    })).then(function () {
      btn.disabled = false; btn.textContent = "列印 / 存 PDF";
      window.addEventListener("afterprint", function () { setQuality(before); }, { once: true });
      window.print();
    });
  }

  /* ---------------------------------------------------------- 事件 */
  document.addEventListener("click", function (e) {
    var frame = e.target.closest(".frame");
    if (frame) { openLB(Number(frame.dataset.idx)); return; }
    if (e.target.closest(".lb-prev")) { stepLB(-1); return; }
    if (e.target.closest(".lb-next")) { stepLB(1); return; }
    if (e.target.closest(".lb-close") || e.target === lb) { closeLB(); return; }
    if (e.target.closest("#print-btn")) { preparePrint(); }
  });
  document.addEventListener("keydown", function (e) {
    if (lb.hidden) return;
    if (e.key === "Escape") closeLB();
    else if (e.key === "ArrowLeft") stepLB(-1);
    else if (e.key === "ArrowRight") stepLB(1);
  });
  window.addEventListener("beforeprint", function () { setDetails(true); setQuality("full"); });

  render();
})();
