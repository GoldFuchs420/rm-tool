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
let articleReady = false;    // true sobald Extraktion/PDF-Erkennung lief
let fontSize = 16;

// Bilder
let foundImages = [];
let selectedSrcs = new Set();
let imagesScanned = false;
let sending = false;         // verhindert parallele Sende-Vorgänge

const $ = (id) => document.getElementById(id);

/* Mehrsprachigkeit: dieselbe Tabelle wie der Dateimanager (assets/js/i18n.js).
   Statische Texte stehen mit data-i18n im HTML und werden unten uebersetzt. */
const t = (key, vars) => (window.RMX && RMX.t ? RMX.t(key, vars) : key);
document.querySelectorAll("[data-i18n]").forEach((el) => {
  const txt = t(el.getAttribute("data-i18n"));
  if (txt && txt !== el.getAttribute("data-i18n")) el.textContent = txt;
});

/* ---------------------------------------------------------------------
 * Server (gemeinsame Komponente, siehe shared/servers.js) + Einstellungen
 * pro Seite (Hostname) für die Schriftgröße
 * ------------------------------------------------------------------- */
function readyServers() {
  return serverComponent ? serverComponent.readyServers() : [];
}

async function loadSettingsForHost(hostname) {
  const { pageSettings, lastSettings } = await chrome.storage.local.get(["pageSettings", "lastSettings"]);
  const perPage = pageSettings && hostname ? pageSettings[hostname] : null;
  const base = perPage || lastSettings || {};
  fontSize = Number.isFinite(base.fontSize) ? base.fontSize : 16;
}
async function saveSettingsForHost(hostname) {
  const data = { fontSize };
  const { pageSettings } = await chrome.storage.local.get("pageSettings");
  const next = pageSettings || {};
  if (hostname) next[hostname] = data;
  await chrome.storage.local.set({ pageSettings: next, lastSettings: data });
}

function sanitizeFilename(s) {
  return RMXShared.sanitizeFilename(s);
}

// Lädt einen Blob als PDF an die übergebenen Server hoch, parallel, mit
// Einzelergebnis pro Server (angehängt an resultsEl, nicht geleert –
// der Aufrufer steuert, wann die Liste zurückgesetzt wird, damit Artikel-
// und Bilder-Ergebnisse in einem kombinierten Senden nebeneinander
// stehen können).
async function uploadToAllServers(blob, filenameBase, resultsEl, targets) {
  if (!targets.length) return;
  const frag = document.createDocumentFragment();
  const rows = new Map();
  for (const s of targets) {
    const li = document.createElement("li");
    li.textContent = `⏳ ${s.url} …`;
    frag.appendChild(li);
    rows.set(s.id, li);
  }
  resultsEl.appendChild(frag);

  await Promise.allSettled(targets.map(async (server) => {
    const li = rows.get(server.id);
    try {
      const form = new FormData();
      form.append("file", blob, filenameBase + ".pdf");
      const headers = {};
      if (server.hasCreds) headers["Authorization"] = "Basic " + btoa(`${server.user}:${server.pass}`);
      const res = await fetch(server.url + "/upload", { method: "POST", headers, body: form });
      if (res.ok) {
        li.textContent = `✓ ${server.url}`;
        li.className = "ok";
      } else {
        li.textContent = `✗ ${server.url} (HTTP ${res.status})`;
        li.className = "fail";
      }
    } catch (e) {
      li.textContent = `✗ ${server.url} (${e.message || e})`;
      li.className = "fail";
    }
  }));
}

