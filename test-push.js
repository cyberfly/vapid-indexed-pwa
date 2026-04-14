/**
 * test-push.js — Manual push notification trigger
 *
 * Run this script to send a push notification to all subscribers.
 * Usage:
 *   node test-push.js
 *   node test-push.js "My Title" "My message body"
 *
 * Arguments (optional):
 *   1st arg = notification title
 *   2nd arg = notification body
 *
 * Example:
 *   node test-push.js "Reminder" "Don't forget your todos!"
 */

const http = require('http'); // Built-in Node.js HTTP module — no npm install needed

// ── Read optional command-line arguments ──────────────────────────────────────
// process.argv = ['node', 'test-push.js', 'title?', 'body?']
const title = process.argv[2] || 'Hello from Node!';
const body  = process.argv[3] || 'Manual push notification triggered successfully.';

// ── Build the payload ─────────────────────────────────────────────────────────
const payload = JSON.stringify({ title, body });

console.log('📣 Sending push notification...');
console.log(`   Title : ${title}`);
console.log(`   Body  : ${body}`);
console.log('');

// ── Send the HTTP request to our server ───────────────────────────────────────
const req = http.request(
  {
    hostname: 'localhost',
    port:     process.env.PORT || 4000,
    path:     '/send-notification',
    method:   'POST',
    headers:  {
      'Content-Type':   'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  },
  (res) => {
    // Collect the response data (arrives in chunks)
    let data = '';
    res.on('data', chunk => { data += chunk; });

    // When all chunks received, parse and display the result
    res.on('end', () => {
      const result = JSON.parse(data);

      if (result.sent > 0) {
        console.log(`✅ Sent to ${result.sent} subscriber(s)!`);
      } else {
        console.log('⚠️  No subscribers found.');
        console.log('   → Open http://localhost:3000 in the browser');
        console.log('   → Click the 🔔 bell button and allow notifications');
        console.log('   → Then run this script again');
      }

      if (result.failed > 0) {
        console.log(`❌ Failed: ${result.failed} (stale subscriptions removed)`);
      }
    });
  }
);

// Handle connection errors (e.g. server not running)
req.on('error', (err) => {
  if (err.code === 'ECONNREFUSED') {
    console.error('❌ Could not connect to server.');
    console.error('   → Make sure the server is running: node server.js');
  } else {
    console.error('❌ Error:', err.message);
  }
});

// Send the payload and end the request
req.write(payload);
req.end();
