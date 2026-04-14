/**
 * app.js — Main application logic for the Todo PWA
 *
 * This file wires everything together:
 *  1. Registers the Service Worker (for offline + push notifications)
 *  2. Handles the PWA install banner
 *  3. Manages push notification subscriptions
 *  4. Handles the Add Todo form (camera, description, location)
 *  5. Renders the todo list from IndexedDB
 *
 * JS Tip for PHP developers:
 *  - document.getElementById('foo') is like getElementById in DOM — gets an HTML element
 *  - addEventListener is like registering an event handler
 *  - async/await is like PHP's synchronous code, but for async operations
 *  - fetch() is like file_get_contents() or cURL for making HTTP requests
 */

// ── State variables ────────────────────────────────────────────────────────────
// These variables hold the current state of the form.
// They live in memory and reset when the page is refreshed.

let currentImageData  = null;   // Base64 string of the selected photo (or null)
let currentLatitude   = null;   // GPS latitude (or null)
let currentLongitude  = null;   // GPS longitude (or null)
let currentLocation   = null;   // Human-readable location text (or null)
let pushSubscription  = null;   // The browser's push subscription object (or null)
let deferredInstallPrompt = null; // Saved install prompt event (for the install banner)

// ── DOM Element References ─────────────────────────────────────────────────────
// We grab all the HTML elements we need once at startup.
// Like storing DB connections — do it once, reuse everywhere.

const form             = document.getElementById('todo-form');
const inputImage       = document.getElementById('input-image');
const imagePreview     = document.getElementById('image-preview');
const imagePreviewWrap = document.getElementById('image-preview-wrapper');
const btnRemoveImage   = document.getElementById('btn-remove-image');
const inputDesc        = document.getElementById('input-desc');
const btnGetLocation   = document.getElementById('btn-get-location');
const locationDisplay  = document.getElementById('location-display');
const locationText     = document.getElementById('location-text');
const btnClearLocation = document.getElementById('btn-clear-location');
const todoList         = document.getElementById('todo-list');
const todoCount        = document.getElementById('todo-count');
const emptyMessage     = document.getElementById('empty-message');
const btnNotify        = document.getElementById('btn-notify');
const installBanner    = document.getElementById('install-banner');
const btnInstall       = document.getElementById('btn-install');
const btnInstallDismiss= document.getElementById('btn-install-dismiss');
const btnSendPush      = document.getElementById('btn-send-push');
const pushStatus       = document.getElementById('push-status');

// ── App Initialization ─────────────────────────────────────────────────────────

/**
 * init()
 * Entry point — runs when the page loads.
 * Sets up all features and loads existing todos.
 */
async function init() {
  console.log('🚀 Todo PWA starting...');

  // Register the Service Worker first (needed for push + offline)
  await registerServiceWorker();

  // Set up the PWA install banner
  setupInstallBanner();

  // Set up form event handlers
  setupFormHandlers();

  // Load and display existing todos from IndexedDB
  await refreshTodoList();

  // Update the notification bell icon based on current permission
  updateNotifyButton();

  console.log('✅ App ready!');
}

// ── Service Worker Registration ────────────────────────────────────────────────

/**
 * registerServiceWorker()
 * Registers sw.js as our Service Worker.
 *
 * A Service Worker is a background script that:
 *  - Caches files so the app works offline
 *  - Receives push notifications from the server
 *
 * Think of it as a proxy server that runs inside the browser.
 * Like Nginx caching — it intercepts requests and serves cached responses.
 */
async function registerServiceWorker() {
  // Check if Service Workers are supported (all modern browsers support them)
  if (!('serviceWorker' in navigator)) {
    console.warn('⚠️ Service Workers not supported in this browser');
    return;
  }

  try {
    // Register sw.js as the service worker for this origin
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log('✅ Service Worker registered:', registration.scope);
  } catch (error) {
    console.error('❌ Service Worker registration failed:', error);
  }
}

// ── PWA Install Banner ─────────────────────────────────────────────────────────

/**
 * setupInstallBanner()
 * Listens for the 'beforeinstallprompt' event.
 *
 * Browsers fire 'beforeinstallprompt' when they detect the site meets PWA criteria:
 *  - Has a manifest.json
 *  - Has a Service Worker
 *  - Served over HTTPS (or localhost)
 *
 * We save the event and use it to show our custom install banner.
 * Without saving it, we can't trigger the install dialog programmatically.
 */