function sectionHeading(text) {
  const li = document.createElement("li");
  li.className = "rmx-result-heading";
  li.style.cssText = "font-weight:600;margin-top:6px";
  li.textContent = text;
  return li;
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
  $("articleStatus").textContent = "Lade Seite…";
  articleReady = false;
  articleData = null;
  isPdfSource = false;
  pdfSourceBlob = null;

  if (!currentTabInfo || !currentTabInfo.url || !/^https?:\/\//.test(currentTabInfo.url)) {
    $("articleStatus").textContent = "Aktueller Tab ist keine Webseite.";
    $("includeArticle").disabled = true;
    $("includeArticle").checked = false;
    return;
  }

  isPdfSource = await detectIfPdf(currentTabInfo.url);
  $("fontSlider").disabled = isPdfSource;

  if (isPdfSource) {
    $("articleStatus").textContent = "Lade PDF…";
    try {
      pdfSourceBlob = await fetchPdfBlob(currentTabInfo.url);
      articleReady = true;
      $("articleStatus").textContent = "Diese Seite ist bereits ein PDF – wird unverändert gesendet.";
    } catch {
      $("articleStatus").textContent = "PDF konnte nicht geladen werden.";
      $("includeArticle").checked = false;
      $("includeArticle").disabled = true;
    }
    updateSendButton();
    return;
  }

  $("articleStatus").textContent = "Extrahiere Lesemodus…";
  try {
    articleData = await extractArticleFromTab(currentTabInfo.id);
  } catch {
    $("articleStatus").textContent = "Seite konnte nicht gelesen werden (z.B. interne Chrome-Seite).";
    $("includeArticle").checked = false;
    $("includeArticle").disabled = true;
    updateSendButton();
    return;
  }
  if (!articleData) {
    $("articleStatus").textContent = "Kein Inhalt gefunden.";
    $("includeArticle").checked = false;
    $("includeArticle").disabled = true;
    updateSendButton();
    return;
  }
  articleReady = true;
  $("articleStatus").textContent = `„${(articleData.title || "Artikel").slice(0, 70)}“`;
  updateSendButton();
}

$("fontSlider").addEventListener("input", () => {
  fontSize = parseInt($("fontSlider").value, 10);
  $("fontSizeValue").textContent = String(fontSize);
});
$("fontSlider").addEventListener("change", () => saveSettingsForHost(currentTabInfo?.hostname));
$("includeArticle").addEventListener("change", updateSendButton);

/* Schalter: alle gewaehlten Bilder in EINEM zusammenhaengenden PDF (Standard)
   oder ein eigenes PDF je Bild. Die Wahl bleibt gespeichert. */
let onePerPdf = false;
try { onePerPdf = localStorage.getItem("rmx.oneimg") === "1"; } catch (e) { /* private mode */ }
$("onePerPdf").checked = onePerPdf;
$("onePerPdf").addEventListener("change", () => {
  onePerPdf = $("onePerPdf").checked;
  try { localStorage.setItem("rmx.oneimg", onePerPdf ? "1" : "0"); } catch (e) { /* private mode */ }
});

/* ---- PDF-Erzeugung aus dem extrahierten Artikel (Kapitel-Umbruch,
   Bild-Umfluss/Orphan-Schutz) ---- */
async function buildPdfFromArticle(title, contentHtml, size, sourceUrl) {
  const { jsPDF, utils } = window.jspdf;
  const doc = new jsPDF({ format: "a4" });
  const margin = 48;
  const footerReserve = 34;
  const maxWidth = doc.pageWidth - margin * 2;
  const lineHeight = size * 1.15;
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
  const blocks = root && root.children.length ? Array.from(root.children) : [root].filter(Boolean);

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
      }) + 6;
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
      doc.setFontSize(Math.max(size, size + (7 - parseInt(tag[1], 10)) * 1.2));
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
    results.push({ src, alt: (img.getAttribute("alt") || "").trim() });
  });
  return { images: results, pageTitle: document.title };
}

async function scanCurrentTab() {
  $("imageStatus").textContent = "Durchsuche Seite nach Bildern…";
  $("imageStrip").innerHTML = "";
  selectedSrcs.clear();
  imagesScanned = false;

  if (!currentTabInfo || !currentTabInfo.url || !/^https?:\/\//.test(currentTabInfo.url)) {
    $("imageStatus").textContent = "Aktueller Tab ist keine Webseite.";
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
    $("imageStatus").textContent = "Seite konnte nicht durchsucht werden (z.B. interne Chrome-Seite).";
    return;
  }

  imagesScanned = true;
  renderImageStrip();
}

