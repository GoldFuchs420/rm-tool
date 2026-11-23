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
})(typeof window !== "undefined" ? window : this);
