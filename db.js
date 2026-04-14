/**
 * db.js — IndexedDB helper functions
 *
 * IndexedDB is like a database built into the browser.
 * Think of it like PHP's SQLite — but it lives in the browser, not on the server.
 *
 * Key concepts:
 *  - Database: The container (like a MySQL database)
 *  - Object Store: Like a table in SQL
 *  - Record: Like a row in SQL
 *  - Index: Like a MySQL index — speeds up queries
 *
 * IndexedDB is asynchronous — operations don't happen instantly.
 * We use Promises to handle this (like async/await in modern PHP).
 */

// ── Database Configuration ────────────────────────────────────────────────────
const DB_NAME    = 'TodoPWA';   // Name of our IndexedDB database
const DB_VERSION = 1;           // Version number — increase this if you change the schema
const STORE_NAME = 'todos';     // Name of our "table" (object store)

/**
 * openDatabase()
 * Opens (or creates) the IndexedDB database.
 * Returns a Promise that resolves with the database object.
 *
 * This is like connecting to MySQL with PDO in PHP:
 *   $pdo = new PDO('sqlite:mydb.sqlite');
 */
function openDatabase() {
  return new Promise((resolve, reject) => {
    // indexedDB.open() returns a "request" object, not data directly.
    // The actual data arrives via events (onsuccess, onerror, etc.)
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    // onupgradeneeded fires when the database is first created,
    // or when DB_VERSION increases. This is where you define the schema.
    // Like running CREATE TABLE in MySQL.
    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Create the "todos" object store if it doesn't exist yet.
      // keyPath: 'id' means the 'id' field is our primary key (auto-created by us).
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });

        // Create an index on 'createdAt' so we can sort todos by date.
        // Like: CREATE INDEX idx_created_at ON todos (createdAt);
        store.createIndex('createdAt', 'createdAt', { unique: false });

        console.log('📦 IndexedDB: Created todos object store');
      }
    };

    // onsuccess fires when the database opens successfully
    request.onsuccess = (event) => {
      resolve(event.target.result); // Return the database connection
    };

    // onerror fires if something went wrong (e.g., user denied storage permission)
    request.onerror = (event) => {
      console.error('IndexedDB error:', event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * addTodo(todo)
 * Saves a new todo item to IndexedDB.
 * Like: INSERT INTO todos VALUES (...)  in SQL
 *
 * @param {Object} todo - The todo object to save. Shape:
 *   {
 *     id:          number,  // Unique ID (we use Date.now())
 *     description: string,  // The todo text
 *     imageData:   string,  // Base64-encoded photo (or null)
 *     latitude:    number,  // GPS latitude (or null)
 *     longitude:   number,  // GPS longitude (or null)
 *     locationName:string,  // Human-readable location (or null)
 *     createdAt:   string,  // ISO date string
 *     done:        boolean  // Completion status
 *   }
 * @returns {Promise<number>} The ID of the new todo
 */
async function addTodo(todo) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    // Start a read-write transaction on the 'todos' store.
    // Like: BEGIN TRANSACTION in SQL
    const tx    = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    // Add the todo. This fails if a record with the same key already exists.
    // Like: INSERT INTO todos SET ...
    const request = store.add(todo);

    request.onsuccess = () => {
      console.log('✅ Todo saved to IndexedDB with id:', todo.id);
      resolve(todo.id);
    };

    request.onerror = () => {
      console.error('Error saving todo:', request.error);
      reject(request.error);
    };
  });
}

/**
 * getAllTodos()
 * Retrieves all todo items from IndexedDB, newest first.
 * Like: SELECT * FROM todos ORDER BY createdAt DESC  in SQL
 *
 * @returns {Promise<Array>} Array of todo objects
 */
async function getAllTodos() {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    // Read-only transaction — we're just reading data
    const tx    = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    // getAll() returns all records in the store.
    // Like: SELECT * FROM todos
    const request = store.getAll();

    request.onsuccess = () => {
      const todos = request.result;

      // Sort newest first (by createdAt date, descending)
      todos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      resolve(todos);
    };

    request.onerror = () => {
      console.error('Error getting todos:', request.error);
      reject(request.error);
    };
  });
}

/**
 * updateTodo(id, changes)
 * Updates specific fields of an existing todo.
 * Like: UPDATE todos SET done=1 WHERE id=123  in SQL
 *
 * @param {number} id      - The ID of the todo to update
 * @param {Object} changes - An object with the fields to update
 * @returns {Promise<void>}
 */
async function updateTodo(id, changes) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    // First, get the existing record
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const todo = getRequest.result;

      if (!todo) {
        reject(new Error(`Todo with id ${id} not found`));
        return;
      }

      // Merge the changes with the existing record
      // Like: Object.assign in JS, or array_merge in PHP
      const updatedTodo = { ...todo, ...changes };

      // Save the updated record back
      const putRequest = store.put(updatedTodo);

      putRequest.onsuccess = () => resolve();
      putRequest.onerror   = () => reject(putRequest.error);
    };

    getRequest.onerror = () => reject(getRequest.error);
  });
}

/**
 * deleteTodo(id)
 * Removes a todo item from IndexedDB.
 * Like: DELETE FROM todos WHERE id=123  in SQL
 *
 * @param {number} id - The ID of the todo to delete
 * @returns {Promise<void>}
 */
async function deleteTodo(id) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    // delete() removes the record with this key
    const request = store.delete(id);

    request.onsuccess = () => {
      console.log('🗑️ Todo deleted from IndexedDB, id:', id);
      resolve();
    };

    request.onerror = () => {
      console.error('Error deleting todo:', request.error);
      reject(request.error);
    };
  });
}
