# VAPID Push Notification Tutorial — Todo PWA

A beginner-friendly guide to VAPID push notifications using the actual code in this project.
Written for developers who know PHP but are new to browser push notifications.

---

## Table of Contents

1. [What is VAPID?](#1-what-is-vapid)
2. [How Push Notifications Work — The Full Picture](#2-how-push-notifications-work--the-full-picture)
3. [The Three Players](#3-the-three-players)
4. [Files Involved in This App](#4-files-involved-in-this-app)
5. [Step 1 — Generate VAPID Keys (server.js)](#5-step-1--generate-vapid-keys-serverjs)
6. [Step 2 — Expose the Public Key to the Browser (server.js)](#6-step-2--expose-the-public-key-to-the-browser-serverjs)
7. [Step 3 — Request Notification Permission (app.js)](#7-step-3--request-notification-permission-appjs)
8. [Step 4 — Subscribe the Browser (app.js)](#8-step-4--subscribe-the-browser-appjs)
9. [Step 5 — Save the Subscription on the Server (server.js)](#9-step-5--save-the-subscription-on-the-server-serverjs)
10. [Step 6 — Send a Push Notification (server.js)](#10-step-6--send-a-push-notification-serverjs)
11. [Step 7 — Receive and Show the Notification (sw.js)](#11-step-7--receive-and-show-the-notification-swjs)
12. [Step 8 — Handle Notification Click (sw.js)](#12-step-8--handle-notification-click-swjs)
13. [Testing Push Notifications](#13-testing-push-notifications)
14. [What Happens When the App is Offline](#14-what-happens-when-the-app-is-offline)
15. [Common Mistakes](#15-common-mistakes)
16. [Quick Reference](#16-quick-reference)

---

## 1. What is VAPID?

**VAPID** stands for **Voluntary Application Server Identification**.

It is an open web standard (RFC 8292) that lets your server prove its identity when sending push notifications to browsers. Think of it like an API key pair:

- **Public key** — given to the browser when it subscribes. The push service uses it to verify that only your server can send to your subscribers.
- **Private key** — kept secret on your server. Used to sign each notification before sending.

Without VAPID, any server could send a notification to any subscriber. VAPID ensures that only the server that holds the matching private key can send to subscriptions created with a given public key.

```
VAPID is like HTTPS for push notifications:
  - The key pair proves you are who you say you are
  - Nobody else can impersonate your server
```

---

## 2. How Push Notifications Work — The Full Picture

This is the complete journey of a push notification in this app:

```
┌──────────────┐         ┌──────────────────┐         ┌────────────────────┐
│   Browser    │         │   Your Server    │         │  Push Service      │
│  (app.js +  │         │   (server.js)    │         │  (Google/Mozilla)  │
│   sw.js)    │         │                  │         │                    │
└──────────────┘         └──────────────────┘         └────────────────────┘

  SETUP PHASE (one-time, per browser)
  ─────────────────────────────────────────────────────────────────────────
  1. Browser asks user: "Allow notifications?"
  2. User clicks Allow
  3. Browser contacts Push Service → gets a unique subscription object
     subscription = {
       endpoint: "https://fcm.googleapis.com/fcm/send/abc123...",
       keys: { p256dh: "...", auth: "..." }
     }
  4. Browser sends subscription → POST /subscribe → Server saves it

  SENDING PHASE (every time you want to notify)
  ─────────────────────────────────────────────────────────────────────────
  5. Server calls webpush.sendNotification(subscription, payload)
  6. web-push library signs the request with the VAPID private key
  7. Server sends signed request → subscription.endpoint (Google/Mozilla URL)
  8. Push Service verifies the VAPID signature (using your public key)
  9. Push Service delivers the message to the browser
  10. Browser wakes up the Service Worker (even if the app tab is closed)
  11. Service Worker receives the 'push' event → shows the notification
  12. User clicks the notification → Service Worker opens the app
```

---

## 3. The Three Players

Every push notification in this app involves three separate pieces of code:

| File | Role | Runs In |
|---|---|---|
| `server.js` | Generates keys, stores subscriptions, sends notifications | Node.js (server) |
| `app.js` | Asks permission, subscribes the browser, sends subscription to server | Browser tab |
| `sw.js` | Receives push events, shows notifications, handles clicks | Browser background (Service Worker) |

The Service Worker (`sw.js`) is the key piece. It runs in the background even when the app tab is closed, which is what allows push notifications to appear at any time.

---

## 4. Files Involved in This App

```
vapid-indexed-pwa/
├── server.js       ← VAPID key management, /subscribe endpoint, /send-notification endpoint
├── app.js          ← Permission request, push subscription, urlBase64ToUint8Array helper
├── sw.js           ← push event listener, notificationclick event listener
└── vapid-keys.json ← Auto-generated on first server run (do not commit this to git)
```

---

## 5. Step 1 — Generate VAPID Keys (server.js)

VAPID requires a public/private key pair. They are generated **once** and reused forever. If you regenerate them, all existing browser subscriptions become invalid.

In this app, keys are auto-generated on first run and saved to `vapid-keys.json`:

```js
// server.js

const webpush = require('web-push');
const fs      = require('fs');

const KEYS_FILE = './vapid-keys.json';

function loadOrGenerateVapidKeys() {
  if (fs.existsSync(KEYS_FILE)) {
    // Keys already generated before — load them
    return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
  }

  // First run — generate a new key pair
  const keys = webpush.generateVAPIDKeys();
  // keys = { publicKey: "BEOwf3M42Z...", privateKey: "abc123..." }

  fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));
  return keys;
}

const vapidKeys = loadOrGenerateVapidKeys();

// Tell the web-push library to use these keys when sending notifications
webpush.setVapidDetails(
  'mailto:admin@example.com',  // Contact email (required by VAPID spec)
  vapidKeys.publicKey,
  vapidKeys.privateKey
);
```

**What `vapid-keys.json` looks like after generation:**

```json
{
  "publicKey": "BEOwf3M42ZCcxCC911WKY9xLnaV1IbpHaKHl9Y2RIMLPPgcW1ZREfjnrheYkqRcjVIvIrwUctdAwKlRGSXHBHmk",
  "privateKey": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

**Important rules:**
- Never commit `vapid-keys.json` to Git (add it to `.gitignore`)
- Never regenerate keys in production — it breaks all existing subscriptions
- The public key is safe to share with the browser; the private key must stay on the server

---

## 6. Step 2 — Expose the Public Key to the Browser (server.js)

The browser needs your public key to create a subscription. We serve it via an API endpoint:

```js
// server.js

app.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: vapidKeys.publicKey });
});
```

The browser fetches this URL before subscribing. This is the only key the browser ever sees — the private key never leaves the server.

---

## 7. Step 3 — Request Notification Permission (app.js)

Before subscribing, the browser must ask the user for permission. This shows the browser's native permission dialog ("Allow notifications?").

```js
// app.js

async function requestNotificationPermission() {
  // Check if notifications are supported
  if (!('Notification' in window)) {
    alert('Your browser does not support notifications.');
    return;
  }

  // Check if already blocked
  if (Notification.permission === 'denied') {
    alert('Notifications are blocked. Please allow them in browser settings.');
    return;
  }

  // Show the permission dialog
  // Notification.permission can be: 'default', 'granted', or 'denied'
  const permission = await Notification.requestPermission();

  if (permission === 'granted') {
    await subscribeToPush();  // Permission granted — now subscribe
  }
}
```

**Permission states:**

| State | Meaning | Can Ask Again? |
|---|---|---|
| `'default'` | Not asked yet | Yes |
| `'granted'` | User allowed | N/A — already granted |
| `'denied'` | User blocked | No — user must change in browser settings |

**You can only call `requestPermission()` once.** If the user clicks "Deny", you cannot programmatically ask again. The user must manually go to browser settings to re-allow.

In this app, the user triggers this by clicking the 🔔 bell button in the header.

---

## 8. Step 4 — Subscribe the Browser (app.js)

After permission is granted, we create a **push subscription** — a unique object that tells us how to reach this specific browser on this specific device.

```js
// app.js

async function subscribeToPush() {
  // Get the active Service Worker registration
  // navigator.serviceWorker.ready waits until sw.js is fully installed
  const registration = await navigator.serviceWorker.ready;

  // Check if already subscribed (avoid duplicate subscriptions)
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    pushSubscription = existing;
    return;  // Already subscribed — no need to do it again
  }

  // Fetch the VAPID public key from our server
  const response   = await fetch('/vapid-public-key');
  const { publicKey } = await response.json();

  // Create the subscription
  // pushManager.subscribe() contacts Google/Mozilla push service
  // and returns a subscription object
  pushSubscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,  // Required: we must show a notification for every push
    applicationServerKey: urlBase64ToUint8Array(publicKey)  // Convert key format
  });

  // Send the subscription to our server so it can send us notifications later
  await fetch('/subscribe', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(pushSubscription)
  });
}
```

**What a subscription object looks like:**

```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/eKGkim0...",
  "expirationTime": null,
  "keys": {
    "p256dh": "BNcRdreALRFXTkOOUHK...",
    "auth": "tBHItJI5svbpez7KI4CCXg"
  }
}
```

- `endpoint` — a URL at Google's/Mozilla's push service. Your server POSTs to this URL to deliver a message.
- `keys.p256dh` and `keys.auth` — encryption keys. The `web-push` library uses these to encrypt the payload so only the intended browser can decrypt it.

**The `urlBase64ToUint8Array` helper:**

The VAPID public key is a Base64 string, but `pushManager.subscribe()` requires a `Uint8Array` (raw binary). This function converts between the two formats:

```js
// app.js

function urlBase64ToUint8Array(base64String) {
  // URL-safe Base64 uses '-' and '_' instead of '+' and '/'
  // We must convert back before decoding
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);         // Decode Base64 → binary string
  const output  = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i);         // Convert each character to a byte
  }

  return output;
}
```

This is boilerplate code — every PWA that uses VAPID needs exactly this function. You do not need to understand the internals, just know that it converts the public key from the format the server sends to the format the browser expects.

---

## 9. Step 5 — Save the Subscription on the Server (server.js)

When the browser calls `POST /subscribe`, the server stores the subscription object. Later, when we want to send a notification, we send to all stored subscriptions.

```js
// server.js

const SUBSCRIPTIONS_FILE = './subscriptions.json';

// Load existing subscriptions from disk (survives server restarts)
let subscriptions = fs.existsSync(SUBSCRIPTIONS_FILE)
  ? JSON.parse(fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf8'))
  : [];

function saveSubscriptions() {
  fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(subscriptions, null, 2));
}

app.post('/subscribe', (req, res) => {
  const subscription = req.body;

  // Avoid saving duplicates — check by endpoint URL
  const exists = subscriptions.some(s => s.endpoint === subscription.endpoint);

  if (!exists) {
    subscriptions.push(subscription);
    saveSubscriptions();
  }

  res.status(201).json({ message: 'Subscribed successfully' });
});
```

In this app, subscriptions are stored in `subscriptions.json`. In a production app, you would store them in a database (MySQL, PostgreSQL, etc.) and associate each subscription with a user account.

**What `subscriptions.json` looks like:**

```json
[
  {
    "endpoint": "https://fcm.googleapis.com/fcm/send/abc...",
    "expirationTime": null,
    "keys": {
      "p256dh": "BNcRd...",
      "auth": "tBHIt..."
    }
  }
]
```

---

## 10. Step 6 — Send a Push Notification (server.js)

This is where the server sends a notification to all subscribed browsers. In this app, it is triggered two ways:

1. **Automatically** — when a new todo is added (`sendPushForNewTodo()` in `app.js`)
2. **Manually** — when the "Send Push Notification" test button is clicked

```js
// server.js

app.post('/send-notification', async (req, res) => {
  const { title = 'Todo PWA', body = 'You have a notification!', icon, data } = req.body;

  // Build the payload — must be a string (we use JSON)
  const payload = JSON.stringify({
    title,
    body,
    icon: icon || '/icons/icon.svg',
    data
  });

  // Send to every subscriber
  // Promise.allSettled() runs all sends in parallel and
  // does NOT stop if one fails (unlike Promise.all())
  const results = await Promise.allSettled(
    subscriptions.map(subscription =>
      webpush.sendNotification(subscription, payload)
    )
  );

  // Remove subscriptions that are no longer valid
  // Status 410 = Gone (user uninstalled app or cleared browser data)
  // Status 404 = Not Found (subscription expired)
  const invalidEndpoints = [];
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      const err = result.reason;
      if (err.statusCode === 410 || err.statusCode === 404) {
        invalidEndpoints.push(subscriptions[index].endpoint);
      }
    }
  });

  // Clean up stale subscriptions
  if (invalidEndpoints.length > 0) {
    subscriptions = subscriptions.filter(s => !invalidEndpoints.includes(s.endpoint));
    saveSubscriptions();
  }

  res.json({
    sent:  results.filter(r => r.status === 'fulfilled').length,
    failed: results.filter(r => r.status === 'rejected').length
  });
});
```

**Test it with curl (from your terminal):**

```bash
curl -X POST http://localhost:3000/send-notification \
     -H "Content-Type: application/json" \
     -d '{"title":"Hello!","body":"This is a test notification"}'
```

**How `app.js` calls it when a todo is added:**

```js
// app.js — sendPushForNewTodo()

async function sendPushForNewTodo(description) {
  await fetch('/send-notification', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: '✅ New Todo Added',
      body:  description,
      data:  { url: '/' }
    })
  });
}
```

---

## 11. Step 7 — Receive and Show the Notification (sw.js)

When the server sends a push, the browser's push service delivers it to the Service Worker. The `push` event fires — even if the app tab is closed.

```js
// sw.js

