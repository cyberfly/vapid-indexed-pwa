# Todo PWA — VAPID Push Notification + IndexedDB Demo

A simple Todo app built as a **Progressive Web App (PWA)** to demonstrate two key browser technologies:

- **IndexedDB** — store todos locally in the browser (works offline)
- **VAPID Push Notifications** — server sends push notifications to the browser via Node.js

Built with plain HTML, CSS, and JavaScript — no frameworks. Ideal for developers learning PWA concepts.

---

## Features

- Add todos with a **photo** (camera or file picker), **description**, and **GPS location**
- Data stored in **IndexedDB** — persists across page reloads and browser restarts
- Works completely **offline** (Service Worker caches all assets)
- **Install banner** — prompts user to add the app to their home screen / desktop
- **VAPID push notifications** — Node.js server sends real push notifications to the browser
- Mark todos as done / undo, delete todos

---

## Demo: What We Are Showing

### 1. IndexedDB
Every todo you add is saved directly in the **browser's built-in database** — no server needed for storage. Close the tab, reopen it — your todos are still there. This is what makes the app work offline.

> See the full walkthrough: **[INDEXEDDB-TUTORIAL.md](./INDEXEDDB-TUTORIAL.md)**

### 2. VAPID Push Notifications
When you add a todo, the browser sends the subscription to a **Node.js server**. The server uses VAPID (an open web standard) to push a notification back to the browser — even if the app tab is closed.

> See the full walkthrough: **[VAPID-TUTORIAL.md](./VAPID-TUTORIAL.md)**

---

## Project Structure

```
vapid-indexed-pwa/
├── index.html              — Main app UI
├── style.css               — Styles
├── app.js                  — App logic (SW registration, push subscribe, form, render)
├── db.js                   — IndexedDB helper (open, add, read, update, delete)
├── sw.js                   — Service Worker (offline cache + push event handler)
├── manifest.json           — PWA manifest (name, icons, display mode)
├── server.js               — Node.js server (VAPID keys, subscriptions, send push)
├── test-push.js            — Script to manually trigger a push notification
├── generate-icons.js       — Generates PNG icons for the manifest
├── icons/                  — App icons (SVG + PNG)
├── INDEXEDDB-TUTORIAL.md   — Step-by-step IndexedDB tutorial
└── VAPID-TUTORIAL.md       — Step-by-step VAPID push notification tutorial
```

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Start the server

```bash
node server.js
```

Output:
```
🔑 Generated new VAPID keys and saved to vapid-keys.json

🚀 Todo PWA Server running!
   Open in browser: http://localhost:4000
```

VAPID keys are **auto-generated** on first run and saved to `vapid-keys.json`.

### 3. Open the app

Go to **http://localhost:4000** in Chrome or Edge.

### 4. Enable push notifications

Click the **🔔 bell** icon in the top right corner and click **Allow**.

### 5. Add a todo

Fill in a description, optionally take a photo and get your location, then click **Add Todo**.

---

## Demo: Trigger a Push Notification from Node.js

After enabling notifications in the browser, open a second terminal and run:

```bash
node test-push.js
```

Or with a custom message:

```bash
node test-push.js "Reminder" "Don't forget your todos!"
```

The notification will appear on your screen — even if the app tab is not focused.

You can also use the **Test Push Notification** panel inside the app, or trigger it with curl:

```bash
curl -X POST http://localhost:4000/send-notification \
     -H "Content-Type: application/json" \
     -d '{"title":"Hello","body":"Push from curl!"}'
```

---

## How It Works

```
User adds a todo
      │
      ├── Saved to IndexedDB (browser database)     ← db.js
      │
      └── POST /send-notification → Node.js server  ← server.js
                │
                └── webpush.sendNotification()
                          │
                          └── Google/Mozilla Push Service
                                    │
                                    └── Service Worker receives 'push' event  ← sw.js
                                                │
                                                └── Shows notification on screen
```

---

## Tutorials

| Tutorial | Description |
|---|---|
| [INDEXEDDB-TUTORIAL.md](./INDEXEDDB-TUTORIAL.md) | Learn how IndexedDB works — concepts, CRUD operations, SQL comparisons, Chrome DevTools inspection |
| [VAPID-TUTORIAL.md](./VAPID-TUTORIAL.md) | Learn how VAPID push works — key generation, browser subscription, sending from Node.js, Service Worker handler |

Both tutorials are written for developers with a PHP/MySQL background who are new to browser APIs.

---

## Server API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/vapid-public-key` | Returns the VAPID public key for browser subscription |
| `POST` | `/subscribe` | Saves a new push subscription |
| `POST` | `/unsubscribe` | Removes a push subscription |
| `POST` | `/send-notification` | Sends a push to all subscribers |
| `GET` | `/subscriptions/count` | Returns number of active subscribers |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML, CSS, JavaScript |
| Storage | IndexedDB (browser built-in) |
| Offline | Service Worker + Cache API |
| Backend | Node.js + Express |
| Push | VAPID via `web-push` npm package |

---

## Requirements

- Node.js 16+
- Chrome, Edge, or Firefox (push notifications not supported in Safari on desktop)
- Must be served from `localhost` or `https://` — push notifications require a secure context
