// popup.js
"use strict";

/* ---------------------------------------------------------------------
 * State
 * ------------------------------------------------------------------- */
let currentTabInfo = null;   // { id, url, title, hostname }
let serverComponent = null;  // von RMXServers.mount() (shared/servers.js)

// Artikel
let articleData = null;      // { title, content } von Readability
let isPdfSource = false;     // aktuelle Seite ist selbst schon ein PDF
let pdfSourceBlob = null;    // bei isPdfSource: die geladenen PDF-Bytes
let textSource = null;       // Code-/Markdown-Datei als Quelle (File-Objekt)
let articleReady = false;    // true sobald Extraktion/PDF-Erkennung lief
let fontSize = 16;

// Bilder
let foundImages = [];
const selectedSrcs = new Set();
let minEdgeMax = 0;   // groesste kleinste Bildkante in Pixel (Slider-Maximum)
let sending = false;         // verhindert parallele Sende-Vorgänge

const $ = (id) => document.getElementById(id);
// nachher, neu hinzufügen
function updateSliderFill(el) {
  if (!el) return;
  const min = parseFloat(el.min) || 0, max = parseFloat(el.max) || 100, val = parseFloat(el.value) || min;
  const pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
  el.style.setProperty("--fill", pct + "%");
}
/* Mehrsprachigkeit: dieselbe Tabelle wie der Dateimanager (assets/js/i18n.js).
   Statische Texte stehen mit data-i18n im HTML und werden unten uebersetzt. */
const t = (key, vars, fallback) => {
  let out = window.RMX && RMX.t ? RMX.t(key, vars) : "";
  if (!out || out === key) out = fallback || key;
  return out;
};
function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"), null, el.textContent);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const v = t(el.getAttribute("data-i18n-title"), null, el.title);
    el.title = v;
    el.setAttribute("aria-label", v);
  });
}
applyI18n();
/* Dynamische Statuszeilen (Artikel- und Bilderbereich) merken sich ihren
   letzten Text; beim Sprachwechsel werden sie neu uebersetzt, statt vom
   naechsten Ladevorgang ueberschrieben zu werden. */
let lastArtStatus = null, lastImgStatus = null;
function setArtStatus(key, vars, fall) {
  lastArtStatus = { key, vars, fall };
  $("articleStatus").textContent = t(key, vars, fall);
}
function setImgStatus(key, vars, fall) {
  lastImgStatus = { key, vars, fall };
  $("imageStatus").textContent = t(key, vars, fall);
}
function redrawStatuses() {
  const a = lastArtStatus, i = lastImgStatus;
  if (a) $("articleStatus").textContent = t(a.key, a.vars, a.fall);
  if (i) $("imageStatus").textContent = t(i.key, i.vars, i.fall);
}

/* ---------------------------------------------------------------------
 * Server (gemeinsame Komponente, siehe shared/servers.js) + Einstellungen
 * pro Seite (Hostname) für die Schriftgröße
 * ------------------------------------------------------------------- */
/* Sprachwahl im Popup-Kopf: Optionen einmal fuellen, Wechsel uebersetzt
   sofort (statische Texte + Serverliste) ohne Neuladen. */
function buildLangSelect() {
  if (!window.RMX || !RMX.langs) return;
  const sel = $("lang-select");
  sel.innerHTML = RMX.langs.map((l) => '<option value="' + l[0] + '"' + (l[0] === RMX.lang ? ' selected' : '') + '>' + l[0].toUpperCase() + '</option>').join("");
  sel.addEventListener("change", (e) => {
    RMX.setLang(e.target.value);
    applyI18n();
    redrawStatuses();
    if (serverComponent) serverComponent.redraw();
    updateSendButton();
  });
}

function readyServers() {
  return serverComponent ? serverComponent.readyServers() : [];
}

/* Schriftgroesse wird je Seite (Hostname) UND je Dokumenttyp gespeichert
   (article | pdf | code | md | epub); als Default gilt der letzte Wert. */
let docType = "article";

async function loadSettingsForHost(hostname) {
  const type = docType;
  const { pageSettings, lastSettings } = await chrome.storage.local.get(["pageSettings", "lastSettings"]);
  const perPage = pageSettings && hostname ? pageSettings[hostname] : null;
  const v = perPage && Number.isFinite(perPage[type]) ? perPage[type]
    : perPage && Number.isFinite(perPage.fontSize) ? perPage.fontSize
    : lastSettings && Number.isFinite(lastSettings.fontSize) ? lastSettings.fontSize : 16;
  fontSize = v;
}
async function saveSettingsForHost(hostname) {
  await chrome.storage.local.set({ lastSettings: { fontSize } });
  if (!hostname) return;
  const { pageSettings } = await chrome.storage.local.get("pageSettings");
  const next = pageSettings || {};
  if (!next[hostname] || typeof next[hostname] !== "object") next[hostname] = {};
  next[hostname][docType] = fontSize;
  await chrome.storage.local.set({ pageSettings: next });
}

async function applyFontForDocType() {
  await loadSettingsForHost(currentTabInfo?.hostname);
  $("fontSlider").value = String(fontSize);
  $("fontSizeValue").textContent = String(fontSize);
  updateSliderFill($("fontSlider"));
}

function sanitizeFilename(s) {
  return RMXShared.sanitizeFilename(s);
}

// Lädt eine Datei (vollständiger Dateiname inkl. Endung; EPUB wird
// unverändert durchgereicht) an alle übergebenen Server (parallel) und
// liefert das je-Server-Ergebnis zurück: { ok, fail, total, detail }. Eine
// Zeile pro DATEI im Status-Expander fasst die Server-Ergebnisse zusammen;
// im title-Attribut steht die Server-Liste für die Details.
async function uploadOne(blob, filename, server) {
  try {
    const form = new FormData();
    form.append("file", blob, filename);
    const headers = { Authorization: RMXServers.authHeaderFor(server) };
    const res = await fetch(server.url + "/upload", { method: "POST", headers, body: form, credentials: "omit" });
    if (res.ok) return { ok: true };
    return { ok: false, code: res.status };
  } catch (e) {
    return { ok: false, msg: (e && e.message) || String(e) };
  }
}

async function uploadToAllServers(blob, filename, targets) {
  const results = await Promise.all(targets.map((server) => uploadOne(blob, filename, server)));
  results.forEach((r, i) => {
    if (r.ok || r.code === 401 || r.code === 403) return;
    if (serverComponent && serverComponent.report) {
      serverComponent.report(targets[i].url, r.code != null ? "HTTP " + r.code : r.msg || "");
    }
  });
  let ok = 0;
  const detail = results.map((r, i) => {
    const url = targets[i].url;
    if (r.ok) { ok++; return t("upOk", { url }, `✓ ${url}`); }
    if (r.code != null) return t("upFailHttp", { url, code: r.code }, `✗ ${url} (HTTP ${r.code})`);
    return t("upFail", { msg: `${url} ${r.msg || ""}`.trim() }, `✗ ${url} (${r.msg || ""})`);
  });
  return { ok, fail: results.length - ok, total: results.length, detail: detail.join("\n") };
}