self.addEventListener('push', (event) => {
  // Default content if payload is missing or broken
  let notifData = {
    title: 'Todo PWA',
    body:  'You have a new notification!',
    icon:  '/icons/icon.svg',
    data:  { url: '/' }
  };

  // Parse the JSON payload sent by the server
  if (event.data) {
    try {
      const payload = event.data.json();
      notifData = { ...notifData, ...payload };  // Merge with defaults
    } catch (error) {
      console.error('[SW] Could not parse push payload:', error);
    }
  }

  // Notification display options
  const options = {
    body:    notifData.body,
    icon:    notifData.icon,
    badge:   notifData.badge,
    data:    notifData.data,        // Passed to notificationclick handler
    vibrate: [200, 100, 200],       // Mobile vibration: on 200ms, off 100ms, on 200ms
    actions: [
      { action: 'open',  title: '📝 Open App' },
      { action: 'close', title: '✕ Dismiss' }
    ]
  };

  // Show the notification
  // event.waitUntil() keeps the Service Worker alive until the notification is shown
  event.waitUntil(
    self.registration.showNotification(notifData.title, options)
  );
});
```

**Why `event.waitUntil()` matters:**

The Service Worker is ephemeral — the browser terminates it when it has nothing to do. `event.waitUntil()` tells the browser "keep this Service Worker alive until this Promise resolves." Without it, the browser might kill the worker before `showNotification()` finishes.

**Notification options reference:**

| Option | Type | Description |
|---|---|---|
| `body` | string | The notification message text |
| `icon` | string | URL to an image shown next to the notification |
| `badge` | string | Small icon shown in the status bar on Android |
| `vibrate` | number[] | Vibration pattern in milliseconds `[on, off, on, ...]` |
| `data` | any | Arbitrary data passed to `notificationclick` handler |
| `actions` | object[] | Up to 2 buttons shown inside the notification (Chrome only) |
| `tag` | string | If set, new notifications with the same tag replace old ones |
| `requireInteraction` | boolean | If true, notification stays until user interacts with it |

---

## 12. Step 8 — Handle Notification Click (sw.js)

When the user clicks the notification (or one of its action buttons), `notificationclick` fires in the Service Worker.

```js
// sw.js

