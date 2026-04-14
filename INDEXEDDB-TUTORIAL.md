# IndexedDB Tutorial — Todo PWA

A beginner-friendly guide to IndexedDB using the actual code in this project.
Written for developers who know PHP/MySQL but are new to browser storage.

---

## Table of Contents

1. [What is IndexedDB?](#1-what-is-indexeddb)
2. [IndexedDB vs Other Storage Options](#2-indexeddb-vs-other-storage-options)
3. [Core Concepts](#3-core-concepts)
4. [How This App Uses IndexedDB](#4-how-this-app-uses-indexeddb)
5. [Step 1 — Opening the Database](#5-step-1--opening-the-database)
6. [Step 2 — Creating the Schema (onupgradeneeded)](#6-step-2--creating-the-schema-onupgradeneeded)
7. [Step 3 — Inserting a Record (addTodo)](#7-step-3--inserting-a-record-addtodo)
8. [Step 4 — Reading All Records (getAllTodos)](#8-step-4--reading-all-records-getalltodos)
9. [Step 5 — Updating a Record (updateTodo)](#9-step-5--updating-a-record-updatetodo)
10. [Step 6 — Deleting a Record (deleteTodo)](#10-step-6--deleting-a-record-deletetodo)
11. [How app.js Calls db.js](#11-how-appjs-calls-dbjs)
12. [Inspecting IndexedDB in Chrome DevTools](#12-inspecting-indexeddb-in-chrome-devtools)
13. [Common Mistakes](#13-common-mistakes)
14. [Quick Reference — SQL vs IndexedDB](#14-quick-reference--sql-vs-indexeddb)

---

## 1. What is IndexedDB?

IndexedDB is a **database built into the browser**. It stores data permanently on the user's device — data survives page refreshes and even closing the browser.

Think of it as SQLite, but instead of a `.sqlite` file on your server, it lives inside the browser itself.

```
PHP + MySQL (server-side)          IndexedDB (browser-side)
──────────────────────────         ─────────────────────────
Server holds the data              Browser holds the data
Lost if server crashes             Lost if user clears browser data
All users share the same DB        Each user has their own DB
Requires internet to read          Works completely offline
```

In this PWA, every todo you add is saved to IndexedDB. When you reload the page — or even go offline — your todos are still there, because they are stored locally in the browser.

---

## 2. IndexedDB vs Other Storage Options

The browser offers several storage mechanisms. Here is when to use each:

| Storage | Size Limit | Structured Data | Offline | Use For |
|---|---|---|---|---|
| `localStorage` | ~5 MB | No (strings only) | Yes | Simple key-value settings |
| `sessionStorage` | ~5 MB | No (strings only) | No | Temporary session data |
| Cookies | ~4 KB | No | Partial | Auth tokens, server communication |
| **IndexedDB** | **Hundreds of MB** | **Yes (objects, blobs)** | **Yes** | **Complex app data, files, images** |
| Cache API | Large | No (HTTP responses) | Yes | Caching assets for Service Worker |

IndexedDB is the right choice for this app because:

- Todos are structured objects (description, image, location, date)
- Images (Base64 strings) can be large — `localStorage` would not fit them
- Data must survive page refreshes and browser restarts
- App must work offline (no server database available)

---

## 3. Core Concepts

Before reading the code, understand these terms. Each maps to something you already know from MySQL.

| IndexedDB Term | MySQL Equivalent | Description |
|---|---|---|
| **Database** | Database | The top-level container. Has a name and version number. |
| **Object Store** | Table | Stores records of the same type. |
| **Record** | Row | A single JavaScript object (like a PHP associative array). |
| **Key / keyPath** | Primary Key | The unique identifier for each record. |
| **Index** | INDEX | An extra lookup field for faster queries. |
| **Transaction** | Transaction | A group of operations that succeed or fail together. |
| **Cursor** | Cursor / result set iteration | Iterates over many records one by one. |

**The transaction model is important.** Every read or write must happen inside a transaction, just like `BEGIN TRANSACTION` / `COMMIT` in SQL. If any operation inside a transaction fails, all changes are rolled back.

Transactions have two modes:

- `'readonly'` — for SELECT queries (faster, can run in parallel)
- `'readwrite'` — for INSERT, UPDATE, DELETE (exclusive access)

---

## 4. How This App Uses IndexedDB

All IndexedDB code lives in `db.js`. The file exports four functions used by `app.js`:

```
db.js                           app.js
─────────────────────────────   ─────────────────────────────────────
openDatabase()           ←──    (called internally by every function)
addTodo(todo)            ←──    handleFormSubmit()
getAllTodos()             ←──    refreshTodoList()
updateTodo(id, changes)  ←──    toggleDone()
deleteTodo(id)           ←──    removeTodo()
```

The database structure (schema) looks like this:

```
Database: "TodoPWA"  (version 1)
└── Object Store: "todos"
    ├── keyPath: "id"           ← Primary key (we set this to Date.now())
    ├── index: "createdAt"      ← Secondary index for sorting
    └── Records:
        ├── { id: 1776144188950, description: "Buy groceries", done: true,  ... }
        └── { id: 1776144209041, description: "Read PWA docs",  done: false, ... }
```

Each todo record is a plain JavaScript object:

```js
{
  id:           1776144188950,          // Number — unique ID (timestamp)
  description:  "Buy groceries",        // String — the todo text
  imageData:    "data:image/jpeg;...",  // String — Base64 photo, or null
  latitude:     14.5995,                // Number — GPS latitude, or null
  longitude:    120.9842,               // Number — GPS longitude, or null
  locationName: "14.59950, 120.98420",  // String — human-readable, or null
  createdAt:    "2026-04-14T05:23:08Z", // String — ISO 8601 date
  done:         false                   // Boolean — completion status
}
```

---

## 5. Step 1 — Opening the Database

**File:** `db.js`, function `openDatabase()`

Before you can read or write anything, you must open a connection to the database. This is like `new PDO(...)` in PHP.

```js
// db.js
const DB_NAME    = 'TodoPWA';  // Database name — like the MySQL database name
const DB_VERSION = 1;          // Schema version — increase this to trigger migrations
const STORE_NAME = 'todos';    // Object store name — like a table name

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onsuccess = (event) => {
      resolve(event.target.result);  // Return the database connection
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };

    request.onupgradeneeded = (event) => {
      // This runs when the DB is created for the first time,
      // or when DB_VERSION increases. See Step 2.
    };
  });
}
```

**Key points:**

- `indexedDB.open()` does not return data directly — it returns a **request object**
- Results arrive through event callbacks: `onsuccess`, `onerror`, `onupgradeneeded`
- We wrap it in a `Promise` so callers can use `await` instead of nested callbacks
- The database is created automatically if it does not exist yet

**Version numbers matter.** If you change `DB_VERSION` from `1` to `2`, the browser detects the version mismatch and fires `onupgradeneeded` again — this is how you run schema migrations (adding new object stores or indexes).

---

## 6. Step 2 — Creating the Schema (onupgradeneeded)

**File:** `db.js`, inside `openDatabase()`, the `onupgradeneeded` handler

`onupgradeneeded` is where you define your schema. It is equivalent to a `CREATE TABLE` migration in SQL. It only runs:

- The very first time the app opens (database does not exist yet)
- When `DB_VERSION` increases (schema migration)

```js
request.onupgradeneeded = (event) => {
  const db = event.target.result;

  // Only create the store if it does not already exist
  // (important during migrations — you might not want to recreate everything)
  if (!db.objectStoreNames.contains(STORE_NAME)) {

    // Create the "todos" object store.
    // keyPath: 'id' means every record must have an 'id' field — that is the primary key.
    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });

    // Create a secondary index on 'createdAt'.
    // This lets us query/sort by date efficiently.
    // unique: false means multiple todos can have the same date (they won't, but allowed).
    store.createIndex('createdAt', 'createdAt', { unique: false });
  }
};
```

**SQL equivalent:**

```sql
CREATE TABLE IF NOT EXISTS todos (
  id          INTEGER PRIMARY KEY,
  description TEXT,
  imageData   TEXT,
  latitude    REAL,
  longitude   REAL,
  locationName TEXT,
  createdAt   TEXT,
  done        INTEGER
);

CREATE INDEX idx_created_at ON todos (createdAt);
```

**Two keyPath options:**

```js
// Option A: You manage the ID yourself (what this app does)
db.createObjectStore('todos', { keyPath: 'id' });
// Every record you add MUST have an 'id' property set before inserting.
// In this app: todo.id = Date.now()

// Option B: Auto-incrementing ID (like MySQL AUTO_INCREMENT)
db.createObjectStore('todos', { autoIncrement: true });
// IndexedDB assigns the ID automatically. No need to set it yourself.
```

---

## 7. Step 3 — Inserting a Record (addTodo)

**File:** `db.js`, function `addTodo(todo)`

```js
async function addTodo(todo) {
  // 1. Open the database connection
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    // 2. Start a read-write transaction
    //    Like: BEGIN TRANSACTION in SQL
    const tx    = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    // 3. Add the record
    //    store.add() fails if a record with the same key already exists.
    //    Use store.put() instead if you want "insert or update" (upsert).
    const request = store.add(todo);

    request.onsuccess = () => resolve(todo.id);
    request.onerror   = () => reject(request.error);
  });
}
```

**SQL equivalent:**

```sql
BEGIN TRANSACTION;
INSERT INTO todos (id, description, imageData, latitude, longitude, locationName, createdAt, done)
VALUES (1776144188950, 'Buy groceries', null, null, null, null, '2026-04-14T05:23:08Z', 0);
COMMIT;
```

**How `app.js` calls it:**

```js
// app.js — handleFormSubmit()

const todo = {
  id:           Date.now(),           // Timestamp as unique ID
  description:  'Buy groceries',
  imageData:    currentImageData,     // Base64 string or null
  latitude:     currentLatitude,
  longitude:    currentLongitude,
  locationName: currentLocation,
  createdAt:    new Date().toISOString(),
  done:         false
};

await addTodo(todo);  // Calls db.js
```

**`add()` vs `put()`:**

| Method | Behaviour | SQL Equivalent |
|---|---|---|
| `store.add(record)` | Insert only. Fails if key exists. | `INSERT INTO ...` |
| `store.put(record)` | Insert or replace. Safe to call always. | `INSERT OR REPLACE INTO ...` |

---

## 8. Step 4 — Reading All Records (getAllTodos)

**File:** `db.js`, function `getAllTodos()`

```js
async function getAllTodos() {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    // Read-only transaction — we are not changing any data
    const tx    = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    // getAll() fetches every record in the store at once
    const request = store.getAll();

    request.onsuccess = () => {
      const todos = request.result;  // Array of all todo objects

      // Sort newest first — IndexedDB does not guarantee order by default
      todos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      resolve(todos);
    };

    request.onerror = () => reject(request.error);
  });
}
```

**SQL equivalent:**

```sql
SELECT * FROM todos ORDER BY createdAt DESC;
```

**How `app.js` calls it:**

```js
// app.js — refreshTodoList()

const todos = await getAllTodos();  // Returns an array of objects

todos.forEach(todo => {
  const element = createTodoElement(todo);  // Build HTML for each todo
  todoList.appendChild(element);
});
```

**Why sort manually?**

IndexedDB's `getAll()` returns records in **key order** (by `id`), not by `createdAt`. Since our `id` is `Date.now()`, the order happens to be correct in this app — but it is better practice to sort explicitly. If you needed to sort by `createdAt` at the database level (for large datasets), you would use the `createdAt` index with a cursor:

```js
// Advanced: use the index to iterate in order
const index   = store.index('createdAt');
const cursor  = index.openCursor(null, 'prev');  // 'prev' = descending
// Then collect records from the cursor one by one
```

---

## 9. Step 5 — Updating a Record (updateTodo)

**File:** `db.js`, function `updateTodo(id, changes)`

IndexedDB has no `UPDATE` equivalent that lets you change only specific fields. You must:

1. Read the full existing record
2. Merge your changes into it
3. Write the entire record back with `put()`

```js
async function updateTodo(id, changes) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    // Step 1: Read the existing record by its primary key
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const todo = getRequest.result;  // The full todo object

      // Step 2: Merge changes
      // { ...todo, ...changes } is like array_merge($todo, $changes) in PHP.
      // Fields in 'changes' overwrite the same fields in 'todo'.
      const updatedTodo = { ...todo, ...changes };

      // Step 3: Write back the full updated object
      // put() replaces the existing record with the same key.
      const putRequest = store.put(updatedTodo);

      putRequest.onsuccess = () => resolve();
      putRequest.onerror   = () => reject(putRequest.error);
    };

    getRequest.onerror = () => reject(getRequest.error);
  });
}
```

**SQL equivalent:**

```sql
UPDATE todos SET done = 1 WHERE id = 1776144188950;
```

**How `app.js` calls it:**

```js
// app.js — toggleDone()

const todos = await getAllTodos();
const todo  = todos.find(t => t.id === id);

// Only pass the field(s) you want to change
await updateTodo(id, { done: !todo.done });
```

The spread operator (`...`) handles the merge:

```js
const original = { id: 1, description: 'Buy milk', done: false, createdAt: '...' };
const changes  = { done: true };

const merged   = { ...original, ...changes };
// Result: { id: 1, description: 'Buy milk', done: true, createdAt: '...' }
//                                            ↑ overwritten
```

---

## 10. Step 6 — Deleting a Record (deleteTodo)

**File:** `db.js`, function `deleteTodo(id)`

```js
async function deleteTodo(id) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    // delete() removes the record matching this primary key
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror   = () => reject(request.error);
  });
}
```

**SQL equivalent:**

```sql
DELETE FROM todos WHERE id = 1776144188950;
```

**How `app.js` calls it:**

```js
// app.js — removeTodo()

if (!confirm('Delete this todo?')) return;  // Confirm before deleting

await deleteTodo(id);       // Remove from IndexedDB
await refreshTodoList();    // Re-render the list
```

---

## 11. How app.js Calls db.js

`db.js` is loaded before `app.js` in `index.html`, so all four functions are available globally.

```html
<!-- index.html — load order matters -->
<script src="/db.js"></script>   <!-- defines addTodo, getAllTodos, etc. -->
<script src="/app.js"></script>  <!-- uses those functions -->
```

The full data flow when a user adds a todo:

```
User fills form and clicks "Add Todo"
         │
         ▼
handleFormSubmit()          [app.js]
  │  Builds todo object
  │  id = Date.now()
  │
  ├──► addTodo(todo)         [db.js]
  │      openDatabase()
  │      transaction('readwrite')
  │      store.add(todo)
  │      ✅ saved to IndexedDB
  │
  ├──► refreshTodoList()     [app.js]
  │      getAllTodos()        [db.js]
  │        openDatabase()
  │        transaction('readonly')
  │        store.getAll()
  │        sort by date
  │        ✅ returns array
  │      Renders each todo as HTML
  │
  └──► sendPushForNewTodo()  [app.js]
         fetch('/send-notification')
         ✅ server notifies subscribers
```

---

## 12. Inspecting IndexedDB in Chrome DevTools

You can see your stored todos directly in the browser — like reading a database with phpMyAdmin.

1. Open Chrome at `http://localhost:3000`
2. Press **F12** to open DevTools
3. Go to the **Application** tab
4. In the left sidebar, expand **IndexedDB**
5. Click **TodoPWA** → **todos**
6. You will see all your todo records listed

You can also:

- Click a record to see all its fields
- Right-click a record to delete it
- Click the refresh icon if data looks stale
- Clear the entire database from **Storage** → **Clear site data**

To inspect via the browser console (press F12 → Console tab):

```js
// Read all todos from the console
const req = indexedDB.open('TodoPWA', 1);
req.onsuccess = (e) => {
  const db    = e.target.result;
  const tx    = db.transaction('todos', 'readonly');
  const store = tx.objectStore('todos');
  store.getAll().onsuccess = (e) => console.table(e.target.result);
};
```

---

## 13. Common Mistakes

### Mistake 1 — Forgetting that IndexedDB is asynchronous

```js
// ❌ WRONG — result is not available yet
const todos = getAllTodos();
console.log(todos);  // Prints: Promise { <pending> }

// ✅ CORRECT — wait for the Promise to resolve
const todos = await getAllTodos();
console.log(todos);  // Prints: [{ id: ..., description: ... }, ...]
```

IndexedDB never returns data immediately. Always use `await` (or `.then()`) to wait for results. This is the biggest difference from PHP's synchronous `$pdo->query()`.

### Mistake 2 — Using the wrong transaction mode

```js
// ❌ WRONG — cannot write inside a readonly transaction
const tx    = db.transaction('todos', 'readonly');
const store = tx.objectStore('todos');
store.add(todo);  // Error: The transaction is read-only

// ✅ CORRECT
const tx    = db.transaction('todos', 'readwrite');
const store = tx.objectStore('todos');
store.add(todo);  // Works
```

Use `'readonly'` for reads, `'readwrite'` for any writes.

### Mistake 3 — Calling `openDatabase()` once and reusing the connection across transactions

```js
// ❌ Risky — database connections can become invalid after version upgrades
let db;
async function init() {
  db = await openDatabase();  // Stored globally
}

// ✅ CORRECT (what this app does) — open fresh for each operation
async function addTodo(todo) {
  const db = await openDatabase();  // New connection each time
  // ...
}
```

Opening the database is cheap — the browser keeps the connection pooled internally. Opening fresh for each operation is simpler and avoids stale connection bugs.

### Mistake 4 — Trying to use `store.add()` with a duplicate key

```js
// ❌ If a todo with id=123 already exists, this throws an error
store.add({ id: 123, description: 'Duplicate' });

// ✅ Use put() for "insert or update" behaviour
store.put({ id: 123, description: 'Updated description' });
```

### Mistake 5 — Changing the schema without bumping DB_VERSION

```js
// ❌ This change will NOT apply to existing users:
// db.createObjectStore('newTable', { keyPath: 'id' });  ← inside onupgradeneeded

// ✅ Increase DB_VERSION to trigger onupgradeneeded for existing users
const DB_VERSION = 2;  // Was 1 — bump to 2 to run the migration
```

---

## 14. Quick Reference — SQL vs IndexedDB

| Operation | SQL | IndexedDB |
|---|---|---|
| Connect | `new PDO(...)` | `indexedDB.open(name, version)` |
| Create table | `CREATE TABLE todos (...)` | `db.createObjectStore('todos', { keyPath: 'id' })` |
| Create index | `CREATE INDEX ...` | `store.createIndex('createdAt', 'createdAt', ...)` |
| Insert | `INSERT INTO todos SET ...` | `store.add(object)` |
| Insert or update | `INSERT OR REPLACE ...` | `store.put(object)` |
| Select all | `SELECT * FROM todos` | `store.getAll()` |
| Select one | `SELECT * FROM todos WHERE id=?` | `store.get(id)` |
| Update | `UPDATE todos SET done=1 WHERE id=?` | `store.get(id)` → merge → `store.put(updated)` |
| Delete | `DELETE FROM todos WHERE id=?` | `store.delete(id)` |
| Begin transaction | `BEGIN TRANSACTION` | `db.transaction('todos', 'readwrite')` |
| Order by | `ORDER BY createdAt DESC` | Sort result array in JS, or use index cursor |
| Where clause | `WHERE done = 1` | Filter result array in JS with `.filter()` |

---

*This tutorial is based on the actual `db.js` implementation in this project. Read the source code alongside this document for the full picture.*