/* ---------------------------------------------------------------------
 * Aktiver Tab
 * ------------------------------------------------------------------- */
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return null;
  let hostname = "";
  try { hostname = new URL(tab.url).hostname; } catch {}
  return { id: tab.id, url: tab.url, title: tab.title, hostname };
}

/* ---------------------------------------------------------------------
 * Artikel-Erkennung/-Extraktion (unverändert gegenüber der bisherigen
 * Version, siehe README für die ausführlich getestete Kapitel-Umbruch-/
 * Bild-Umfluss-/Orphan-Schutz-Logik in buildPdfFromArticle)
 * ------------------------------------------------------------------- */
async function detectIfPdf(url) {
  if (/^https?:\/\/.+\.pdf(\?.*)?$/i.test(url)) return true;
  try {
    const res = await fetch(url, { method: "HEAD", cache: "no-store" });
    const ct = res.headers.get("content-type") || "";
    return ct.includes("application/pdf");
  } catch {
    return false;
  }
}
async function fetchPdfBlob(url) {
  const res = await fetch(url, { cache: "no-store" });
  return await res.blob();
}

async function extractArticleFromTab(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["libs/readability.js"] });
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      try {
        const clone = document.cloneNode(true);
        return new Readability(clone).parse();
      } catch (e) {
        return null;
      }
    }
  });
  if (result && result.content) return result;

  const [{ result: fallback }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      title: document.title,
      content: "<p>" + (document.body.innerText || "").slice(0, 20000).replace(/\n{2,}/g, "</p><p>") + "</p>"
    })
  });
  return fallback;
}

