/*
 * Markdown / plain text / source code -> PDF, entirely in the browser.
 *   Markdown is parsed with marked (MIT), HTML with the browser's DOMParser
 *   (inert, nothing is executed or loaded). Source code files (JS, TS, PY,
 *   SH, ...) and HTML are rendered as formatted code with line numbers and
 *   light syntax highlighting. Code titles carry the file extension so the
 *   document type stays visible on the tablet; code pages use tight margins
 *   (flush left with a line-number gutter, half margin elsewhere). EPUB files
 *   are passed through unchanged because the device imports them natively.
 *   The page layout is own code on top of
 *   pdf-lib (MIT) using the standard PDF fonts (Latin-1 / WinAnsi characters;
 *   emoji and non-Latin scripts are replaced by "?").
 */
(function () {
  'use strict';
  const R = (window.RMX = window.RMX || {});

  const PAGES = {
    remarkable: { w: (1404 / 226) * 72, h: (1872 / 226) * 72, margin: 30 },
    a4: { w: 595.28, h: 841.89, margin: 54 }
  };
  const SKIP = /^(script|style|noscript|template|svg|canvas|iframe|object|embed|nav|aside|footer|button|select|input|textarea|dialog|video|audio|map|head|link|meta)$/i;
  const INLINE = /^(a|span|strong|b|em|i|u|s|del|ins|small|sup|sub|mark|code|kbd|samp|var|abbr|cite|q|time|label|font|big|tt|bdi|bdo|data|dfn)$/i;
  const BLOCKISH = /^(p|div|section|article|main|header|figure|figcaption|details|summary|address|center|dl|dd|dt|body|html|hgroup)$/i;
  const TRANSLIT = { '\u2192': '->', '\u2190': '<-', '\u2713': 'v', '\u2714': 'v', '\u2715': 'x', '\u2022': '\u2022', '\u00a0': ' ', '\u2011': '-', '\u2212': '-', '\u200b': '', '\ufeff': '', '\u2028': '\n', '\u2029': '\n' };

  function pageDate(d) { return d; }

  /** WinAnsi-safe text per embedded standard font: transliterates common
     symbols (e.g. \u2192 -> "->") and replaces everything else outside the
     font's character set with "?" instead of letting pdf-lib throw. */
  function charsetCleaner(fonts) {
    const sets = {};
    Object.keys(fonts).forEach(function (k) { sets[k] = new Set(fonts[k].getCharacterSet()); });
    return function (text, key) {
      const cs = sets[key] || sets.r;
      let out = '';
      for (let ch of text) {
        if (ch === '\n') { out += ch; continue; }
        if (TRANSLIT[ch] !== undefined) ch = TRANSLIT[ch];
        for (const c of ch) out += cs.has(c.codePointAt(0)) ? c : (c.charCodeAt(0) < 32 ? '' : '?');
      }
      return out;
    };
  }

  /* ---------- HTML -> block model ---------- */

  function Walker() { this.blocks = []; this.title = ''; }

  Walker.prototype.runStyle = function (el, st) {
    const n = el.nodeName.toLowerCase();
    const s = { b: st.b, i: st.i, m: st.m, link: st.link, gray: st.gray };
    if (n === 'strong' || n === 'b' || /^h[1-6]$/.test(n)) s.b = true;
    if (n === 'em' || n === 'i' || n === 'cite' || n === 'dfn' || n === 'var') s.i = true;
    if (n === 'code' || n === 'kbd' || n === 'samp' || n === 'tt') s.m = true;
    if (n === 'a' && el.getAttribute('href')) s.link = true;
    if (n === 'small' || n === 'sup' || n === 'sub') s.gray = st.gray;
    return s;
  };

  /** Appends the inline content of a node to `runs`. */
  Walker.prototype.inline = function (node, st, runs) {
    const self = this;
    if (node.nodeType === 3) {
      const tx = node.nodeValue.replace(/[\t\r\n ]+/g, ' ');
      if (tx) runs.push({ text: tx, b: st.b, i: st.i, m: st.m, link: st.link, gray: st.gray });
      return;
    }
    if (node.nodeType !== 1) return;
    const n = node.nodeName.toLowerCase();
    if (SKIP.test(n) || node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true') return;
    if (n === 'br') { runs.push({ text: '\n' }); return; }
    if (n === 'img') {
      const alt = (node.getAttribute('alt') || '').trim();
      if (alt) runs.push({ text: '[' + alt + ']', i: true, gray: true });
      return;
    }
    const s = this.runStyle(node, st);
    Array.prototype.forEach.call(node.childNodes, function (c) { self.inline(c, s, runs); });
  };

  function trimRuns(runs) {
    // collapse whitespace across run borders and trim both ends
    const out = [];
    runs.forEach(function (r) {
      if (r.text === '\n') { out.push(r); return; }
      let t = r.text;
      const prev = out[out.length - 1];
      if (prev && prev.text !== '\n' && /\s$/.test(prev.text) && /^\s/.test(t)) t = t.replace(/^\s+/, '');
      if (!prev || prev.text === '\n') t = t.replace(/^\s+/, '');
      if (t) out.push(Object.assign({}, r, { text: t }));
    });
    while (out.length && (out[out.length - 1].text === '\n' || /^\s*$/.test(out[out.length - 1].text))) out.pop();
    if (out.length) out[out.length - 1].text = out[out.length - 1].text.replace(/\s+$/, '');
    return out;
  }

  Walker.prototype.flush = function (runs, ctx, extra) {
    const r = trimRuns(runs);
    runs.length = 0;
    if (!r.length) return false;
    this.blocks.push(Object.assign({ kind: 'text', runs: r, indent: ctx.indent, quote: ctx.quote, size: 1 }, extra || {}));
    return true;
  };

  Walker.prototype.children = function (el, ctx, st) {
    const self = this;
    const runs = [];
    Array.prototype.forEach.call(el.childNodes, function (c) {
      if (c.nodeType === 3) { self.inline(c, st, runs); return; }
      if (c.nodeType !== 1) return;
      const n = c.nodeName.toLowerCase();
      if (SKIP.test(n) || c.hasAttribute('hidden') || c.getAttribute('aria-hidden') === 'true') return;
      if (INLINE.test(n) || n === 'br' || n === 'img') { self.inline(c, st, runs); return; }
      self.flush(runs, ctx);
      self.block(c, ctx, st);
    });
    self.flush(runs, ctx);
  };

  Walker.prototype.block = function (el, ctx, st) {
    const n = el.nodeName.toLowerCase();
    const self = this;
    const m = /^h([1-6])$/.exec(n);
    if (m) {
      const runs = [];
      this.inline(el, Object.assign({}, st, { b: true }), runs);
      const lvl = parseInt(m[1], 10);
      if (this.flush(runs, ctx, { heading: lvl, size: [0, 1.75, 1.45, 1.25, 1.12, 1.05, 1][lvl] }) && !this.title && lvl <= 2) {
        this.title = this.blocks[this.blocks.length - 1].runs.map(function (r) { return r.text; }).join('');
      }
      return;
    }
    if (n === 'ul' || n === 'ol') {
      let idx = n === 'ol' ? parseInt(el.getAttribute('start') || '1', 10) : 0;
      Array.prototype.forEach.call(el.children, function (li) {
        if (li.nodeName.toLowerCase() !== 'li') return;
        const marker = n === 'ol' ? (idx++) + '.' : (ctx.indent % 2 ? '\u2013' : '\u2022');
        const before = self.blocks.length;
        self.children(li, { indent: ctx.indent + 1, quote: ctx.quote }, st);
        if (self.blocks.length === before) self.blocks.push({ kind: 'text', runs: [{ text: ' ' }], indent: ctx.indent + 1, quote: ctx.quote, size: 1 });
        const first = self.blocks[before];
        first.marker = marker;
        first.listFirst = true;
        for (let i = before + 1; i < self.blocks.length; i++) self.blocks[i].tight = true;
      });
      this.blocks.push({ kind: 'gap', h: 0.4 });
      return;
    }
    if (n === 'li') { this.children(el, { indent: ctx.indent + 1, quote: ctx.quote }, st); return; }
    if (n === 'blockquote') { this.children(el, { indent: ctx.indent, quote: ctx.quote + 1 }, Object.assign({}, st, { i: st.i })); return; }
    if (n === 'pre') {
      const codeText = el.textContent.replace(/\r/g, '').replace(/\n+$/, '');
      this.blocks.push({ kind: 'code', text: codeText, indent: ctx.indent, quote: ctx.quote });
      return;
    }
    if (n === 'hr') { this.blocks.push({ kind: 'hr', quote: ctx.quote }); return; }
    if (n === 'table') { this.table(el, ctx, st); return; }
    if (n === 'dl') { this.children(el, ctx, st); return; }
    if (n === 'dt') { this.children(el, ctx, Object.assign({}, st, { b: true })); return; }
    if (n === 'dd') { this.children(el, { indent: ctx.indent + 1, quote: ctx.quote }, st); return; }
    if (BLOCKISH.test(n) || n === 'tbody' || n === 'thead' || n === 'tfoot') { this.children(el, ctx, st); return; }
    // unknown element: treat as container
    this.children(el, ctx, st);
  };

  Walker.prototype.table = function (el, ctx, st) {
    const self = this;
    const rows = [];
    Array.prototype.forEach.call(el.querySelectorAll('tr'), function (tr) {
      const cells = [];
      Array.prototype.forEach.call(tr.children, function (td) {
        const nn = td.nodeName.toLowerCase();
        if (nn !== 'td' && nn !== 'th') return;
        const runs = [];
        self.inline(td, Object.assign({}, st, { b: st.b || nn === 'th' }), runs);
        cells.push(trimRuns(runs));
      });
      if (cells.length) rows.push({ cells: cells, head: !!tr.querySelector('th') });
    });
    if (rows.length) this.blocks.push({ kind: 'table', rows: rows, indent: ctx.indent, quote: ctx.quote });
  };

  function textToBlocks(text) {
    const blocks = [];
    text.replace(/\r\n?/g, '\n').split(/\n{2,}/).forEach(function (para) {
      if (!para.trim()) return;
      const runs = [];
      para.replace(/\n+$/, '').split('\n').forEach(function (line, i) {
        if (i) runs.push({ text: '\n' });
        runs.push({ text: line.replace(/\t/g, '    ') });
      });
      blocks.push({ kind: 'text', runs: runs, indent: 0, quote: 0, size: 1, raw: true });
    });
    return { blocks: blocks, title: '' };
  }

  function htmlToBlocks(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const w = new Walker();
    // prefer the main content, but only if it holds a substantial part of the page text
    let root = doc.body;
    const total = (doc.body.textContent || '').trim().length;
    const cand = doc.querySelector('article') || doc.querySelector('main');
    if (cand && (cand.textContent || '').trim().length >= Math.min(600, total * 0.4)) root = cand;
    const t = doc.querySelector('title');
    w.children(root, { indent: 0, quote: 0 }, {});
    if (t && t.textContent.trim()) w.title = t.textContent.trim();
    return { blocks: w.blocks, title: w.title };
  }

  /* ---------- layout / drawing ---------- */

  async function render(model, opts) {
    const PDFLib = window.PDFLib;
    const pg = PAGES[opts.page] || PAGES.remarkable;
    const base = 11 * (opts.fontScale || 1);
    const pdf = await PDFLib.PDFDocument.create();
    const SF = PDFLib.StandardFonts;
    const fonts = {
      r: await pdf.embedFont(SF.Helvetica),
      b: await pdf.embedFont(SF.HelveticaBold),
      i: await pdf.embedFont(SF.HelveticaOblique),
      bi: await pdf.embedFont(SF.HelveticaBoldOblique),
      m: await pdf.embedFont(SF.Courier),
      mb: await pdf.embedFont(SF.CourierBold)
    };
    const fk = function (r) {
      if (r.m) return r.b ? 'mb' : 'm';
      return r.b && r.i ? 'bi' : r.b ? 'b' : r.i ? 'i' : 'r';
    };
    const clean = charsetCleaner(fonts);

    const left = pg.margin, right = pg.w - pg.margin, top = pg.h - pg.margin, bottom = pg.margin;
    let page = null, y = 0;
    const newPage = function () { page = pdf.addPage([pg.w, pg.h]); y = top; };
    newPage();
    const INDENT = 18, QUOTE = 12;
    const gray = PDFLib.rgb(0.35, 0.35, 0.35), blue = PDFLib.rgb(0.1, 0.25, 0.7), black = PDFLib.rgb(0.1, 0.09, 0.08);

    /** Splits runs into lines that fit `width`. Each line: {items:[{t,key,size,color}], w}. */
    function layoutRuns(runs, size, width, forceBold) {
      const lines = [];
      let cur = { items: [], w: 0 };
      const push = function () { lines.push(cur); cur = { items: [], w: 0 }; };
      runs.forEach(function (r) {
        if (r.text === '\n') { push(); return; }
        const rr = forceBold ? Object.assign({}, r, { b: true }) : r;
        const key = fk(rr);
        const font = fonts[key];
        const color = rr.link ? blue : rr.gray ? gray : black;
        const parts = clean(r.text, key).split(/(\s+)/);
        parts.forEach(function (part) {
          if (!part) return;
          const isSpace = /^\s+$/.test(part);
          if (isSpace) part = ' ';
          const wd = font.widthOfTextAtSize(part, size);
          if (isSpace && !cur.items.length) return;
          if (cur.w + wd > width && !isSpace && cur.items.length) {
            // trailing space of the previous item is dropped by the width calc below
            push();
          }
          if (!isSpace && wd > width) {
            // very long word: break by characters
            let piece = '';
            for (const ch of part) {
              if (font.widthOfTextAtSize(piece + ch, size) > width - cur.w && (piece || cur.items.length)) {
                if (piece) cur.items.push({ t: piece, key: key, size: size, color: color, w: font.widthOfTextAtSize(piece, size) });
                cur.w += piece ? font.widthOfTextAtSize(piece, size) : 0;
                push(); piece = '';
              }
              piece += ch;
            }
            if (piece) { const pw = font.widthOfTextAtSize(piece, size); cur.items.push({ t: piece, key: key, size: size, color: color, w: pw }); cur.w += pw; }
            return;
          }
          cur.items.push({ t: part, key: key, size: size, color: color, w: wd });
          cur.w += wd;
        });
      });
      if (cur.items.length || !lines.length) lines.push(cur);
      return lines;
    }

    const quoteBars = function (q, yTop, yBottom) {
      for (let k = 0; k < q; k++) {
        page.drawRectangle({ x: left + k * QUOTE + 2, y: yBottom, width: 2, height: yTop - yBottom, color: PDFLib.rgb(0.75, 0.73, 0.7) });
      }
    };
    const ensure = function (h) { if (y - h < bottom) newPage(); };

    model.blocks.forEach(function (b, bi) {
      const qOff = (b.quote || 0) * QUOTE;
      const indentOff = (b.indent || 0) * INDENT;
      const x0 = left + qOff + indentOff;
      const width = right - x0;

      if (b.kind === 'gap') { y -= base * b.h; return; }
      if (b.kind === 'hr') {
        ensure(base * 2);
        y -= base * 0.8;
        page.drawLine({ start: { x: left + qOff, y: y }, end: { x: right, y: y }, thickness: 0.7, color: PDFLib.rgb(0.6, 0.58, 0.55) });
        y -= base * 0.8;
        return;
      }

      if (b.kind === 'code') {
        const size = base * 0.82;
        const cw = fonts.m.widthOfTextAtSize('M', size);
        const perLine = Math.max(8, Math.floor((width - 8) / cw));
        const lines = [];
        clean(b.text.replace(/\t/g, '  '), 'm').split('\n').forEach(function (ln) {
          if (!ln.length) { lines.push(''); return; }
          for (let p = 0; p < ln.length; p += perLine) lines.push(ln.slice(p, p + perLine));
        });
        const lh = size * 1.3;
        y -= base * 0.3;
        lines.forEach(function (ln) {
          ensure(lh);
          page.drawRectangle({ x: x0, y: y - lh + size * 0.25, width: width, height: lh, color: PDFLib.rgb(0.94, 0.93, 0.91) });
          if (ln) page.drawText(ln, { x: x0 + 4, y: y - size, font: fonts.m, size: size, color: black });
          if (b.quote) quoteBars(b.quote, y + size * 0.3, y - lh + size * 0.3);
          y -= lh;
        });
        y -= base * 0.6;
        return;
      }

      if (b.kind === 'table') {
        const cols = Math.max.apply(null, b.rows.map(function (r) { return r.cells.length; }));
        const weights = [];
        for (let c = 0; c < cols; c++) {
          let mx = 6;
          b.rows.forEach(function (r) {
            const len = (r.cells[c] || []).reduce(function (a, x) { return a + x.text.length; }, 0);
            mx = Math.max(mx, Math.min(len, 40));
          });
          weights.push(Math.sqrt(mx));
        }
        const total = weights.reduce(function (a, x) { return a + x; }, 0);
        const tsize = base * 0.9;
        const pad = 4;
        y -= base * 0.3;
        b.rows.forEach(function (row) {
          const cellLines = [];
          let maxLines = 1;
          for (let cc = 0; cc < cols; cc++) {
            const cwid = (width * weights[cc]) / total - pad * 2;
            const ls = layoutRuns(row.cells[cc] || [], tsize, cwid, row.head);
            cellLines.push(ls);
            maxLines = Math.max(maxLines, ls.length);
          }
          const lh2 = tsize * 1.3;
          const rh = maxLines * lh2 + pad * 2;
          ensure(rh);
          let cx = x0;
          for (let c2 = 0; c2 < cols; c2++) {
            const colw = (width * weights[c2]) / total;
            let yy = y - pad;
            cellLines[c2].forEach(function (ln) {
              let xx = cx + pad;
              ln.items.forEach(function (it) {
                page.drawText(it.t, { x: xx, y: yy - tsize, font: fonts[it.key], size: it.size, color: it.color });
                xx += it.w;
              });
              yy -= lh2;
            });
            cx += colw;
          }
          y -= rh;
          page.drawLine({ start: { x: x0, y: y }, end: { x: x0 + width, y: y }, thickness: 0.5, color: PDFLib.rgb(0.75, 0.73, 0.7) });
        });
        y -= base * 0.7;
        return;
      }

      // text block
      const size2 = base * (b.size || 1);
      const textLeft = x0;
      const lines2 = layoutRuns(b.runs, size2, width, !!b.heading);
      const lh3 = size2 * (b.heading ? 1.25 : 1.38);
      if (b.heading) { y -= size2 * (b.heading <= 2 ? 0.9 : 0.6); ensure(lh3 * 3); }
      else if (!b.tight && !b.listFirst) y -= 0;
      lines2.forEach(function (ln, li) {
        ensure(lh3);
        const yTop = y;
        let xx = textLeft;
        if (b.raw && /^\s*$/.test(ln.items.map(function (i) { return i.t; }).join(''))) { y -= lh3; return; }
        ln.items.forEach(function (it) {
          page.drawText(it.t, { x: xx, y: y - size2, font: fonts[it.key], size: it.size, color: it.color });
          xx += it.w;
        });
        if (li === 0 && b.marker) {
          const mw = fonts.r.widthOfTextAtSize(clean(b.marker, 'r'), size2);
          page.drawText(clean(b.marker, 'r'), { x: textLeft - 4 - mw, y: y - size2, font: fonts.r, size: size2, color: black });
        }
        if (b.quote) quoteBars(b.quote, yTop + size2 * 0.25, yTop - lh3 + size2 * 0.25);
        y -= lh3;
      });
      y -= b.heading ? size2 * 0.35 : (b.listFirst || b.tight ? base * 0.25 : base * 0.65);
    });

    const title = (opts.title || model.title || 'Dokument').trim();
    pdf.setTitle(title);
    pdf.setCreator('reMarkable web interface');
    return pdf;
  }

  const MD = /\.(md|markdown|mdown)$/i, TXT = /\.txt$/i, EPUB = /\.epub$/i;

  /* Source-code file types: rendered as readable formatted code (the device
     UI does not display code files at all, and HTML is sent as code, too). */
  const CODE_EXTS = {
    js: 'js', mjs: 'js', cjs: 'js', jsx: 'js', ts: 'js', tsx: 'js', mts: 'js', cts: 'js',
    vue: 'js', svelte: 'js', astro: 'js', json: 'js', jsonc: 'js', groovy: 'jvm', gradle: 'jvm',
    java: 'jvm', kt: 'jvm', kts: 'jvm', scala: 'jvm', cs: 'jvm', dart: 'jvm', swift: 'jvm',
    go: 'c', rs: 'c', c: 'c', h: 'c', cc: 'c', cpp: 'c', cxx: 'c', hh: 'c', hpp: 'c', hxx: 'c',
    py: 'py', pyw: 'py', rb: 'py', erb: 'py', php: 'py', phtml: 'py', pl: 'py', pm: 'py',
    sh: 'sh', bash: 'sh', zsh: 'sh', ksh: 'sh', fish: 'sh', ps1: 'sh', psm1: 'sh', bat: 'sh', cmd: 'sh',
    css: 'css', scss: 'css', sass: 'css', less: 'css', styl: 'css',
    html: 'xml', htm: 'xml', xhtml: 'xml', xml: 'xml', xsl: 'xml', xslt: 'xml',
    yaml: 'yaml', yml: 'yaml', toml: 'yaml', ini: 'yaml', cfg: 'yaml', conf: 'yaml', properties: 'yaml',
    sql: 'sql', lua: 'lua', r: 'lua', jl: 'lua', proto: 'xml', graphql: 'js', gql: 'js', tf: 'yaml'
  };
  const CODE_NAME = /^(makefile|dockerfile|rakefile|gemfile|jenkinsfile|vagrantfile|justfile|\.gitignore|\.gitattributes|\.gitmodules|\.dockerignore|\.editorconfig|\.npmrc|\.babelrc|\.eslintrc(\..+)?)$/i;

  /** Classifies an upload by name/mime: md | code | epub | txt (or null). */
  function kindOf(file) {
    const n = file.name, m = /\.([a-z0-9]+)$/i.exec(n), ext = m ? m[1].toLowerCase() : '';
    if (MD.test(n) || file.type === 'text/markdown') return 'md';
    if (CODE_EXTS[ext] || CODE_NAME.test(n) ||
        /^(text\/(javascript|typescript|x-sh|sh|kotlin|rust|sql)|application\/(javascript|typescript|json|xml|xhtml|sql|x-sh))$/.test(file.type)) return 'code';
    if (/\.epub$/i.test(n) || file.type === 'application/epub+zip') return 'epub';
    if (TXT.test(n) || file.type === 'text/plain') return 'txt';
    return null;
  }

  /** What a URL holds, by extension: pdf | md | code | null. Shared with the popup. */
  function urlKind(url) {
    if (!url || !/^https?:\/\//i.test(url)) return null;
    const p = (url.split(/[?#]/)[0] || '').replace(/\/+$/, '');
    if (/\.pdf$/i.test(p)) return 'pdf';
    const m = /\.([a-z0-9]+)$/i.exec(p), ext = m ? m[1].toLowerCase() : '';
    if (/^(md|markdown|mdown)$/.test(ext)) return 'md';
    if (ext === 'epub') return 'epub';
    if (CODE_EXTS[ext]) return 'code';
    return null;
  }

  /** @param {File} file md | txt | html   @param {{page,fontScale,title}} opts   @returns {Promise<File>} */
  /* ---------- source code -> PDF (line numbers, light syntax highlighting) ----------
   * Own mini-tokenizer: a whole top-level unit (class, function, statement with
   * trailing lines) always stays on one page if it fits on an empty page.
   * Fine-grained colour output stays readable on the e-ink tablet. */

  const KW_GROUPS = {
    js: ('as async await break case catch class const continue debugger default delete do else export extends finally for ' +
      'function if implements import in instanceof interface let new of return static super switch this throw try ' +
      'typeof var void while with yield true false null undefined NaN get set enum namespace declare readonly public ' +
      'private protected abstract type constructor').split(' '),
    c: ('auto break case char const continue default do double else enum extern float for goto if inline int long register ' +
      'restrict return short signed sizeof static struct switch typedef union unsigned void volatile while class new delete ' +
      'this virtual override private public protected template typename namespace using nullptr true false bool catch throw ' +
      'try operator explicit friend mutable fn let mut impl pub use match mod trait struct where async move ref unsafe').split(' '),
    jvm: ('abstract assert boolean break byte case catch char class const continue default do double else enum extends final ' +
      'finally float for goto if implements import instanceof int interface long native new package private protected ' +
      'public return short static strictfp super switch synchronized this throw throws transient try void volatile while ' +
      'var val fun object data when null true false open companion override sealed init suspend inline').split(' '),
    py: ('and as assert async await break class continue def del elif else except finally for from global if import in is ' +
      'lambda nonlocal not or pass raise return try while with yield True False None self match case').split(' '),
    sh: ('if then else elif fi for while until do done case esac in function return exit local export readonly declare shift ' +
      'set unset trap echo source alias break continue true false select time').split(' '),
    sql: ('add all alter and any as asc authorization between by case check column constraint create cross current_date ' +
      'current_time default delete desc distinct drop else end escape except exists from grant group having in index inner ' +
      'insert intersect into join key like not null on or order outer primary references revoke right rollback select set ' +
      'some table then to union unique update values view when where with commit begin').split(' '),
    css: ('important media supports keyframes import includes from and not only screen print root var apply extend mixin').split(' '),
    lua: ('and break do else elseif end false for function goto if in local nil not or repeat return then true until while').split(' ')
  };
  const LANGS = {
    js: { line: ['//'], block: [['/*', '*/']], kw: KW_GROUPS.js, name: 'JavaScript' },
    jvm: { line: ['//'], block: [['/*', '*/']], kw: KW_GROUPS.jvm, name: 'Java / Kotlin' },
    c: { line: ['//'], block: [['/*', '*/']], kw: KW_GROUPS.c, name: 'C / C++ / Go' },
    py: { line: ['#'], block: [['"""', '"""'], ["'''", "'''"]], kw: KW_GROUPS.py, name: 'Python / Ruby' },
    sh: { line: ['#'], block: [], kw: KW_GROUPS.sh, name: 'Shell' },
    css: { line: [], block: [['/*', '*/']], kw: KW_GROUPS.css, name: 'CSS / SCSS' },
    xml: { line: [], block: [['<!--', '-->']], kw: [], name: 'XML / HTML' },
    yaml: { line: ['#'], block: [], kw: [], name: 'YAML / TOML' },
    sql: { line: ['--'], block: [['/*', '*/']], kw: KW_GROUPS.sql, ci: true, name: 'SQL' },
    lua: { line: ['--'], block: [['--[[', ']]']], kw: KW_GROUPS.lua, name: 'Lua' }
  };

  /** Splits source into lines of {t, cls} segments, cls: kw | str | com | num | null. */
  function tokenize(text, lang) {
    const L = LANGS[lang] || { line: [], block: [], kw: [], ci: false };
    const kws = L.ci ? L.kw.map(function (w) { return w.toLowerCase(); }) : L.kw;
    const out = [];
    let pending = null;               /* { end, cls } active multi-line string/comment */
    text.replace(/\r\n?/g, '\n').split('\n').forEach(function (raw) {
      const line = raw.replace(/\t/g, '  ');
      const segs = [];
      let cur = '';
      const flush = function () { if (cur) { segs.push({ t: cur, cls: null }); cur = ''; } };
      let i = 0;
      while (i < line.length) {
        if (pending) {
          flush();
          const idx = line.indexOf(pending.end, i);
          const stop = idx < 0 ? line.length : idx + pending.end.length;
          segs.push({ t: line.slice(i, stop), cls: pending.cls });
          i = stop;
          if (idx >= 0) pending = null;
          continue;
        }
        const c0 = line[i];
        const isQuote = c0 === '"' || c0 === "'" || c0 === '`';
        const lineTok = L.line.filter(function (tok) { return line.startsWith(tok, i); })[0];
        const blockTok = L.block.filter(function (tok) { return line.startsWith(tok[0], i); })[0];
        if (isQuote) {
          flush();
          let j = 1, closed = false;
          while (j < line.length - i) {
            if (line[i + j] === '\\') { j += 2; continue; }
            if (line[i + j] === c0) { closed = true; j++; break; }
            j++;
          }
          segs.push({ t: line.substr(i, j), cls: 'str' });
          if (!closed) pending = { end: c0, cls: 'str' };
          i += j;
          continue;
        }
        if (lineTok) {
          flush();
          segs.push({ t: line.slice(i), cls: 'com' });
          i = line.length;
          continue;
        }
        if (blockTok) {
          flush();
          const idx = line.indexOf(blockTok[1], i + blockTok[0].length);
          const seg = idx < 0 ? line.slice(i) : line.slice(i, idx + blockTok[1].length);
          segs.push({ t: seg, cls: 'com' });
          if (idx < 0) pending = { end: blockTok[1], cls: 'com' };
          i += seg.length;
          continue;
        }
        const wm = /^[\w$]+/.exec(line.slice(i));
        if (wm) {
          flush();
          const w = wm[0];
          const lc = L.ci ? w.toLowerCase() : w;
          segs.push({ t: w, cls: kws.indexOf(lc) >= 0 ? 'kw' : (/^\d/.test(w) ? 'num' : null) });
          i += w.length;
          continue;
        }
        cur += c0;
        i++;
      }
      flush();
      out.push(segs);
    });
    return out;
  }

  async function renderCode(text, name, opts) {
    const PDFLib = window.PDFLib;
    const pg = PAGES[opts.page] || PAGES.remarkable;
    const pdf = await PDFLib.PDFDocument.create();
    const SF = PDFLib.StandardFonts;
    const fonts = {
      m: await pdf.embedFont(SF.Courier),
      mb: await pdf.embedFont(SF.CourierBold),
      mi: await pdf.embedFont(SF.CourierOblique),
      r: await pdf.embedFont(SF.Helvetica),
      rb: await pdf.embedFont(SF.HelveticaBold)
    };
    const clean = charsetCleaner(fonts);
    const size = Math.max(5.5, Math.min(11.5, 8.8 * (opts.fontScale || 1)));
    const lh = size * 1.32;
    const margin = pg.margin;
    /* Code pages use tighter margins: flush left (the line-number gutter sits
       at the paper edge), half the regular margin right/top/bottom. The
       missing left margin is balanced by indenting the code after the gutter. */
    const cm = Math.round(margin * 0.5);
    const gutterW = Math.max(17, fonts.m.widthOfTextAtSize('0000', size) + 10);
    const left = gutterW + 6 + Math.round(margin * 0.5), right = pg.w - cm;
    const cw = fonts.m.widthOfTextAtSize('M', size);
    const perLine = Math.max(10, Math.floor((right - left) / cw));
    const black = PDFLib.rgb(0.10, 0.09, 0.08);
    /* token colours as in GitHub's code view (light theme): keywords red,
       strings navy, comments grey, numbers blue. */
    const colors = {
      kw: PDFLib.rgb(0.812, 0.133, 0.180),
      str: PDFLib.rgb(0.039, 0.188, 0.412),
      com: PDFLib.rgb(0.349, 0.388, 0.431),
      num: PDFLib.rgb(0.020, 0.314, 0.682)
    };
    const clsColor = function (cls) { return cls ? colors[cls] : black; };
    const clsFont = function (cls) { return cls === 'kw' ? fonts.mb : cls === 'com' ? fonts.mi : fonts.m; };

    /* One visual line = { no: source line number, segs: [{t, cls}] }. Lines that
       do not fit are wrapped (continuation without line number). */
    text = clean(text, 'm');   /* WinAnsi-safe ahead of wrapping/width math */
    const rows = tokenize(text, (CODE_EXTS[(name.match(/\.([a-z0-9]+)$/i) || [])[1] || '']) || '');
    const visual = [];
    rows.forEach(function (segs, li) {
      let buf = [], used = 0;
      const pushV = function (no) {
        visual.push({ no: no, segs: buf });
        buf = []; used = 0;
      };
      segs.forEach(function (s) {
        let rest = s.t;
        while (rest.length > perLine - used) {
          buf.push({ t: rest.slice(0, perLine - used), cls: s.cls });
          rest = rest.slice(perLine - used);
          pushV(null);
        }
        if (rest.length) { buf.push({ t: rest, cls: s.cls }); used += rest.length; }
      });
      buf.push({ t: '', cls: null });
      pushV(li + 1);
    });

    /* Group into top-level units: a unit starts at an unindented, non-blank
       line that is not a closing bracket. A unit never starts on the last
       lines of a page if it could be moved to a fresh page. */
    const units = [];
    let unit = [];
    visual.forEach(function (v) {
      const s = v.no !== null ? (v.segs[0] ? v.segs[0].t : '') : '';
      const startsUnit = v.no !== null && s.trim() && !/^[}\])]/.test(s.trim());
      const freshUnit = v.no !== null && !s.trim();
      if (unit.length && (startsUnit || freshUnit)) { units.push(unit); unit = []; }
      unit.push(v);
    });
    if (unit.length) units.push(unit);

    /* first page + title block */
    let page = pdf.addPage([pg.w, pg.h]);
    let y = pg.h - cm;
    const title = clean(((opts.title || name).replace(/[\\/]/g, ' ').trim() || name), 'rb');
    const titleSize = Math.min(19, size * 1.9);
    page.drawText(title, { x: left, y: y - titleSize, font: fonts.rb, size: titleSize, color: black });
    y -= titleSize * 1.5;
    const ext = (name.match(/\.([a-z0-9]+)$/i) || [])[1] || '';
    const meta = clean(R.t('codeLines', { n: rows.length, lang: (LANGS[CODE_EXTS[ext]] || {}).name || 'TXT' }), 'r');
    page.drawText(meta, { x: left, y: y - size, font: fonts.r, size: size * 0.95, color: colors.com });
    y -= size * 1.9;
    page.drawLine({ start: { x: 0, y: y }, end: { x: pg.w - cm, y: y }, thickness: 0.7, color: PDFLib.rgb(0.72, 0.70, 0.67) });
    y -= size * 1.1;
    const firstTop = y;
    const freshHeight = pg.h - cm * 2;
    const remaining = function () { return y - (cm + size * 2.2); };
    const nextPage = function () { page = pdf.addPage([pg.w, pg.h]); y = pg.h - cm; };

    units.forEach(function (u) {
      const h = u.length * lh;
      if (h <= freshHeight && y < firstTop && remaining() < h && remaining() > lh * 2) nextPage();
      u.forEach(function (v) {
        if (remaining() < lh) nextPage();
        const yLine = y;
        if (v.no !== null) {
          const no = String(v.no);
          page.drawText(no, { x: margin + (gutterW - 8) - fonts.m.widthOfTextAtSize(no, size), y: yLine - size, font: fonts.m, size: size, color: colors.com });
        }
        page.drawLine({ start: { x: margin + gutterW, y: yLine + size * 0.25 }, end: { x: margin + gutterW, y: yLine - lh + size * 0.25 }, thickness: 0.5, color: PDFLib.rgb(0.86, 0.85, 0.83) });
        let x = left;
        v.segs.forEach(function (s) {
          if (s.t) page.drawText(s.t, { x: x, y: yLine - size, font: clsFont(s.cls), size: size, color: clsColor(s.cls) });
          x += s.t.length * cw;
        });
        y -= lh;
      });
      if (u !== units[units.length - 1]) y -= lh * 0.25;    /* small gap between units */
    });

    /* footer: file name left, page n/m right */
    const pages = pdf.getPages();
    const fSize = Math.max(6.5, size * 0.82);
    const fn = clean(name.length > 60 ? name.slice(0, 57) + '...' : name, 'r');
    pages.forEach(function (p, pi) {
      p.drawLine({ start: { x: 0, y: cm + size * 1.5 }, end: { x: pg.w - cm, y: cm + size * 1.5 }, thickness: 0.5, color: PDFLib.rgb(0.80, 0.78, 0.75) });
      const rightText = (pi + 1) + ' / ' + pages.length;
      const rw = fonts.r.widthOfTextAtSize(rightText, fSize);
      p.drawText(rightText, { x: pg.w - cm - rw, y: cm + size * 0.45, font: fonts.r, size: fSize, color: colors.com });
      p.drawText(fn, { x: 0, y: cm + size * 0.45, font: fonts.r, size: fSize, color: colors.com });
    });

    pdf.setTitle(title);
    pdf.setCreator('reMarkable web interface');
    return pdf;
  }

  async function convert(file, opts) {
    opts = opts || {};
    await R.load.pdfLib();
    const text = await file.text();
    const kind = kindOf(file);
    if (kind === 'md') await R.load.marked();
    let model;
    if (kind === 'code') {
      const base = file.name.replace(/\.[^.]+$/, '');
      /* keep the extension visible: title and file name carry "base.ext" */
      const ext = (file.name.match(/\.([a-z0-9]+)$/i) || [])[1] || '';
      const title = (opts.title || base + (ext ? '.' + ext : ''));
      const pdf = await renderCode(text, file.name, { page: opts.page, fontScale: opts.fontScale, title: title });
      const bytes = await pdf.save();
      return new File([bytes], title + '.pdf', { type: 'application/pdf' });
    }
    if (kind === 'epub') {
      /* EPUB is transferred to the tablet unchanged (the device import
         handles it natively); no PDF conversion happens here. */
      return file;
    }
    if (kind === 'md') {
      if (!window.marked) throw new Error('marked not loaded');
      const html = window.marked.parse(text, { gfm: true, breaks: false });
      model = htmlToBlocks(html);
      if (!model.title) {
        const mm = /^\s*#\s+(.+)$/m.exec(text);
        if (mm) model.title = mm[1].trim();
      }
    } else {
      model = textToBlocks(text);
    }
    if (!model.blocks.length) throw new Error(R.t('emptyDoc'));
    const base = file.name.replace(/\.[^.]+$/, '');
    const pdf = await render(model, { page: opts.page, fontScale: opts.fontScale, title: opts.title || model.title || base });
    const bytes = await pdf.save();
    const outName = (opts.useTitleAsName && model.title ? model.title.replace(/[\\\/\u0000-\u001f]/g, ' ').trim().slice(0, 120) : base) || base;
    return new File([bytes], outName + '.pdf', { type: 'application/pdf' });
  }

  R.textpdf = { kindOf: kindOf, convert: convert, pageDate: pageDate, urlKind: urlKind };
})();
