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
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
let pass = 0;
let failures = [];

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
  const start = src.indexOf("var T = {");
  assert(start >= 0, "var T = { nicht gefunden");
  let depth = 0, inStr = null, esc = false, end = -1;
  for (let i = start + "var T = ".length; i < src.length; i++) {
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
  return vm.runInNewContext("(" + src.slice(start + "var T = ".length, end + 1) + ")", {}, { filename: "i18n.T" });
}

const T = loadI18nTable();
const LANGS = 5;

console.log("\n[2] assets/js/i18n.js Tabellenintegrität");

check("Tabelle nicht leer", function () {
  assert(Object.keys(T).length >= 200, "nur " + Object.keys(T).length + " Schlüssel");
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
  "assets/js/thumbs.js", "assets/js/util.js"
];
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

console.log("      ungenutzte Tabellenschlüssel: " +
  Object.keys(T).filter(function (k) { return !allRefs.has(k); }).length +
  " (dynamische Aufrufe und Fallbacks sind erlaubt)");

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

check("R.load-Pfade in assets/js/util.js vorhanden", function () {
  const src = read("assets/js/util.js");
  const re = /'((?:\/|assets\/)[^']+\.js)'/g;
  const missing = [];
  let m;
  while ((m = re.exec(src))) {
    const p = m[1].replace(/^\//, "");
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
  assert(typeof man.version === "string" && /^\d+\.\d+\.\d+$/.test(man.version), "version: " + man.version);
});

/* ---------- 6. Syntax aller eigenen JS-Dateien ---------- */
console.log("\n[6] Syntax (node --check)");

check("alle eigenen JS-Dateien haben gültige Syntax", function () {
  const files = [...jsFiles, "shared/filename.js", "assets/js/i18n.js", __filename];
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

const ownJs = [...jsFiles, "shared/filename.js", "assets/js/i18n.js"];
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
  const missing = [...refs].filter(function (u) { return !exists(u); });
  assert(missing.length === 0, "fehlt: " + missing.join(", "));
});

console.log("\n[14] Ungenutzte Dateien");

check("jede Paketdatei wird vom Code, HTML, CSS oder manifest referenziert", function () {
  /* Corpus = alle Paketdateien ausser Tests, README und Lizenztexten.
     Referenzquelle ist auch manifest.json selbst (Icons, Popup, Worker). */
  const NONCODE = [/^tests\//, /^README\.md$/, /^assets\/vendor\/licenses\//, /THIRD_PARTY_NOTICES\.txt$/];
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

/* ---------- Ergebnis ---------- */
console.log("\n" + pass + " bestanden, " + failures.length + " fehlgeschlagen");
if (failures.length) {
  console.log("\nFehler:");
  failures.forEach(function (f) { console.log("  - " + f); });
  process.exit(1);
}