function filenameFromUrl(url) {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() || "bild";
    return decodeURIComponent(last).replace(/\.[a-z0-9]{2,5}$/i, "") || "bild";
  } catch {
    return "bild";
  }
}

function renderImageStrip() {
  const strip = $("imageStrip");

  if (foundImages.length === 0) {
    $("imageStatus").textContent = "Keine passenden Bilder auf dieser Seite gefunden.";
    strip.innerHTML = "";
    return;
  }
  $("imageStatus").textContent = `${foundImages.length} Bild${foundImages.length === 1 ? "" : "er"}`;

  const frag = document.createDocumentFragment();
  for (const img of foundImages) {
    const tile = document.createElement("div");
    tile.className = "image-tile";
    if (selectedSrcs.has(img.src)) tile.classList.add("selected");

    const box = document.createElement("div");
    box.className = "thumb-box";
    const thumb = document.createElement("img");
    thumb.src = img.src;
    thumb.loading = "lazy";
    thumb.decoding = "async";
    box.appendChild(thumb);

    const badge = document.createElement("div");
    badge.className = "select-badge";
    badge.textContent = selectedSrcs.has(img.src) ? "✓" : "";

    const sendOneBtn = document.createElement("button");
    sendOneBtn.type = "button";
    sendOneBtn.className = "send-one-btn";
    sendOneBtn.title = t("sendOneTitle");
    sendOneBtn.setAttribute("aria-label", sendOneBtn.title);
    sendOneBtn.textContent = "↑";
    sendOneBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (sending) return;
      await sendNow({ images: [img] });
    });

    box.addEventListener("click", () => {
      if (selectedSrcs.has(img.src)) selectedSrcs.delete(img.src);
      else selectedSrcs.add(img.src);
      tile.classList.toggle("selected");
      badge.textContent = selectedSrcs.has(img.src) ? "✓" : "";
      updateSendButton();
    });

    const label = document.createElement("div");
    label.className = "label";
    label.textContent = img.alt || filenameFromUrl(img.src);
    label.title = img.alt || img.src;

    box.append(badge, sendOneBtn);
    tile.append(box, label);
    frag.appendChild(tile);
  }
  strip.innerHTML = "";
  strip.appendChild(frag);
}

$("selectAllBtn").addEventListener("click", () => {
  foundImages.forEach((img) => selectedSrcs.add(img.src));
  renderImageStrip();
  updateSendButton();
});
$("selectNoneBtn").addEventListener("click", () => {
  selectedSrcs.clear();
  renderImageStrip();
  updateSendButton();
});
$("rescanBtn").addEventListener("click", () => scanCurrentTab());

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

/* ---------------------------------------------------------------------
 * Senden: Artikel und/oder Bilder, gemeinsam oder einzeln, an alle
 * aktuell erreichbaren Server.
 * ------------------------------------------------------------------- */
function updateSendButton() {
  const hasArticle = $("includeArticle").checked && articleReady;
  const hasImages = selectedSrcs.size > 0;
  $("sendBtn").disabled = (!hasArticle && !hasImages) || readyServers().length === 0 || sending;
  /* Kein Server erreichbar: nur das Serverpanel zeigen (Senden/Konfiguration
     der restlichen Bereiche ist dann ohne Zweck). */
  document.body.classList.toggle("rmx-nosrv", readyServers().length === 0);
}

