/**
 * Mini-PDFKit
 * ------------------------------------------------------------------
 * Eigenständiger, kompakter PDF-Writer. Die öffentliche API ist
 * bewusst an jsPDF angelehnt (new jsPDF(), .setFont(), .setFontSize(),
 * .splitTextToSize(), .text(), .addImage(), .addPage(), .output()),
 * damit der Aufruf-Code so aussieht wie "normaler" jsPDF-Code aus
 * Tutorials/Forenbeiträgen und bei Bedarf leicht gegen das echte
 * jsPDF ausgetauscht werden kann. Die Implementierung selbst ist
 * aber komplett eigenständig:
 *  - Standard-PDF-Objektmodell (Catalog/Pages/Page/Contents) von Hand
 *    geschrieben, Base-14-Font "Helvetica" (keine Font-Einbettung nötig).
 *  - Bilder werden als JPEG (DCTDecode) direkt eingebettet; der JPEG-
 *    Header-Parser liest Breite/Höhe/Farbkanäle nach dem öffentlich
 *    dokumentierten JFIF-Markerformat aus.
 *  - Text wird in WinAnsiEncoding geschrieben (deckt Umlaute/ß ab).
 *
 * Limitierungen (bewusst einfach gehalten):
 *  - Kein Kerning/Ligaturen, nur eine grobe Zeichenbreiten-Heuristik
 *    fürs Zeilenumbrechen (keine AFM-Tabelle).
 *  - Keine Vektor-Grafiken, nur Text + JPEG-Bilder.
 */
