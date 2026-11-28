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
    /* Bilder liegen neben der .rm-Seite, je nach Archiv-Layout direkt im
       Ordner <pageid>/ oder im Dokument-Unterordner (<docid>/<pageid>/). */
    const folderRe = new RegExp('(^|/)' + String(pageId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/[^/]+$');
    const entries = Object.keys(zip.files)
      .filter(function (path) { return folderRe.test(path) && IMG_EXT.test(String(path).split('/').pop()) && !zip.files[path].dir; })
      .sort();
    const out = [];
    for (const path of entries) {
      const blob = await zip.files[path].async('blob');
      out.push({ name: String(path).split('/').pop(), blob: blob });
    }
    return out;
  }

  R.rmimages = { extractEmbeddedImages: extractEmbeddedImages };
})();
