// src/server.js - Express API server + static dashboard server
const express = require("express");
const cors = require("cors");
const path = require("path");
const { config, validateConfig } = require("./config");
const { getEmails, getStats, getSyncHistory } = require("./db");
const { runSync } = require("./worker");
const { startWorker } = require("./worker");

validateConfig();

const app = express();
app.use(cors());
app.use(express.json());

// ── Serve Static Frontend Dashboard ───────────────────────────────
app.use(express.static(config.paths.publicDir));

// ── API Routes ─────────────────────────────────────────────────────

/** GET /api/stats - Dashboard summary counts */
app.get("/api/stats", async (req, res) => {
  try {
    const stats = await getStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** GET /api/emails - Get all emails, with optional ?status= filter */
app.get("/api/emails", async (req, res) => {
  try {
    const { status, search } = req.query;
    let emails = await getEmails(status || null);

    // Optional keyword search on subject/sender/snippet
    if (search) {
      const q = search.toLowerCase();
      emails = emails.filter(
        (e) =>
          (e.subject || "").toLowerCase().includes(q) ||
          (e.sender || "").toLowerCase().includes(q) ||
          (e.snippet || "").toLowerCase().includes(q) ||
          (e.ai_summary || "").toLowerCase().includes(q)
      );
    }

    res.json({ success: true, data: emails, count: emails.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** GET /api/sync-history - Last 10 sync logs */
app.get("/api/sync-history", async (req, res) => {
  try {
    const history = await getSyncHistory();
    res.json({ success: true, data: history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** POST /api/sync - Manually trigger a sync */
app.post("/api/sync", async (req, res) => {
  try {
    res.json({ success: true, message: "Sync started in background." });
    // Run async without blocking response
    runSync().catch(console.error);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** GET /api/health - Health check endpoint */
app.get("/api/health", (req, res) => {
  res.json({ success: true, status: "running", timestamp: new Date().toISOString() });
});

// ── Start Server & Worker ──────────────────────────────────────────
app.listen(config.app.port, () => {
  console.log(`\n🚀 AI Email Agent Dashboard`);
  console.log(`   URL: http://localhost:${config.app.port}`);
  console.log(`   API: http://localhost:${config.app.port}/api/stats`);
  startWorker();
});

module.exports = app;
