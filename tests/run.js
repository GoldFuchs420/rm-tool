/*
 * Selbstlaufende Testsuite (node tests/run.js, ohne Abhängigkeiten).
 *
 * Prüft:
 *  1. shared/filename.js: sanitizeFilename, asciiName, ymd
 *  2. assets/js/i18n.js: Tabellenintegrität (5 Sprachen pro Eintrag)
 *  3. Referenzauflösung: jeder im Code/HTML genutzte i18n-Schlüssel existiert
 *  4. Dateireferenzen: src/href in HTML, Icons in manifest.json, R.load-Pfade
 *  5. manifest.json ist gültiges JSON mit erwarteten Feldern
 *  6. Syntax aller eigenen JS-Dateien (node --check)
 *  7. Keine Referenzen auf entfernte Dateien (libs/jspdf.js)
 *  8. Ungenutzte Funktionen (Deklaration ohne jede Referenz = toter Code)
 *  9. Doppelte Funktionsdeklarationen innerhalb einer Datei
 * 10. Fehlende Funktionen (Aufruf ohne Deklaration, Global oder Built-in)
 * 11. Ungenutzte CSS-Klassen in app.css, popup.css, servers.css
 * 12. Fehlende CSS-Klassen (referenziert in HTML/JS, aber nicht definiert)
 * 13. Fehlende Dateien (Referenzen aus HTML, CSS, JS und manifest.json)
 * 14. Ungenutzte Dateien (vom Erweiterungspaket nicht referenziert)
 * 15. Doppelte HTML-IDs
 * 16. CSS-Klammerbalance
 * 17. i18n-Sprachparitaet: Platzhalter ({n}, {name}, ...) und Sprachliste
 * 18. Content-Security-Policy des Manifests (MV3-Defaults darf nicht gelockert werden)
 * 19. OCR-Pipeline: Geometrie/Dekodierung der neuen Module (vm-Sandbox)
 * 20. OCR-Pipeline: manuell beschaffte Assets sind dokumentiert, Allowlist aktuell
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
let pass = 0;
let failures = [];

/* Manuell beschaffte Pipeline-Assets (Modelle + npm-Builds, siehe
   docs/ocr-pipeline.md): grosse Binärdateien bzw. npm-Builds, bewusst NICHT
   im Repository. Die Tests prüfen ihre Existenz nicht - nur dass jede Datei
   in docs/ocr-pipeline.md dokumentiert bleibt (Abschnitt 20). */
const MANUAL_ASSETS = [
  "assets/vendor/remarkable-rm/index.global.js",
  "assets/vendor/onnxruntime-web/",
  "assets/models/de-htr-v2/model.onnx",
  "assets/models/de-htr-v2/config.json",
  "assets/models/simple-htr/model.onnx",
  "assets/models/comer/encoder_int8.onnx",
  "assets/models/comer/decoder_int8.onnx",
  "assets/models/comer/vocab.json",
  "assets/vendor/ink-on/core/",
  "assets/vendor/katex/"
];

function isManualAsset(p) {
  return MANUAL_ASSETS.some(function (m) { return p === m || p.indexOf(m) === 0; });
}

