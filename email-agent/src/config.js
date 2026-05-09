// src/config.js - Central configuration and environment setup
require("dotenv").config();
const path = require("path");

const config = {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/oauth2callback",
    scopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.labels",
    ],
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: "gemini-2.0-flash",
  },
  user: {
    email: process.env.USER_EMAIL,
  },
  app: {
    port: parseInt(process.env.PORT || "3000", 10),
    syncIntervalHours: parseInt(process.env.SYNC_INTERVAL_HOURS || "1", 10),
    maxThreadsPerSync: parseInt(process.env.MAX_THREADS_PER_SYNC || "50", 10),
  },
  paths: {
    db: path.join(__dirname, "../data/email_agent.db"),
    tokenStore: path.join(__dirname, "../data/token.json"),
    publicDir: path.join(__dirname, "../public"),
  },
};

// Validate critical config
function validateConfig() {
  const required = [
    ["GOOGLE_CLIENT_ID", config.google.clientId],
    ["GOOGLE_CLIENT_SECRET", config.google.clientSecret],
    ["GEMINI_API_KEY", config.gemini.apiKey],
    ["USER_EMAIL", config.user.email],
  ];
  const missing = required.filter(([, val]) => !val).map(([key]) => key);
  if (missing.length > 0) {
    console.error(`\n❌ Missing environment variables: ${missing.join(", ")}`);
    console.error("   Please copy .env.example to .env and fill in the values.\n");
    process.exit(1);
  }
}

module.exports = { config, validateConfig };