async function sendNow({ article, images } = {}) {
  if (sending) return;
  const targets = readyServers();
  if (!targets.length) return;
  const wantArticle = !!article;
  const wantImages = Array.isArray(images) && images.length > 0;
  if (!wantArticle && !wantImages) return;

  sending = true;
  updateSendButton();
  const resultsEl = $("results");
  resultsEl.innerHTML = "";

  if (wantArticle) {
    resultsEl.appendChild(sectionHeading(t("pageAsPdfHead")));
    try {
      let blob, filenameBase;
      if (isPdfSource) {
        blob = pdfSourceBlob;
        filenameBase = sanitizeFilename(currentTabInfo?.title || "Dokument");
      } else {
        blob = await buildPdfFromArticle(articleData.title || "Artikel", articleData.content, fontSize, currentTabInfo?.url);
        filenameBase = sanitizeFilename(articleData.title || "Artikel");
      }
      await uploadToAllServers(blob, filenameBase, resultsEl, targets);
    } catch (e) {
      const li = document.createElement("li");
      li.className = "fail";
      li.textContent = `✗ Fehlgeschlagen: ${e.message || e}`;
      resultsEl.appendChild(li);
    }
  }

  if (wantImages) {
    resultsEl.appendChild(sectionHeading(images.length === 1 ? t("imageHead") : t("imagesHead")));
    /* Standard: alle Bilder in einem zusammenhaengenden PDF. Mit dem Schalter
       "Ein Bild pro PDF" bekommt jedes Bild sein eigenes PDF. */
    if (onePerPdf) {
      let ok = 0;
      for (const img of images) {
        try {
          const { blob } = await buildImagesPdf([img]);
          if (!blob) continue;
          await uploadToAllServers(blob, sanitizeFilename(img.alt || filenameFromUrl(img.src)), resultsEl, targets);
          ok++;
        } catch (e) {
          const li = document.createElement("li");
          li.className = "fail";
          li.textContent = `✗ ${sanitizeFilename(img.alt || filenameFromUrl(img.src))}: ${e.message || e}`;
          resultsEl.appendChild(li);
        }
      }
      if (!ok) {
        const li = document.createElement("li");
        li.className = "fail";
        li.textContent = `✗ ${t("imgNoneLoaded")}`;
        resultsEl.appendChild(li);
      }
    } else {
      try {
        const { blob, loadedCount, totalCount } = await buildImagesPdf(images);
        if (!blob || loadedCount === 0) {
          const li = document.createElement("li");
          li.className = "fail";
          li.textContent = `✗ ${t("imgNoneLoaded")}`;
          resultsEl.appendChild(li);
        } else {
          if (loadedCount < totalCount) {
            const warn = document.createElement("li");
            warn.textContent = `⚠ ${totalCount - loadedCount} / ${totalCount}`;
            resultsEl.appendChild(warn);
          }
          const filenameBase = images.length === 1
            ? sanitizeFilename(images[0].alt || filenameFromUrl(images[0].src))
            : sanitizeFilename(currentTabInfo?.pageTitle || currentTabInfo?.title || "Bilder");
          await uploadToAllServers(blob, filenameBase, resultsEl, targets);
        }
      } catch (e) {
        const li = document.createElement("li");
        li.className = "fail";
        li.textContent = `✗ Fehlgeschlagen: ${e.message || e}`;
        resultsEl.appendChild(li);
      }
    }
  }

  sending = false;
  updateSendButton();
}

$("sendBtn").addEventListener("click", () => {
  const hasArticle = $("includeArticle").checked && articleReady;
  const images = foundImages.filter((img) => selectedSrcs.has(img.src));
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
  currentTabInfo = await getActiveTab();
  await loadSettingsForHost(currentTabInfo?.hostname);
  $("fontSlider").value = String(fontSize);
  $("fontSizeValue").textContent = String(fontSize);

  serverComponent = RMXServers.mount($("serverPanel"), { onChange: updateSendButton });
  updateSendButton(); /* bis zum ersten Check gilt: kein Server → nur Serverpanel */

  await Promise.all([prepareArticleSection(), scanCurrentTab()]);
  updateSendButton();
})();