function check(name, fn) {
  try {
    fn();
    pass++;
    console.log("  ok  " + name);
  } catch (e) {
    failures.push(name + " -> " + e.message);
    console.log("FAIL  " + name + "\n      " + e.message);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

function exists(file) {
  return fs.existsSync(path.join(ROOT, file));
}

/* ---------- 1. shared/filename.js in Sandbox laden ---------- */
const sandbox = { console: console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(read("shared/filename.js"), sandbox, { filename: "shared/filename.js" });
const S = sandbox.RMXShared;

console.log("\n[1] shared/filename.js");

check("sanitizeFilename entfernt \\ / : * ? \" < > |", function () {
  const out = S.sanitizeFilename('a/b\\c:d*e?f"g<h>i|j');
  assert(!/[\\/:*?"<>|]/.test(out), "erhalten: " + out);
  assert(out.indexOf("a b c d e f g h i j") === 0, "erhalten: " + out);
});

check("sanitizeFilename entfernt Steuerzeichen und fasst Leerraum zusammen", function () {
  const out = S.sanitizeFilename("a\u0000b\u001fc   d\t\ne");
  assert(!/[\u0000-\u001f]/.test(out), "Steuerzeichen erhalten: " + JSON.stringify(out));
  assert(out === "a b c d e", "erhalten: " + JSON.stringify(out));
});

check("sanitizeFilename kürzt auf 120 Zeichen", function () {
  const out = S.sanitizeFilename("x".repeat(500));
  assert(out.length === 120, "Länge: " + out.length);
});

check("sanitizeFilename hebt Leerraum am Namen für die Grenzprüfung auf", function () {
  const out = S.sanitizeFilename("  " + "y".repeat(125) + "  ");
  assert(out.length === 120 && out === "y".repeat(120), "erhalten: " + JSON.stringify(out.slice(0, 20)) + "… Länge " + out.length);
});

check("sanitizeFilename nutzt Fallback bei leerem/ungenutztem Input", function () {
  assert(S.sanitizeFilename("") === "Dokument", "leer");
  assert(S.sanitizeFilename(null) === "Dokument", "null");
  assert(S.sanitizeFilename("///") === "Dokument", "nur Sonderzeichen");
  assert(S.sanitizeFilename("", "Artikel") === "Artikel", "eigener Fallback");
});

check("sanitizeFilename behält Umlaute (kein ASCII-Zwang)", function () {
  assert(S.sanitizeFilename("Grüße an Kölle") === "Grüße an Kölle", "erhalten: " + S.sanitizeFilename("Grüße an Kölle"));
});

check("asciiName: ä→ae ö→oe ü→ue ß→ss", function () {
  assert(S.asciiName("äöüß") === "aeoeuess", "erhalten: " + S.asciiName("äöüß"));
});

check("asciiName: Versalien", function () {
  assert(S.asciiName("ÄÖÜÆØ") === "AeOeUeAeOe", "erhalten: " + S.asciiName("ÄÖÜÆØ"));
});

check("asciiName: Akzente über NFD (é, è, ç, ř)", function () {
  assert(S.asciiName("é") === "e", "é -> " + JSON.stringify(S.asciiName("é")));
  assert(S.asciiName("È") === "E", "È -> " + S.asciiName("È"));
  assert(S.asciiName("ç") === "c", "ç -> " + S.asciiName("ç"));
  assert(S.asciiName("ř") === "r", "ř -> " + S.asciiName("ř"));
});

check("asciiName: nicht darstellbare Zeichen werden _ (kein Leerzeichen)", function () {
  assert(S.asciiName("日") === "_", "日 -> " + JSON.stringify(S.asciiName("日")));
  assert(S.asciiName("€") === "_", "€ -> " + JSON.stringify(S.asciiName("€")));
});

check("asciiName: ASCII-Bereich bleibt unangetastet", function () {
  const s = "Abc-123_x (v2).pdf";
  assert(S.asciiName(s) === s, "erhalten: " + S.asciiName(s));
});

check("asciiName kombiniert mit sanitizeFilename (Export-Kette)", function () {
  const out = S.sanitizeFilename(S.asciiName("Über möbel Straße"));
  assert(out === "Ueber moebel Strasse", "erhalten: " + out);
});

check("ymd: Date-Objekt", function () {
  assert(S.ymd(new Date(2026, 0, 5)) === "2026-01-05", "erhalten: " + S.ymd(new Date(2026, 0, 5)));
});

check("ymd: ISO-String", function () {
  assert(S.ymd("2026-11-23T10:00:00Z") === "2026-11-23", "erhalten: " + S.ymd("2026-11-23T10:00:00Z"));
});

check("ymd: ungültig -> leerer String", function () {
  assert(S.ymd("nicht-ein-datum") === "", "erhalten: " + S.ymd("nicht-ein-datum"));
  assert(S.ymd(new Date(NaN)) === "", "Date(NaN)");
});

check("Namespace enthält nur die drei Helfer", function () {
  const keys = Object.keys(S).sort();
  assert(JSON.stringify(keys) === JSON.stringify(["asciiName", "sanitizeFilename", "ymd"]), "erhalten: " + keys.join(","));
});

/* ---------- 2. i18n-Tabelle laden (Objekt-Literal isoliert auswerten) ---------- */
function loadI18nTable() {
  const src = read("assets/js/i18n.js");
  const m = src.match(/\b(?:var|let|const)\s+T\s*=\s*\{/);
  assert(m, "Tabellenstart ((var|let|const) T = {) nicht gefunden");
  const start = m.index, skip = m[0].length - 1; /* Slice startet am { */
  let depth = 0, inStr = null, esc = false, end = -1;
  for (let i = start + skip; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'") inStr = c;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  assert(end > 0, "Tabellenende nicht gefunden");
  return vm.runInNewContext("(" + src.slice(start + skip, end + 1) + ")", {}, { filename: "i18n.T" });
}

const T = loadI18nTable();
const LANGS = 5;

console.log("\n[2] assets/js/i18n.js Tabellenintegrität");

check("Tabelle nicht leer", function () {
  assert(Object.keys(T).length >= 180, "nur " + Object.keys(T).length + " Schlüssel");
});

check("jeder Eintrag hat genau " + LANGS + " Übersetzungen", function () {
  const bad = Object.keys(T).filter(function (k) {
    return !Array.isArray(T[k]) || T[k].length !== LANGS;
  });
  assert(bad.length === 0, "betroffen: " + bad.slice(0, 10).join(", "));
});

check("keine leeren Übersetzungen", function () {
  const bad = [];
  Object.keys(T).forEach(function (k) {
    T[k].forEach(function (s, i) {
      if (typeof s !== "string" || !s.trim()) bad.push(k + "[" + i + "]");
    });
  });
  assert(bad.length === 0, "leer: " + bad.slice(0, 10).join(", "));
});

check("keine doppelten Schlüssel in der Quelldatei", function () {
  const src = read("assets/js/i18n.js");
  const seen = {};
  const dupes = [];
  src.replace(/^\s{4}([A-Za-z0-9_]+): \[/gm, function (_, k) {
    if (seen[k]) dupes.push(k);
    seen[k] = 1;
    return _;
  });
  assert(dupes.length === 0, "doppelt: " + dupes.join(", "));
});

check("Schlüssel sind gültige JS-Bezeichner (sicher für t()-Aufrufe)", function () {
  const bad = Object.keys(T).filter(function (k) { return !/^[A-Za-z][A-Za-z0-9_]*$/.test(k); });
  assert(bad.length === 0, "betroffen: " + bad.join(", "));
});

/* ---------- 3. i18n-Referenzauflösung ---------- */
function collectI18nRefs(file, includeHtml) {
  const src = read(file);
  const refs = new Set();
  // t("key"), t('key'), T("key") – aber nicht got( / split(t) etc.: kein Wortzeichen davor
  const jsRe = /(?<![A-Za-z0-9_$.])(?:t|T)\(\s*(['"])([A-Za-z][A-Za-z0-9_]*)\1/g;
  let m;
  while ((m = jsRe.exec(src))) refs.add(m[2]);
  if (includeHtml) {
    const htmlRe = /data-i18n(?:-title)?="([A-Za-z][A-Za-z0-9_]*)"/g;
    while ((m = htmlRe.exec(src))) refs.add(m[1]);
  }
  return refs;
}

const jsFiles = [
  "background.js", "popup.js",
  "shared/servers.js",
  "assets/js/api.js", "assets/js/app.js", "assets/js/archive.js", "assets/js/convert.js",
  "assets/js/import.js", "assets/js/outputs.js", "assets/js/pdfview.js",
  "assets/js/preview.js", "assets/js/rmdoc.js", "assets/js/rmx-bridge.js", "assets/js/textpdf.js",
  "assets/js/thumbs.js", "assets/js/util.js",
  /* OCR-Pipeline (docs/ocr-pipeline.md); ocr-formula.mjs ist ein ES-Modul und
     wird über MODULE_FILES gesondert behandelt (Import-Bindings, ESM-Syntax). */
  "assets/js/rmlines.js", "assets/js/rmsegment.js", "assets/js/rmrender.js",
  "assets/js/ocr-ctc.js", "assets/js/ocr-dehtr.js", "assets/js/ocr-simplehtr.js",
  "assets/js/rmregions.js", "assets/js/rmimages.js", "assets/js/rmmarkdown.js",
  "assets/js/ocrpipeline.js"
];
const MODULE_FILES = ["assets/js/ocr-formula.mjs", "assets/vendor/onnxruntime-web-shim.mjs"];
const htmlFiles = ["filemanager.html", "popup.html"];

const allRefs = new Map(); // key -> [file:line]
jsFiles.forEach(function (f) {
  if (!exists(f)) { failures.push("JS-Datei fehlt: " + f); return; }
  const src = read(f);
  const re = /(?<![A-Za-z0-9_$.])(?:t|T)\(\s*(['"])([A-Za-z][A-Za-z0-9_]*)\1/g;
  let m;
  while ((m = re.exec(src))) {
    const line = src.slice(0, m.index).split("\n").length;
    const key = m[2];
    if (!allRefs.has(key)) allRefs.set(key, []);
    allRefs.get(key).push(f + ":" + line);
  }
});
htmlFiles.forEach(function (f) {
  const src = read(f);
  const re = /data-i18n(?:-title)?="([A-Za-z][A-Za-z0-9_]*)"/g;
  let m;
  while ((m = re.exec(src))) {
    if (!allRefs.has(m[1])) allRefs.set(m[1], []);
    allRefs.get(m[1]).push(f);
  }
});

console.log("\n[3] i18n-Referenzauflösung (" + allRefs.size + " genutzte Schlüssel)");

check("jede referenzierte i18n-Übersetzung existiert in der Tabelle", function () {
  const missing = [...allRefs.keys()].filter(function (k) { return !T[k]; });
  assert(missing.length === 0, "fehlende Schlüssel: " + missing.map(function (k) {
    return k + " (" + allRefs.get(k).join(", ") + ")";
  }).join("; "));
});

/* Ungenutzte Schluessel wrapper-robust zaehlen: Schluessel gelten auch dann als
   genutzt, wenn sie als Wort irgendwo im Code stehen (setArtStatus("stScanning", ...)
   oder label(k) -> t(k + 'Short')). Nur so entsteht keine toten-Schluessel-Fehlliste. */
const refCorpus = [...jsFiles, "shared/filename.js", ...htmlFiles]
  .map(function (f) { return read(f); }).join("\n");
const keyHit = function (k) {
  /* Sonderfall label(k) -> t(k + 'Short'): kurze Variante gilt als genutzt,
     wenn ihr Basis-Schluessel (ohne Suffix) referenziert wird. */
  if (k.slice(-5) === "Short" && keyHit(k.slice(0, -5))) return true;
  return new RegExp("(^|[^A-Za-z0-9_$])" + k + "([^A-Za-z0-9_$]|$)").test(refCorpus);
};
const unusedKeys = Object.keys(T).filter(function (k) { return !keyHit(k); });
console.log("      ungenutzte Tabellenschlüssel: " +
  (unusedKeys.length ? unusedKeys.join(", ") : "0") + " (dynamische Aufrufe und Fallbacks sind erlaubt)");

/* ---------- 4. Dateireferenzen in HTML und manifest ---------- */
console.log("\n[4] Dateireferenzen");

function localRefsInHtml(file) {
  const src = read(file);
  const out = [];
  const re = /(?:src|href)="([^"]+)"/g;
  let m;
  while ((m = re.exec(src))) {
    const u = m[1];
    if (/^(https?:|data:|mailto:)/.test(u)) continue;
    out.push(u.replace(/^\//, ""));
  }
  return [...new Set(out)].filter(function (u) { return !u.startsWith("#"); });
}

htmlFiles.forEach(function (f) {
  check("alle lokalen Referenzen in " + f + " vorhanden", function () {
    const missing = localRefsInHtml(f).filter(function (u) { return !exists(u); });
    assert(missing.length === 0, "fehlt: " + missing.join(", "));
  });
});

check("R.load-Pfade in assets/js/util.js vorhanden (manuelle Pipeline-Assets ausgenommen)", function () {
  const src = read("assets/js/util.js");
  const re = /'((?:\/|assets\/)[^']+\.js)'/g;
  const missing = [];
  let m;
  while ((m = re.exec(src))) {
    const p = m[1].replace(/^\//, "");
    if (isManualAsset(p)) continue; // siehe MANUAL_ASSETS / docs/ocr-pipeline.md
    if (!exists(p)) missing.push(p);
  }
  assert(missing.length === 0, "fehlt: " + missing.join(", "));
});

check("manifest.json: alle Icon-Pfade vorhanden", function () {
  const man = JSON.parse(read("manifest.json"));
  const paths = [];
  [man.icons, man.action && man.action.default_icon].forEach(function (grp) {
    if (grp) Object.keys(grp).forEach(function (k) { paths.push(grp[k]); });
  });
  if (man.action && man.action.default_popup) paths.push(man.action.default_popup);
  const missing = paths.filter(function (p) { return !exists(p); });
  assert(missing.length === 0, "fehlt: " + missing.join(", "));
});

/* ---------- 5. manifest.json ---------- */
console.log("\n[5] manifest.json");

check("manifest.json ist gültiges MV3-Manifest", function () {
  const man = JSON.parse(read("manifest.json"));
  assert(man.manifest_version === 3, "manifest_version: " + man.manifest_version);
  assert(man.name === "reMarkable Toolkit", "name: " + man.name);
  assert(man.action && man.action.default_popup === "popup.html", "default_popup falsch");
  assert(Array.isArray(man.permissions) && man.permissions.indexOf("scripting") >= 0, "permissions");
  assert(man.background && man.background.service_worker === "background.js", "service_worker");
  assert(typeof man.version === "string" && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/.test(man.version), "version: " + man.version);
});

/* ---------- 6. Syntax aller eigenen JS-Dateien ---------- */
console.log("\n[6] Syntax (node --check)");

check("alle eigenen JS-Dateien haben gültige Syntax", function () {
  const files = [...jsFiles, ...MODULE_FILES, "shared/filename.js", "assets/js/i18n.js", "tools/bump-version.js", __filename];
  const broken = [];
  files.forEach(function (f) {
    if (!exists(f)) return; // schon oben gemeldet
    try {
      execFileSync(process.execPath, ["--check", path.join(ROOT, f)], { stdio: "pipe" });
    } catch (e) {
      broken.push(f + ": " + String(e.stderr || e.message).split("\n")[0]);
    }
  });
  assert(broken.length === 0, broken.join("; "));
});

/* ---------- 7. Entfernte/verwaiste Dateien ---------- */
console.log("\n[7] Verwaiste Referenzen");

check("keine Referenz auf die entfernte Datei libs/jspdf.js mehr (window.jspdf als Global von pdfkit.js bleibt erlaubt)", function () {
  const hits = [];
  // README nennt libs/jspdf.js nur dokumentarisch (Entfernungs-Hinweis) und ist daher ausgenommen.
  [
    "popup.html", "filemanager.html", "manifest.json",
    "popup.js", "background.js",
    "shared/filename.js", "shared/servers.js",
    "assets/js/app.js", "assets/js/util.js"
  ].forEach(function (f) {
    if (exists(f) && read(f).indexOf("libs/jspdf") >= 0) hits.push(f);
  });
  assert(hits.length === 0, "Referenzen in: " + hits.join(", "));
});

check("libs/pdfkit.js existiert und wird geladen (bewusst aktiv)", function () {
  assert(exists("libs/pdfkit.js"), "pdfkit.js fehlt");
  assert(read("popup.html").indexOf('libs/pdfkit.js') >= 0, "popup.html lädt pdfkit.js nicht");
});

/* ---------- 8-16: Neue Checks (Funktionen, Klassen, Dateien) ---------- */

/* Code-Skelett: Kommentare und String-Inhalte entfernen, Code-Struktur bleibt.
   Verhindert Fehltreffer aus deutschem Kommentartext und generiertem HTML. */
function codeSkeleton(src) {
  let out = "", i = 0, n = src.length, mode = "code", interp = 0;
  const lastSig = function () {
    for (let k = out.length - 1; k >= 0; k--) {
      const ch = out[k];
      if (ch !== " " && ch !== "\n" && ch !== "\t" && ch !== "\r") return ch;
    }
    return "";
  };
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (mode === "code") {
      if (c === "/" && d === "/") { mode = "line"; out += "  "; i += 2; continue; }
      if (c === "/" && d === "*") { mode = "block"; out += "  "; i += 2; continue; }
      if (c === "'") { mode = "sq"; out += " "; i++; continue; }
      if (c === '"') { mode = "dq"; out += " "; i++; continue; }
      if (c === "`") { mode = "tpl"; out += " "; i++; continue; }
      if (c === "/") {
        const p = lastSig();
        const afterWord = (out.match(/([A-Za-z]+)\s*$/) || ["", ""])[1];
        const isRegex = p === "" || "(,=:[!&|?{};+-*%<>~^".indexOf(p) >= 0 ||
          ["return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "do", "else", "case", "yield", "await"].indexOf(afterWord) >= 0;
        if (isRegex) {
          let j = i + 1, inCls = false;
          while (j < n) {
            if (src[j] === "\\") { j += 2; continue; }
            if (src[j] === "[") inCls = true;
            else if (src[j] === "]") inCls = false;
            else if (src[j] === "/" && !inCls) break;
            else if (src[j] === "\n") break;
            j++;
          }
          out += " ";
          i = Math.min(n, j + 1);
          while (i < n && /[a-z]/.test(src[i])) i++;
          continue;
        }
        out += c; i++; continue;
      }
      if (interp > 0 && c === "{") { interp++; out += c; i++; continue; }
      if (interp > 0 && c === "}") { interp--; out += c; i++; if (interp === 0) mode = "tpl"; continue; }
      out += c; i++; continue;
    }
    if (mode === "line") { if (c === "\n") { mode = "code"; out += c; } else out += " "; i++; continue; }
    if (mode === "block") { if (c === "*" && d === "/") { mode = "code"; out += "  "; i += 2; } else { out += c === "\n" ? "\n" : " "; i++; } continue; }
    if (mode === "sq" || mode === "dq") {
      if (c === "\\") { out += "  "; i += 2; continue; }
      if ((mode === "sq" && c === "'") || (mode === "dq" && c === '"')) { mode = "code"; out += " "; i++; continue; }
      out += c === "\n" ? "\n" : " "; i++; continue;
    }
    if (mode === "tpl") {
      if (c === "\\") { out += "  "; i += 2; continue; }
      if (c === "`") { mode = "code"; out += " "; i++; continue; }
      if (c === "$" && d === "{") { mode = "code"; out += "  "; interp = 1; i += 2; continue; }
      out += c === "\n" ? "\n" : " "; i++; continue;
    }
  }
  return out;
}

const ownJs = [...jsFiles, ...MODULE_FILES, "shared/filename.js", "assets/js/i18n.js"];
const cssFiles = ["assets/app.css", "assets/index.css", "popup.css", "shared/servers.css"];
const appCssFiles = ["assets/app.css", "popup.css", "shared/servers.css"];

/* Deklarationsmuster: named functions, var/let/const = function/Pfeilfunktion,
   Namensraum-Zuweisungen (R.foo = / RMX.foo = / window.foo =), Klassen. */
const fnRe = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g;
const varFnRe = /\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function\b/g;
const arrowRe = /\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^(){}]*\)|[A-Za-z_$][\w$]*)\s*=>/g;
const nsRe = /\b(?:R|RMX|window)\.([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\()/g;
const classDeclRe = /\bclass\s+([A-Za-z_$][\w$]*)/g;

/* [8]/[9]: Funktionsdeklarationen sammeln (auf dem Code-Skelett) */
const decls = new Map(); // Name -> [Dateien]
ownJs.forEach(function (f) {
  const code = codeSkeleton(read(f));
  const res = [fnRe, varFnRe, arrowRe, nsRe, classDeclRe];
  let m;
  res.forEach(function (re) {
    re.lastIndex = 0;
    while ((m = re.exec(code))) {
      if (!decls.has(m[1])) decls.set(m[1], []);
      decls.get(m[1]).push(f);
    }
  });
});

console.log("\n[8] Ungenutzte Funktionen (" + decls.size + " Deklarationen)");

check("keine deklarierte Funktion ist ohne Referenz im Code", function () {
  /* Nutzungszahl ueber maskierten Corpus: Deklarationsspannen werden geblankt,
     jedes uebrig bleibende Vorkommen (auch R.name / RMX.name) zaehlt als Nutzung. */
  function maskDecls(src) {
    const spans = [];
    [fnRe, varFnRe, arrowRe, nsRe, classDeclRe].forEach(function (re) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(src))) spans.push([m.index, m.index + m[0].length]);
    });
    spans.sort(function (a, b) { return a[0] - b[0]; });
    let out = "", pos = 0;
    spans.forEach(function (s) {
      if (s[0] < pos) return;
      out += src.slice(pos, s[0]) + " ".repeat(s[1] - s[0]);
      pos = s[1];
    });
    return out + src.slice(pos);
  }
  const corpus = ownJs.concat(htmlFiles).map(function (f) { return maskDecls(read(f)); }).join("\n");
  const unused = [];
  decls.forEach(function (files, name) {
    const re = new RegExp("(?<![A-Za-z0-9_$])" + name.replace(/\$/g, "\\$") + "(?![\\w$])", "g");
    if ((corpus.match(re) || []).length === 0) unused.push(name + " (" + files[0] + ")");
  });
  assert(unused.length === 0, "ohne Referenz: " + unused.join(", "));
});

console.log("\n[9] Doppelte Funktionsdeklarationen");

check("kein Funktionsname innerhalb einer Datei doppelt deklariert", function () {
  const dupes = [];
  decls.forEach(function (files, name) {
    const seen = {};
    files.forEach(function (f) { seen[f] = (seen[f] || 0) + 1; });
    Object.keys(seen).forEach(function (f) {
      if (seen[f] > 1) dupes.push(f + ": " + name + " x" + seen[f]);
    });
  });
  assert(dupes.length === 0, "doppelt: " + dupes.join("; "));
});

console.log("\n[10] Fehlende Funktionen");

check("jeder Funktionsaufruf hat eine Deklaration, Global oder Built-in", function () {
  const KEYWORDS = new Set("if for while switch catch return function typeof new delete void in of do else try finally with await yield var let const class extends super this null true false case default break continue throw instanceof export import async".split(/\s+/));
  const KNOWN = new Set(("document window console chrome Math JSON Date Promise Set Map WeakMap WeakSet Symbol Proxy Reflect " +
    "URL URLSearchParams FormData Blob File FileReader Image Intl Error TypeError RangeError SyntaxError URIError " +
    "Uint8Array Uint8ClampedArray Uint16Array Uint32Array Int8Array Int16Array Int32Array Float32Array Float64Array " +
    "ArrayBuffer DataView SharedArrayBuffer Array Object String Number Boolean Function RegExp BigInt " +
    "AbortController AbortSignal DOMParser XMLSerializer TextEncoder TextDecoder ReadableStream WritableStream " +
    "fetch setTimeout clearTimeout setInterval clearInterval requestAnimationFrame cancelAnimationFrame " +
    "isNaN isFinite parseFloat parseInt encodeURIComponent decodeURIComponent encodeURI decodeURI " +
    "crypto atob btoa localStorage sessionStorage navigator location history alert confirm prompt " +
    "structuredClone queueMicrotask CustomEvent Event MouseEvent PointerEvent KeyboardEvent FocusEvent InputEvent " +
    "ResizeObserver IntersectionObserver MutationObserver BroadcastChannel MessageChannel Worker " +
    "getComputedStyle matchMedia performance scroll scrollTo open close print CSS PDFLib JSZip pako marked jsPDF " +
    "Readability DOMRect DOMTokenList CompressionStream DecompressionStream createImageBitmap " +
    "Response Request Headers Notification OffscreenCanvas ImageBitmap undefined NaN Infinity globalThis self " +
    "RMX RMXShared RMXServers R app").split(/\s+/));
  decls.forEach(function (files, name) { KNOWN.add(name); });
  const clean = ownJs.map(function (f) { return codeSkeleton(read(f)); }).join("\n");
  /* Parameter-Namen erlauben (Callbacks wie resolve/reject, app, esc, ...) */
  [/\bfunction\s*[A-Za-z_$]?[\w$]*\s*\(([^()]*)\)/g, /\(([^(){}]*)\)\s*=>/g].forEach(function (re) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(clean))) {
      (m[1] || "").split(",").forEach(function (p) {
        p = p.trim().replace(/^\.\.\./, "").split(/[=\s:]/)[0];
        if (/^[A-Za-z_$][\w$]*$/.test(p)) KNOWN.add(p);
      });
    }
  });
  /* Alle var/let/const-Deklarationen zählen (Aliase wie var ymd = RMXShared.ymd) */
  const varRe = /\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = varRe.exec(clean))) KNOWN.add(m[1]);
  /* ES-Modul-Importe (ocr-formula.mjs) gelten als deklariert */
  const importRe = /\bimport\s*\{([^}]+)\}\s*from/g;
  ownJs.forEach(function (f) {
    let im;
    while ((im = importRe.exec(read(f)))) {
      im[1].split(",").forEach(function (p) {
        p = p.trim().split(/\s+as\s+/).pop().trim();
        if (/^[A-Za-z_$][\w$]*$/.test(p)) KNOWN.add(p);
      });
    }
  });
  const callRe = /(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g;
  const missing = new Set();
  while ((m = callRe.exec(clean))) {
    if (!KEYWORDS.has(m[1]) && !KNOWN.has(m[1])) missing.add(m[1]);
  }
  assert(missing.size === 0, "ohne Deklaration aufgerufen: " + [...missing].join(", "));
});

/* [11]/[12]: CSS-Klassen sammeln */
const cssAll = new Set();
cssFiles.forEach(function (f) {
  const src = read(f);
  let m;
  const selRe = /\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g;
  while ((m = selRe.exec(src))) cssAll.add(m[1]);
});
const usageText = ownJs.concat(htmlFiles).map(function (f) { return read(f); }).join("\n");

/* Dynamisch zusammengesetzte Klassen: "rmx-btn--" + kind -> Basis "rmx-btn--"
   gilt als Referenz aller Klassen mit diesem Praefix. */
function classUsed(name) {
  if (usageText.indexOf(name) >= 0) return true;
  const i = name.lastIndexOf("--");
  if (i > 0) return usageText.indexOf(name.slice(0, i + 2)) >= 0;
  return false;
}

console.log("\n[11] Ungenutzte CSS-Klassen (" + appCssFiles.join(", ") + ")");

check("keine Klasse ohne Referenz in HTML oder JS", function () {
  /* assets/index.css ist das beigestellte Design-System (bewusst vollstaendig
     beigelegt) und wird hier bewusst nicht geprueft. */
  const defined = new Set();
  appCssFiles.forEach(function (f) {
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, "");
    let m;
    const selRe = /\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g;
    while ((m = selRe.exec(src))) defined.add(m[1]);
  });
  const unused = [...defined].filter(function (c) { return !classUsed(c); });
  assert(unused.length === 0, "ungenutzt: " + unused.join(", "));
});

console.log("\n[12] Fehlende CSS-Klassen");

check("jede in HTML/JS referenzierte Klasse ist im CSS definiert", function () {
  /* Reine JS-Hooks ohne Styling und das native hidden-Attribut sind erlaubt. */
  const SEMANTIC = new Set(["rmx-xpander", "rmx-xpander--page", "rmx-headbadge", "ihost"]);
  const tokens = new Set();
  let m;
  htmlFiles.forEach(function (f) {
    const src = read(f);
    const clsAttrRe = /class\s*=\s*"([^"]*)"/g;
    while ((m = clsAttrRe.exec(src))) {
      m[1].trim().split(/\s+/).forEach(function (c) { if (/^[A-Za-z_]/.test(c)) tokens.add(c); });
    }
  });
  const jsRaw = ownJs.map(function (f) { return read(f); }).join("\n");
  const clsListRe = /classList\.(?:add|remove|toggle|contains)\(\s*(['"])([^'"]+)\1/g;
  while ((m = clsListRe.exec(jsRaw))) tokens.add(m[2]);
  const qSelRe = /querySelector(?:All)?\(\s*(['"])[^'"]*?\.([A-Za-z_][A-Za-z0-9_-]*)/g;
  while ((m = qSelRe.exec(jsRaw))) tokens.add(m[2]);
  const cnAssignRe = /className\s*=\s*(['"])([^'"]+)\1/g;
  while ((m = cnAssignRe.exec(jsRaw))) {
    m[2].trim().split(/\s+/).forEach(function (c) { if (/^[A-Za-z_]/.test(c)) tokens.add(c); });
  }
  const missing = [...tokens].filter(function (c) {
    if (cssAll.has(c) || SEMANTIC.has(c) || c === "hidden") return false;
    if (/--$/.test(c)) return ![...cssAll].some(function (d) { return d.indexOf(c) === 0; });
    return true;
  });
  assert(missing.length === 0, "referenziert, aber undefiniert: " + missing.join(", "));
});

console.log("\n[13] Fehlende Dateien (HTML, CSS, JS, manifest.json)");

check("keine Referenz verweist auf eine fehlende Datei", function () {
  const refs = new Set();
  let m;
  htmlFiles.forEach(function (f) {
    const src = read(f);
    const re = /(?:src|href)="([^"]+)"/g;
    while ((m = re.exec(src))) {
      const u = m[1].replace(/^\//, "");
      if (/^(https?:|data:|mailto:|#)/.test(u)) continue;
      refs.add(u);
    }
  });
  cssFiles.forEach(function (f) {
    const src = read(f);
    const re = /url\(\s*['"]?([^'")]+)['"]?\s*\)/g;
    while ((m = re.exec(src))) {
      const u = m[1].replace(/^\//, "");
      if (/^(https?:|data:|#)/.test(u)) continue;
      refs.add(u);
    }
  });
  /* absolute Pfad-Strings ("/assets/...") und relative ("libs/readability.js") */
  const absRe = /['"](\/[A-Za-z0-9_][A-Za-z0-9_\/.-]*\.(?:js|css|png|svg|woff2|json|html))['"]/g;
  const relRe = /['"]([A-Za-z0-9_][A-Za-z0-9_-]*\/[A-Za-z0-9_\/.-]*\.(?:js|css|png|svg|woff2|json|html))['"]/g;
  ownJs.forEach(function (f) {
    const src = read(f);
    while ((m = absRe.exec(src))) refs.add(m[1].replace(/^\//, ""));
    while ((m = relRe.exec(src))) refs.add(m[1]);
  });
  const man = JSON.parse(read("manifest.json"));
  [man.icons, man.action && man.action.default_icon].forEach(function (grp) {
    if (grp) Object.keys(grp).forEach(function (k) { refs.add(grp[k]); });
  });
  if (man.action && man.action.default_popup) refs.add(man.action.default_popup);
  if (man.background && man.background.service_worker) refs.add(man.background.service_worker);
  const missing = [...refs].filter(function (u) { return !exists(u) && !isManualAsset(u); });
  assert(missing.length === 0, "fehlt: " + missing.join(", "));
});

console.log("\n[14] Ungenutzte Dateien");

check("jede Paketdatei wird vom Code, HTML, CSS oder manifest referenziert", function () {
  /* Corpus = alle Paketdateien ausser Tests, Tools, Docs, README und Lizenztexten.
     Referenzquelle ist auch manifest.json selbst (Icons, Popup, Worker). */
  /* tools/, tests/ und docs/ sind Entwicklungs-Werkzeuge/Dokumentation, kein
     Teil des Erweiterungspakets. */
  const NONCODE = [/^tests\//, /^tools\//, /^docs\//, /^README\.md$/, /^assets\/vendor\/licenses\//, /THIRD_PARTY_NOTICES\.txt$/];
  const refs = [];
  function walk(dir) {
    fs.readdirSync(path.join(ROOT, dir === "" ? "." : dir), { withFileTypes: true }).forEach(function (e) {
      if (e.name.charAt(0) === ".") return;
      const rel = dir === "" ? e.name : dir + "/" + e.name;
      if (e.isDirectory()) walk(rel);
      else refs.push(rel);
    });
  }
  walk("");
  const corpus = refs.filter(function (f) { return !NONCODE.some(function (r) { return r.test(f); }); }).map(function (f) { return read(f); }).join("\n");
  const unused = refs.filter(function (f) {
    /* manifest.json wird implizit von Chrome geladen, nicht referenziert. */
    if (NONCODE.some(function (r) { return r.test(f); }) || f === "manifest.json") return false;
    const base = f.split("/").pop();
    return corpus.indexOf(f) < 0 && corpus.indexOf(base) < 0;
  });
  assert(unused.length === 0, "ohne Referenz im Paket: " + unused.join(", "));
});

console.log("\n[15] Doppelte HTML-IDs");

htmlFiles.forEach(function (f) {
  check("keine doppelte id in " + f, function () {
    const src = read(f);
    const seen = {}, dup = [];
    let m;
    const idRe = /id\s*=\s*"([^"]+)"/g;
    while ((m = idRe.exec(src))) {
      if (seen[m[1]] && dup.indexOf(m[1]) < 0) dup.push(m[1]);
      seen[m[1]] = 1;
    }
    assert(dup.length === 0, "doppelt: " + dup.join(", "));
  });
});

console.log("\n[16] CSS-Klammerbalance");

cssFiles.forEach(function (f) {
  check("{ und } in " + f + " ausgeglichen", function () {
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, "");
    const o = (src.match(/\{/g) || []).length, c = (src.match(/\}/g) || []).length;
    assert(o === c, o + " \\{ gegen " + c + " \\}");
  });
});

/* ---------- 17. i18n-Sprachparitaet ---------- */
console.log("\n[17] i18n-Sprachparitaet");

check("Platzhalter ({n}, {name}, ...) stimmen in allen Sprachen ueberein", function () {
  const ph = function (s) { return (s.match(/\{[A-Za-z0-9_]+\}/g) || []).sort().join("|"); };
  const bad = [];
  Object.keys(T).forEach(function (k) {
    const sets = T[k].map(ph);
    const first = sets[0];
    sets.forEach(function (v, i) {
      if (v !== first) bad.push(k + " (Sprache " + i + ": " + (v || "keine") + " statt " + (first || "keine") + ")");
    });
  });
  assert(bad.length === 0, "abweichend: " + bad.slice(0, 10).join("; "));
});

check("Sprachliste umfasst genau " + LANGS + " Sprachen ohne Dubletten", function () {
  const src = read("assets/js/i18n.js");
  const m = src.match(/R\.langs\s*=\s*(\[[^;]*\])\s*;/);
  assert(m, "R.langs nicht gefunden");
  const langs = vm.runInNewContext("(" + m[1] + ")", {}, { filename: "i18n.langs" });
  assert(langs.length === LANGS, "nur " + langs.length + " Sprachen");
  const codes = langs.map(function (l) { return l[0]; });
  assert(new Set(codes).size === LANGS, "Dubletten: " + codes.join(","));
});

/* ---------- 18. Content-Security-Policy ---------- */
console.log("\n[18] Content Security Policy");

check("CSP der Extension-Pages erlaubt kein unsafe-eval/inline und keine Remote-Scripts", function () {
  const man = JSON.parse(read("manifest.json"));
  const csp = man.content_security_policy || {};
  const known = ["extension_pages", "sandbox"];
  const badSections = Object.keys(csp).filter(function (s) { return known.indexOf(s) < 0; });
  assert(badSections.length === 0, "unbekannte CSP-Sektionen: " + badSections.join(", "));
  /* Fehlt content_security_policy, gilt die strenge MV3-Vorgabe; geprueft wird,
     dass sie nicht gelockert wird. */
  const ep = csp.extension_pages || "script-src 'self'; object-src 'self'";
  const directive = function (name) {
    const m = ep.match(new RegExp(name + "([^;]*)"));
    return m ? m[1] : null;
  };
  const src = directive("script-src") || directive("default-src");
  assert(src !== null, "weder script-src noch default-src: " + ep);
  assert(src.indexOf("'self'") >= 0, "ohne 'self': " + ep);
  assert(src.indexOf("'unsafe-eval'") < 0 && src.indexOf("'unsafe-inline'") < 0, "unsichere Quelle: " + ep);
  assert(!/https?:\/\//.test(src), "Remote-Scripts: " + ep);
});

/* ---------- 19. OCR-Pipeline: Geometrie & Dekodierung (vm-Sandbox) ---------- */

/* Reine Logik-Module der OCR-Pipeline (docs/ocr-pipeline.md, Stufen 1-6)
   ohne DOM/Netzwerk testen: alle Dateien in EINE Sandbox laden, damit die
   R.rmlines/rmsegment/rmregions-Querverweise zwischen den Modulen greifen. */
const ocrSandbox = { console: console };
ocrSandbox.window = ocrSandbox;
vm.createContext(ocrSandbox);
[
  "assets/js/rmlines.js", "assets/js/rmsegment.js", "assets/js/ocr-ctc.js",
  "assets/js/rmregions.js", "assets/js/rmmarkdown.js"
].forEach(function (f) {
  vm.runInContext(read(f), ocrSandbox, { filename: f });
});

function mkStroke(pts) {
  return { type: "stroke", points: pts.map(function (p) { return { x: p[0], y: p[1], width: 1 }; }) };
}

console.log("\n[19] OCR-Pipeline: rmlines.js (Stufe 1)");

check("strokesOf liefert nur stroke-Items, über alle Layer hinweg, flach", function () {
  const R = ocrSandbox.RMX;
  const s1 = mkStroke([[0, 0], [10, 10]]), s2 = mkStroke([[5, 5]]), s3 = mkStroke([[1, 2]]);
  const page = { layers: [
    { name: "Notiz", items: [s1, { type: "other" }, s2] },
    { name: "Skizze", items: [s3] }
  ] };
  const out = R.rmlines.strokesOf(page);
  assert(out.length === 3, "Länge: " + out.length);
  assert(out[0] === s1 && out[1] === s2 && out[2] === s3, "Reihenfolge/falsche Items");
  assert(R.rmlines.strokesOf({ layers: [] }).length === 0, "leere Seite");
  assert(R.rmlines.strokesOf({}).length === 0, "Seite ohne layers");
});

check("bounds: leere Liste -> null, sonst korrektes Rechteck ohne Infinity", function () {
  const R = ocrSandbox.RMX;
  assert(R.rmlines.bounds([]) === null, "leere Liste");
  const b = R.rmlines.bounds([mkStroke([[2, 3], [8, 5]]), mkStroke([[4, 1], [6, 9]])]);
  assert(b.minX === 2 && b.minY === 1 && b.maxX === 8 && b.maxY === 9, JSON.stringify(b));
  const keys = Object.keys(b).sort().join(",");
  assert(keys === "maxX,maxY,minX,minY", "Schlüssel: " + keys);
});

console.log("\n[19] OCR-Pipeline: rmsegment.js (Stufe 2)");

check("lines: zwei getrennte Tintenbänder -> zwei Zeilen, sortiert, alle Striche zugeordnet", function () {
  const R = ocrSandbox.RMX;
  const top1 = [mkStroke([[0, 10], [30, 10]]), mkStroke([[0, 12], [30, 12]])];
  const top2 = [mkStroke([[0, 60], [30, 60]]), mkStroke([[0, 62], [30, 62]])];
  const lines = R.rmsegment.lines(top1.concat(top2));
  assert(lines.length === 2, "Zeilen: " + lines.length);
  assert(lines[0].top < lines[1].top, "nicht von oben nach unten sortiert");
  assert(lines[0].strokes.length === 2 && lines[1].strokes.length === 2,
    "Zuordnung: " + lines.map(function (l) { return l.strokes.length; }).join("/"));
  assert(lines[0].bottom < lines[1].top, "Bänder überlappen vollständig");
});

check("lines: leere Eingabe -> leere Liste", function () {
  assert(ocrSandbox.RMX.rmsegment.lines([]).length === 0, "leere Eingabe");
});

check("words: horizontale Lücke > gapFactor*Zeilenhöhe trennt Wörter, sortiert links->rechts", function () {
  const R = ocrSandbox.RMX;
  // Zwei Buchstaben-Cluster (Lücke 6, nicht > Schwellwert) plus ein fernes
  // Wort (Lücke 80); Strichhöhe 10 -> Schwellwert 0.6*10 = 6.
  const strokes = [
    mkStroke([[100, 0], [110, 10]]),
    mkStroke([[0, 0], [8, 10]]),
    mkStroke([[14, 0], [20, 10]])
  ];
  const words = R.rmsegment.words(strokes);
  assert(words.length === 2, "Wörter: " + words.length);
  assert(words[0].left < words[1].left, "nicht von links nach rechts sortiert");
  assert(words[0].strokes.length === 2 && words[1].strokes.length === 1,
    "Zuordnung: " + words.map(function (w) { return w.strokes.length; }).join("/"));
  assert(words[0].left === 0 && words[0].right === 20 && words[1].left === 100, "Grenzen falsch");
});

check("words: leere Eingabe -> leere Liste", function () {
  assert(ocrSandbox.RMX.rmsegment.words([]).length === 0, "leere Eingabe");
});

console.log("\n[19] OCR-Pipeline: ocr-ctc.js (Stufen 3/4)");

check("ctcDecode: greedy Argmax, Blank (0) verworfen, Wiederholungen zusammengefasst", function () {
  const R = ocrSandbox.RMX;
  // 3 Klassen: 0 = Blank, 1 = 'a', 2 = 'b'
  const logits = new Float32Array([
    0.1, 5, 0.2,   // t0: 'a'
    0.1, 4, 0.2,   // t1: 'a' (Wiederholung -> keine Ausgabe)
    5, 0.1, 0.2,   // t2: Blank
    0.1, 0.2, 5,   // t3: 'b'
    5, 0.1, 0.2    // t4: Blank
  ]);
  assert(R.ocrCtc.decode(logits, 5, 3, ["a", "b"]) === "ab", "erhalten: " + R.ocrCtc.decode(logits, 5, 3, ["a", "b"]));
  assert(R.ocrCtc.decode(new Float32Array([5, 0, 0, 5, 0, 0]), 2, 3, ["a", "b"]) === "", "nur Blanks");
  assert(R.ocrCtc.decode(new Float32Array([0, 5, 0, 5, 0, 0, 0, 5, 0]), 3, 3, ["a", "b"]) === "aa", "gleiches Zeichen nach Blank bleibt");
});

console.log("\n[19] OCR-Pipeline: rmregions.js (Stufe 5)");

check("classifyLayers ordnet über Ebenennamen zu (Formel/Bild, Rest Text)", function () {
  const R = ocrSandbox.RMX;
  const t = mkStroke([[0, 0], [1, 1]]), f = mkStroke([[2, 2], [3, 3]]), i = mkStroke([[4, 4], [5, 5]]);
  const page = { layers: [
    { name: "Notizen", items: [t] },
    { name: " Formel ", items: [f] },
    { name: "Bild", items: [i] }
  ] };
  const out = R.rmregions.classifyLayers(page);
  assert(out.text.length === 1 && out.text[0] === t, "text: " + out.text.length);
  assert(out.formula.length === 1 && out.formula[0] === f, "formula: " + out.formula.length);
  assert(out.image.length === 1 && out.image[0] === i, "image: " + out.image.length);
});

check("classifyLayers: Index-Fallback greift nur bei namenlosen Ebenen", function () {
  const R = ocrSandbox.RMX;
  const a = mkStroke([[0, 0]]), b = mkStroke([[1, 1]]), c = mkStroke([[2, 2]]);
  const page = { layers: [
    { name: "", items: [a] },
    { name: "", items: [b] },
    { name: "", items: [c] }
  ] };
  const out = R.rmregions.classifyLayers(page, { formulaLayerIndex: 1, imageLayerIndex: 2 });
  assert(out.text.length === 1 && out.text[0] === a, "text: " + out.text.length);
  assert(out.formula.length === 1 && out.formula[0] === b, "formula-Fallback");
  assert(out.image.length === 1 && out.image[0] === c, "image-Fallback");
  // Benannte Ebenen ignorieren den Fallback:
  const named = R.rmregions.classifyLayers({ layers: [{ name: "Formel", items: [a] }] }, { imageLayerIndex: 0 });
  assert(named.formula.length === 1 && named.image.length === 0, "Name schlägt Fallback");
});

check("imageMarkers: getrennte Markierungen -> einzelne Bereiche, oben -> unten", function () {
  const R = ocrSandbox.RMX;
  const markers = R.rmregions.imageMarkers([
    mkStroke([[0, 100], [40, 100]]),
    mkStroke([[0, 10], [40, 10]])
  ]);
  assert(markers.length === 2, "Markierungen: " + markers.length);
  assert(markers[0].top < markers[1].top, "nicht sortiert");
});

console.log("\n[19] OCR-Pipeline: rmmarkdown.js (Stufe 6)");

check("assembleMarkdown sortiert nach y-Position und formatiert Formeln/Bilder", function () {
  const R = ocrSandbox.RMX;
  const md = R.rmmarkdown.assembleMarkdown(
    [{ top: 30, text: "Hallo Welt" }],
    [{ top: 10, latex: "x ^ { 2 }   +  1" }, { top: 50, latex: "" }],
    [{ top: 20, file: "blob:abc" }]
  );
  const parts = md.split("\n\n");
  assert(parts.length === 3, "Blöcke: " + JSON.stringify(md));
  assert(parts[0] === "$$x ^ { 2 } + 1$$", "Formel: " + parts[0]);
  assert(parts[1] === "![](blob:abc)", "Bild: " + parts[1]);
  assert(parts[2] === "Hallo Welt", "Text: " + parts[2]);
  assert(md.indexOf("$$") === 0, "Formel zuerst (top 10)");
});

/* ---------- 20. OCR-Pipeline: manuell beschaffte Assets ---------- */

console.log("\n[20] OCR-Pipeline: MANUAL_ASSETS-Allowlist");

check("jede Allowlist-Datei ist in docs/ocr-pipeline.md dokumentiert", function () {
  const doc = read("docs/ocr-pipeline.md");
  const undocumented = MANUAL_ASSETS.filter(function (m) {
    return doc.indexOf(m) < 0 && doc.indexOf(m.replace(/\/$/, "")) < 0;
  });
  assert(undocumented.length === 0, "nicht dokumentiert: " + undocumented.join(", "));
});

check("Allowlist enthält keine Datei, die im Repository liegt (sonst veraltet)", function () {
  const stale = MANUAL_ASSETS.filter(function (m) { return exists(m); });
  assert(stale.length === 0, "liegt im Repo, ist also nicht mehr manuell: " + stale.join(", "));
});

/* ---------- Ergebnis ---------- */
console.log("\n" + pass + " bestanden, " + failures.length + " fehlgeschlagen");
if (failures.length) {
  console.log("\nFehler:");
  failures.forEach(function (f) { console.log("  - " + f); });
  process.exit(1);
}