self.addEventListener('notificationclick', (event) => {
  // Close the notification popup
  event.notification.close();

  // If user clicked "Dismiss", do nothing
  if (event.action === 'close') return;

  // For 'open' action or clicking the notification body:
  // Find if the app is already open in a tab, focus it — or open a new tab

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Look for an already-open tab of this app
        for (const client of clientList) {
          if (client.url.includes(self.location.origin)) {
            client.focus();                    // Focus the existing tab
            return client.navigate(urlToOpen); // Navigate to the target URL
          }
        }

        // No existing tab — open a new one
        return self.clients.openWindow(urlToOpen);
      })
  );
});
```

**`event.action`** matches the `action` string you defined in `options.actions`. If the user clicks the notification body itself (not a button), `event.action` is an empty string `""`.

---

## 13. Testing Push Notifications

### In the browser

1. Start the server: `node server.js`
2. Open `http://localhost:3000`
3. Click the 🔔 bell button in the header
4. Click **Allow** in the browser permission dialog
5. Scroll to the **Test Push Notification** section
6. Enter a title and message
7. Click **Send Push Notification**
8. The notification should appear (even if you switch to another tab)

### With curl (command line)

```bash
# Send a notification to all subscribers
curl -X POST http://localhost:3000/send-notification \
     -H "Content-Type: application/json" \
     -d '{"title":"Test from curl","body":"It works!"}'

# Check how many subscribers you have
curl http://localhost:3000/subscriptions/count

# Check the VAPID public key
curl http://localhost:3000/vapid-public-key
```

