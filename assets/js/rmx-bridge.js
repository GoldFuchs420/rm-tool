/*
 * Erweiterung für die Chrome-Extension: bindet die gemeinsame Server-
 * Komponente (shared/servers.js – dieselbe, die auch das Popup nutzt)
 * unter dem Header ein und konfiguriert api.js (siehe dortiger Patch:
 * R.configureServer/R.ready), sobald ein Server erreichbar ist.
 */
(function () {
  "use strict";
  var R = (window.RMX = window.RMX || {});

  /* RMXServers.authHeaderFor liefert immer einen Basic-Header (ggf. leerer),
     damit die API-Aufrufe hier denselben tragen wie der Erreichbarkeits-
     Probe – ueberall gleich, und nirgends oeffnet Chrome den nativen
     Login-Dialog (siehe shared/servers.js). */
  var authHeaderFor = function (s) { return window.RMXServers.authHeaderFor(s); };

  var configured = false;
  var lastActiveId = null;

  function pickPreferred(ready) {
    if (!ready.length) return null;
    var preferred = null;
    try { preferred = localStorage.getItem("rmx.activeServer"); } catch (e) { /* private mode */ }
    return ready.filter(function (s) { return s.id === preferred; })[0] || ready[0];
  }

  function onServersChanged(readyList) {
    if (document.body) document.body.classList.toggle("rmx-nosrv", !readyList.length);
    var chosen = pickPreferred(readyList);
    if (!chosen) return;
    var wasConfigured = configured;
    var serverChanged = chosen.id !== lastActiveId;
    lastActiveId = chosen.id;
    configured = true;
    try { localStorage.setItem("rmx.activeServer", chosen.id); } catch (e) { /* private mode */ }
    R.configureServer(chosen.url, authHeaderFor(chosen));
    // Ein Wechsel des aktiven Servers NACH der ersten Konfiguration lädt
    // neu, damit keine Ordner-IDs/Zustand des vorherigen Servers hängen
    // bleiben. Die allererste Konfiguration braucht das nicht (die noch
    // wartenden Requests laufen einfach jetzt los, siehe api.js).
    if (wasConfigured && serverChanged) location.reload();
  }

  function mount() {
    // Als ERSTES Kind von .rmx-container eingehängt (nicht als
    // Geschwister von <main>): dadurch erbt das Panel automatisch
    // exakt dieselbe max-width/Zentrierung/responsive Seitenränder wie
    // "Meine Dateien", Suche und Import/Export (alles Kinder desselben
    // Containers) – bündige Ausrichtung ohne eigene Breiten-/Rand-CSS,
    // und der normale Flex-"gap" des Containers sorgt für einen zum
    // restlichen Seiten-Rhythmus passenden Abstand statt zusätzlich
    // aufaddierter eigener Polsterung.
    var container = document.querySelector(".rmx-container");
    if (!container || document.getElementById("rmx-srv-panel")) return;
    var panel = document.createElement("div");
    panel.id = "rmx-srv-panel";
    panel.className = "rmx-srv-panel-wrap";
    container.insertBefore(panel, container.firstChild);
    /* Bis der erste Erreichbarkeits-Check abgeschlossen ist, gilt: kein
       Server erreichbar → nur das Serverpanel zeigen (Dateilisten können
       ohne Server ohnehin nicht geladen werden). */
    if (document.body) document.body.classList.add("rmx-nosrv");
    var srv = window.RMXServers.mount(panel, { onChange: onServersChanged });
    /* Sprachwechsel im Dateimanager: Serverleiste ebenfalls neu uebersetzen. */
    if (srv && srv.redraw) R.serversRedraw = srv.redraw;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
