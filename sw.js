/* Offline support: keeps the app's files (and the Firebase library) on the phone. */
var CACHE = 'business-tracker-v11';
var FILES = ['./', './index.html', './styles.css', './config.js', './i18n.js', './lang-fr.js', './lang-pt.js', './countries.js', './calc.js', './themes.js', './security.js', './sync.js', './app.js', './privacy.html', './delete-account.html', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll(FILES.map(function (f) { return new Request(f, { cache: 'reload' }); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  var isSdk = url.hostname === 'www.gstatic.com' && url.pathname.indexOf('/firebasejs/') === 0;
  if (url.origin !== self.location.origin && !isSdk) return; // Firebase data traffic goes straight through
  if (url.origin === self.location.origin && /\/config\.js$/.test(url.pathname)) {
    e.respondWith(fetch(e.request, { cache: 'no-store' }).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put('./config.js', copy); }); }
      return res;
    }).catch(function () { return caches.match('./config.js'); }));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: !isSdk }).then(function (hit) {
    if (hit) return hit;
    return fetch(e.request).then(function (res) {
      if (res && (res.ok || res.type === 'opaque')) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); }
      return res;
    }).catch(function () {
      if (e.request.mode === 'navigate') return caches.match('./index.html');
    });
  }));
});