### Checking Service Worker in Chrome DevTools

1. Open DevTools (F12)
2. Go to the **Application** tab
3. Click **Service Workers** in the left sidebar
4. You should see `sw.js` listed with status **activated and running**
5. Click **Push** to simulate receiving a push (without the server)

---

## 14. What Happens When the App is Offline

Push notifications still work when the app is offline, but with a delay:

```
App is offline
     │
     ▼
Server sends notification → Push Service receives it
                                    │
                                    ▼  (stores it, waits)
                         Device reconnects to internet
                                    │
                                    ▼
                         Push Service delivers the stored notification
                                    │
                                    ▼
                         Service Worker receives 'push' event
                                    │
                                    ▼
                         Notification appears on screen
```

Push Services (Google, Mozilla) hold undelivered messages for a limited time (typically 4 weeks). After that they expire and are discarded. The server never needs to know whether the browser was online — it just sends to the endpoint and the push service handles delivery.

---

## 15. Common Mistakes

### Mistake 1 — No HTTPS (except localhost)

Push notifications require a **secure context**. The page must be served over `https://` or `localhost`. An `http://` server on any other domain will not work.

```
✅ http://localhost:3000      — works (localhost is always trusted)
✅ https://myapp.com          — works
❌ http://192.168.1.10:3000   — does NOT work (not localhost, not HTTPS)
```

