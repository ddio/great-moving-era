/* 搬家估價說明 — 渲染、圖片品質切換、燈箱、列印 */
(function () {
  "use strict";

  var D = window.MOVE_DATA;
  if (!D) { document.getElementById("app").textContent = "找不到 data/data.js"; return; }

  var QKEY = "move-explain-quality";
  var quality = localStorage.getItem(QKEY) === "full" ? "full" : "thumb";
  var GALLERY = [];          // 所有圖片的平面清單，燈箱用
  var isDesktop = window.matchMedia("(min-width: 721px)").matches;

  /* ---------------------------------------------------------- 小工具 */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function isBox(name) { return /箱/.test(name); }
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
      return '<figure class="shot">' +
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
    return '<section id="logistics"><h2>搬運條件<span class="tag">影響人力與車次</span></h2>' +
      '<p class="sec-summary">以下為兩地的出入與搬運動線條件。</p>' +
      '<div class="logi-grid">' + placeHTML(L.from) + placeHTML(L.to) + "</div>" +
      (L.preferredDate ? '<p class="logi-date">希望搬遷日期：<strong>' + esc(L.preferredDate) + "</strong></p>" : "") +
      notesHTML(L.notes) + "</section>";
  }

  /* ---------------------------------------------------------- 彙總 */
  function tally() {
    var t = { rooms: [], pieces: 0, boxes: 0, lines: 0, volume: 0, unsized: 0 };
    (D.rooms || []).forEach(function (r) {
      var row = { name: r.name, id: r.id, pieces: 0, boxes: 0, volume: 0, unsized: 0, summary: r.summary };
      (r.items || []).forEach(function (it) {
        t.lines++;
        if (isBox(it.name)) row.boxes += it.qty; else row.pieces += it.qty;
        if (it.volume) row.volume += it.volume * it.qty; else row.unsized += it.qty;
      });
      t.pieces += row.pieces; t.boxes += row.boxes;
      t.volume += row.volume; t.unsized += row.unsized;
      t.rooms.push(row);
    });
    return t;
  }

  function summaryHTML(t) {
    var stats = [
      [t.rooms.length, "個", "房間區段"],
      [t.pieces, "件", "家具與家電"],
      [t.boxes, "箱", "紙箱（預估）"],
      [fmt(t.volume, 1), "m³", "可估材積"],
      [GALLERY.length, "張", "現場照片"]
    ];
    var rows = t.rooms.map(function (r) {
      return "<tr><td><a href=\"#room-" + esc(r.id) + "\">" + esc(r.name) + "</a></td>" +
             '<td class="num">' + (r.pieces || "–") + "</td>" +
             '<td class="num">' + (r.boxes || "–") + "</td>" +
             '<td class="num">' + (r.volume ? fmt(r.volume, 2) : "–") + "</td>" +
             "<td>" + esc(r.summary || "") + "</td></tr>";
    }).join("");
    return '<section id="summary"><h2>全屋彙總<span class="tag">自動統計</span></h2>' +
      '<p class="sec-summary">數量由各房間物品清單自動加總；材積依標示的長寬高計算，' +
      "「標準箱」以 60×40×40 cm、「標準吊衣箱」以 50×50×100 cm 估算" +
      (t.unsized ? "，另有 " + t.unsized + " 件未標尺寸、未計入材積" : "") + "。</p>" +
      '<div class="stats">' + stats.map(function (s) {
        return '<div class="stat"><div class="n">' + esc(s[0]) + "<small>" + esc(s[1]) +
               '</small></div><div class="k">' + esc(s[2]) + "</div></div>";
      }).join("") + "</div>" +
      "<table><thead><tr><th>房間</th><th class=\"num\">家具家電</th><th class=\"num\">紙箱</th>" +
      '<th class="num">材積 m³</th><th>搬運重點</th></tr></thead><tbody>' + rows +
      '<tr class="total"><td>合計</td><td class="num">' + t.pieces + '</td><td class="num">' + t.boxes +
      '</td><td class="num">' + fmt(t.volume, 2) + "</td><td></td></tr></tbody></table></section>";
  }

  /* ------------------------------------------------------------ 房間 */
  function itemsTable(items) {
    if (!items || !items.length) return "";
    return '<div class="sub-h">物品清單</div><table><thead><tr><th>品項</th>' +
      '<th class="num">數量</th><th>尺寸</th><th>備註</th></tr></thead><tbody>' +
      items.map(function (it) {
        return "<tr><td>" + esc(it.name) + '</td><td class="num">' + it.qty + "</td><td>" +
               esc(it.size) + '</td><td class="note">' + esc(it.note) + "</td></tr>";
      }).join("") + "</tbody></table>";
  }

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
      itemsTable(r.items) +
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

    var t = tally();
    // 彙總的照片張數要等 GALLERY 填完才準，所以先產房間與整體 HTML
    var body = ovHTML + (D.rooms || []).map(roomHTML).join("");
    document.getElementById("app").innerHTML = summaryHTML(t) + body;

    var nav = (D.rooms || []).map(function (r) {
      return '<a href="#room-' + esc(r.id) + '">' + esc(r.name) + "</a>";
    }).join("");
    document.getElementById("room-nav").innerHTML =
      '<a href="#summary">彙總</a><a href="#logistics">搬運條件</a><a href="#overview">整體</a>' + nav;

    // 搬運條件插在彙總之前
    document.getElementById("app").insertAdjacentHTML("afterbegin", logisticsHTML());
    updateDetailButton();
  }

  /* -------------------------------------------------- 圖片品質切換 */
  function setQuality(q) {
    quality = q === "full" ? "full" : "thumb";
    localStorage.setItem(QKEY, quality);
    var dir = "images/" + (quality === "full" ? "full" : "thumb") + "/";
    Array.prototype.forEach.call(document.querySelectorAll("figure.shot img"), function (img) {
      var next = dir + img.dataset.file;
      if (img.getAttribute("src") !== next) img.setAttribute("src", next);
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-quality]"), function (b) {
      b.classList.toggle("on", b.dataset.quality === quality);
    });
  }

  /* ------------------------------------------------------- 細節收合 */
  function detailBlocks() { return document.querySelectorAll("details.detail-block"); }
  function allOpen() {
    var all = detailBlocks();
    return all.length > 0 && Array.prototype.every.call(all, function (d) { return d.open; });
  }
  function updateDetailButton() {
    var btn = document.getElementById("toggle-detail");
    btn.textContent = allOpen() ? "收合細節" : "展開細節";
  }
  function setDetails(open) {
    Array.prototype.forEach.call(detailBlocks(), function (d) { d.open = open; });
    updateDetailButton();
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
    var seg = e.target.closest("[data-quality]");
    if (seg) { setQuality(seg.dataset.quality); return; }
    if (e.target.closest(".lb-prev")) { stepLB(-1); return; }
    if (e.target.closest(".lb-next")) { stepLB(1); return; }
    if (e.target.closest(".lb-close") || e.target === lb) { closeLB(); return; }
    if (e.target.closest("#toggle-detail")) { setDetails(!allOpen()); return; }
    if (e.target.closest("#print-btn")) { preparePrint(); }
  });
  document.addEventListener("toggle", function (e) {
    if (e.target.classList && e.target.classList.contains("detail-block")) updateDetailButton();
  }, true);
  document.addEventListener("keydown", function (e) {
    if (lb.hidden) return;
    if (e.key === "Escape") closeLB();
    else if (e.key === "ArrowLeft") stepLB(-1);
    else if (e.key === "ArrowRight") stepLB(1);
  });
  window.addEventListener("beforeprint", function () { setDetails(true); setQuality("full"); });

  render();
  setQuality(quality);
})();
