// src/db.js - SQLite database setup and query helpers (sqlite3 async API)
const sqlite3 = require("sqlite3").verbose();
const { config } = require("./config");
const fs = require("fs");
const path = require("path");

// Ensure data directory exists
const dataDir = path.dirname(config.paths.db);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Open database connection
const db = new sqlite3.Database(config.paths.db, (err) => {
  if (err) {
    console.error("❌ Failed to open database:", err.message);
    process.exit(1);
  }
});

// Enable WAL mode for better performance
db.run("PRAGMA journal_mode = WAL");

// ── Schema Creation ────────────────────────────────────────────────
const CREATE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id TEXT UNIQUE NOT NULL,
    message_id TEXT NOT NULL,
    subject TEXT,
    sender TEXT,
    sender_email TEXT,
    snippet TEXT,
    status TEXT NOT NULL,
    last_user_reply_date TEXT,
    last_external_reply_date TEXT,
    last_message_date TEXT,
    total_messages INTEGER DEFAULT 1,
    ai_summary TEXT,
    raw_labels TEXT,
    first_seen_at TEXT DEFAULT (datetime('now')),
    last_synced_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    synced_at TEXT DEFAULT (datetime('now')),
    threads_processed INTEGER DEFAULT 0,
    threads_updated INTEGER DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    status TEXT DEFAULT 'success',
    error TEXT
  );

  CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`;

db.exec(CREATE_SCHEMA, (err) => {
  if (err) console.error("❌ Schema creation error:", err.message);
});

// ── Promisified Helpers ────────────────────────────────────────────
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// ── Email Operations ───────────────────────────────────────────────

/** Upsert an email record (insert or update if thread_id exists) */
async function upsertEmail(emailData) {
  const sql = `
    INSERT INTO emails (
      thread_id, message_id, subject, sender, sender_email, snippet,
      status, last_user_reply_date, last_external_reply_date,
      last_message_date, total_messages, ai_summary, raw_labels, last_synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(thread_id) DO UPDATE SET
      message_id = excluded.message_id,
      subject = excluded.subject,
      sender = excluded.sender,
      sender_email = excluded.sender_email,
      snippet = excluded.snippet,
      status = excluded.status,
      last_user_reply_date = excluded.last_user_reply_date,
      last_external_reply_date = excluded.last_external_reply_date,
      last_message_date = excluded.last_message_date,
      total_messages = excluded.total_messages,
      ai_summary = excluded.ai_summary,
      raw_labels = excluded.raw_labels,
      last_synced_at = datetime('now')
  `;
  const params = [
    emailData.thread_id, emailData.message_id, emailData.subject,
    emailData.sender, emailData.sender_email, emailData.snippet,
    emailData.status, emailData.last_user_reply_date, emailData.last_external_reply_date,
    emailData.last_message_date, emailData.total_messages,
    emailData.ai_summary, emailData.raw_labels,
  ];
  return dbRun(sql, params);
}

/** Get all emails, optionally filtered by status */
async function getEmails(status = null) {
  if (status) {
    return dbAll(`SELECT * FROM emails WHERE status = ? ORDER BY last_message_date DESC`, [status]);
  }
  return dbAll(`SELECT * FROM emails ORDER BY last_message_date DESC`);
}

/** Get aggregated stats for the dashboard */
async function getStats() {
  return dbGet(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'NOT_SEEN' THEN 1 ELSE 0 END) as not_seen,
      SUM(CASE WHEN status = 'ACTION_NEEDED' THEN 1 ELSE 0 END) as action_needed,
      SUM(CASE WHEN status = 'WAITING' THEN 1 ELSE 0 END) as waiting,
      SUM(CASE WHEN status = 'NO_REPLY_EVER' THEN 1 ELSE 0 END) as no_reply_ever
    FROM emails
  `);
}

// ── App State Operations ───────────────────────────────────────────

/** Get a persisted app state value */
async function getState(key) {
  const row = await dbGet(`SELECT value FROM app_state WHERE key = ?`, [key]);
  return row ? row.value : null;
}

/** Set a persisted app state value */
async function setState(key, value) {
  return dbRun(`INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)`, [key, String(value)]);
}

// ── Sync Log Operations ────────────────────────────────────────────

/** Log the result of a sync operation */
async function logSync(data) {
  return dbRun(
    `INSERT INTO sync_log (threads_processed, threads_updated, duration_ms, status, error) VALUES (?, ?, ?, ?, ?)`,
    [data.threads_processed, data.threads_updated, data.duration_ms, data.status, data.error]
  );
}

/** Get the last 10 sync history entries */
async function getSyncHistory() {
  return dbAll(`SELECT * FROM sync_log ORDER BY synced_at DESC LIMIT 10`);
}

module.exports = { upsertEmail, getEmails, getStats, getState, setState, logSync, getSyncHistory };