If you want to test on your phone over the local network, you need to set up HTTPS (use a tool like `ngrok` to create a temporary HTTPS tunnel).

### Mistake 2 — Regenerating VAPID keys after users have subscribed

```
❌ Wrong: Delete vapid-keys.json and restart the server

Every existing subscription is now invalid.
The server will get 410 Gone errors for all old subscriptions.
Users must re-enable notifications.

✅ Correct: Keep vapid-keys.json and never regenerate in production.
```

### Mistake 3 — Calling `subscribeToPush()` before the Service Worker is ready

```js
// ❌ Wrong — sw.js might not be installed yet
const reg = await navigator.serviceWorker.register('/sw.js');
await reg.pushManager.subscribe(...);  // May fail if sw.js is still installing

// ✅ Correct — wait until the Service Worker is fully active
const reg = await navigator.serviceWorker.ready;  // Resolves only when active
await reg.pushManager.subscribe(...);
```

### Mistake 4 — Not handling expired subscriptions on the server

If a user uninstalls your PWA or clears browser data, their subscription becomes invalid. The next time you try to send to it, the push service returns `410 Gone`.

If you do not clean up these stale subscriptions, your server keeps sending to dead endpoints:

```js
// ✅ Always check for 410/404 after sending and remove stale subscriptions
if (err.statusCode === 410 || err.statusCode === 404) {
  // Remove this subscription from your database
}
```

### Mistake 5 — Using `userVisibleOnly: false`

```js
// ❌ This is rejected by Chrome (and most browsers)
await registration.pushManager.subscribe({
  userVisibleOnly: false,  // NOT allowed
  applicationServerKey: ...
});

// ✅ Always set this to true
await registration.pushManager.subscribe({
  userVisibleOnly: true,  // Required — every push must show a visible notification
  applicationServerKey: ...
});
```

`userVisibleOnly: true` means you promise to show a notification for every push message received. Browsers enforce this — if your `push` event handler does not show a notification, some browsers will show a generic fallback notification.

---

## 16. Quick Reference

### The 8-step VAPID checklist

```
1. [server.js] Generate VAPID keys once → save to vapid-keys.json
2. [server.js] Call webpush.setVapidDetails(email, publicKey, privateKey)
3. [server.js] Serve public key at GET /vapid-public-key
4. [app.js]    Register sw.js as Service Worker
5. [app.js]    Ask user for notification permission
6. [app.js]    Call pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
7. [app.js]    POST the subscription object to POST /subscribe
8. [server.js] Call webpush.sendNotification(subscription, JSON.stringify(payload))
9. [sw.js]     Handle 'push' event → call self.registration.showNotification()
10. [sw.js]    Handle 'notificationclick' event → open or focus the app tab
```

### Server endpoints in this app

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/vapid-public-key` | Returns the VAPID public key for browser subscription |
| `POST` | `/subscribe` | Saves a new push subscription |
| `POST` | `/unsubscribe` | Removes a subscription |
| `POST` | `/send-notification` | Sends a push to all subscribers |
| `GET` | `/subscriptions/count` | Returns number of active subscribers |

### npm package used

```bash
npm install web-push
```

```js
const webpush = require('web-push');

// Generate keys (run once)
const keys = webpush.generateVAPIDKeys();

// Configure
webpush.setVapidDetails('mailto:you@example.com', keys.publicKey, keys.privateKey);

// Send
await webpush.sendNotification(subscriptionObject, JSON.stringify({ title, body }));
```

---

*This tutorial is based on the actual code in `server.js`, `app.js`, and `sw.js` in this project. Read each file alongside this document for the full implementation.*