function setupInstallBanner() {
  // 'beforeinstallprompt' fires before the browser shows its own install prompt.
  // We call preventDefault() to suppress the built-in banner so we can show ours.
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); // Stop the browser's default mini-banner

    deferredInstallPrompt = event; // Save for later use
    installBanner.style.display = 'flex'; // Show our custom banner

    console.log('📲 PWA install banner ready');
  });

  // User clicked "Install" in our banner
  btnInstall.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;

    // Show the browser's install dialog
    deferredInstallPrompt.prompt();

    // Wait to see if the user accepted or dismissed
    const { outcome } = await deferredInstallPrompt.userChoice;
    console.log('Install outcome:', outcome);

    // We can only call prompt() once, so clear the saved event
    deferredInstallPrompt = null;
    installBanner.style.display = 'none';
  });

  // User clicked "Later" — hide the banner
  btnInstallDismiss.addEventListener('click', () => {
    installBanner.style.display = 'none';
  });

  // Hide the banner once the app is installed
  window.addEventListener('appinstalled', () => {
    console.log('✅ PWA installed!');
    installBanner.style.display = 'none';
    deferredInstallPrompt = null;
  });
}

// ── Push Notifications ─────────────────────────────────────────────────────────

/**
 * updateNotifyButton()
 * Updates the bell button icon based on notification permission state.
 * Notification.permission can be: 'default', 'granted', or 'denied'
 */
function updateNotifyButton() {
  if (!('Notification' in window)) {
    btnNotify.title = 'Notifications not supported';
    btnNotify.textContent = '🔕';
    return;
  }

  const permission = Notification.permission;
  if (permission === 'granted') {
    btnNotify.textContent = '🔔';
    btnNotify.title = 'Notifications enabled';
  } else if (permission === 'denied') {
    btnNotify.textContent = '🔕';
    btnNotify.title = 'Notifications blocked — allow in browser settings';
  } else {
    btnNotify.textContent = '🔔';
    btnNotify.title = 'Click to enable notifications';
  }
}

/**
 * requestNotificationPermission()
 * Asks the user to allow push notifications.
 * If granted, subscribes the browser to push notifications via the server.
 */
async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    alert('Your browser does not support notifications.');
    return;
  }

  if (Notification.permission === 'denied') {
    alert('Notifications are blocked. Please allow them in your browser settings.');
    return;
  }

  // Ask the user for permission. This shows the browser's permission dialog.
  // We can only ask once — if denied, we can't ask again programmatically.
  const permission = await Notification.requestPermission();
  console.log('Notification permission:', permission);

  updateNotifyButton();

  if (permission === 'granted') {
    await subscribeToPush(); // Subscribe to receive server-sent push notifications
  }
}

/**
 * subscribeToPush()
 * Registers this browser with our server to receive push notifications.
 *
 * How push notifications work:
 *  1. Browser generates a unique "subscription" object containing:
 *     - endpoint: a URL at Google/Mozilla/Apple push service
 *     - encryption keys (p256dh, auth)
 *  2. We send this subscription to our server (POST /subscribe)
 *  3. Server stores it
 *  4. When server calls webpush.sendNotification(), it sends to that endpoint URL
 *  5. The push service (Google etc.) delivers it to the browser
 *  6. Browser wakes up our service worker which shows the notification
 */
async function subscribeToPush() {
  try {
    // Get the service worker registration
    const registration = await navigator.serviceWorker.ready;

    // Check if already subscribed
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      console.log('✅ Already subscribed to push');
      pushSubscription = existing;
      return;
    }

    // Fetch the VAPID public key from our server.
    // The browser needs this to create the subscription.
    const response  = await fetch('/vapid-public-key');
    const { publicKey } = await response.json();

    // Subscribe to push notifications.
    // urlBase64ToUint8Array() converts the public key to the format browsers expect.
    pushSubscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,  // Required: notifications must be shown to the user
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });

    console.log('📬 Push subscription created:', pushSubscription.endpoint.slice(0, 50) + '...');

    // Send the subscription to our server so it knows where to send notifications
    await fetch('/subscribe', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(pushSubscription)
    });

    console.log('✅ Subscription saved to server');
    alert('🔔 Notifications enabled! You will receive push notifications.');

  } catch (error) {
    console.error('❌ Push subscription failed:', error);
    alert('Failed to enable notifications: ' + error.message);
  }
}

/**
 * urlBase64ToUint8Array(base64String)
 * Converts a URL-safe Base64 string to a Uint8Array.
 *
 * This is a required conversion for the push subscription API.
 * The VAPID public key comes as a Base64 string, but the browser
 * needs it as a binary array (Uint8Array).
 *
 * You don't need to understand this deeply — it's boilerplate code
 * that every PWA uses.
 *
 * @param {string} base64String - URL-safe Base64 encoded string
 * @returns {Uint8Array}
 */
