/*
 * Liest eingefügte (nicht handgezeichnete) Bilder direkt aus dem
 * .rmdoc-Archiv - NICHT aus dem .rm-Strichformat. Die exakte Position
 * eines eingefügten Bildes steckt im komplexen CRDT-Blockformat von v6
 * und wird hier bewusst nicht dekodiert; stattdessen werden Bilder über
 * Bild-Markierungen (rmregions.js) in Lesereihenfolge zugeordnet.
 * Siehe docs/ocr-pipeline.md, Stufe 5.
 */
(function () {
  'use strict';
  const R = (window.RMX = window.RMX || {});

  const IMG_EXT = /\.(png|jpe?g)$/i;

  /**
   * @param {File|Blob|ArrayBuffer} rmdocFile Inhalt einer .rmdoc-Datei
   * @param {string} pageId die Seiten-UUID (z. B. aus cPages.pages[i].id in der .content-Datei)
   * @returns {Promise<Array<{name: string, blob: Blob}>>} gefundene Bilder,
   *   alphabetisch nach Dateiname sortiert (siehe Hinweis zur Lesereihenfolge
   *   in docs/ocr-pipeline.md)
   */
  async function extractEmbeddedImages(rmdocFile, pageId) {
    await R.load.jszip();
    const zip = await window.JSZip.loadAsync(rmdocFile);
    const prefix = pageId + '/';
    const entries = Object.keys(zip.files)
      .filter(function (path) { return path.startsWith(prefix) && IMG_EXT.test(path) && !zip.files[path].dir; })
      .sort();
    const out = [];
    for (const path of entries) {
      const blob = await zip.files[path].async('blob');
      out.push({ name: path.slice(prefix.length), blob: blob });
    }
    return out;
  }

  R.rmimages = { extractEmbeddedImages: extractEmbeddedImages };
})();
