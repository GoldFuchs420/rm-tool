/*
 * Gemeinsame Server-Verwaltungskomponente (reMarkable-Proxy-Liste:
 * hinzufügen/entfernen, Erreichbarkeits-Check, Basic-Auth-Login).
 * Wird identisch von popup.js UND vom Dateimanager (assets/js/
 * rmx-bridge.js) genutzt – ein Mount-Punkt, ein Code-Pfad, statt zweier
 * getrennter Implementierungen.
 *
 * Nutzung:
 *   const srv = RMXServers.mount(containerEl, {
 *     onChange(readyServers) { ... }   // aufgerufen nach jedem Discovery-Lauf
 *   });
 *   srv.refresh();                     // manuell neu prüfen
 *   srv.readyServers();                // aktuell erreichbare (online) Server
 */
(function (global) {
  "use strict";
  var RMXServers = (global.RMXServers = global.RMXServers || {});

  RMXServers.mount = function (root, opts) {
    opts = opts || {};
    var onChange = opts.onChange || function () {};

    var servers = [];
    var editMode = false;

    root.innerHTML =
      '<div class="rmx-srv-head">' +
      '<span class="rmx-srv-summary" data-rmx-srv-summary></span>' +
      '<button type="button" class="rmx-srv-toggle" data-rmx-srv-toggle title="Server verwalten / alle anzeigen" aria-label="Server verwalten / alle anzeigen">⚙</button>' +
      "</div>" +
      '<ul class="rmx-srv-list" data-rmx-srv-list></ul>' +
      '<form class="rmx-srv-add-form hidden" data-rmx-srv-addform>' +
      '<input type="text" class="rmx-srv-add-input" data-rmx-srv-addinput placeholder="z.B. https://10.11.99.1" />' +
      '<button type="submit" class="rmx-srv-add-btn">+</button>' +
      "</form>";

    var elSummary = root.querySelector("[data-rmx-srv-summary]");
    var elToggle = root.querySelector("[data-rmx-srv-toggle]");
    var elList = root.querySelector("[data-rmx-srv-list]");
    var elAddForm = root.querySelector("[data-rmx-srv-addform]");
    var elAddInput = root.querySelector("[data-rmx-srv-addinput]");

    function esc(s) {
      return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    }

    async function loadServers() {
      var data = await chrome.storage.local.get("servers");
      servers = data.servers && data.servers.length ? data.servers : [
        { id: crypto.randomUUID(), url: "https://10.11.99.1", user: "", pass: "", hasCreds: false }
      ];
    }
    async function saveServers() {
      await chrome.storage.local.set({ servers: servers });
    }
    function authHeaderFor(s) {
      if (!s.hasCreds) return null;
      return "Basic " + btoa(s.user + ":" + s.pass);
    }
    function readyServers() {
      return servers.filter(function (s) { return s._status === "online"; });
    }

    async function probe(s) {
      var ctrl = new AbortController();
      var timer = setTimeout(function () { ctrl.abort(); }, 3500);
      try {
        var headers = {};
        var h = authHeaderFor(s);
        if (h) headers.Authorization = h;
        var res = await fetch(s.url + "/documents/", { method: "GET", headers: headers, signal: ctrl.signal, cache: "no-store" });
        clearTimeout(timer);
        if (res.status === 401 || res.status === 403) return "auth";
        if (res.ok) return "online";
        return "offline";
      } catch (e) {
        clearTimeout(timer);
        return "offline";
      }
    }

    // Jedes Server-Objekt wird direkt mutiert (nicht per Index in der
    // äußeren Liste nachgeschlagen) – sonst würde ein zwischenzeitlich
    // hinzugefügter/entfernter Server (neue, andere Länge von `servers`)
    // zu "Cannot set properties of undefined" führen, falls ein älterer
    // Discovery-Lauf noch läuft, wenn servers sich bereits geändert hat.
    async function runDiscovery() {
      var list = servers;
      for (var i = 0; i < list.length; i++) list[i]._status = "checking";
      render();
      await Promise.all(list.map(async function (s) { s._status = await probe(s); }));
      render();
      onChange(readyServers());
    }

    function buildLoginCard(s) {
      var card = document.createElement("div");
      card.className = "rmx-srv-login";
      card.innerHTML =
        '<p class="rmx-srv-login__title">🔒 Basic-Auth für ' + esc(s.url) + "</p>" +
        '<input type="text" class="rmx-srv-login__input ark-input" placeholder="Benutzername" autocomplete="username" data-u />' +
        '<input type="password" class="rmx-srv-login__input ark-input" placeholder="Passwort" autocomplete="current-password" data-p />' +
        '<div class="rmx-srv-login__row">' +
        '<button type="button" class="rmx-srv-login__submit" data-submit>Anmelden</button>' +
        '<span class="rmx-srv-login__err hidden" data-err>Anmeldung fehlgeschlagen.</span>' +
        "</div>";
      var userInput = card.querySelector("[data-u]");
      var passInput = card.querySelector("[data-p]");
      var submitBtn = card.querySelector("[data-submit]");
      var errEl = card.querySelector("[data-err]");
      async function submit() {
        submitBtn.disabled = true;
        submitBtn.textContent = "Prüft…";
        errEl.classList.add("hidden");
        var candidate = Object.assign({}, s, { user: userInput.value, pass: passInput.value, hasCreds: true });
        var status = await probe(candidate);
        if (status === "online") {
          s.user = userInput.value; s.pass = passInput.value; s.hasCreds = true; s._status = "online";
          await saveServers();
          render();
          onChange(readyServers());
        } else {
          submitBtn.disabled = false;
          submitBtn.textContent = "Anmelden";
          errEl.classList.remove("hidden");
        }
      }
      submitBtn.addEventListener("click", submit);
      passInput.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
      return card;
    }

    function buildCopyBtn(s) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "rmx-srv-btn";
      btn.title = "Adresse kopieren";
      btn.setAttribute("aria-label", "Adresse kopieren: " + s.url);
      btn.textContent = "\u2750";
      btn.addEventListener("click", function () {
        navigator.clipboard.writeText(s.url).then(function () {
          btn.textContent = "\u2713";
          btn.classList.add("ok");
          setTimeout(function () { btn.textContent = "\u2750"; btn.classList.remove("ok"); }, 1200);
        });
      });
      return btn;
    }

    function buildOpenBtn(s) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "rmx-srv-btn";
      btn.title = "In neuem Tab \u00f6ffnen";
      btn.setAttribute("aria-label", "In neuem Tab \u00f6ffnen: " + s.url);
      btn.textContent = "\u2197";
      btn.addEventListener("click", function () { window.open(s.url, "_blank", "noopener"); });
      return btn;
    }

    function render() {
      var visible = editMode ? servers : servers.filter(function (s) { return s._status !== "offline"; });
      var frag = document.createDocumentFragment();

      visible.forEach(function (s) {
        var row = document.createElement("li");
        var rowDiv = document.createElement("div");
        rowDiv.className = "rmx-srv-row";

        var dot = document.createElement("span");
        dot.className = "rmx-srv-dot rmx-srv-dot--" + (s._status || "checking");

        var url = document.createElement("span");
        url.className = "rmx-srv-url";
        url.textContent = s.url;

        var label = document.createElement("span");
        label.className = "rmx-srv-state";
        label.textContent = { online: "bereit", auth: "Login nötig", offline: "offline", checking: "…" }[s._status || "checking"];

        rowDiv.append(dot, url, label);
        rowDiv.append(buildCopyBtn(s), buildOpenBtn(s));

        if (editMode) {
          var del = document.createElement("button");
          del.type = "button";
          del.className = "rmx-srv-rm";
          del.title = "Entfernen";
          del.textContent = "✕";
          del.addEventListener("click", async function () {
            servers = servers.filter(function (x) { return x.id !== s.id; });
            await saveServers();
            render();
            runDiscovery();
          });
          rowDiv.appendChild(del);
        }

        row.appendChild(rowDiv);
        if (s._status === "auth") row.appendChild(buildLoginCard(s));
        frag.appendChild(row);
      });

      if (!visible.length) {
        var empty = document.createElement("li");
        empty.className = "rmx-srv-empty";
        empty.textContent = editMode ? "Keine Server hinterlegt." : "Kein Server erreichbar. ⚙ zeigt alle an.";
        frag.appendChild(empty);
      }

      elList.innerHTML = "";
      elList.appendChild(frag);
      elAddForm.classList.toggle("hidden", !editMode);

      var online = servers.filter(function (s) { return s._status === "online"; }).length;
      elSummary.textContent = servers.length ? online + "/" + servers.length + " erreichbar" : "";
      elToggle.classList.toggle("active", editMode);
    }

    elToggle.addEventListener("click", function () {
      editMode = !editMode;
      render();
    });
    elAddForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      var val = (elAddInput.value || "").trim();
      if (!val) return;
      if (!/^https?:\/\//i.test(val)) val = "https://" + val;
      val = val.replace(/\/+$/, "");
      servers.push({ id: crypto.randomUUID(), url: val, user: "", pass: "", hasCreds: false });
      await saveServers();
      elAddInput.value = "";
      render();
      runDiscovery();
    });

    (async function init() {
      await loadServers();
      render();
      await runDiscovery();
    })();

    return {
      refresh: runDiscovery,
      readyServers: readyServers
    };
  };
})(typeof window !== "undefined" ? window : this);