function urlBase64ToUint8Array(base64String) {
  // URL-safe Base64 uses '-' and '_' instead of '+' and '/'
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);    // Decode Base64 to raw binary string
  const output  = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i);   // Convert each char to its char code
  }

  return output;
}

// ── Form Handlers ──────────────────────────────────────────────────────────────

/**
 * setupFormHandlers()
 * Attaches event listeners to all form elements.
 */
function setupFormHandlers() {

  // ── Camera / Image ────────────────────────────────────────────────────────

  // When user selects an image file (or takes a photo)
  inputImage.addEventListener('change', handleImageSelect);

  // Remove photo button
  btnRemoveImage.addEventListener('click', clearImage);

  // ── Location ──────────────────────────────────────────────────────────────

  // Get location button
  btnGetLocation.addEventListener('click', getLocation);

  // Clear location button
  btnClearLocation.addEventListener('click', clearLocation);

  // ── Form Submit ───────────────────────────────────────────────────────────

  form.addEventListener('submit', handleFormSubmit);

  // ── Notification Button ───────────────────────────────────────────────────

  btnNotify.addEventListener('click', requestNotificationPermission);

  // ── Push Test Panel ───────────────────────────────────────────────────────

  btnSendPush.addEventListener('click', sendTestPushNotification);
}

/**
 * handleImageSelect(event)
 * Called when the user selects a photo from camera or file picker.
 * Converts the image to a Base64 string and shows a preview.
 *
 * We store images as Base64 strings in IndexedDB.
 * Base64 is a way to represent binary data (like images) as text.
 * Like: base64_encode(file_get_contents('photo.jpg')) in PHP.
 */
function handleImageSelect(event) {
  const file = event.target.files[0]; // Get the first selected file

  if (!file) return; // User cancelled

  // FileReader reads files from the user's device.
  // It's asynchronous — the result arrives in an event callback.
  const reader = new FileReader();

  // readAsDataURL converts the file to: "data:image/jpeg;base64,/9j/4AAQSkZ..."
  reader.readAsDataURL(file);

  reader.onload = (e) => {
    currentImageData = e.target.result; // Save the Base64 string

    // Show the preview image
    imagePreview.src = currentImageData;
    imagePreviewWrap.style.display = 'flex';

    console.log('📷 Image selected, size:', Math.round(currentImageData.length / 1024), 'KB');
  };

  reader.onerror = () => {
    console.error('Error reading image file');
    alert('Could not read the image. Please try again.');
  };
}

/**
 * clearImage()
 * Removes the selected photo and hides the preview.
 */
function clearImage() {
  currentImageData = null;
  inputImage.value = ''; // Reset the file input
  imagePreview.src = '';
  imagePreviewWrap.style.display = 'none';
}

/**
 * getLocation()
 * Uses the browser's Geolocation API to get the user's current position.
 * Requires the user to allow location access (like PHP's $_SERVER has no location).
 */
function getLocation() {
  // Check if Geolocation is supported
  if (!('geolocation' in navigator)) {
    alert('Geolocation is not supported by your browser.');
    return;
  }

  // Show loading state on the button
  btnGetLocation.disabled = true;
  btnGetLocation.textContent = '⏳ Getting location...';

  /**
   * getCurrentPosition() is asynchronous — it shows a permission dialog,
   * then calls our callback with the position data.
   */
  navigator.geolocation.getCurrentPosition(
    // Success callback — called with a Position object
    (position) => {
      currentLatitude  = position.coords.latitude;
      currentLongitude = position.coords.longitude;
      currentLocation  = `${currentLatitude.toFixed(5)}, ${currentLongitude.toFixed(5)}`;

      // Show the coordinates
      locationText.textContent = `📍 ${currentLocation}`;
      locationDisplay.style.display = 'flex';

      // Reset button
      btnGetLocation.disabled = false;
      btnGetLocation.textContent = '📍 Get My Location';

      console.log(`📍 Location: ${currentLocation}`);
    },

    // Error callback — called if location failed or was denied
    (error) => {
      btnGetLocation.disabled = false;
      btnGetLocation.textContent = '📍 Get My Location';

      // error.code tells us why it failed
      const messages = {
        1: 'Location access denied. Please allow it in your browser.',
        2: 'Location unavailable. Try again.',
        3: 'Location request timed out. Try again.'
      };

      alert(messages[error.code] || 'Could not get location.');
      console.error('Geolocation error:', error);
    },

    // Options
    {
      enableHighAccuracy: true, // Use GPS if available (more accurate but slower)
      timeout: 10000,           // Give up after 10 seconds
      maximumAge: 60000         // Accept a cached position up to 1 minute old
    }
  );
}

