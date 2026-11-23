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
  const RMXServers = (global.RMXServers = global.RMXServers || {});

  RMXServers.mount = function (root, opts) {
    opts = opts || {};
    const onChange = opts.onChange || function () {};

    let servers = [];
    let editMode = false;

    root.innerHTML =
      '<div class="rmx-srv-head">' +
      '<span class="rmx-srv-summary" data-rmx-srv-summary></span>' +
      '<button type="button" class="rmx-srv-toggle" data-rmx-srv-toggle title="Server verwalten / alle anzeigen" aria-label="Server verwalten / alle anzeigen">⚙</button>' +
      "</div>" +
      '<ul class="rmx-srv-list" data-rmx-srv-list></ul>' +
      '<form class="rmx-srv-add-form hidden" data-rmx-srv-addform>' +
      '<input type="text" class="rmx-srv-add-input" data-rmx-srv-addinput />' +
      '<button type="submit" class="rmx-srv-add-btn">+</button>' +
      "</form>";

    const elSummary = root.querySelector("[data-rmx-srv-summary]");
    const elToggle = root.querySelector("[data-rmx-srv-toggle]");
    const elList = root.querySelector("[data-rmx-srv-list]");
    const elAddForm = root.querySelector("[data-rmx-srv-addform]");
    const elAddInput = root.querySelector("[data-rmx-srv-addinput]");
    elAddInput.placeholder = T("srvAddPh", "z. B. https://10.11.99.1");

    function esc(s) {
      return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    }

    /* Shared texts in 5 languages (assets/js/i18n.js); German as a fallback so
       this file also works standalone (e.g. before i18n.js has run). */
    function T(key, fallback, vars) {
      const v = window.RMX && RMX.t ? RMX.t(key) : "";
      let out = v && v !== key ? v : fallback;
      if (vars) out = out.replace(/\{(\w+)\}/g, function (m, n) { return vars[n] !== undefined ? vars[n] : m; });
      return out;
    }

    async function loadServers() {
      const data = await chrome.storage.local.get("servers");
      servers = data.servers && data.servers.length ? data.servers : [
        { id: crypto.randomUUID(), url: "https://10.11.99.1", user: "", pass: "", hasCreds: false }
      ];
      servers.forEach(function (s) { delete s._status; });
    }
    /* Ohne den internen Status (_status): der darf beim nächsten Öffnen
       nicht als "online" gelten, bevor der erste Erreichbarkeits-Check
       gelaufen ist (sonst zeigten Popup/Dateimanager Senden bzw. Listen
       kurz sofort an, solange die Server gerade erst geprüft werden). */
    function plainServers() {
      return servers.map(function (s) { const c = Object.assign({}, s); delete c._status; return c; });
    }
    async function saveServers() {
      await chrome.storage.local.set({ servers: plainServers() });
    }
    /* Immer eine Authorization mitschicken (ohne Credentials: ein leerer
       Basic-Header). Ohne Header wuerde Chrome – nur im Tab, nicht im
       Popup – bei 401 den nativen Login-Dialog oeffnen; der haengt am
       selben fetch, den der Probe-Timeout nach 3,5 s abbricht. Der
       Server sprang dann auf "offline" (rot), statt auf "auth" (gelb,
       Inline-Login wie im Popup). Geraet/Proxy ohne Auth ignorieren den
       Header einfach. */
    RMXServers.authHeaderFor = function (s) {
      if (!s) return null;
      return "Basic " + btoa((s.user || "") + ":" + (s.pass || ""));
    };
    const authHeaderFor = RMXServers.authHeaderFor;
    function readyServers() {
      return servers.filter(function (s) { return s._status === "online"; });
    }

    /* Probe liefert { status, scheme?, code?, netError? }: scheme aus dem
       WWW-Authenticate-Header (z. B. Digest/NTLM → Basic-Login kann nie
       gelingen), code = HTTP-Status, netError = "timeout"/"network". */
    async function probe(s) {
      const ctrl = new AbortController();
      const timer = setTimeout(function () { ctrl.abort(); }, 8000);
      try {
        const headers = { Authorization: authHeaderFor(s) };
        const res = await fetch(s.url + "/documents/", { method: "GET", headers: headers, signal: ctrl.signal, cache: "no-store", credentials: "omit" });
        clearTimeout(timer);
        let scheme = null;
        try {
          const chall = (res.headers.get("WWW-Authenticate") || "").trim();
          if (chall) scheme = chall.split(/\s+/)[0];
        } catch (e2) { /* Header evtl. nicht lesbar */ }
        if (res.ok) return { status: "online", scheme: scheme };
        if (res.status === 401 || res.status === 403) return { status: "auth", scheme: scheme, code: res.status };
        return { status: "offline", scheme: scheme, code: res.status };
      } catch (e) {
        clearTimeout(timer);
        return { status: "offline", netError: e && e.name === "AbortError" ? "timeout" : "network" };
      }
    }

    // Jedes Server-Objekt wird direkt mutiert (nicht per Index in der
    // äußeren Liste nachgeschlagen) – sonst würde ein zwischenzeitlich
    // hinzugefügter/entfernter Server (neue, andere Länge von `servers`)
    // zu "Cannot set properties of undefined" führen, falls ein älterer
    // Discovery-Lauf noch läuft, wenn servers sich bereits geändert hat.
    async function runDiscovery() {
      const list = servers;
      for (let i = 0; i < list.length; i++) list[i]._status = "checking";
      render();
      await Promise.all(list.map(async function (s) { s._status = (await probe(s)).status; }));
      render();
      onChange(readyServers());
    }

    function buildLoginCard(s) {
      const card = document.createElement("div");
      card.className = "rmx-srv-login";
      card.innerHTML =
        '<p class="rmx-srv-login__title">🔒 ' + esc(T("srvLoginTitle", "Basic-Auth für {url}", { url: s.url })) + "</p>" +
        '<input type="text" class="rmx-srv-login__input ark-input" placeholder="' + esc(T("srvUser", "Benutzername")) + '" autocomplete="username" data-u />' +
        '<input type="password" class="rmx-srv-login__input ark-input" placeholder="' + esc(T("srvPass", "Passwort")) + '" autocomplete="current-password" data-p />' +
        '<div class="rmx-srv-login__row">' +
        '<button type="button" class="rmx-srv-login__submit" data-submit>' + esc(T("srvLogin", "Anmelden")) + '</button>' +
        '<span class="rmx-srv-login__err hidden" data-err>' + esc(T("srvLoginFail", "Anmeldung fehlgeschlagen.")) + '</span>' +
        "</div>";
      const userInput = card.querySelector("[data-u]");
      const passInput = card.querySelector("[data-p]");
      const submitBtn = card.querySelector("[data-submit]");
      const errEl = card.querySelector("[data-err]");
      async function submit() {
        submitBtn.disabled = true;
        submitBtn.textContent = T("srvChecking", "Prüft …");
        errEl.classList.add("hidden");
        const candidate = Object.assign({}, s, { user: userInput.value, pass: passInput.value, hasCreds: true });
        const r = await probe(candidate);
        if (r.status === "online") {
          s.user = userInput.value; s.pass = passInput.value; s.hasCreds = true; s._status = "online";
          await saveServers();
          render();
          onChange(readyServers());
        } else {
          submitBtn.disabled = false;
          submitBtn.textContent = T("srvLogin", "Anmelden");
          if (r.scheme && r.scheme.toLowerCase() !== "basic") {
            errEl.textContent = T("srvAuthScheme", "Dieser Server erwartet {scheme} statt Basic: bitte an einem Proxy mit Basic-Auth anmelden oder sich im Browser-Fenster einloggen.", { scheme: r.scheme });
          } else if (r.code) {
            errEl.textContent = T("srvFailCode", "Anmeldung fehlgeschlagen (HTTP {code}).", { code: r.code });
          } else {
            errEl.textContent = T("srvNoConn", "Keine Verbindung.");
          }
          errEl.classList.remove("hidden");
        }
      }
      submitBtn.addEventListener("click", submit);
      passInput.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
      return card;
    }

    function buildCopyBtn(s) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "rmx-srv-btn";
      btn.title = T("srvCopyAddr", "Adresse kopieren");
      btn.setAttribute("aria-label", btn.title + ": " + s.url);
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
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "rmx-srv-btn";
      btn.title = T("srvOpenTab", "In neuem Tab \u00f6ffnen");
      btn.setAttribute("aria-label", btn.title + ": " + s.url);
      btn.textContent = "\u2197";
      btn.addEventListener("click", function () { window.open(s.url, "_blank", "noopener"); });
      return btn;
    }

    function render() {
      /* Wenn kein Server online ist, alle zeigen (auch offline), damit die
         Login-Karte und das Hinzufügen jederzeit erreichbar bleiben. */
      const noneOnline = !servers.some(function (s) { return s._status === "online"; });
      const visible = (editMode || noneOnline) ? servers : servers.filter(function (s) { return s._status !== "offline"; });
      const frag = document.createDocumentFragment();

      visible.forEach(function (s) {
        const row = document.createElement("li");
        const rowDiv = document.createElement("div");
        rowDiv.className = "rmx-srv-row";

        const dot = document.createElement("span");
        dot.className = "rmx-srv-dot rmx-srv-dot--" + (s._status || "checking");

        const url = document.createElement("span");
        url.className = "rmx-srv-url";
        url.textContent = s.url;

        const label = document.createElement("span");
        label.className = "rmx-srv-state";
        label.textContent = { online: T("srvOnline", "bereit"), auth: T("srvAuth", "Login nötig"), offline: T("srvOffline", "offline"), checking: "…" }[s._status || "checking"];

        rowDiv.append(dot, url, label);
        rowDiv.append(buildCopyBtn(s), buildOpenBtn(s));

        if (editMode) {
          const del = document.createElement("button");
          del.type = "button";
          del.className = "rmx-srv-rm";
          del.title = T("remove", "Entfernen");
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
        const empty = document.createElement("li");
        empty.className = "rmx-srv-empty";
        empty.textContent = editMode ? T("srvEmptyEdit", "Keine Server hinterlegt.") : T("srvEmptyHint", "Kein Server erreichbar. ⚙ zeigt alle an.");
        frag.appendChild(empty);
      }

      elList.innerHTML = "";
      elList.appendChild(frag);
      elAddForm.classList.toggle("hidden", !editMode);

      const online = servers.filter(function (s) { return s._status === "online"; }).length;
      elSummary.textContent = servers.length && online ? T("srvSummary", "{o}/{n} erreichbar", { o: online, n: servers.length }) : "";
      elToggle.classList.toggle("active", editMode);
    }

    elToggle.addEventListener("click", function () {
      editMode = !editMode;
      render();
    });
    elAddForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      let val = (elAddInput.value || "").trim();
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
      readyServers: readyServers,
      redraw: render
    };
  };
})(typeof window !== "undefined" ? window : this);
