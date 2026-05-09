# AI Email Agent 📧
### An Autonomous Gmail Intelligence & Segregation System

> Connects to your Gmail, reads your inbox, and uses AI to classify every conversation — so you always know what needs your attention and what doesn't.

---

## 📖 Working Principle

The system is built around a **three-stage pipeline** that runs every hour automatically in the background.

### Stage 1 — Ingestion (Gmail API)
The agent authenticates with your Gmail account using **OAuth2** (a secure, industry-standard protocol — your password is never stored). It then fetches your most recent email threads, including the **full message body** of each email in a thread, not just the preview snippet.

### Stage 2 — Analysis (AI Agent)
For every thread fetched, the agent runs a **two-tier classification logic**:

1. **Heuristic Check (Fast Path)**: First, the agent checks simple, deterministic rules without calling the AI:
   - Is there an `UNREAD` label on the thread? → `NOT_SEEN`
   - Is the last message from you? → `WAITING`
   - Has the user never sent a message in this thread? → `NO_REPLY_EVER`

2. **Gemini AI (Smart Path)**: For complex cases that heuristics can't handle (e.g., threads with many participants, automated replies, or ambiguous back-and-forth), the full thread body is passed to **Google Gemini** which reads the conversation and returns a structured JSON classification with a one-line contextual summary.

This two-tier approach keeps **API costs low** — the AI is only called when necessary.

### Stage 3 — Storage & Display (SQLite + Web Dashboard)
The classification result is saved to a local **SQLite database**. This serves two purposes:
- **Incremental Sync**: The next hourly run only processes threads *updated since the last sync*, not the entire inbox.
- **Instant Dashboard**: The web dashboard at `http://localhost:3000` reads from the local database, making it load instantly without any live API calls.

---

## 📊 Email Status Categories

| Status | Meaning |
|---|---|
| 🔴 **Not Seen** | The email is unread. You haven't opened it yet. |
| ⚡ **Action Needed** | You've read it, and the other person replied. Your response is pending. |
| ⏳ **Waiting** | You replied last. You are waiting for them to respond. Includes your last reply date. |
| 🔇 **No Reply Ever** | You have read this email but never replied to anyone in this thread. |

---

## 🏗️ Architecture

```
Gmail API
    │
    ▼
Sync Worker (node-cron, every 1 hour)
    │
    ├──► Heuristic Engine (fast, free)
    │         │
    │         └──► Complex Case? ──► Gemini AI (smart, paid per-use)
    │
    ▼
SQLite Database (local file, persistent)
    │
    ▼
Express API Server
    │
    ▼
Web Dashboard (http://localhost:3000)
```

---

## ⚙️ Setup Guide

### Step 1: Install dependencies
```bash
npm install
```

### Step 2: Configure environment variables
```bash
copy .env.example .env
# Fill in GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GEMINI_API_KEY, USER_EMAIL
```

### Step 3: Create Google Cloud OAuth2 Credentials
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project → Go to **APIs & Services → Library** → Enable **Gmail API**
3. Go to **Credentials → Create Credentials → OAuth Client ID**
4. Set Application type: **Web Application**
5. Under **Authorized Redirect URIs**, add: `http://localhost:3000/oauth2callback`
6. Copy the `Client ID` and `Client Secret` into your `.env` file

### Step 4: Add yourself as a Test User
1. Go to **APIs & Services → OAuth Consent Screen**
2. Scroll to **Test Users → + ADD USERS**
3. Add your Gmail address and **Save**

### Step 5: Authenticate with Gmail (one-time only)
```bash
npm run auth
```
This opens a browser. Sign in with your Gmail and grant access. The token is saved locally in `data/token.json`.

### Step 6: Start the app
```bash
npm start
```
Open **http://localhost:3000** to view your live email dashboard.

---

## 📁 Project Structure

```
email-agent/
├── src/
│   ├── auth.js          # One-time OAuth2 token generator
│   ├── config.js        # Environment and config management
│   ├── db.js            # SQLite database schema & operations
│   ├── gmailService.js  # Gmail API integration & body decoder
│   ├── aiAgent.js       # Heuristic + Gemini AI classifier
│   ├── worker.js        # Hourly sync orchestrator (node-cron)
│   └── server.js        # Express API + dashboard server
├── public/
│   ├── index.html       # Dashboard structure
│   ├── style.css        # Dark-mode design system
│   └── app.js           # Dashboard frontend logic
├── data/                # SQLite DB + OAuth token (auto-created, git-ignored)
├── .env.example         # Environment variable template
└── package.json
```

---

## 🔌 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/stats` | Total counts per status category |
| `GET` | `/api/emails` | All emails (`?status=`, `?search=` filters supported) |
| `POST` | `/api/sync` | Manually trigger a sync immediately |
| `GET` | `/api/sync-history` | Last 10 sync run logs |
| `GET` | `/api/health` | Server health check |

---

## 🔮 Future Upgrades (Roadmap)

This project is designed as a **foundation**. The following features are planned for future versions:

### V2 — AI Auto-Reply Agent
- The agent will read `ACTION_NEEDED` emails and **draft a context-aware reply** using Gemini.
- Replies will be shown in the dashboard for **one-click approval** before sending.
- A configurable "persona" (formal / casual) will control the writing tone.

### V3 — Urgency Scoring & Priority Inbox
- Each email will be scored `0–10` for urgency based on keywords, sender importance, and thread age.
- A **"Priority" tab** will surface the highest-urgency emails that need immediate attention.

### V4 — Calendar & Task Integration
- Emails containing meeting requests will automatically create **Google Calendar events**.
- Action items extracted from emails (e.g., *"Send me the report by Friday"*) will be pushed to a **task list** (Notion / Todoist / Google Tasks).

### V5 — Multi-Account Support
- Support monitoring **multiple Gmail accounts** simultaneously from a single dashboard.
- Each account will have its own isolated database partition.

### V6 — Smart Notifications
- **Daily Digest**: A summary email or WhatsApp/Telegram message every morning listing all pending `ACTION_NEEDED` threads.
- **Spike Alerts**: Instant notification if the inbox receives an unusual burst of emails.

---

## 🔒 Privacy & Security

- Your Gmail password is **never stored**. Authentication uses Google's OAuth2 standard.
- The OAuth token is stored **locally** in `data/token.json` and is excluded from Git via `.gitignore`.
- Email bodies are sent to Gemini's API only when heuristics cannot determine the status. No data is stored by Google beyond the API call lifecycle.
- All data (emails, statuses, sync logs) lives in a local SQLite file on your own machine.
