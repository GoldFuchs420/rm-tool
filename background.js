// background.js
// Legt beim ersten Install einen Standard-Server an.

const DEFAULT_SERVERS = [
  {
    id: crypto.randomUUID(),
    url: "https://10.11.99.1",
    user: "",
    pass: "",
    hasCreds: false
  }
];

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason !== "install") return;
  const existing = await chrome.storage.local.get("servers");
  if (!existing.servers || existing.servers.length === 0) {
    await chrome.storage.local.set({ servers: DEFAULT_SERVERS });
  }
});
