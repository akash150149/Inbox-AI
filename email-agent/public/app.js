// public/app.js - Dashboard frontend logic
const API = "";

// ── State ─────────────────────────────────────────────────────────
let allEmails = [];
let currentFilter = "all";
let searchQuery = "";
let isSyncing = false;

// ── Avatar Color Map ──────────────────────────────────────────────
const avatarColors = [
  "#6c63ff","#a78bfa","#38bdf8","#f59e0b",
  "#34d399","#f472b6","#fb923c","#60a5fa",
];

function getAvatarColor(name) {
  let hash = 0;
  for (const ch of (name || "?")) hash = hash * 31 + ch.charCodeAt(0);
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

function getInitial(name) {
  return (name || "?")[0].toUpperCase();
}

// ── Status Helpers ────────────────────────────────────────────────
const statusMeta = {
  NOT_SEEN:     { label: "Not Seen",      icon: "🔴" },
  ACTION_NEEDED:{ label: "Action Needed", icon: "⚡" },
  WAITING:      { label: "Waiting",       icon: "⏳" },
  NO_REPLY_EVER:{ label: "No Reply Ever", icon: "🔇" },
};

function statusBadgeHtml(status) {
  const meta = statusMeta[status] || { label: status, icon: "•" };
  return `<span class="status-badge badge-${status}">${meta.icon} ${meta.label}</span>`;
}

// ── Date Formatter ────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60)          return "just now";
  if (diff < 3600)        return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400)       return `${Math.floor(diff/3600)}h ago`;
  if (diff < 604800)      return `${Math.floor(diff/86400)}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── API Calls ─────────────────────────────────────────────────────
async function fetchStats() {
  try {
    const res = await fetch(`${API}/api/stats`);
    const json = await res.json();
    if (json.success) updateStats(json.data);
  } catch (e) {
    console.error("Stats fetch error:", e);
  }
}

async function fetchEmails() {
  try {
    const params = new URLSearchParams();
    if (currentFilter !== "all") params.set("status", currentFilter);
    if (searchQuery) params.set("search", searchQuery);

    const res = await fetch(`${API}/api/emails?${params}`);
    const json = await res.json();
    if (json.success) {
      allEmails = json.data;
      renderEmails(allEmails);
      document.getElementById("result-count").textContent = `${json.count} thread${json.count !== 1 ? "s" : ""}`;
    }
  } catch (e) {
    renderError();
  }
}

async function triggerSync() {
  if (isSyncing) return;
  isSyncing = true;

  const btn = document.getElementById("sync-btn");
  const icon = document.getElementById("sync-icon");
  const dot = document.querySelector(".status-dot");
  const label = document.getElementById("sync-label");

  btn.disabled = true;
  icon.classList.add("spinning");
  dot.className = "status-dot syncing";
  label.textContent = "Syncing...";

  try {
    await fetch(`${API}/api/sync`, { method: "POST" });
    // Poll for completion (check every 3s for up to 60s)
    let attempts = 0;
    const poll = setInterval(async () => {
      attempts++;
      await fetchStats();
      await fetchEmails();
      if (attempts >= 20) {
        clearInterval(poll);
        doneSyncing(dot, label, icon, btn);
      }
    }, 3000);

    setTimeout(() => {
      clearInterval(poll);
      doneSyncing(dot, label, icon, btn);
    }, 60000);
  } catch (e) {
    dot.className = "status-dot error";
    label.textContent = "Sync failed";
    btn.disabled = false;
    icon.classList.remove("spinning");
    isSyncing = false;
  }
}

function doneSyncing(dot, label, icon, btn) {
  isSyncing = false;
  dot.className = "status-dot done";
  label.textContent = "Synced";
  icon.classList.remove("spinning");
  btn.disabled = false;
  document.getElementById("last-sync-label").textContent = `Last sync: just now`;
  setTimeout(() => {
    dot.className = "status-dot idle";
    label.textContent = "Ready";
  }, 5000);
}

// ── Render Stats ──────────────────────────────────────────────────
function updateStats(stats) {
  const keys = ["NOT_SEEN", "ACTION_NEEDED", "WAITING", "NO_REPLY_EVER"];
  keys.forEach((k) => {
    const val = stats[k.toLowerCase()] || 0;
    const el = document.getElementById(`stat-val-${k}`);
    const badge = document.getElementById(`badge-${k}`);
    if (el) el.textContent = val;
    if (badge) badge.textContent = val;
  });
  const allBadge = document.getElementById("badge-all");
  if (allBadge) allBadge.textContent = stats.total || 0;
}

// ── Render Email Cards ────────────────────────────────────────────
function renderEmails(emails) {
  const list = document.getElementById("email-list");
  const loading = document.getElementById("loading-state");
  if (loading) loading.remove();

  if (!emails || emails.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <h3>No emails found</h3>
        <p>Try syncing your inbox or changing the filter.</p>
      </div>`;
    return;
  }

  list.innerHTML = emails
    .map((email, i) => emailCardHtml(email, i))
    .join("");
}

