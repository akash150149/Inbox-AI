// src/gmailService.js - Gmail API authentication and email fetching
const { google } = require("googleapis");
const { config } = require("./config");
const fs = require("fs");

/** Create an authenticated OAuth2 client from saved token */
function getAuthClient() {
  if (!fs.existsSync(config.paths.tokenStore)) {
    console.error("\n❌ No authentication token found.");
    console.error("   Please run: node src/auth.js\n");
    process.exit(1);
  }
  const tokens = JSON.parse(fs.readFileSync(config.paths.tokenStore, "utf8"));
  const auth = new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    config.google.redirectUri
  );
  auth.setCredentials(tokens);

  // Auto-refresh token if expired
  auth.on("tokens", (newTokens) => {
    const merged = { ...tokens, ...newTokens };
    fs.writeFileSync(config.paths.tokenStore, JSON.stringify(merged, null, 2));
  });

  return auth;
}

/** Decode base64url-encoded email content */
function decodeBase64(str) {
  if (!str) return "";
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

/** Extract a header value from a Gmail message payload */
function getHeader(headers, name) {
  const h = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : "";
}

/** Extract the plain text body from a Gmail message payload (recursive) */
function extractBody(payload) {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const result = extractBody(part);
      if (result) return result;
    }
  }
  return "";
}

/** Parse a raw email address string to extract name and email */
function parseEmailAddress(raw) {
  if (!raw) return { name: "Unknown", email: "" };
  const match = raw.match(/^(.+?)\s*<(.+?)>$/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  return { name: raw, email: raw };
}

/**
 * Fetch recent email threads from Gmail.
 * @param {number} maxResults - Max number of threads to return
 * @param {string|null} afterTimestamp - Only fetch threads updated after this UNIX timestamp
 */
async function fetchThreads(maxResults = 50, afterTimestamp = null) {
  const auth = getAuthClient();
  const gmail = google.gmail({ version: "v1", auth });

  let query = "in:inbox";
  if (afterTimestamp) {
    query += ` after:${Math.floor(parseInt(afterTimestamp) / 1000)}`;
  }

  console.log(`📥 Fetching up to ${maxResults} threads...`);
  const listResponse = await gmail.users.threads.list({
    userId: "me",
    maxResults,
    q: query,
  });

  const threads = listResponse.data.threads || [];
  console.log(`   Found ${threads.length} threads.`);
  return threads;
}

/**
 * Fetch the full content of a single email thread.
 * @param {string} threadId
 */
async function fetchThreadDetail(threadId) {
  const auth = getAuthClient();
  const gmail = google.gmail({ version: "v1", auth });

  const response = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "full",
  });

  const thread = response.data;
  const messages = thread.messages || [];

  // Parse each message in the thread
  const parsedMessages = messages.map((msg) => {
    const headers = msg.payload?.headers || [];
    const { name: senderName, email: senderEmail } = parseEmailAddress(getHeader(headers, "From"));
    const body = extractBody(msg.payload);

    return {
      messageId: msg.id,
      date: getHeader(headers, "Date"),
      dateTimestamp: parseInt(msg.internalDate || "0"),
      subject: getHeader(headers, "Subject"),
      from: senderName,
      fromEmail: senderEmail,
      to: getHeader(headers, "To"),
      snippet: msg.snippet || "",
      body: body.substring(0, 2000), // Cap body at 2000 chars per message for LLM efficiency
      labels: msg.labelIds || [],
      isUnread: (msg.labelIds || []).includes("UNREAD"),
    };
  });

  return {
    threadId,
    messages: parsedMessages,
    totalMessages: parsedMessages.length,
  };
}

module.exports = { fetchThreads, fetchThreadDetail, getAuthClient };
