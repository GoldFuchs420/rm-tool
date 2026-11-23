/*
 * Gemeinsam genutzte Dateinamen-Bereinigung. Popup (Artikel-/Bilder-
 * Namen) und Dateimanager (Umbenennen-Feld beim Import, siehe
 * assets/js/outputs.js) nutzen dieselbe Funktion, statt zwei
 * unterschiedliche Implementierungen zu pflegen.
 *
 * In beide Seiten eingebunden (popup.html und filemanager.html),
 * daher als einfaches globales Namespace-Objekt statt als Modul.
 */
(function (global) {
  "use strict";
  var RMXShared = (global.RMXShared = global.RMXShared || {});

  // Entfernt Zeichen, die in Dateinamen Probleme machen (Windows-
  // reservierte Zeichen \ / : * ? " < > | sowie Steuerzeichen), fasst
  // mehrfachen Leerraum zusammen, kürzt auf eine sinnvolle Länge und
  // fällt bei leerem Ergebnis auf einen Standardnamen zurück.
  RMXShared.sanitizeFilename = function (name, fallback) {
    return String(name || "")
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || (fallback || "Dokument");
  };

  // Ersetzt Umlaute und Sonderzeichen durch einfache ASCII-Zeichen
  // ("ä" -> "ae", "é" -> "e"), wie in den Export-Namensoptionen.
  RMXShared.asciiName = function (x) {
    return String(x)
      .replace(/[äæ]/g, "ae").replace(/[öø]/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
      .replace(/[ÄÆ]/g, "Ae").replace(/[ÖØ]/g, "Oe").replace(/[Ü]/g, "Ue")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x20-\x7e]/g, "_");
  };

  // "2026-11-23"-Präfix für Dateinamen (leer bei ungültigem Datum).
  RMXShared.ymd = function (value) {
    var d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return "";
    var p = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  };
})(typeof window !== "undefined" ? window : this);