function emailCardHtml(email, index) {
  const color = getAvatarColor(email.sender);
  const initial = getInitial(email.sender);
  const date = formatDate(email.last_message_date);
  const replyDate = email.last_user_reply_date
    ? `<span>Your last reply: <strong>${formatDate(email.last_user_reply_date)}</strong></span>`
    : "";

  return `
    <div class="email-card" onclick="openModal(${index})" style="animation-delay:${index * 0.03}s">
      <div class="card-avatar" style="background:${color}">${initial}</div>
      <div class="card-body">
        <div class="card-top">
          <span class="card-sender">${escHtml(email.sender || "Unknown")}</span>
          ${statusBadgeHtml(email.status)}
        </div>
        <div class="card-subject">${escHtml(email.subject || "(No Subject)")}</div>
        <div class="card-snippet">${escHtml(email.snippet || "")}</div>
        ${email.ai_summary ? `<div class="card-ai-summary">🤖 ${escHtml(email.ai_summary)}</div>` : ""}
      </div>
      <div class="card-meta">
        <span class="card-date">${date}</span>
        <span class="card-messages">${email.total_messages || 1} msg${email.total_messages !== 1 ? "s" : ""}</span>
        ${replyDate ? `<span class="card-date" style="color:var(--info)">${replyDate}</span>` : ""}
      </div>
    </div>`;
}

// ── Modal ─────────────────────────────────────────────────────────
function openModal(index) {
  const email = allEmails[index];
  if (!email) return;

  const color = getAvatarColor(email.sender);

  let replyBlock = "";
  if (email.status === "WAITING") {
    replyBlock = `<div class="modal-reply-info">⏳ You replied on <strong>${formatDate(email.last_user_reply_date)}</strong>. Awaiting a response.</div>`;
  } else if (email.status === "ACTION_NEEDED") {
    replyBlock = `<div class="modal-reply-info">⚡ Last external message received. <strong>Your response is needed.</strong></div>`;
  } else if (email.status === "NO_REPLY_EVER") {
    replyBlock = `<div class="modal-reply-info">🔇 You have <strong>never replied</strong> to this thread.</div>`;
  } else if (email.status === "NOT_SEEN") {
    replyBlock = `<div class="modal-reply-info">🔴 This email has <strong>not been read</strong> yet.</div>`;
  }

  // ── AI Draft Section (only for ACTION_NEEDED) ──
  const draftSection = email.status === "ACTION_NEEDED" ? `
    <div class="modal-section draft-section" id="draft-section">
      <div class="draft-header">
        <h4>✍️ AI Draft Reply</h4>
        <div class="draft-actions">
          <button class="draft-btn btn-regenerate" onclick="regenerateDraft('${email.thread_id}')" id="regen-btn">
            <span id="regen-icon">↻</span> Regenerate
          </button>
          <button class="draft-btn btn-copy" onclick="copyDraft()" id="copy-btn">
            📋 Copy
          </button>
        </div>
      </div>
      ${email.suggested_draft
        ? `<textarea class="draft-textarea" id="draft-textarea" placeholder="AI is generating a reply...">${escHtml(email.suggested_draft)}</textarea>
           <div class="draft-meta">Generated ${formatDate(email.draft_generated_at)} · Edit freely before copying</div>`
        : `<div class="draft-generating" id="draft-generating">
             <div class="spinner" style="width:20px;height:20px;border-width:2px;"></div>
             <span>No draft yet. Click Regenerate to create one.</span>
           </div>`
      }
    </div>` : "";

  document.getElementById("modal-content").innerHTML = `
    <div class="modal-header">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
        <div class="card-avatar" style="background:${color};width:44px;height:44px;font-size:17px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff">${getInitial(email.sender)}</div>
        <div>${statusBadgeHtml(email.status)}</div>
      </div>
      <h3>${escHtml(email.subject || "(No Subject)")}</h3>
      <div class="modal-sender">From: <strong>${escHtml(email.sender || "?")} &lt;${escHtml(email.sender_email || "")}&gt;</strong></div>
      <div class="modal-date">Last activity: ${formatDate(email.last_message_date)} · ${email.total_messages || 1} messages</div>
    </div>

    <div class="modal-section">
      <h4>Reply Status</h4>
      ${replyBlock}
    </div>

    ${draftSection}

    ${email.ai_summary ? `
    <div class="modal-section">
      <h4>🤖 AI Summary</h4>
      <p>${escHtml(email.ai_summary)}</p>
    </div>` : ""}

    ${email.snippet ? `
    <div class="modal-section">
      <h4>Snippet</h4>
      <p>${escHtml(email.snippet)}</p>
    </div>` : ""}

    <div class="modal-section">
      <h4>Thread Details</h4>
      <div class="modal-reply-info">
        <strong>Thread ID:</strong> ${escHtml(email.thread_id)}<br/>
        <strong>First Seen:</strong> ${formatDate(email.first_seen_at)}<br/>
        <strong>Last Synced:</strong> ${formatDate(email.last_synced_at)}
      </div>
    </div>`;

  document.getElementById("modal-overlay").classList.add("open");
}

