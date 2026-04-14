/**
 * server.js — Node.js backend for the Todo PWA
 *
 * What this file does:
 *  1. Serves all the PWA files (HTML, CSS, JS, icons)
 *  2. Generates and stores VAPID keys (used to send push notifications)
 *  3. Stores browser push subscriptions (who to notify)
 *  4. Has an endpoint to send a push notification to all subscribers
 *
 * Think of VAPID like an API key pair:
 *  - Public key  → given to the browser so it can subscribe
 *  - Private key → kept on the server to sign/send notifications
 */

const express   = require('express');   // Web framework (like Laravel's routing)
const webpush   = require('web-push');  // Library for sending push notifications
const cors      = require('cors');      // Allows browser to talk to this server
const fs        = require('fs');        // Built-in: read/write files
const path      = require('path');      // Built-in: work with file paths

const app  = express();
const PORT = 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());                          // Allow all cross-origin requests
app.use(express.json());                  // Parse JSON request bodies
app.use(express.static(__dirname));       // Serve all files in this folder as static

// ─── VAPID Key Management ─────────────────────────────────────────────────────
// VAPID keys identify your server to push services (like Google FCM, Mozilla, etc.)
// We auto-generate them on first run and save to a file so they persist.

const KEYS_FILE          = path.join(__dirname, 'vapid-keys.json');
const SUBSCRIPTIONS_FILE = path.join(__dirname, 'subscriptions.json');

/**
 * loadOrGenerateVapidKeys()
 * Reads saved VAPID keys from file, or generates new ones if the file doesn't exist.
 * Returns an object with { publicKey, privateKey }
 */
function loadOrGenerateVapidKeys() {
  if (fs.existsSync(KEYS_FILE)) {
    // Keys already exist — load them
    console.log('✅ Loaded existing VAPID keys from vapid-keys.json');
    return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
  }

  // First run — generate a new key pair
  const keys = webpush.generateVAPIDKeys();
  fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));
  console.log('🔑 Generated new VAPID keys and saved to vapid-keys.json');
  console.log('   Public Key:', keys.publicKey);
  return keys;
}

const vapidKeys = loadOrGenerateVapidKeys();

// Tell web-push library which keys to use when sending notifications
webpush.setVapidDetails(
  'mailto:admin@example.com',  // Contact email (required by spec)
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// ─── Subscription Storage ─────────────────────────────────────────────────────
// Subscriptions are objects the browser gives us after the user says "allow notifications"
// We save them to a file so they survive server restarts.

/**
 * loadSubscriptions()
 * Reads saved push subscriptions from file.
 * Returns an array of subscription objects.
 */
function loadSubscriptions() {
  if (fs.existsSync(SUBSCRIPTIONS_FILE)) {
    return JSON.parse(fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf8'));
  }
  return []; // No subscriptions yet
}

/**
 * saveSubscriptions(subscriptions)
 * Writes the subscriptions array to a JSON file.
 */
function saveSubscriptions(subscriptions) {
  fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(subscriptions, null, 2));
}

// Keep subscriptions in memory for fast access
let subscriptions = loadSubscriptions();

// ─── API Routes ───────────────────────────────────────────────────────────────

/**
 * GET /vapid-public-key
 * The browser needs the public key to set up a push subscription.
 * This endpoint sends it.
 */
app.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: vapidKeys.publicKey });
});

/**
 * POST /subscribe
 * Called when a user enables push notifications in the browser.
 * The browser sends us a "subscription" object containing:
 *  - endpoint: a URL at Google/Mozilla/etc. to send the push to
 *  - keys.auth / keys.p256dh: encryption keys so only we can send to this browser
 */
app.post('/subscribe', (req, res) => {
  const subscription = req.body;

  // Check if this subscription already exists (avoid duplicates)
  const exists = subscriptions.some(s => s.endpoint === subscription.endpoint);

  if (!exists) {
    subscriptions.push(subscription);
    saveSubscriptions(subscriptions);
    console.log(`📬 New subscription saved. Total: ${subscriptions.length}`);
  }

  res.status(201).json({ message: 'Subscribed successfully' });
});

/**
 * POST /unsubscribe
 * Called when a user turns off notifications.
 * We remove their subscription so we don't try to send to them anymore.
 */
app.post('/unsubscribe', (req, res) => {
  const { endpoint } = req.body;

  // Filter out the subscription with this endpoint
  subscriptions = subscriptions.filter(s => s.endpoint !== endpoint);
  saveSubscriptions(subscriptions);

  console.log(`🚫 Subscription removed. Total: ${subscriptions.length}`);
  res.json({ message: 'Unsubscribed successfully' });
});

/**
 * POST /send-notification
 * Sends a push notification to ALL subscribed browsers.
 * Body: { title, body, icon, data }
 *
 * You can test this with curl:
 *   curl -X POST http://localhost:3000/send-notification \
 *        -H "Content-Type: application/json" \
 *        -d '{"title":"Hello!","body":"Test notification"}'
 */
app.post('/send-notification', async (req, res) => {
  const { title = 'Todo PWA', body = 'You have a notification!', icon, data } = req.body;

  // Build the notification payload (must be a string)
  const payload = JSON.stringify({ title, body, icon: icon || '/icons/icon.svg', data });

  console.log(`📣 Sending notification to ${subscriptions.length} subscribers...`);

  // Send to each subscriber — use Promise.allSettled so one failure doesn't stop others
  const results = await Promise.allSettled(
    subscriptions.map(subscription => webpush.sendNotification(subscription, payload))
  );

  // Remove subscriptions that are no longer valid (browser uninstalled the app, etc.)
  const invalidEndpoints = [];
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      const err = result.reason;
      // Status 410 = Gone (subscription expired/cancelled)
      if (err.statusCode === 410 || err.statusCode === 404) {
        invalidEndpoints.push(subscriptions[index].endpoint);
        console.log(`  ❌ Removed invalid subscription: ${subscriptions[index].endpoint.slice(0, 50)}...`);
      }
    }
  });

  // Clean up invalid subscriptions
  if (invalidEndpoints.length > 0) {
    subscriptions = subscriptions.filter(s => !invalidEndpoints.includes(s.endpoint));
    saveSubscriptions(subscriptions);
  }

  const sent    = results.filter(r => r.status === 'fulfilled').length;
  const failed  = results.filter(r => r.status === 'rejected').length;

  console.log(`  ✅ Sent: ${sent}, ❌ Failed: ${failed}`);
  res.json({ sent, failed, total: subscriptions.length });
});

/**
 * GET /subscriptions/count
 * Returns how many push subscriptions are currently stored.
 * Useful for debugging.
 */
app.get('/subscriptions/count', (req, res) => {
  res.json({ count: subscriptions.length });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('\n🚀 Todo PWA Server running!');
  console.log(`   Open in browser: http://localhost:${PORT}`);
  console.log(`   Send test push:  POST http://localhost:${PORT}/send-notification`);
  console.log('\n   Test with curl:');
  console.log(`   curl -X POST http://localhost:${PORT}/send-notification \\`);
  console.log(`        -H "Content-Type: application/json" \\`);
  console.log(`        -d '{"title":"Test","body":"Hello from server!"}'`);
  console.log('');
});
