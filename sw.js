// Minimal service worker: no caching, so the app can never get stuck on old files.
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",()=>{});
self.addEventListener("push",e=>{e.waitUntil(self.registration.showNotification("Billionaire Vicoba",{body:e.data?e.data.text():"New update",icon:"icon-192.png"}))});
