/*
 * Converts JPG / PNG / SVG images into a PDF in the browser (pdf-lib, MIT).
 *   - JPG: the original JPEG data is embedded as is (no re-encoding);
 *     EXIF rotation is honoured by rotating the placement, not the pixels.
 *   - PNG: embedded losslessly (incl. transparency).
 *   - SVG: rendered at high resolution through <canvas> and embedded as PNG.
 *   - Page format: "original" -> page has exactly the image's aspect ratio,
 *     "remarkable" -> image fitted proportionally onto a device-sized page.
 */
(function () {
  'use strict';
  const R = (window.RMX = window.RMX || {});

  const RM_W_PT = (1404 / 226) * 72; // reMarkable page: 1404 x 1872 px @ 226 dpi
  const RM_H_PT = (1872 / 226) * 72;
  const PX_TO_PT = 72 / 226;

  function kindOf(file) {
    const n = file.name.toLowerCase();
    if (/\.jpe?g$/.test(n) || file.type === 'image/jpeg') return 'jpg';
    if (/\.png$/.test(n) || file.type === 'image/png') return 'png';
    if (/\.svg$/.test(n) || file.type === 'image/svg+xml') return 'svg';
    if (/\.webp$/.test(n) || file.type === 'image/webp') return 'webp';
    return null;
  }

  /** EXIF orientation (1-8) from JPEG bytes, 1 if unknown. */
  function jpegOrientation(b) {
    if (b[0] !== 0xff || b[1] !== 0xd8) return 1;
    let off = 2;
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    while (off + 4 < b.length) {
      if (b[off] !== 0xff) break;
      const marker = b[off + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { off += 2; continue; }
      const len = dv.getUint16(off + 2);
      if (marker === 0xe1 && b[off + 4] === 0x45 && b[off + 5] === 0x78 && b[off + 6] === 0x69 && b[off + 7] === 0x66) {
        const t = off + 10;
        const le = b[t] === 0x49;
        const ifd = t + dv.getUint32(t + 4, le);
        const n = dv.getUint16(ifd, le);
        for (let i = 0; i < n; i++) {
          const e = ifd + 2 + i * 12;
          if (dv.getUint16(e, le) === 0x0112) return dv.getUint16(e + 8, le);
        }
        return 1;
      }
      if (marker === 0xda) break;
      off += 2 + len;
    }
    return 1;
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('Image could not be decoded')); };
      img.src = src;
    });
  }

  /** Pixel data of a canvas as JPEG bytes (white background already painted). */
  function canvasToJpegBytes(canvas) {
    if (!R.canvasSafe()) return Promise.reject(new Error(R.t('canvasBlocked')));
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) return reject(new Error('Canvas export failed'));
        blob.arrayBuffer().then(function (ab) { resolve(new Uint8Array(ab)); }, reject);
      }, 'image/jpeg', 0.94);
    });
  }

  const UNITS = { px: 1, pt: 96 / 72, pc: 16, mm: 96 / 25.4, cm: 96 / 2.54, in: 96, '': 1 };
  function cssLength(v) {
    if (!v) return NaN;
    const m = /^\s*([0-9.]+)\s*(px|pt|pc|mm|cm|in)?\s*$/i.exec(v);
    if (!m) return NaN; // %, em ... are not usable without a layout
    return parseFloat(m[1]) * UNITS[(m[2] || '').toLowerCase()];
  }

  /** Declares namespaces that many exporters forget (a hard error for XML parsers). */
  function repairSvgText(text) {
    const m = /<svg\b[^>]*>/i.exec(text);
    if (!m) return text;
    const tag = m[0];
    let add = '';
    if (!/\sxmlns\s*=/.test(tag)) add += ' xmlns="http://www.w3.org/2000/svg"';
    if (/\sxlink:/.test(text) && !/xmlns:xlink\s*=/.test(tag)) add += ' xmlns:xlink="http://www.w3.org/1999/xlink"';
    return add ? text.replace(tag, tag.replace(/<svg/i, '<svg' + add)) : text;
  }

  /** Measures the drawing when the SVG carries neither size nor viewBox. */
  function measureContent(svg) {
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden;width:0;height:0;overflow:hidden';
    const clone = document.importNode(svg, true);
    host.appendChild(clone);
    document.body.appendChild(host);
    try {
      const bb = clone.getBBox();
      return bb && bb.width > 0 && bb.height > 0 ? bb : null;
    } catch (e) {
      return null;
    } finally {
      host.remove();
    }
  }

  /** Renders an SVG file to PNG bytes. Returns {bytes, ptW, ptH}. */
  async function rasteriseSvg(file) {
    const text = repairSvgText(await file.text());
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) {
      throw new Error('Invalid SVG');
    }
    let w = cssLength(svg.getAttribute('width'));
    let h = cssLength(svg.getAttribute('height'));
    let vb = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(parseFloat);
    let hasVb = vb.length === 4 && vb[2] > 0 && vb[3] > 0;
    if (!(w > 0) && !(h > 0) && !hasVb) {
      const bb = measureContent(svg);
      if (bb) {
        vb = [bb.x, bb.y, bb.width, bb.height]; hasVb = true;
        svg.setAttribute('viewBox', vb.join(' '));
      }
    }
    if (!(w > 0) && !(h > 0)) { w = hasVb ? vb[2] : 1404; h = hasVb ? vb[3] : 1872; }
    else if (!(w > 0)) w = h * (hasVb ? vb[2] / vb[3] : 1);
    else if (!(h > 0)) h = w * (hasVb ? vb[3] / vb[2] : 1);
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    if (!svg.getAttribute('xmlns')) svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const xml = new XMLSerializer().serializeToString(svg);
    const img = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml));

    const scale = Math.min(4096 / Math.max(w, h), Math.max(1, 3000 / Math.max(w, h)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; // paper
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { bytes: await canvasToJpegBytes(canvas), ptW: w * 0.75, ptH: h * 0.75 };
  }

  /** Fallback: let the browser decode (and orient) the image, re-encode as PNG. */
  async function viaCanvas(file) {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0);
    return { bytes: await canvasToJpegBytes(canvas), ptW: bmp.width * PX_TO_PT, ptH: bmp.height * PX_TO_PT };
  }

  /** Adds one page with the image to `pdf`. */
  async function addImagePage(pdf, file, mode) {
    const PDFLib = window.PDFLib;
    const kind = kindOf(file);
    if (!kind) throw new Error('Unsupported image type');
    let image, rawW, rawH, ptW, ptH, orient = 1;

    async function embedFromCanvas() {
      const r = await viaCanvas(file);
      image = await pdf.embedJpg(r.bytes);
      rawW = image.width; rawH = image.height; ptW = r.ptW; ptH = r.ptH; orient = 1;
    }

    if (kind === 'svg') {
      const s = await rasteriseSvg(file);
      image = await pdf.embedJpg(s.bytes);
      rawW = image.width; rawH = image.height; ptW = s.ptW; ptH = s.ptH;
    } else if (kind === 'webp') {
      await embedFromCanvas();
    } else {
      const bytes = new Uint8Array(await file.arrayBuffer());
      try {
        if (kind === 'jpg') {
          orient = jpegOrientation(bytes);
          if (orient === 2 || orient === 4 || orient === 5 || orient === 7) throw new Error('mirrored');
          image = await pdf.embedJpg(bytes);
        } else {
          image = await pdf.embedPng(bytes);
        }
        rawW = image.width; rawH = image.height;
        ptW = rawW * PX_TO_PT; ptH = rawH * PX_TO_PT;
        if (orient === 6 || orient === 8) { const tmp = ptW; ptW = ptH; ptH = tmp; }
      } catch (e) {
        await embedFromCanvas();
      }
    }

    // displayed (upright) size in points
    const dispW = ptW, dispH = ptH;
    let pageW, pageH, bw, bh, bx, by;
    if (mode === 'remarkable') {
      const landscape = dispW > dispH;
      pageW = landscape ? RM_H_PT : RM_W_PT;
      pageH = landscape ? RM_W_PT : RM_H_PT;
      const k = Math.min(pageW / dispW, pageH / dispH);
      bw = dispW * k; bh = dispH * k;
      bx = (pageW - bw) / 2; by = (pageH - bh) / 2;
    } else {
      pageW = Math.max(36, dispW); pageH = Math.max(36, dispH);
      bw = pageW; bh = pageH; bx = 0; by = 0;
    }

    const page = pdf.addPage([pageW, pageH]);
    let o = { x: bx, y: by, width: bw, height: bh };
    if (orient === 3) { o = { x: bx + bw, y: by + bh, width: bw, height: bh, rotate: PDFLib.degrees(180) }; }
    else if (orient === 6) { o = { x: bx, y: by + bh, width: bh, height: bw, rotate: PDFLib.degrees(-90) }; }
    else if (orient === 8) { o = { x: bx + bw, y: by, width: bh, height: bw, rotate: PDFLib.degrees(90) }; }
    page.drawImage(image, o);
  }

  /**
   * @param {File[]} files  jpg / png / svg / webp, one page per image, in the given order
   * @param {{pageMode: 'original'|'remarkable', name?: string}} opts
   * @returns {Promise<File>} a PDF file; named like the first image unless opts.name is given
   */
  async function imagesToPdf(files, opts) {
    await R.load.pdfLib();
    const PDFLib = window.PDFLib;
    const mode = (opts && opts.pageMode) || 'original';
    const pdf = await PDFLib.PDFDocument.create();
    for (let i = 0; i < files.length; i++) await addImagePage(pdf, files[i], mode);
    const base = (opts && opts.name) || files[0].name.replace(/\.[^.]+$/, '');
    pdf.setTitle(base);
    pdf.setCreator('reMarkable web interface');
    const out = await pdf.save();
    return new File([out], base + '.pdf', { type: 'application/pdf' });
  }

  function imageToPdf(file, opts) { return imagesToPdf([file], opts); }

  R.convert = {
    kindOf: kindOf,
    isImage: function (file) { return !!kindOf(file); },
    imageToPdf: imageToPdf,
    imagesToPdf: imagesToPdf
  };
})();