function closeModal() {
  document.getElementById("modal-overlay").classList.remove("open");
}

/** Regenerate the AI draft for a given thread */
async function regenerateDraft(threadId) {
  const regenBtn = document.getElementById("regen-btn");
  const regenIcon = document.getElementById("regen-icon");
  const textarea = document.getElementById("draft-textarea");

  if (regenBtn) {
    regenBtn.disabled = true;
    regenIcon.style.animation = "spin 1s linear infinite";
  }

  // Show generating state in textarea
  if (textarea) {
    textarea.value = "⏳ Generating new draft...";
    textarea.disabled = true;
  }

  try {
    const res = await fetch(`/api/emails/${threadId}/regenerate-draft`, { method: "POST" });
    const json = await res.json();

    if (json.success && json.draft) {
      if (textarea) {
        textarea.value = json.draft;
        textarea.disabled = false;
      } else {
        // If no textarea existed (no previous draft), rebuild the draft section
        const section = document.getElementById("draft-section");
        if (section) {
          const genEl = document.getElementById("draft-generating");
          if (genEl) genEl.outerHTML = `<textarea class="draft-textarea" id="draft-textarea">${escHtml(json.draft)}</textarea>
            <div class="draft-meta">Generated just now · Edit freely before copying</div>`;
        }
      }
      // Update the in-memory email object so re-opens show the draft
      const emailIdx = allEmails.findIndex(e => e.thread_id === threadId);
      if (emailIdx !== -1) allEmails[emailIdx].suggested_draft = json.draft;
    } else {
      if (textarea) { textarea.value = "❌ Failed to generate draft. Try again."; textarea.disabled = false; }
    }
  } catch (err) {
    if (textarea) { textarea.value = `❌ Error: ${err.message}`; textarea.disabled = false; }
  } finally {
    if (regenBtn) {
      regenBtn.disabled = false;
      regenIcon.style.animation = "";
    }
  }
}

/** Copy the draft textarea content to clipboard */
async function copyDraft() {
  const textarea = document.getElementById("draft-textarea");
  const copyBtn = document.getElementById("copy-btn");
  if (!textarea || !textarea.value) return;

  try {
    await navigator.clipboard.writeText(textarea.value);
    copyBtn.textContent = "✅ Copied!";
    setTimeout(() => { copyBtn.textContent = "📋 Copy"; }, 2500);
  } catch (e) {
    // Fallback for older browsers
    textarea.select();
    document.execCommand("copy");
    copyBtn.textContent = "✅ Copied!";
    setTimeout(() => { copyBtn.textContent = "📋 Copy"; }, 2500);
  }
}

// ── Filter & Search ───────────────────────────────────────────────
function filterEmails(status, btn) {
  currentFilter = status;
  searchQuery = "";
  document.getElementById("search-input").value = "";

  document.querySelectorAll(".nav-item").forEach((el) => el.classList.remove("active"));
  if (btn) btn.classList.add("active");

  const titles = {
    all: "All Emails", NOT_SEEN: "Not Seen Emails",
    ACTION_NEEDED: "Action Needed", WAITING: "Waiting for Reply",
    NO_REPLY_EVER: "No Reply Ever",
  };
  document.getElementById("current-view-title").textContent = titles[status] || status;

  fetchEmails();
}

let searchDebounce;
function onSearchInput() {
  clearTimeout(searchDebounce);
  searchQuery = document.getElementById("search-input").value.trim();
  searchDebounce = setTimeout(fetchEmails, 350);
}

// ── Utility ───────────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return "";
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function renderError() {
  document.getElementById("email-list").innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">⚠️</div>
      <h3>Could not connect</h3>
      <p>Make sure the server is running at port 3000.</p>
    </div>`;
}

// ── Keyboard Shortcut ─────────────────────────────────────────────
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

// ── Init ──────────────────────────────────────────────────────────
async function init() {
  await Promise.all([fetchStats(), fetchEmails()]);
  // Auto-refresh every 60 seconds
  setInterval(() => {
    fetchStats();
    if (!isSyncing) fetchEmails();
  }, 60000);
}

init();