/**
 * clearLocation()
 * Clears the current location data.
 */
function clearLocation() {
  currentLatitude  = null;
  currentLongitude = null;
  currentLocation  = null;
  locationDisplay.style.display = 'none';
  locationText.textContent = '';
}

/**
 * handleFormSubmit(event)
 * Called when the "Add Todo" button is clicked.
 * Validates the form, saves the todo to IndexedDB, refreshes the list.
 */
async function handleFormSubmit(event) {
  event.preventDefault(); // Prevent the default form submission (page reload)

  const description = inputDesc.value.trim();

  // Basic validation — description is required
  if (!description) {
    alert('Please enter a description for your todo.');
    inputDesc.focus();
    return;
  }

  // Build the todo object (like a PHP associative array)
  const todo = {
    id:           Date.now(),         // Use current timestamp as unique ID
    description:  description,
    imageData:    currentImageData,   // Base64 image or null
    latitude:     currentLatitude,
    longitude:    currentLongitude,
    locationName: currentLocation,
    createdAt:    new Date().toISOString(), // ISO format: "2024-01-15T10:30:00.000Z"
    done:         false
  };

  try {
    // Save to IndexedDB (defined in db.js)
    await addTodo(todo);

    // Clear the form for the next todo
    resetForm();

    // Reload and display the updated list
    await refreshTodoList();

    // Auto-send a push notification to let the user know the todo was added
    // This simulates a real-world scenario (e.g., task created → team gets notified)
    sendPushForNewTodo(todo.description);

    console.log('✅ Todo added:', todo);

  } catch (error) {
    console.error('Error adding todo:', error);
    alert('Could not save your todo. Please try again.');
  }
}

/**
 * resetForm()
 * Clears all form fields after a todo is added.
 */
function resetForm() {
  inputDesc.value = '';
  clearImage();
  clearLocation();
}

// ── Todo List Rendering ────────────────────────────────────────────────────────

/**
 * refreshTodoList()
 * Loads all todos from IndexedDB and renders them to the page.
 */
async function refreshTodoList() {
  try {
    const todos = await getAllTodos(); // From db.js

    // Update the count badge
    todoCount.textContent = todos.length;

    // Show/hide the empty state message
    emptyMessage.style.display = todos.length === 0 ? 'block' : 'none';

    // Clear the current list
    todoList.innerHTML = '';

    // Render each todo
    todos.forEach(todo => {
      const element = createTodoElement(todo);
      todoList.appendChild(element);
    });

  } catch (error) {
    console.error('Error loading todos:', error);
  }
}

/**
 * createTodoElement(todo)
 * Creates an HTML element for a single todo item.
 * This is like building HTML strings in PHP, but using DOM methods instead.
 *
 * @param {Object} todo - The todo object from IndexedDB
 * @returns {HTMLElement} The div element to append to the list
 */
function createTodoElement(todo) {
  const div = document.createElement('div');
  div.className = 'todo-item' + (todo.done ? ' todo-item--done' : '');
  div.dataset.id = todo.id; // Store the ID as a data attribute for easy access

  // ── Build the inner HTML ────────────────────────────────────────────────
  // We construct the HTML as a string, then set div.innerHTML.
  // (Alternatively you could use appendChild() for each element.)

  let html = '';

  // Photo (if the todo has one)
  if (todo.imageData) {
    // We use the stored Base64 string directly as the image src
    html += `<img class="todo-item__image" src="${todo.imageData}" alt="Todo photo">`;
  }

  // Description
  html += `<p class="todo-item__desc">${escapeHtml(todo.description)}</p>`;

  // Metadata (date + location)
  html += '<div class="todo-item__meta">';
  html += `<span>🕐 ${formatDate(todo.createdAt)}</span>`;
  if (todo.locationName) {
    // Make it a link to Google Maps if we have coordinates
    if (todo.latitude && todo.longitude) {
      html += `<a href="https://maps.google.com/?q=${todo.latitude},${todo.longitude}" target="_blank" rel="noopener">
                 📍 ${escapeHtml(todo.locationName)}
               </a>`;
    } else {
      html += `<span>📍 ${escapeHtml(todo.locationName)}</span>`;
    }
  }
  html += '</div>';

  // Action buttons
  html += '<div class="todo-item__actions">';

  // Toggle done/undone button
  const doneLabel = todo.done ? '↩️ Undo' : '✅ Done';
  html += `<button class="btn btn--primary btn--sm" onclick="toggleDone(${todo.id})">${doneLabel}</button>`;

  // Delete button
  html += `<button class="btn btn--danger btn--sm" onclick="removeTodo(${todo.id})">🗑️ Delete</button>`;

  html += '</div>';

  div.innerHTML = html;
  return div;
}

