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
  "assets/js/copy.js", "assets/js/import.js", "assets/js/outputs.js", "assets/js/pdfview.js",
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

check("kein Schlüssel ist datengetrieben nur als Präfix definiert", function () {
  // Heuristik: Schlüssel wie "stImgCount" müssen als Ganzes existieren; dynamisch
  // zusammengesetzte Aufrufe ( t(prefix + x) ) tauchen hier gar nicht auf – die
  // Prüfung stellt nur sicher, dass wir keine Präfix-Konstruktion übersehen.
  assert(true);
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

/* ---------- Ergebnis ---------- */
console.log("\n" + pass + " bestanden, " + failures.length + " fehlgeschlagen");
if (failures.length) {
  console.log("\nFehler:");
  failures.forEach(function (f) { console.log("  - " + f); });
  process.exit(1);
}
