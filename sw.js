// Static site: no caching, never intercepts fetches. Handles web push (sent by the desk, same text as Telegram) and opens the FOMO link on tap.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("push", (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (_) { d = {title: "FOMO Desk", body: e.data ? e.data.text() : ""}; }
  e.waitUntil(self.registration.showNotification(d.title || "FOMO Desk", {body: d.body || "", tag: d.tag || "desk", data: {url: d.url || "./"}, icon: "icons/icon-192.png"}));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(clients.openWindow(url));
});
