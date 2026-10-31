// Keeps a full copy of the app on the phone so it opens with no internet.
// Only app files are handled here. Planner data lives in IndexedDB and is never touched.
const VERSION = '900229cf2cc0';
const FILES = ["app.js","calendarView.js","dates.js","dayView.js","icons/icon-180.png","icons/icon-192.png","icons/icon-512.png","index.html","manifest.webmanifest","mealPlan.js","phone.css","phoneApp.js","phoneSettings.js","phoneStorage.js","recipesView.js","settingsView.js","shared-data.js","styles.css","tagsView.js","ui.js","version.js"];
const CACHE_PREFIX = 'daily-planner-';
const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`;

// "reload" skips the web cache, so a new version can't be installed with old files.
// If any file fails to download, the install fails and the current version stays in place.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(FILES.map((file) => new Request(file, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

async function removeOldVersions() {
  const names = await caches.keys();
  const old = names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME);
  await Promise.all(old.map((name) => caches.delete(name)));
}

self.addEventListener('activate', (event) => {
  event.waitUntil(removeOldVersions().then(() => self.clients.claim()));
});

async function fromCache(request) {
  const cache = await caches.open(CACHE_NAME);
  const match = await cache.match(request.mode === 'navigate' ? 'index.html' : request, { ignoreSearch: true });
  return match ?? fetch(request);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method === 'GET' && new URL(request.url).origin === location.origin) {
    event.respondWith(fromCache(request));
  }
});