/**
 * toggleDone(id)
 * Marks a todo as done or undone.
 * Called by the "Done" / "Undo" buttons inside each todo item.
 *
 * @param {number} id - The todo's ID
 */
async function toggleDone(id) {
  try {
    // Get all todos and find this one
    const todos = await getAllTodos();
    const todo  = todos.find(t => t.id === id);

    if (!todo) return;

    // Toggle the done status
    await updateTodo(id, { done: !todo.done });

    // Refresh the display
    await refreshTodoList();

  } catch (error) {
    console.error('Error toggling todo:', error);
  }
}

/**
 * removeTodo(id)
 * Deletes a todo after confirmation.
 * Called by the "Delete" button inside each todo item.
 *
 * @param {number} id - The todo's ID
 */
async function removeTodo(id) {
  // Confirm before deleting (like a browser confirm() dialog)
  if (!confirm('Delete this todo?')) return;

  try {
    await deleteTodo(id); // From db.js
    await refreshTodoList();
  } catch (error) {
    console.error('Error deleting todo:', error);
    alert('Could not delete the todo. Please try again.');
  }
}

// ── Push Notification Helpers ──────────────────────────────────────────────────

/**
 * sendPushForNewTodo(description)
 * Sends a push notification to all subscribers when a new todo is added.
 * Fires silently in the background — no UI update needed here.
 *
 * @param {string} description - The new todo's description
 */
async function sendPushForNewTodo(description) {
  try {
    await fetch('/send-notification', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        title: '✅ New Todo Added',
        body:  description.length > 60 ? description.slice(0, 57) + '...' : description,
        data:  { url: '/' }
      })
    });
  } catch (error) {
    // Silently fail — push notification is optional
    console.warn('Could not send push notification:', error.message);
  }
}

/**
 * sendTestPushNotification()
 * Called by the "Send Push Notification" test button.
 * Lets you manually trigger a push notification to test the flow.
 */
async function sendTestPushNotification() {
  const title = document.getElementById('push-title').value.trim() || 'Todo PWA';
  const body  = document.getElementById('push-body').value.trim()  || 'Test notification!';

  // Show loading state
  btnSendPush.disabled = true;
  pushStatus.textContent = '⏳ Sending...';
  pushStatus.className   = 'push-status';

  try {
    const response = await fetch('/send-notification', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ title, body })
    });

    const result = await response.json();

    if (result.sent > 0) {
      pushStatus.textContent = `✅ Sent to ${result.sent} subscriber(s)!`;
      pushStatus.className   = 'push-status push-status--success';
    } else {
      pushStatus.textContent = '⚠️ No subscribers yet. Enable notifications first (🔔 button).';
      pushStatus.className   = 'push-status push-status--error';
    }

  } catch (error) {
    pushStatus.textContent = '❌ Error: ' + error.message;
    pushStatus.className   = 'push-status push-status--error';
    console.error('Push send error:', error);
  }

  btnSendPush.disabled = false;
}

// ── Utility Functions ──────────────────────────────────────────────────────────

/**
 * escapeHtml(text)
 * Prevents XSS (Cross-Site Scripting) attacks by escaping HTML characters.
 * Always escape user-provided text before inserting into innerHTML!
 * Like htmlspecialchars() in PHP.
 *
 * @param {string} text - Raw user input
 * @returns {string} Safe HTML string
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}

/**
 * formatDate(isoString)
 * Formats an ISO date string into a human-readable format.
 * Like PHP's date('M j, Y g:i A', strtotime($date)).
 *
 * @param {string} isoString - ISO 8601 date string
 * @returns {string} Formatted date like "Jan 15, 2024 10:30 AM"
 */
function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
}

// ── Start the App ──────────────────────────────────────────────────────────────
// Run init() when the DOM is fully loaded.
// Like PHP's register_shutdown_function(), but for "DOM ready" instead of shutdown.
document.addEventListener('DOMContentLoaded', init);
