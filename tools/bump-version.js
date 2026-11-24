/*
 * Bumps the extension version in manifest.json (semantic versioning).
 * Usage: node tools/bump-version.js [patch|minor|major]   (default: patch)
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const MANIFEST = path.join(ROOT, "manifest.json");

const kind = (process.argv[2] || "patch").toLowerCase();
if (!["major", "minor", "patch"].includes(kind)) {
  console.error("unbekannte Stufe: " + kind + " (erlaubt: major, minor, patch)");
  process.exit(1);
}

const man = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.]+))?$/.exec(man.version);
if (!match) {
  console.error("ungueltige Version in manifest.json: " + man.version);
  process.exit(1);
}

/* Ein Prerelease-Suffix (z. B. -RC1) entfaellt beim naechsten Bump. */
let [major, minor, patch] = match.slice(1, 4).map(Number);
if (kind === "major") { major++; minor = 0; patch = 0; }
else if (kind === "minor") { minor++; patch = 0; }
else { patch++; }
man.version = [major, minor, patch].join(".");
/* Der Anzeigename (version_name) wird mitgezogen, damit Anzeige und interne
   Version nicht auseinanderlaufen; der Prerelease-Zusatz entfaellt ebenso
   wie bei der internen Version. */
if (typeof man.version_name === "string") {
  man.version_name = man.version;
}

fs.writeFileSync(MANIFEST, JSON.stringify(man, null, 2) + "\n");
console.log("manifest.json: Version -> " + man.version);