async function prepareArticleSection() {
  setArtStatus("stLoadingPage", null, "Lade Seite…");
  articleReady = false;
  articleData = null;
  isPdfSource = false;
  pdfSourceBlob = null;
  docType = "article";
  $("fontSlider").disabled = false;

  if (!currentTabInfo || !currentTabInfo.url || !/^https?:\/\//.test(currentTabInfo.url)) {
    setArtStatus("stNotWebpage", null, "Aktueller Tab ist keine Webseite.");
    return;
  }

  isPdfSource = await detectIfPdf(currentTabInfo.url);
  textSource = null;
  $("fontSlider").disabled = isPdfSource;

  /* Code- und Markdown-Dateien: Source direkt laden; gerendert wird beim
     Upload (Schriftgroesse aus dem Popup-Slider wird als fontScale uebergeben). */
  const uk = (window.RMX && RMX.textpdf) ? RMX.textpdf.urlKind(currentTabInfo.url) : null;
  if (uk === "code" || uk === "md") {
    setArtStatus("stLoadFile", null, "Lade Datei\u2026");
    try {
      const res = await fetch(currentTabInfo.url, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const path = currentTabInfo.url.split(/[?#]/)[0].replace(/\/+$/, "").split("/");
      let base = decodeURIComponent(path.pop() || "") || "Dokument";
      base = base.replace(/[\\/:*?\"<>|]/g, "_") || "Dokument";
      docType = uk;
      $("fontSlider").disabled = uk === "epub";
      if (uk === "epub") {
        textSource = new File([await res.blob()], base, { type: "application/epub+zip" });
        articleReady = true;
        setArtStatus("stEpubSource", { name: base.slice(0, 60) }, base.slice(0, 60));
      } else {
        textSource = new File([await res.text()], base, { type: "text/plain" });
        articleReady = true;
        setArtStatus(uk === "code" ? "stCodeSource" : "stMdSource", { name: base.slice(0, 60) }, base.slice(0, 60));
      }
    } catch {
      setArtStatus("stFileFail", null, "Datei konnte nicht geladen werden.");
    }
    await applyFontForDocType();
    updateSendButton();
    return;
  }

  if (isPdfSource) {
    setArtStatus("stLoadingPdf", null, "Lade PDF…");
    try {
      pdfSourceBlob = await fetchPdfBlob(currentTabInfo.url);
      articleReady = true;
      docType = "pdf";
      setArtStatus("stPdfSource", null, "Diese Seite ist bereits ein PDF – wird unverändert gesendet.");
    } catch {
      setArtStatus("stPdfFailed", null, "PDF konnte nicht geladen werden.");
    }
    await applyFontForDocType();
    return;
  }

  setArtStatus("stExtracting", null, "Extrahiere Lesemodus…");
  try {
    articleData = await extractArticleFromTab(currentTabInfo.id);
  } catch {
    setArtStatus("stReadFail", null, "Seite konnte nicht gelesen werden (z. B. interne Chrome-Seite).");
    updateSendButton();
    return;
  }
  if (!articleData) {
    setArtStatus("stNoContent", null, "Kein Inhalt gefunden.");
    updateSendButton();
    return;
  }
  articleReady = true;
  await applyFontForDocType();
  setArtStatus("stFoundTitle", { name: (articleData.title || "Artikel").slice(0, 70) }, `„${(articleData.title || "Artikel").slice(0, 70)}“`);
  updateSendButton();
}

$("fontSlider").addEventListener("input", () => {
  fontSize = parseInt($("fontSlider").value, 10);
  $("fontSizeValue").textContent = String(fontSize);
  updateSliderFill($("fontSlider"));
});
$("fontSlider").addEventListener("change", () => saveSettingsForHost(currentTabInfo?.hostname));
$("grpPage").addEventListener("toggle", updateSendButton);
$("grpImages").addEventListener("toggle", updateSendButton);

/* Schalter: alle gewaehlten Bilder in EINEM zusammenhaengenden PDF (Standard)
   oder ein eigenes PDF je Bild. Die Wahl bleibt gespeichert. */
let onePerPdf = false;
try { onePerPdf = localStorage.getItem("rmx.oneimg") === "1"; } catch (e) { /* private mode */ }
$("onePerPdf").checked = onePerPdf;
$("onePerPdf").addEventListener("change", () => {
  onePerPdf = $("onePerPdf").checked;
  try { localStorage.setItem("rmx.oneimg", onePerPdf ? "1" : "0"); } catch (e) { /* private mode */ }
  updateSendButton();
});

/* Readability's own unlikelyCandidates/negative regexes are English-only and
   can miss "related articles" boxes that are (a) named in another language
   (weiterlesen, mehr zum Thema, ähnliche Artikel, ...) or (b) styled with
   hashed/obfuscated CSS-module class names that carry no readable keyword
   at all. Both cases otherwise end up rendered as if they were part of the
   article, because renderBlock()'s generic fallback pulls every <img> out
   of any container it doesn't specifically recognise. */
const RELATED_KEYWORDS = /related|more-?stories|recirc|recommend(ed|ation)?|teaser|read-?more|also-?read|next-?article|more-?articles|outbrain|taboola|weiterlesen|mehr[-_ ]?zum[-_ ]?thema|similar|[aä]hnlich|auch[-_ ]?interessant|das[-_ ]?k[oö]nnte|empfehlung/i;

function looksLikeTeaserGrid(el) {
  if (!el.querySelectorAll) return false;
  const links = Array.from(el.querySelectorAll("a"));
  const withImg = links.filter((a) => a.querySelector("img"));
  if (withImg.length < 2) return false;
  // A real paragraph/figure has substantial text per image; a teaser grid
  // of thumbnail + short headline links barely has any.
  const textLen = (el.innerText || "").trim().length;
  return textLen < withImg.length * 90;
}

function isRelatedBlock(el) {
  if (!el || el.nodeType !== 1) return false;
  const sig = String((el.className && el.className.baseVal) || el.className || "") + " " + String(el.id || "");
  if (RELATED_KEYWORDS.test(sig)) return true;
  return looksLikeTeaserGrid(el);
}

/* Only trims from the end: a "related" match in the middle of an article
   is far more likely to be a false positive (e.g. a legitimate inline
   recommendation box an author placed deliberately) than one trailing
   after the last real content block. */
function stripTrailingRelatedBlocks(blocks) {
  let end = blocks.length;
  while (end > 0 && isRelatedBlock(blocks[end - 1])) end--;
  return end > 0 ? blocks.slice(0, end) : blocks;
}
       
/* ---- PDF-Erzeugung aus dem extrahierten Artikel (Kapitel-Umbruch,
   Bild-Umfluss/Orphan-Schutz) ---- */
async function buildPdfFromArticle(title, contentHtml, size, sourceUrl) {
  const { jsPDF, utils } = window.jspdf;
  const doc = new jsPDF({ format: "a4" });
  const margin = 48;
  const footerReserve = 34;
  const maxWidth = doc.pageWidth - margin * 2;
  const lineHeight = size * 1.15;
  const CM_TO_PT = 28.35;
  let y = doc.pageHeight - margin;

  function ensureSpace(h) {
    if (y - h < margin + footerReserve) {
      doc.addPage();
      y = doc.pageHeight - margin;
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(Math.round(size * 1.6));
  doc.splitTextToSize(title, maxWidth).forEach((line) => {
    ensureSpace(doc.getFontSize() * 1.25);
    doc.text(line, margin, y);
    y -= doc.getFontSize() * 1.25;
  });
  y -= 10;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(size);

  const parser = new DOMParser();
  const parsed = parser.parseFromString(`<div>${contentHtml}</div>`, "text/html");
  
  const root = parsed.body.firstElementChild;
  const rawBlocks = root && root.children.length ? Array.from(root.children) : [root].filter(Boolean);
  const blocks = stripTrailingRelatedBlocks(rawBlocks);
  const imageCache = new Map();
  
  async function loadImage(src) {
    if (!src || !/^https?:\/\//.test(src)) return null;
    if (imageCache.has(src)) return imageCache.get(src);
    let result = null;
    try {
      const res = await fetch(src, { cache: "no-store" });
      const blob = await res.blob();
      if (blob.type.startsWith("image/")) {
        const jpegBytes = blob.type === "image/jpeg"
          ? new Uint8Array(await blob.arrayBuffer())
          : await utils.toJpegBytes(blob);
        const info = utils.parseJpegInfo(jpegBytes);
        if (info.width && info.height) result = { jpegBytes, info };
      }
    } catch { /* Bild überspringen */ }
    imageCache.set(src, result);
    return result;
  }
  function imageDisplayHeight(info) {
    const w = Math.min(maxWidth, info.width);
    return w * (info.height / info.width);
  }
  async function renderImage(imgEl) {
    const loaded = await loadImage(imgEl.getAttribute("src"));
    if (!loaded) return;
    const w = Math.min(maxWidth, loaded.info.width);
    const h = imageDisplayHeight(loaded.info);
    ensureSpace(h + 14);
    doc.addImage(loaded.jpegBytes, margin, y - h, w, h);
    y -= h + 14;
  }
  async function measureImage(imgEl) {
    const loaded = await loadImage(imgEl.getAttribute("src"));
    return loaded ? imageDisplayHeight(loaded.info) + 14 : 0;
  }

  const WRAPPER_TAGS = ["DIV", "SECTION", "ARTICLE", "MAIN", "ASIDE"];
  const BLOCK_CHILD_TAGS = ["P", "UL", "OL", "BLOCKQUOTE", "H1", "H2", "H3", "H4", "H5", "H6", "DIV", "SECTION", "FIGURE", "ARTICLE"];
  function hasBlockChildren(el) {
    return el.children && Array.from(el.children).some((c) => BLOCK_CHILD_TAGS.includes(c.tagName));
  }
  function withFont(style, fsize, fn) {
    const savedStyle = doc.fontStyle, savedSize = doc.fontSize;
    doc.setFont("helvetica", style);
    doc.setFontSize(fsize);
    const result = fn();
    doc.setFont("helvetica", savedStyle);
    doc.setFontSize(savedSize);
    return result;
  }
  function writeParagraphText(text, indent = 0) {
    const lh = doc.getFontSize() * 1.15;
    const w = maxWidth - indent;
    for (const line of doc.splitTextToSize(text, w)) {
      ensureSpace(lh);
      doc.text(line, margin + indent, y);
      y -= lh;
    }
  }

  async function measureList(listEl) {
    const items = Array.from(listEl.children).filter((c) => c.tagName === "LI");
    let total = 0;
    const indent = 16;
    for (const li of items) {
      const text = (li.innerText || "").trim();
      if (!text) continue;
      const lines = doc.splitTextToSize(text, maxWidth - indent);
      total += lines.length * lineHeight + 2;
      if (li.querySelectorAll) {
        for (const img of li.querySelectorAll("img")) total += await measureImage(img);
      }
    }
    return total + 4;
  }
  async function measureBlockquote(bqEl) {
    const text = (bqEl.innerText || "").trim();
    if (!text) return 0;
    const indent = 18;
    return withFont("italic", size, () => {
      const lines = doc.splitTextToSize(text, maxWidth - indent);
      return lines.length * lineHeight + 6;
    });
  }
  async function measureFigure(el) {
    let total = 0;
    const img = el.querySelector("img");
    if (img) total += await measureImage(img);
    const caption = el.querySelector("figcaption");
    if (caption && caption.innerText.trim()) {
      const capSize = Math.max(8, size - 3);
      total += withFont("normal", capSize, () => {
        const lines = doc.splitTextToSize(caption.innerText.trim(), maxWidth);
        return lines.length * capSize * 1.15;
      }) + 4;
    }
    return total;
  }
  async function measureBlock(el) {
    if (!el || !el.tagName) return 0;
    const tag = el.tagName;
    if (tag === "IMG") return measureImage(el);
    if (/^H[1-6]$/.test(tag)) {
      const hsize = Math.max(size, size + (7 - parseInt(tag[1], 10)) * 1.2);
      return withFont("bold", hsize, () => {
        const lines = doc.splitTextToSize(el.innerText || "", maxWidth);
        return lines.length * hsize * 1.25;
      }) + Math.max(CM_TO_PT, hsize) + 6;
    }
    if (tag === "UL" || tag === "OL") return measureList(el);
    if (tag === "BLOCKQUOTE") return measureBlockquote(el);
    if (tag === "FIGURE") return measureFigure(el);
    if (WRAPPER_TAGS.includes(tag) && hasBlockChildren(el)) {
      let total = 0;
      for (const child of el.children) total += await measureBlock(child);
      return total;
    }
    let total = 0;
    const text = (el.innerText || "").trim();
    if (text) {
      const lines = doc.splitTextToSize(text, maxWidth);
      total += lines.length * lineHeight + 6;
    }
    if (el.querySelectorAll) {
      for (const img of el.querySelectorAll("img")) total += await measureImage(img);
    }
    return total;
  }

  function flattenBlocks(elements) {
    const out = [];
    for (const el of elements) {
      if (!el || !el.tagName) continue;
      if (WRAPPER_TAGS.includes(el.tagName) && hasBlockChildren(el)) {
        out.push(...flattenBlocks(Array.from(el.children)));
      } else {
        out.push(el);
      }
    }
    return out;
  }
  function groupIntoChapters(flat) {
    const chapters = [];
    let current = { heading: null, blocks: [] };
    for (const el of flat) {
      if (/^H[1-6]$/.test(el.tagName)) {
        if (current.heading || current.blocks.length) chapters.push(current);
        current = { heading: el, blocks: [] };
      } else {
        current.blocks.push(el);
      }
    }
    if (current.heading || current.blocks.length) chapters.push(current);
    return chapters;
  }

  async function renderBlock(el) {
    if (!el || !el.tagName) return;
    const tag = el.tagName;
    if (tag === "IMG") { await renderImage(el); return; }
    if (/^H[1-6]$/.test(tag)) {
      doc.setFont("helvetica", "bold");
      const hSize = Math.max(size, size + (7 - parseInt(tag[1], 10)) * 1.2);
      doc.setFontSize(hSize);
      const wasAtTop = y >= doc.pageHeight - margin - 0.01;
      if (!wasAtTop) {
        const gapBefore = Math.max(CM_TO_PT, hSize);
        ensureSpace(gapBefore + hSize * 1.25);
        if (y < doc.pageHeight - margin - 0.01) y -= gapBefore;
      }
      doc.splitTextToSize(el.innerText || "", maxWidth).forEach((line) => {
        ensureSpace(doc.getFontSize() * 1.25);
        doc.text(line, margin, y);
        y -= doc.getFontSize() * 1.25;
      });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(size);
      y -= 6;
      return;
    }
    if (tag === "UL" || tag === "OL") {
      const items = Array.from(el.children).filter((c) => c.tagName === "LI");
      let n = 1;
      for (const li of items) {
        const marker = tag === "OL" ? `${n}.` : "•";
        const text = (li.innerText || "").trim();
        n++;
        if (text) {
          const indent = 16;
          doc.splitTextToSize(text, maxWidth - indent).forEach((line, i) => {
            ensureSpace(lineHeight);
            if (i === 0) doc.text(marker, margin, y);
            doc.text(line, margin + indent, y);
            y -= lineHeight;
          });
          y -= 2;
        }
        if (li.querySelectorAll) for (const img of li.querySelectorAll("img")) await renderImage(img);
      }
      y -= 4;
      return;
    }
    if (tag === "BLOCKQUOTE") {
      const text = (el.innerText || "").trim();
      if (text) {
        const indent = 18;
        const startY = y;
        const startPageCount = doc.pageCount;
        doc.setFont("helvetica", "italic");
        doc.setTextColor(0.25, 0.25, 0.25);
        doc.splitTextToSize(text, maxWidth - indent).forEach((line) => {
          ensureSpace(lineHeight);
          doc.text(line, margin + indent, y);
          y -= lineHeight;
        });
        doc.setTextColor(0, 0, 0);
        doc.setFont("helvetica", "normal");
        if (doc.pageCount === startPageCount) {
          doc.line(margin + 6, startY + lineHeight * 0.3, margin + 6, y + lineHeight * 0.7, [0.75, 0.75, 0.75], 1.5);
        }
        y -= 6;
      }
      return;
    }
    if (tag === "FIGURE") {
      const img = el.querySelector("img");
      if (img) await renderImage(img);
      const caption = el.querySelector("figcaption");
      if (caption && caption.innerText.trim()) {
        doc.setFontSize(Math.max(8, size - 3));
        doc.setTextColor(0.4, 0.4, 0.4);
        writeParagraphText(caption.innerText.trim());
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(size);
        y -= 4;
      }
      return;
    }
    const text = (el.innerText || "").trim();
    if (text) { writeParagraphText(text); y -= 6; }
    if (el.querySelectorAll) for (const img of el.querySelectorAll("img")) await renderImage(img);
  }

  function isPlainParagraphLike(el) {
    if (!el || !el.tagName) return false;
    const tag = el.tagName;
    if (/^H[1-6]$/.test(tag)) return false;
    if (["IMG", "FIGURE", "UL", "OL", "BLOCKQUOTE"].includes(tag)) return false;
    return !!(el.innerText && el.innerText.trim());
  }
  async function renderFloatedImageWithText(paragraphEl, loaded) {
    const floatGap = 12;
    const w = Math.min(maxWidth * 0.42, loaded.info.width);
    const h = w * (loaded.info.height / loaded.info.width);
    ensureSpace(Math.min(h, lineHeight * 2));
    const floatTop = y;
    const floatBottom = y - h;
    const floatPage = doc.getCurrentPageIndex();
    const imgX = doc.pageWidth - margin - w;
    doc.addImage(loaded.jpegBytes, imgX, floatBottom, w, h);
    const words = (paragraphEl.innerText || "").trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
    let i = 0;
    while (i < words.length) {
      const nearFloat = doc.getCurrentPageIndex() === floatPage && y <= floatTop && y > floatBottom;
      const availW = nearFloat ? maxWidth - w - floatGap : maxWidth;
      ensureSpace(lineHeight);
      let line = "";
      while (i < words.length) {
        const test = line ? line + " " + words[i] : words[i];
        if (doc._textWidth(test, doc.getFontSize()) > availW && line) break;
        line = test;
        i++;
      }
      if (!line && words[i]) { line = words[i]; i++; }
      doc.text(line, margin, y);
      y -= lineHeight;
    }
    if (doc.getCurrentPageIndex() === floatPage && y > floatBottom) y = floatBottom;
    y -= 10;
  }
  async function renderChapterBlocks(elements) {
    for (let idx = 0; idx < elements.length; idx++) {
      const el = elements[idx];
      const next = elements[idx + 1];
      const isImageish = el.tagName === "IMG" || (el.tagName === "FIGURE" && el.querySelector("img"));
      if (isImageish && next && isPlainParagraphLike(next)) {
        const imgEl = el.tagName === "FIGURE" ? el.querySelector("img") : el;
        const loaded = await loadImage(imgEl.getAttribute("src"));
        if (loaded) {
          const fullW = Math.min(maxWidth, loaded.info.width);
          const fullH = fullW * (loaded.info.height / loaded.info.width);
          const canFloat = fullW < maxWidth * 0.45;
          const probeWidth = canFloat ? maxWidth - Math.min(maxWidth * 0.42, loaded.info.width) - 12 : maxWidth;
          const nextLines = doc.splitTextToSize((next.innerText || "").trim(), probeWidth);
          const minFollow = Math.min(nextLines.length, 2) * lineHeight;
          const combinedMin = fullH + 14 + minFollow;
          const remaining = y - (margin + footerReserve);
          if (combinedMin > remaining && combinedMin <= usablePageHeight) {
            doc.addPage();
            y = doc.pageHeight - margin;
          }
          if (canFloat) {
            await renderFloatedImageWithText(next, loaded);
            idx++;
            continue;
          }
        }
      }
      await renderBlock(el);
    }
  }

  const flatBlocks = flattenBlocks(blocks);
  const chapters = groupIntoChapters(flatBlocks);
  const usablePageHeight = doc.pageHeight - margin * 2 - footerReserve;

  for (const chapter of chapters) {
    const chapterEls = chapter.heading ? [chapter.heading, ...chapter.blocks] : chapter.blocks;
    if (chapter.heading) {
      let totalHeight = 0;
      for (const el of chapterEls) totalHeight += await measureBlock(el);
      const remaining = y - (margin + footerReserve);
      if (totalHeight > remaining && totalHeight <= usablePageHeight) {
        doc.addPage();
        y = doc.pageHeight - margin;
      }
    }
    await renderChapterBlocks(chapterEls);
  }

  // Fußzeile: Titel (breitenbasiert gekürzt) / Quelle / Datum+Seite
  let hostname = "";
  try { hostname = sourceUrl ? new URL(sourceUrl).hostname.replace(/^www\./, "") : ""; } catch {}
  const generatedAt = new Date().toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
  });
  const footerSize = 8.5;
  const footerY = margin - 18;
  const lineY = footerY + 13;
  const footerGap = 10;

  for (let p = 0; p < doc.pageCount; p++) {
    doc.setPage(p);
    doc.line(margin, lineY, doc.pageWidth - margin, lineY, [0.78, 0.78, 0.78], 0.75);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(footerSize);
    doc.setTextColor(0.45, 0.45, 0.45);

    const rightText = `${generatedAt} · Seite ${p + 1}/${doc.pageCount}`;
    const rightWidth = doc._textWidth(rightText, footerSize);
    const rightStartX = doc.pageWidth - margin - rightWidth;
    doc.text(rightText, rightStartX, footerY);

    let midStartX = rightStartX;
    if (hostname) {
      const midWidth = doc._textWidth(hostname, footerSize);
      midStartX = (doc.pageWidth - midWidth) / 2;
      doc.text(hostname, midStartX, footerY);
    }

    const maxLeftWidth = Math.max(0, midStartX - margin - footerGap);
    const leftText = doc.truncateToWidth(title || "", maxLeftWidth);
    doc.text(leftText, margin, footerY);
    doc.setTextColor(0, 0, 0);
  }

  return doc.output("blob");
}

/* ---------------------------------------------------------------------
 * Bilder-Scan der aktiven Seite
 * ------------------------------------------------------------------- */
// Läuft im Kontext der Zielseite. Nur echte <img>-Elemente (keine per
// Stylesheet gesetzten background-image), Lazy-Loading aufgelöst,
// ausgeblendete/winzige Bilder gefiltert.
function scanImagesInPage() {
  function isVisible(el) {
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (parseFloat(style.opacity || "1") === 0) return false;
    return true;
  }
  const seen = new Set();
  const results = [];
  document.querySelectorAll("img").forEach((img) => {
    const lazy = img.getAttribute("data-src") || img.getAttribute("data-original")
      || img.getAttribute("data-lazy-src");
    let src = lazy || img.currentSrc || img.getAttribute("src");
    if (!src) return;
    try { src = new URL(src, location.href).href; } catch { return; }
    if (!/^https?:\/\//.test(src)) return;
    if (seen.has(src)) return;
    if (!isVisible(img)) return;
    if (!lazy) {
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      if (w && h && (w < 40 || h < 40)) return;
    }
    seen.add(src);
    results.push({ src, alt: (img.getAttribute("alt") || "").trim(), svg: /\.svg(\?|#|$)/i.test(src) });
  });
  return { images: results, pageTitle: document.title };
}

async function scanCurrentTab() {
  setImgStatus("stScanning", null, "Durchsuche Seite nach Bildern…");
  $("imageStrip").innerHTML = "";
  selectedSrcs.clear();
  minEdgeMax = 0;
  $("minEdgeSlider").value = "0";
  $("maxEdgeSlider").value = "0";
  refreshMinEdgeRow();

  if (!currentTabInfo || !currentTabInfo.url || !/^https?:\/\//.test(currentTabInfo.url)) {
    setImgStatus("stNotWebpage", null, "Aktueller Tab ist keine Webseite.");
    return;
  }

  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: currentTabInfo.id },
      func: scanImagesInPage
    });
    foundImages = result?.images || [];
    currentTabInfo.pageTitle = result?.pageTitle || currentTabInfo.title || "Bilder";
  } catch {
    setImgStatus("stScanFail", null, "Seite konnte nicht durchsucht werden (z. B. interne Chrome-Seite).");
    return;
  }

  renderImageStrip();
}

/* Minimale Kantenlaenge: Der Slider blendet kleine Bilder (z. B. Icons)
   aus der Liste aus. SVGs und Bilder ohne messbare Groesse bleiben immer
   sichtbar; das Maximum waechst mit, sobald groessere Bilder nachladen. */
function imgIncluded(img) {
  if (img.svg || img.minEdge === undefined) return true;
  const minV = Number($("minEdgeSlider").value || 0);
  const maxV = Number($("maxEdgeSlider").value || minEdgeMax);
  return img.minEdge >= minV && img.minEdge <= maxV;
}
function refreshMinEdgeRow(bump) {
  const row = $("minEdgeRow"), lo = $("minEdgeSlider"), hi = $("maxEdgeSlider");
  row.hidden = minEdgeMax <= 0;
  if (row.hidden) return;
  lo.max = hi.max = String(minEdgeMax);
  if (bump) hi.value = String(Math.max(Number(hi.value), minEdgeMax));
  $("minEdgeMin").textContent = lo.value + " px";
  $("minEdgeMaxVal").textContent = hi.value + " px";
  edgeRangeWidget.render();
}

function renderImageStrip() {
  const strip = $("imageStrip");
  const status = $("imageStatus");

  const visible = foundImages.filter(imgIncluded);
  if (foundImages.length === 0) {
    status.hidden = false;
    setImgStatus("stNoImages", null, "Keine passenden Bilder auf dieser Seite gefunden.");
    strip.innerHTML = "";
    return;
  }
  status.hidden = visible.length > 0;
  status.textContent = t("stAllFiltered", null, "Alle Bilder liegen unter der minimalen Kantenl\u00e4nge.");
  if (visible.length === 0) { strip.innerHTML = ""; return; }

  const frag = document.createDocumentFragment();
  for (const img of visible) {
    const tile = document.createElement("div");
    tile.className = "image-tile";
    if (selectedSrcs.has(img.src)) tile.classList.add("selected");

    const box = document.createElement("div");
    box.className = "thumb-box";
    const thumb = document.createElement("img");
    thumb.loading = "lazy";
    thumb.decoding = "async";
    thumb.addEventListener("load", () => {
      if (img.svg || !thumb.naturalWidth || !thumb.naturalHeight) return;
      img.minEdge = Math.min(thumb.naturalWidth, thumb.naturalHeight);
      if (img.minEdge > minEdgeMax) { minEdgeMax = img.minEdge; refreshMinEdgeRow(true); }
      if (!imgIncluded(img)) { img._tile.remove(); img._tile = null; updateSendButton(); }
    });
    thumb.src = img.src;
    box.appendChild(thumb);

    const badge = document.createElement("div");
    badge.className = "select-badge";
    badge.textContent = selectedSrcs.has(img.src) ? "\u2713" : "";

    box.addEventListener("click", () => {
      if (selectedSrcs.has(img.src)) selectedSrcs.delete(img.src);
      else selectedSrcs.add(img.src);
      tile.classList.toggle("selected");
      badge.textContent = selectedSrcs.has(img.src) ? "\u2713" : "";
      updateSendButton();
    });

    const label = document.createElement("div");
    label.className = "label";
    label.textContent = img.alt || img.src;
    label.title = img.alt || img.src;

    box.append(badge);
    tile.append(box, label);
    img._tile = tile;
    frag.appendChild(tile);
  }
  strip.innerHTML = "";
  strip.appendChild(frag);
}

$("selectAllBtn").addEventListener("click", () => {
  foundImages.forEach((img) => { if (imgIncluded(img)) selectedSrcs.add(img.src); });
  renderImageStrip();
  updateSendButton();
});
$("selectNoneBtn").addEventListener("click", () => {
  selectedSrcs.clear();
  renderImageStrip();
  updateSendButton();
});
function onEdgeInput() {
  const lo = $("minEdgeSlider"), hi = $("maxEdgeSlider");
  if (Number(lo.value) > Number(hi.value)) hi.value = lo.value;
  if (Number(hi.value) < Number(lo.value)) lo.value = hi.value;
  refreshMinEdgeRow();
  renderImageStrip();
  updateSendButton();
}
$("minEdgeSlider").addEventListener("input", onEdgeInput);
$("maxEdgeSlider").addEventListener("input", onEdgeInput);
/* ---- PDF-Erzeugung: jedes Bild bekommt eine eigene Seite im exakten
   Bild-Seitenverhältnis (randlos, kein Letterboxing). ---- */
async function loadImageBytes(src) {
  try {
    const res = await fetch(src, { cache: "no-store" });
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) return null;
    const jpegBytes = blob.type === "image/jpeg"
      ? new Uint8Array(await blob.arrayBuffer())
      : await window.jspdf.utils.toJpegBytes(blob);
    const info = window.jspdf.utils.parseJpegInfo(jpegBytes);
    if (!info.width || !info.height) return null;
    return { jpegBytes, info };
  } catch {
    return null;
  }
}
function computePageSizeForImage(pxWidth, pxHeight) {
  const MAX_PT = 1200, MIN_PT = 150;
  let w = pxWidth * 0.75, h = pxHeight * 0.75;
  const longest = Math.max(w, h);
  if (longest > MAX_PT) { const s = MAX_PT / longest; w *= s; h *= s; }
  const shortest = Math.min(w, h);
  if (shortest < MIN_PT) { const s = MIN_PT / shortest; w *= s; h *= s; }
  return [w, h];
}
async function buildImagesPdf(images) {
  const { jsPDF } = window.jspdf;
  let doc = null;
  let loadedCount = 0;
  for (const img of images) {
    const loaded = await loadImageBytes(img.src);
    if (!loaded) continue;
    const [pw, ph] = computePageSizeForImage(loaded.info.width, loaded.info.height);
    if (!doc) doc = new jsPDF({ format: [pw, ph] });
    else doc.addPage(pw, ph);
    doc.addImage(loaded.jpegBytes, 0, 0, pw, ph);
    loadedCount++;
  }
  return { blob: doc ? doc.output("blob") : null, loadedCount, totalCount: images.length };
}

/* Dokumentname je Bild: Alt-Text, sonst "Bilder von Titel - n"; Dubletten
   erhalten eine fortlaufende Nummer. */
function imageBaseNames(images) {
  const label = t("imagesFrom", { title: (currentTabInfo?.pageTitle || currentTabInfo?.title || "").trim() || t("imagesHead") });
  const used = new Map();
  return images.map((img, i) => {
    let base = (img.alt || "").trim() || `${label} - ${i + 1}`;
    const key = base.toLowerCase();
    const seen = used.get(key) || 0;
    used.set(key, seen + 1);
    if (seen > 0) base = `${base} ${seen + 1}`;
    return sanitizeFilename(base);
  });
}

/* ---------------------------------------------------------------------
 * Senden: Artikel und/oder Bilder, gemeinsam oder einzeln, an alle
 * aktuell erreichbaren Server.
 * ------------------------------------------------------------------- */
function updateSendButton() {
  /* Der Zustand der Gruppen (aus-/eingeklappt) steuert, was gesendet wird. */
  const hasArticle = $("grpPage").open && articleReady;
  const n = foundImages.filter((img) => selectedSrcs.has(img.src) && imgIncluded(img)).length;
  const imgIncl = $("grpImages").open;
  /* Gesamte PDFs: Webseite (0/1) plus Bilder (Einzelmodus: je Bild, sonst 1). */
  const files = (hasArticle ? 1 : 0) + (imgIncl && n > 0 ? (onePerPdf ? n : 1) : 0);
  const btn = $("sendBtn");
  btn.disabled = files === 0 || readyServers().length === 0 || sending;
  /* Kein Server erreichbar: nur das Serverpanel zeigen (Senden/Konfiguration
     der restlichen Bereiche ist dann ohne Zweck). */
  const noneReady = readyServers().length === 0;
  /* Klasse fuer den Zustand ohne JS; hidden-Attribute als robuste Absicherung
     in Chrome, unabhaengig von CSS-Kaskade und Resource-Cache. */
  document.body.classList.toggle("rmx-nosrv", noneReady);
  $("grpPage").hidden = noneReady;
  $("grpImages").hidden = noneReady;
  $("sendPanel").hidden = noneReady;
  if (noneReady) $("statusBox").hidden = true;
  if (!sending) btn.textContent = files > 0 ? t("sendPdfCount", { n: files }) : t("sendBtnLabel", null, "Senden");
  /* Zaehlbadge im Expander-Kopf (Platz fix reserviert). Grau ausgeblendeter
     leerer Kreis solange nichts gesendet wird (z. B. Bilder ausgewaehlt,
     Expander aber zu – der Schalter ist inaktiv). */
  setBadge($("pageBadge"), hasArticle ? 1 : 0);
  setBadge($("imgBadge"), imgIncl ? n : 0);
}

function setBadge(el, n) {
  el.hidden = false;
  el.textContent = n > 0 ? String(n) : "";
  el.classList.toggle("rmx-count--empty", n === 0);
}

/* Status-Expander: eine Zeile pro DATEI (Webseite, zusammengefasstes
   Bilder-PDF oder je Bild im Einzelmodus). Darunter fasst jede Zeile die
   Server-Ergebnisse zusammen (title-Attribut = Detailliste). */
const RES_GLYPHS = {
  ok: '<svg class="rmx-ico" width="16" height="16" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z"/></svg>',
  fail: '<svg class="rmx-ico" width="16" height="16" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32Z"/></svg>',
  partial: '<svg class="rmx-ico" width="16" height="16" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M236.8,188.09,149.35,36.22h0a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09ZM124,96a8,8,0,0,1,16,0v40a8,8,0,0,1-16,0Zm8,88a12,12,0,1,1,12-12A12,12,0,0,1,132,184Z"/></svg>'
};

function statusRow(label) {
  const li = document.createElement("li");
  li.className = "pending";
  const spin = document.createElement("span");
  spin.className = "rmx-spinner rmx-row-spin";
  const lbl = document.createElement("span");
  lbl.className = "rrow-label";
  lbl.textContent = label;
  li.append(spin, lbl);
  return li;
}

function settleRow(li, cls, res) {
  li.className = cls;
  li.title = (res && res.detail) || "";
  if (res && res.label) {
    const lbl = li.querySelector(".rrow-label");
    if (lbl) lbl.textContent = res.label;
  }
  const g = document.createElement("span");
  g.className = "rrow-glyph";
  g.innerHTML = RES_GLYPHS[cls] || RES_GLYPHS.partial;
  li.replaceChild(g, li.firstChild);
}

function resultClass(res) {
  if (res.ok === res.total) return "ok";
  return res.ok > 0 ? "partial" : "fail";
}

async function sendNow({ article, images } = {}) {
  if (sending) return;
  const targets = readyServers();
  if (!targets.length) return;
  const wantArticle = !!article;
  const wantImages = Array.isArray(images) && images.length > 0;
  if (!wantArticle && !wantImages) return;

  /* der beim Senden aktive Wert gilt als letzter Default (global gespeichert) */
  await saveSettingsForHost(currentTabInfo?.hostname);
  sending = true;
  updateSendButton();

  /* Bildplan: zusammengefasst = max. 2 Dateien (Webseite + Bilder-PDF),
     Einzelmodus = eine Datei pro Bild. */
  const files = [];
  if (wantArticle) files.push({ kind: "article" });
  if (wantImages && onePerPdf) {
    const bases = imageBaseNames(images);
    images.forEach((img, i) => files.push({ kind: "image", img, base: bases[i] }));
  } else if (wantImages) {
    files.push({ kind: "images", list: images });
  }

  const box = $("statusBox");
  box.hidden = false;
  box.open = true;
  const resultsEl = $("results");
  resultsEl.innerHTML = "";
  const spin = $("statusSpin");
  spin.hidden = false;

  const rows = files.map((f) => {
    const li = statusRow(
      f.kind === "article" ? (textSource ? textSource.name : (currentTabInfo?.title || t("pageAsPdfHead")))
        : f.kind === "images" ? t("imagesFrom", { title: (currentTabInfo?.pageTitle || currentTabInfo?.title || "").trim() || t("imagesHead") })
        : f.base
    );
    resultsEl.appendChild(li);
    return li;
  });

  const total = files.length;
  let done = 0;
  const refreshSummary = () => {
    $("statusSummaryText").textContent = t("statusSummary", { done, n: total }, `${done} von ${total} Dateien`);
  };
  refreshSummary();

  const settle = (i, cls, res) => {
    done++;
    settleRow(rows[i], cls, res);
    refreshSummary();
  };

  await Promise.all(files.map(async (f, i) => {
    try {
      if (f.kind === "article") {
        let blob, filename;
        if (isPdfSource) {
          blob = pdfSourceBlob;
          filename = sanitizeFilename(currentTabInfo?.title || "Dokument") + ".pdf";
        } else if (textSource) {
          /* EPUB reist als EPUB; Code/Markdown werden hier zu PDF gerendert
             und uebernehmen die Schriftgroesse des Sliders (fontScale). */
          blob = await RMX.textpdf.convert(textSource, {
            page: "remarkable",
            fontScale: Math.min(2.2, Math.max(0.6, fontSize / 16))
          });
          filename = sanitizeFilename(blob.name);
        } else {
          blob = await buildPdfFromArticle(articleData.title || "Artikel", articleData.content, fontSize, currentTabInfo?.url);
          filename = sanitizeFilename(articleData.title || "Artikel") + ".pdf";
        }
        const res = await uploadToAllServers(blob, filename, targets);
        settle(i, resultClass(res), res);
      } else if (f.kind === "images") {
        const { blob, loadedCount, totalCount } = await buildImagesPdf(f.list);
        if (!blob || loadedCount === 0) { settle(i, "fail", { label: t("imgNoneLoaded") }); return; }
        const filenameBase = sanitizeFilename(t("imagesFrom", { title: (currentTabInfo?.pageTitle || currentTabInfo?.title || "").trim() || t("imagesHead") }));
        const res = await uploadToAllServers(blob, filenameBase, targets);
        if (loadedCount < totalCount) {
          const warn = t("imgSomeLoaded", { n: totalCount - loadedCount, m: totalCount });
          res.detail = warn + "\n" + res.detail;
          settle(i, res.ok > 0 ? "partial" : "fail", res);
        } else {
          settle(i, resultClass(res), res);
        }
      } else {
        const { blob } = await buildImagesPdf([f.img]);
        if (!blob) { settle(i, "fail", { label: t("imgOneFail", { name: f.base }) }); return; }
        const res = await uploadToAllServers(blob, f.base + ".pdf", targets);
        settle(i, resultClass(res), res);
      }
    } catch (e) {
      settle(i, "fail", { label: String(e.message || e), detail: String(e.message || e) });
    }
  }));

  spin.hidden = true;
  sending = false;
  updateSendButton();
}

/* Eigener Doppelslider: zwei echte Griff-Elemente statt zwei ueberlagerter
   nativer <input type="range">. Loest zwei Probleme der alten Loesung auf
   einen Schlag: (1) Lauflinie/Fuellung koennen nie auseinanderdriften, da
   beide aus derselben CSS-Regel kommen; (2) die Trefferflaeche IST der
   sichtbare Griff (plus ein Tipp auf die freie Leiste springt zum naechst-
   gelegenen Griff), statt einer unsichtbaren, schwer zu treffenden nativen
   Thumb-Spur. Die beiden <input type="range">-Elemente bleiben im DOM als
   reine Werte-/Event-Quelle erhalten: bestehender Code (onEdgeInput,
   imgIncluded, refreshMinEdgeRow) liest/schreibt weiterhin ganz normal
   .value/.max und bekommt weiterhin "input"-Events, ohne etwas von dieser
   Umstellung zu wissen. */
function setupDualRange(container, loInput, hiInput) {
  const track = container.querySelector(".rmx-range2-track");
  const fill = container.querySelector(".rmx-range2-fill");
  const thumbs = { lo: container.querySelector('[data-handle="lo"]'), hi: container.querySelector('[data-handle="hi"]') };
  let dragging = null;

  function pct(v, max) { return max > 0 ? (v / max) * 100 : 0; }

  function render() {
    const max = Number(loInput.max) || 0;
    const lo = Number(loInput.value) || 0;
    const hi = Number(hiInput.value) || 0;
    const loPct = pct(lo, max), hiPct = pct(hi, max);
    thumbs.lo.style.left = loPct + "%";
    thumbs.hi.style.left = hiPct + "%";
    fill.style.left = loPct + "%";
    fill.style.right = (100 - hiPct) + "%";
    thumbs.lo.setAttribute("aria-valuemax", String(max));
    thumbs.lo.setAttribute("aria-valuenow", String(lo));
    thumbs.hi.setAttribute("aria-valuemax", String(max));
    thumbs.hi.setAttribute("aria-valuenow", String(hi));
  }

  function setValue(handle, raw) {
    const max = Number(loInput.max) || 0;
    let v = Math.round(Math.min(max, Math.max(0, raw)));
    const input = handle === "lo" ? loInput : hiInput;
    const other = handle === "lo" ? hiInput : loInput;
    if (handle === "lo") v = Math.min(v, Number(other.value) || 0);
    else v = Math.max(v, Number(other.value) || 0);
    if (String(v) === input.value) return;
    input.value = String(v);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function valueFromClientX(clientX) {
    const rect = container.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * (Number(loInput.max) || 0);
  }

  function onPointerDown(handle, e) {
    e.preventDefault();
    dragging = handle;
    try { thumbs[handle].setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    thumbs[handle].focus();
  }
  function onPointerMove(e) {
    if (!dragging) return;
    setValue(dragging, valueFromClientX(e.clientX));
    render();
  }
  function onPointerUp(e) {
    if (!dragging) return;
    try { thumbs[dragging].releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    dragging = null;
  }
  function onKeydown(handle, e) {
    const max = Number(loInput.max) || 0;
    const input = handle === "lo" ? loInput : hiInput;
    const step = Math.max(1, Math.round(max / 100));
    let v = Number(input.value) || 0;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") v -= step;
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") v += step;
    else if (e.key === "Home") v = 0;
    else if (e.key === "End") v = max;
    else if (e.key === "PageDown") v -= step * 5;
    else if (e.key === "PageUp") v += step * 5;
    else return;
    e.preventDefault();
    setValue(handle, v);
    render();
  }

  ["lo", "hi"].forEach(function (handle) {
    thumbs[handle].addEventListener("pointerdown", function (e) { onPointerDown(handle, e); });
    thumbs[handle].addEventListener("keydown", function (e) { onKeydown(handle, e); });
  });
  container.addEventListener("pointermove", onPointerMove);
  container.addEventListener("pointerup", onPointerUp);
  container.addEventListener("pointercancel", onPointerUp);
  track.addEventListener("pointerdown", function (e) {
    const v = valueFromClientX(e.clientX);
    const lo = Number(loInput.value) || 0, hi = Number(hiInput.value) || 0;
    const handle = Math.abs(v - lo) <= Math.abs(v - hi) ? "lo" : "hi";
    onPointerDown(handle, e);
    setValue(handle, v);
    render();
  });

  loInput.addEventListener("input", render);
  hiInput.addEventListener("input", render);
  render();
  return { render: render };
}
const edgeRangeWidget = setupDualRange($("edgeRange"), $("minEdgeSlider"), $("maxEdgeSlider"));

$("sendBtn").addEventListener("click", () => {
  const hasArticle = $("grpPage").open && articleReady;
  const images = $("grpImages").open ? foundImages.filter((img) => selectedSrcs.has(img.src) && imgIncluded(img)) : [];
  sendNow({ article: hasArticle, images });
});

$("openManager").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("filemanager.html") });
  window.close();
});

/* ---------------------------------------------------------------------
 * Init
 * ------------------------------------------------------------------- */
(async function init() {
  /* Bis ein Server online ist, nur das Serverpanel zeigen (auch waehrend
     des Checks; updateSendButton() schaltet spaeter um). */
  document.body.classList.add("rmx-nosrv");
  currentTabInfo = await getActiveTab();
  await loadSettingsForHost(currentTabInfo?.hostname);
  $("fontSlider").value = String(fontSize);
  $("fontSizeValue").textContent = String(fontSize);
  updateSliderFill($("fontSlider"));
   
  buildLangSelect();
  serverComponent = RMXServers.mount($("serverPanel"), { onChange: updateSendButton });
  updateSendButton(); /* bis zum ersten Check gilt: kein Server → nur Serverpanel */

  await Promise.all([prepareArticleSection(), scanCurrentTab()]);
  updateSendButton();
})();
