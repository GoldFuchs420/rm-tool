/*
 * .rmdoc files carry their own name inside (<id>.metadata -> visibleName), the device uses that name
 * and not the file name. Before uploading a copy or a renamed file the name (and the internal id,
 * so a copy can never collide with the original) is rewritten.
 */
(function () {
  'use strict';
  var R = (window.RMX = window.RMX || {});

  async function rename(blob, name) {
    await R.load.jszip();
    var zip;
    try { zip = await window.JSZip.loadAsync(blob); } catch (e) { return blob; } // not a zip: upload unchanged
    var metaPath = Object.keys(zip.files).find(function (n) { return /^[^/]+\.metadata$/.test(n); });
    if (!metaPath) return blob;
    var meta;
    try { meta = JSON.parse(await zip.file(metaPath).async('string')); } catch (e) { return blob; }
    if (meta.visibleName === name) return blob; // already right: upload the original file untouched
    meta.visibleName = name;
    var oldId = metaPath.slice(0, -'.metadata'.length);
    var newId = R.uuid();
    var out = new window.JSZip();
    var jobs = [];
    zip.forEach(function (path, entry) {
      var target = path.indexOf(oldId) === 0 ? newId + path.slice(oldId.length) : path;
      if (entry.dir) { out.file(target, null, { dir: true, date: entry.date }); return; }
      var data = path === metaPath ? Promise.resolve(JSON.stringify(meta)) : entry.async('uint8array');
      jobs.push(data.then(function (d) { out.file(target, d, { binary: path !== metaPath, date: entry.date, createFolders: false }); }));
    });
    await Promise.all(jobs);
    return out.generateAsync({ type: 'blob', compression: 'STORE', mimeType: 'application/octet-stream' });
  }

  R.rmdoc = { rename: rename };
})();
