/**
 * sw.js — Service Worker
 *
 * A Service Worker is a background script that runs separately from the main page.
 * It has no access to the DOM (HTML elements), but it can:
 *  1. Cache files so the app works OFFLINE
 *  2. Receive PUSH NOTIFICATIONS from the server
 *  3. Intercept network requests (like a local proxy server)
 *
 * Lifecycle:
 *  1. install  → First time it runs (downloads and caches files)
 *  2. activate → Takes over from the old service worker (cleans up old caches)
 *  3. fetch    → Every time the page makes a network request
 *  4. push     → When the server sends a push notification
 *  5. notificationclick → When the user clicks a notification
 *
 * For PHP devs: Think of this as a server-side cache (like Redis/Memcached)
 * but running inside the browser.
 */

// ── Cache Configuration ────────────────────────────────────────────────────────

// Cache name includes a version number.
// When you update your app, change 'v1' to 'v2' — this triggers the activate
// event to delete the old cache and install fresh files.
const CACHE_NAME = 'todo-pwa-v1';

// List of files to cache for offline use.
// These are the files needed to run the app without internet.
const FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/db.js',
  '/manifest.json',
  '/icons/icon.svg'
];

// ── Install Event ──────────────────────────────────────────────────────────────

/**
 * The install event fires when the Service Worker is first registered.
 * We use it to pre-cache all the files the app needs to work offline.
 *
 * self.skipWaiting() makes the new service worker activate immediately,
 * without waiting for old pages to close.
 */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');

  // event.waitUntil() tells the browser to wait until our Promise resolves
  // before considering the install complete. If the Promise rejects, the
  // service worker won't be installed.
  event.waitUntil(
    caches.open(CACHE_NAME)                 // Open (or create) our cache
      .then((cache) => {
        console.log('[SW] Caching app files:', FILES_TO_CACHE);
        return cache.addAll(FILES_TO_CACHE); // Download and cache all files
      })
      .then(() => {
        console.log('[SW] All files cached!');
        return self.skipWaiting(); // Activate immediately
      })
      .catch((error) => {
        console.error('[SW] Cache failed:', error);
      })
  );
});

// ── Activate Event ─────────────────────────────────────────────────────────────

/**
 * The activate event fires when this service worker takes control.
 * We use it to delete old caches from previous versions of the app.
 *
 * self.clients.claim() makes this service worker control all open tabs immediately,
 * without requiring a page reload.
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');

  event.waitUntil(
    caches.keys() // Get the names of all existing caches
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter(name => name !== CACHE_NAME) // Find caches that aren't ours
            .map(name => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);         // Delete old caches
            })
        );
      })
      .then(() => {
        console.log('[SW] Service worker activated!');
        return self.clients.claim(); // Take control of all open tabs
      })
  );
});

// ── Fetch Event ────────────────────────────────────────────────────────────────

/**
 * The fetch event intercepts every network request made by the page.
 * We use a "Cache First, then Network" strategy:
 *  1. Check if we have a cached response → serve it (fast, works offline)
 *  2. If not cached → fetch from network → cache it → return it
 *
 * Exception: API requests (to /subscribe, /send-notification, /vapid-public-key)
 * always go to the network because we need fresh data.
 */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Let API requests go straight to the network (don't cache them)
  // These paths are our Node.js server endpoints
  const apiPaths = ['/subscribe', '/unsubscribe', '/send-notification', '/vapid-public-key', '/subscriptions'];
  if (apiPaths.some(path => url.pathname.startsWith(path))) {
    return; // Don't intercept — let the browser handle it normally
  }

  // For everything else: Cache First strategy
  event.respondWith(
    caches.match(event.request) // Look for this request in the cache
      .then((cachedResponse) => {

        if (cachedResponse) {
          // Found in cache — return immediately (works offline!)
          return cachedResponse;
        }

        // Not in cache — fetch from network
        return fetch(event.request)
          .then((networkResponse) => {
            // Only cache successful responses (status 200)
            if (networkResponse && networkResponse.status === 200) {
              // Clone the response because a response body can only be read once.
              // We read it once for the cache, and return the original to the browser.
              const responseToCache = networkResponse.clone();

              caches.open(CACHE_NAME)
                .then(cache => cache.put(event.request, responseToCache));
            }

            return networkResponse;
          })
          .catch(() => {
            // Network request failed and nothing in cache.
            // Return a simple offline message for HTML pages.
            if (event.request.headers.get('accept').includes('text/html')) {
              return new Response(
                '<h1>You are offline</h1><p>Please check your internet connection.</p>',
                { headers: { 'Content-Type': 'text/html' } }
              );
            }
          });
      })
  );
});

// ── Push Event ─────────────────────────────────────────────────────────────────

/**
 * The push event fires when the server sends a push notification.
 * The server sends a JSON payload; we parse it and show a notification.
 *
 * This is the key to VAPID push notifications:
 *  Server → Push Service (Google/Mozilla) → This event fires → We show notification
 *
 * The service worker shows the notification even when the app tab is closed!
 * That's what makes push notifications powerful.
 */
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received!');

  // Default notification content (used if payload is missing or malformed)
  let notifData = {
    title: 'Todo PWA',
    body:  'You have a new notification!',
    icon:  '/icons/icon.svg',
    badge: '/icons/icon.svg',
    data:  { url: '/' }
  };

  // Parse the payload sent by the server
  if (event.data) {
    try {
      const payload = event.data.json(); // Parse the JSON string from server.js
      notifData = { ...notifData, ...payload }; // Merge with defaults
    } catch (error) {
      console.error('[SW] Could not parse push payload:', error);
    }
  }

  // Options for the notification appearance and behavior
  const options = {
    body:    notifData.body,
    icon:    notifData.icon,
    badge:   notifData.badge,
    data:    notifData.data,
    vibrate: [200, 100, 200],  // Vibration pattern on mobile: [on, off, on] ms
    actions: [                  // Buttons inside the notification (Chrome desktop)
      { action: 'open', title: '📝 Open App' },
      { action: 'close', title: '✕ Dismiss' }
    ]
  };

  // Show the notification
  // event.waitUntil() ensures the service worker stays alive until the notification is shown
  event.waitUntil(
    self.registration.showNotification(notifData.title, options)
  );
});

// ── Notification Click Event ───────────────────────────────────────────────────

/**
 * notificationclick fires when the user clicks on a push notification.
 * We use it to open the app (or focus an existing tab).
 */
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);

  // Close the notification popup
  event.notification.close();

  // Handle action buttons
  if (event.action === 'close') {
    return; // User clicked "Dismiss" — do nothing
  }

  // For 'open' action or clicking the notification body itself:
  // Open the app or focus an existing window

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    // Get all open windows/tabs that belong to our app
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {

        // Check if we already have a tab open
        for (const client of clientList) {
          if (client.url.includes(self.location.origin)) {
            // Found an open tab — focus it and navigate to the URL
            client.focus();
            return client.navigate(urlToOpen);
          }
        }

        // No open tab found — open a new one
        return self.clients.openWindow(urlToOpen);
      })
  );
});
