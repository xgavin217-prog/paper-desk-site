// Static mode: no push (needs a server), no caching. Kept only so the app is installable; never intercepts fetches.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