(function (global) {
  "use strict";

  const PAGE_SIZES = { a4: [595.28, 841.89], letter: [612, 792] };

  function strToBytes(str) {
    const u = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) u[i] = str.charCodeAt(i) & 0xff;
    return u;
  }

  const WINANSI_SPECIAL = {
    "\u2018": 0x91, "\u2019": 0x92, "\u201c": 0x93, "\u201d": 0x94,
    "\u2013": 0x96, "\u2014": 0x97, "\u2026": 0x85, "\u20ac": 0x80,
    "\u00a0": 0x20, "\u2022": 0x95, "\u2122": 0x99, "\u2020": 0x86,
    "\u2021": 0x87, "\u02dc": 0x98
  };
  function encodeWinAnsi(str) {
    const out = [];
    for (const ch of String(str)) {
      const cp = ch.codePointAt(0);
      if (cp <= 255) out.push(cp);
      else if (WINANSI_SPECIAL[ch] !== undefined) out.push(WINANSI_SPECIAL[ch]);
      else out.push(0x3f); // Fallback "?"
    }
    return out;
  }
  function escapePdfBytes(byteArr) {
    let out = "";
    for (const b of byteArr) {
      if (b === 0x28 || b === 0x29 || b === 0x5c) out += "\\" + String.fromCharCode(b);
      else out += String.fromCharCode(b);
    }
    return out;
  }

  // Liest Breite/Höhe/Farbkanäle aus einem JPEG (JFIF SOFn-Marker).
  function parseJpegInfo(bytes) {
    let i = 2;
    while (i < bytes.length - 9) {
      if (bytes[i] !== 0xff) { i++; continue; }
      const marker = bytes[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      if (marker === 0xd9) break;
      const len = (bytes[i + 2] << 8) | bytes[i + 3];
      const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSOF) {
        const height = (bytes[i + 5] << 8) | bytes[i + 6];
        const width = (bytes[i + 7] << 8) | bytes[i + 8];
        const components = bytes[i + 9];
        return { width, height, components };
      }
      i += 2 + len;
    }
    return { width: 0, height: 0, components: 3 };
  }

  class jsPDF {
    constructor(opts = {}) {
      const [w, h] = Array.isArray(opts.format)
        ? opts.format
        : (PAGE_SIZES[opts.format || "a4"] || PAGE_SIZES.a4);
      this.pageWidth = w;
      this.pageHeight = h;
      this.fontSize = 12;
      this.fontStyle = "normal";
      this._imgCounter = 0;
      this.pages = [];
      this.addPage();
    }

    // width/height (in pt) optional: legt eine Seite mit eigenem Format an
    // (z.B. im Seitenverhältnis eines Bildes), statt dem Standardformat
    // aus dem Konstruktor. this.pageWidth/pageHeight zeigen danach immer
    // auf die Maße der zuletzt angelegten (= aktuellen) Seite, damit
    // Layout-Code, der doc.pageWidth/pageHeight nach addPage() abfragt,
    // weiterhin die richtigen Werte bekommt.
    addPage(width, height) {
      if (width && height) {
        this.pageWidth = width;
        this.pageHeight = height;
      }
      this.pages.push({ ops: [], images: [], width: this.pageWidth, height: this.pageHeight });
      this._cur = this.pages.length - 1;
      return this;
    }

    setFont(_family, style = "normal") {
      this.fontStyle = style; // "normal" | "bold" | "italic"
      return this;
    }
    setFontSize(size) {
      this.fontSize = size;
      return this;
    }
    getFontSize() {
      return this.fontSize;
    }
    setTextColor(r, g, b) {
      this._fillColor = [r, g, b];
      return this;
    }
    // Seite für nachträgliche Ergänzungen (z.B. Fußzeile) explizit ansteuern,
    // ohne die normale addPage()-Reihenfolge zu beeinflussen.
    setPage(index) {
      this._cur = index;
      return this;
    }
    get pageCount() {
      return this.pages.length;
    }
    getCurrentPageIndex() {
      return this._cur;
    }
    // Einfache gerade Linie, z.B. als Trennstrich über einer Fußzeile.
    line(x1, y1, x2, y2, color = [0, 0, 0], width = 1) {
      const page = this.pages[this._cur];
      const [r, g, b] = color;
      page.ops.push(
        `q ${width} w ${r} ${g} ${b} RG ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S Q`
      );
      return this;
    }

    _charWidth(ch, size) {
      let factor;
      if ("iIl.,;:'!|frtj ".includes(ch)) factor = 0.28;
      else if ("mMWw@%&".includes(ch)) factor = 0.92;
      else if (ch >= "A" && ch <= "Z") factor = 0.72;
      else factor = 0.52;
      if (this.fontStyle === "bold") factor *= 1.05;
      return factor * size;
    }
    _textWidth(str, size) {
      let w = 0;
      for (const ch of str) w += this._charWidth(ch, size);
      return w;
    }

    // Kürzt text so, dass er (inkl. angehängtem "…") in maxWidth passt.
    // Breitenbasiert statt fixer Zeichenzahl, damit z.B. Fußzeilen-Spalten
    // nie überlappen, egal wie lang Titel/Datum/Domain tatsächlich sind.
    truncateToWidth(text, maxWidth) {
      const str = String(text);
      if (this._textWidth(str, this.fontSize) <= maxWidth) return str;
      let t = str;
      while (t.length > 1 && this._textWidth(t + "…", this.fontSize) > maxWidth) {
        t = t.slice(0, -1);
      }
      return t.trim() + "…";
    }

    splitTextToSize(text, maxWidth) {
      const words = String(text).replace(/\s+/g, " ").trim().split(" ");
      const lines = [];
      let line = "";
      for (const word of words) {
        const test = line ? line + " " + word : word;
        if (this._textWidth(test, this.fontSize) > maxWidth && line) {
          lines.push(line);
          line = word;
        } else {
          line = test;
        }
      }
      if (line) lines.push(line);
      return lines;
    }

    text(lines, x, y) {
      const arr = Array.isArray(lines) ? lines : [lines];
      const page = this.pages[this._cur];
      const fontRef = this.fontStyle === "bold" ? "/F2" : this.fontStyle === "italic" ? "/F3" : "/F1";
      const lineHeight = this.fontSize * 1.15;
      const [cr, cg, cb] = this._fillColor || [0, 0, 0];
      const colorOp = `${cr} ${cg} ${cb} rg `;
      arr.forEach((ln, i) => {
        const yy = y - i * lineHeight;
        const bytes = encodeWinAnsi(ln);
        const escaped = escapePdfBytes(bytes);
        page.ops.push(`${colorOp}BT ${fontRef} ${this.fontSize} Tf ${x} ${yy.toFixed(2)} Td (${escaped}) Tj ET`);
      });
      return this;
    }

    // jpegBytes: Uint8Array mit rohen JPEG-Daten. x,y = linke untere Ecke.
    addImage(jpegBytes, x, y, w, h) {
      const page = this.pages[this._cur];
      const info = parseJpegInfo(jpegBytes);
      const id = `Im${this._imgCounter++}`;
      page.images.push({ id, bytes: jpegBytes, info });
      page.ops.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /${id} Do Q`);
      return this;
    }

    output(type = "arraybuffer") {
      const bytes = this._serialize();
      if (type === "blob") return new Blob([bytes], { type: "application/pdf" });
      if (type === "arraybuffer") return bytes.buffer;
      let bin = "";
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      if (type === "base64") return btoa(bin);
      if (type === "datauristring") return "data:application/pdf;base64," + btoa(bin);
      return bytes;
    }

    _serialize() {
      const chunks = [];
      let offset = 0;
      const offsets = [];
      const pushStr = (s) => { const u = strToBytes(s); chunks.push(u); offset += u.length; };
      const pushBytes = (b) => { chunks.push(b); offset += b.length; };
      const beginObj = (n) => { offsets[n] = offset; pushStr(`${n} 0 obj\n`); };
      const endObj = () => pushStr("endobj\n");

      pushStr("%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n");

      let nextObj = 6;
      const pageObjNums = [];
      const contentObjNums = [];
      const pageImageObjMap = this.pages.map((page) => {
        const map = {};
        page.images.forEach((img) => (map[img.id] = nextObj++));
        return map;
      });
      this.pages.forEach(() => { pageObjNums.push(nextObj++); contentObjNums.push(nextObj++); });

      beginObj(1); pushStr("<< /Type /Catalog /Pages 2 0 R >>\n"); endObj();

      const kids = pageObjNums.map((n) => `${n} 0 R`).join(" ");
      beginObj(2); pushStr(`<< /Type /Pages /Kids [${kids}] /Count ${pageObjNums.length} >>\n`); endObj();

      beginObj(3); pushStr("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\n"); endObj();
      beginObj(4); pushStr("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\n"); endObj();
      beginObj(5); pushStr("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>\n"); endObj();

      this.pages.forEach((page, idx) => {
        const pageNum = pageObjNums[idx];
        const contentNum = contentObjNums[idx];
        const imgMap = pageImageObjMap[idx];
        const xobjEntries = Object.entries(imgMap).map(([id, num]) => `/${id} ${num} 0 R`).join(" ");
        const resources = `<< /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >>${xobjEntries ? " /XObject << " + xobjEntries + " >>" : ""} >>`;

        beginObj(pageNum);
        const pw = page.width || this.pageWidth;
        const ph = page.height || this.pageHeight;
        pushStr(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources ${resources} /Contents ${contentNum} 0 R >>\n`);
        endObj();

        const opsBytes = strToBytes(page.ops.join("\n") + "\n");
        beginObj(contentNum);
        pushStr(`<< /Length ${opsBytes.length} >>\nstream\n`);
        pushBytes(opsBytes);
        pushStr("\nendstream\n");
        endObj();

        page.images.forEach((img) => {
          const num = imgMap[img.id];
          const cs = img.info.components === 1 ? "/DeviceGray" : img.info.components === 4 ? "/DeviceCMYK" : "/DeviceRGB";
          beginObj(num);
          pushStr(`<< /Type /XObject /Subtype /Image /Width ${img.info.width} /Height ${img.info.height} /ColorSpace ${cs} /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`);
          pushBytes(img.bytes);
          pushStr("\nendstream\n");
          endObj();
        });
      });

      const xrefOffset = offset;
      const total = nextObj;
      pushStr(`xref\n0 ${total}\n0000000000 65535 f \n`);
      for (let i = 1; i < total; i++) {
        pushStr(`${String(offsets[i] || 0).padStart(10, "0")} 00000 n \n`);
      }
      pushStr(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

      let totalLen = 0; chunks.forEach((c) => (totalLen += c.length));
      const result = new Uint8Array(totalLen);
      let pos = 0; chunks.forEach((c) => { result.set(c, pos); pos += c.length; });
      return result;
    }
  }

  // Konvertiert einen beliebigen Bild-Blob (PNG/WEBP/GIF/...) zu JPEG-Bytes,
  // damit addImage() ihn per DCTDecode einbetten kann.
  async function toJpegBytes(blob, quality = 0.82) {
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height); // Hintergrund für transparente PNGs
    ctx.drawImage(bitmap, 0, 0);
    const outBlob = await canvas.convertToBlob({ type: "image/jpeg", quality });
    return new Uint8Array(await outBlob.arrayBuffer());
  }

  global.jspdf = { jsPDF };
  global.jspdf.utils = { parseJpegInfo, toJpegBytes };
})(typeof window !== "undefined" ? window : this);
