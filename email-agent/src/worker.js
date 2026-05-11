// src/worker.js - Hourly sync orchestrator
const cron = require("node-cron");
const { config } = require("./config");
const { fetchThreads, fetchThreadDetail } = require("./gmailService");
const { classifyThread, generateDraft } = require("./aiAgent");
const { upsertEmail, updateDraft, getState, setState, logSync } = require("./db");

/**
 * Core sync logic — fetches, analyzes, and saves email thread statuses.
 */
async function runSync() {
  const startTime = Date.now();
  let threadsProcessed = 0;
  let threadsUpdated = 0;

  console.log(`\n${"=".repeat(55)}`);
  console.log(`🔄 Email Sync Started: ${new Date().toLocaleString()}`);
  console.log(`${"=".repeat(55)}`);

  try {
    // Get the last sync timestamp for incremental syncing
    const lastSyncTimestamp = await getState("last_sync_timestamp");
    if (lastSyncTimestamp) {
      console.log(`   ⏱  Incremental sync: fetching emails since last run`);
    } else {
      console.log(`   🚀 First-time full sync`);
    }

    // Fetch thread list from Gmail
    const threads = await fetchThreads(config.app.maxThreadsPerSync, lastSyncTimestamp);

    // Process each thread with a small delay to respect rate limits
    for (const thread of threads) {
      try {
        process.stdout.write(`   📧 Processing thread ${thread.id}...`);

        // Fetch full thread with message bodies
        const threadData = await fetchThreadDetail(thread.id);
        threadsProcessed++;

        // Classify via heuristics or AI
        const classification = await classifyThread(threadData);

        // Extract metadata from the last message for display
        const sorted = [...threadData.messages].sort((a, b) => a.dateTimestamp - b.dateTimestamp);
        const lastMsg = sorted[sorted.length - 1];
        const firstMsg = sorted[0];

        // Save to database
        await upsertEmail({
          thread_id: thread.id,
          message_id: lastMsg.messageId,
          subject: firstMsg.subject || "(No Subject)",
          sender: lastMsg.from,
          sender_email: lastMsg.fromEmail,
          snippet: lastMsg.snippet,
          status: classification.status,
          last_user_reply_date: classification.lastUserReplyDate || null,
          last_external_reply_date: classification.lastExternalReplyDate || null,
          last_message_date: lastMsg.date,
          total_messages: threadData.totalMessages,
          ai_summary: classification.aiSummary || null,
          raw_labels: JSON.stringify(lastMsg.labels || []),
        });

        threadsUpdated++;
        console.log(` ✅ ${classification.status}`);

        // For ACTION_NEEDED threads, auto-generate an AI draft reply
        if (classification.status === "ACTION_NEEDED") {
          try {
            process.stdout.write(`   ✍️  Generating draft for ${thread.id}...`);
            const draft = await generateDraft(threadData);
            await updateDraft(thread.id, draft);
            console.log(" 📝 Draft saved.");
          } catch (draftErr) {
            console.log(` ⚠️  Draft failed: ${draftErr.message}`);
          }
        }

        // Small delay to avoid hitting API rate limits
        await new Promise((r) => setTimeout(r, 200));
      } catch (err) {
        console.log(` ❌ Error: ${err.message}`);
      }
    }

    // Save the current timestamp as the last sync point
    await setState("last_sync_timestamp", Date.now().toString());

    const durationMs = Date.now() - startTime;
    await logSync({ threads_processed: threadsProcessed, threads_updated: threadsUpdated, duration_ms: durationMs, status: "success", error: null });

    console.log(`\n✅ Sync Complete in ${(durationMs / 1000).toFixed(1)}s`);
    console.log(`   Processed: ${threadsProcessed} | Updated: ${threadsUpdated}`);
    console.log(`${"=".repeat(55)}\n`);
  } catch (err) {
    const durationMs = Date.now() - startTime;
    await logSync({ threads_processed: threadsProcessed, threads_updated: threadsUpdated, duration_ms: durationMs, status: "error", error: err.message });
    console.error(`\n❌ Sync Failed: ${err.message}\n`);
  }
}

/**
 * Start the scheduled sync worker.
 * Runs immediately on start, then every N hours.
 */
function startWorker() {
  const intervalHours = config.app.syncIntervalHours;
  const cronExpression = `0 */${intervalHours} * * *`;

  console.log(`\n⚡ Email Sync Worker Started`);
  console.log(`   Schedule: Every ${intervalHours} hour(s)`);
  console.log(`   Running initial sync now...\n`);

  // Run immediately on startup
  runSync();

  // Then schedule periodic runs
  cron.schedule(cronExpression, () => {
    runSync();
  });
}

module.exports = { runSync, startWorker };
