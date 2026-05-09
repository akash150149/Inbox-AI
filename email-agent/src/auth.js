// src/auth.js - One-time OAuth2 token generator script
// Run: node src/auth.js
const { google } = require("googleapis");
const { config, validateConfig } = require("./config");
const fs = require("fs");
const http = require("http");
const url = require("url");

validateConfig();

const oauth2Client = new google.auth.OAuth2(
  config.google.clientId,
  config.google.clientSecret,
  config.google.redirectUri
);

async function generateToken() {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: config.google.scopes,
    prompt: "consent",
  });

  console.log("\n🔐 AI Email Agent - OAuth2 Setup");
  console.log("─".repeat(50));
  console.log("Opening your browser to authenticate with Google...");
  console.log("\nIf the browser doesn't open, paste this URL manually:");
  console.log(`\n  ${authUrl}\n`);

  // Try to open browser automatically
  try {
    const open = await import("open");
    await open.default(authUrl);
  } catch (e) {
    // Browser open failed, user needs to copy the URL manually
  }

  // Start a temporary local server to capture the auth code
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const qs = new url.URL(req.url, "http://localhost:3000").searchParams;
        const code = qs.get("code");
        const error = qs.get("error");

        if (error) {
          res.end(`<h1>❌ Authentication Failed</h1><p>${error}</p>`);
          server.close();
          reject(new Error(`OAuth error: ${error}`));
          return;
        }

        if (code) {
          const { tokens } = await oauth2Client.getToken(code);
          fs.writeFileSync(config.paths.tokenStore, JSON.stringify(tokens, null, 2));

          res.end(`
            <html><body style="font-family:sans-serif;padding:40px;text-align:center;">
              <h1>✅ Authentication Successful!</h1>
              <p>Your Gmail access token has been saved.</p>
              <p>You can close this window and return to the terminal.</p>
            </body></html>
          `);

          console.log("✅ Authentication successful!");
          console.log(`   Token saved to: ${config.paths.tokenStore}`);
          console.log("\n🚀 You can now start the app with: npm start\n");

          server.close();
          resolve(tokens);
        }
      } catch (err) {
        res.end(`<h1>❌ Error</h1><p>${err.message}</p>`);
        server.close();
        reject(err);
      }
    });

    server.listen(3000, () => {
      console.log("⏳ Waiting for authentication... (server listening on port 3000)");
    });

    server.on("error", reject);
  });
}

generateToken().catch((err) => {
  console.error("❌ Token generation failed:", err.message);
  process.exit(1);
});
