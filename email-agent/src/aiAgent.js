// src/aiAgent.js - Gemini AI agent for email thread classification
const { GoogleGenAI } = require("@google/genai");
const { config } = require("./config");

const genAI = new GoogleGenAI({ apiKey: config.gemini.apiKey });

/**
 * Determines whether a given email address belongs to the user.
 * We check both exact match and common alias patterns.
 */
function isUserEmail(emailAddress) {
  const userEmail = (config.user.email || "").toLowerCase().trim();
  const addr = (emailAddress || "").toLowerCase().trim();
  if (!addr || !userEmail) return false;
  return addr === userEmail || addr.includes(userEmail.split("@")[0]);
}

/**
 * Quick heuristic classification — avoids calling the LLM for simple cases.
 * Returns null if the case is too complex for heuristics.
 */
function heuristicClassify(threadData) {
  const { messages } = threadData;
  if (!messages || messages.length === 0) return null;

  const hasUnread = messages.some((m) => m.isUnread);
  if (hasUnread) {
    return {
      status: "NOT_SEEN",
      lastUserReplyDate: null,
      lastExternalReplyDate: null,
      aiSummary: "Thread contains unread messages.",
    };
  }

  // Sort messages by timestamp ascending
  const sorted = [...messages].sort((a, b) => a.dateTimestamp - b.dateTimestamp);
  const lastMessage = sorted[sorted.length - 1];
  const userMessages = sorted.filter((m) => isUserEmail(m.fromEmail));

  if (userMessages.length === 0) {
    return {
      status: "NO_REPLY_EVER",
      lastUserReplyDate: null,
      lastExternalReplyDate: lastMessage.date,
      aiSummary: "User has never replied to this thread.",
    };
  }

  const lastUserMsg = userMessages[userMessages.length - 1];
  const lastUserTimestamp = lastUserMsg.dateTimestamp;
  const lastMsgTimestamp = lastMessage.dateTimestamp;

  if (lastUserTimestamp >= lastMsgTimestamp) {
    return {
      status: "WAITING",
      lastUserReplyDate: lastUserMsg.date,
      lastExternalReplyDate: null,
      aiSummary: "User sent the last message. Waiting for a reply from the other party.",
    };
  }

  // Last message is external — send to AI for a nuanced summary
  return null;
}

/**
 * Use Gemini to classify complex email threads where heuristics are insufficient.
 */
async function aiClassify(threadData) {
  const { messages } = threadData;
  const userEmail = config.user.email;

  // Build a compact thread summary for the LLM
  const sorted = [...messages].sort((a, b) => a.dateTimestamp - b.dateTimestamp);
  const threadText = sorted
    .map(
      (m, i) => `--- Message ${i + 1} ---
From: ${m.from} <${m.fromEmail}>
Date: ${m.date}
Body: ${m.body || m.snippet || "(no content)"}
`
    )
    .join("\n");

  const prompt = `You are an AI email assistant analyzing an email thread for the user with email: ${userEmail}.

THREAD CONTENT:
${threadText}

Analyze this thread and return a JSON object with exactly these fields:
{
  "status": "ACTION_NEEDED" | "WAITING" | "NO_REPLY_EVER",
  "lastUserReplyDate": "date string or null",
  "lastExternalReplyDate": "date string or null",
  "aiSummary": "A concise 1-2 sentence summary of the conversation and what action (if any) the user needs to take."
}

STATUS RULES:
- "ACTION_NEEDED": User has replied before, but the most recent message is from an external sender (requires user response).
- "WAITING": User sent the last message in the thread. User is awaiting a response.
- "NO_REPLY_EVER": User has never replied to any message in this thread.

IMPORTANT: Return ONLY the raw JSON object. No markdown, no explanation.`;

  const response = await genAI.models.generateContent({
    model: config.gemini.model,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  const rawText = response.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

  try {
    // Strip potential markdown code blocks before parsing
    const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.warn("   ⚠️  AI response parse failed, defaulting to ACTION_NEEDED.");
    return {
      status: "ACTION_NEEDED",
      lastUserReplyDate: null,
      lastExternalReplyDate: null,
      aiSummary: "Could not parse AI response. Manual review recommended.",
    };
  }
}

/**
 * Main classification function. Runs heuristics first, falls back to AI.
 * @param {object} threadData - Output of fetchThreadDetail()
 * @returns {object} Classification result
 */
async function classifyThread(threadData) {
  const { messages } = threadData;
  if (!messages || messages.length === 0) {
    return {
      status: "NO_REPLY_EVER",
      lastUserReplyDate: null,
      lastExternalReplyDate: null,
      aiSummary: "Empty thread.",
    };
  }

  // Try fast heuristic path first
  const heuristicResult = heuristicClassify(threadData);
  if (heuristicResult) {
    return heuristicResult;
  }

  // Fall back to AI for nuanced cases
  console.log(`   🤖 Using AI to classify thread ${threadData.threadId}...`);
  return await aiClassify(threadData);
}

module.exports = { classifyThread };
