import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const credentialPath = process.argv[2];
const testSpreadsheetId = process.env.GOOGLE_SHEETS_TEST_SPREADSHEET_ID;
const productionSpreadsheetId = "18YbqQZbxXLHm3gI51UH_EphsSW1X7RBueM7YDeOhrfw";
const outputPath = ".env.google-sheets-test.local";
if (!credentialPath) throw new Error("Pass the downloaded Google OAuth client JSON file path.");
if (!testSpreadsheetId) throw new Error("Set GOOGLE_SHEETS_TEST_SPREADSHEET_ID to the synthetic spreadsheet ID.");
if (testSpreadsheetId === productionSpreadsheetId) throw new Error("The integration bootstrap refuses the Production spreadsheet ID.");
const credential = JSON.parse(await readFile(credentialPath, "utf8"));
const client = credential.installed ?? credential.web;
if (!client?.client_id || !client?.client_secret) throw new Error("The OAuth client JSON is incomplete.");

const port = 45873;
const redirectUri = `http://127.0.0.1:${port}/oauth/callback`;
const verifier = randomBytes(48).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");
const state = randomBytes(32).toString("base64url");
const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authUrl.search = new URLSearchParams({
  client_id: client.client_id,
  redirect_uri: redirectUri,
  response_type: "code",
  scope: "https://www.googleapis.com/auth/spreadsheets",
  access_type: "offline",
  prompt: "consent",
  state,
  code_challenge: challenge,
  code_challenge_method: "S256",
}).toString();

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", redirectUri);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  if (url.searchParams.get("state") !== state || error || !code) {
    response.writeHead(400, { "Content-Type": "text/plain" });
    response.end("Authorization was not completed. You may close this tab.");
    server.close();
    process.exitCode = 1;
    return;
  }
  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: client.client_id,
        client_secret: client.client_secret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        code_verifier: verifier,
      }),
    });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok || !tokens.refresh_token) throw new Error("Google did not return a refresh token.");
    const envText = [
      `GOOGLE_SHEETS_SPREADSHEET_ID=${testSpreadsheetId}`,
      `GOOGLE_SHEETS_TEST_SPREADSHEET_ID=${testSpreadsheetId}`,
      `GOOGLE_SHEETS_TAB_NAME=TICKETS`,
      `GOOGLE_SHEETS_CLIENT_ID=${client.client_id}`,
      `GOOGLE_SHEETS_CLIENT_SECRET=${client.client_secret}`,
      `GOOGLE_SHEETS_REFRESH_TOKEN=${tokens.refresh_token}`,
      "",
    ].join("\n");
    await writeFile(outputPath, envText, { mode: 0o600 });
    await chmod(outputPath, 0o600);
    const verify = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(testSpreadsheetId)}?fields=spreadsheetId,sheets.properties(title)`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    if (!verify.ok) throw new Error(`The authorized account cannot access the synthetic spreadsheet (HTTP ${verify.status}).`);
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end("<h1>Google Sheets authorization complete</h1><p>The synthetic spreadsheet is accessible. You may close this tab.</p>");
    console.log("GOOGLE_OAUTH_COMPLETE");
    const child = spawn("pnpm", ["vitest", "run", "tests/integration/google-sheets.live.test.ts"], { stdio: "inherit", env: { ...process.env, ...Object.fromEntries(envText.trim().split("\n").map((line) => line.split(/=(.*)/s).slice(0, 2))), RUN_GOOGLE_SHEETS_INTEGRATION: "true" } });
    child.on("exit", (code) => { process.exitCode = code ?? 1; });
  } catch (reason) {
    response.writeHead(500, { "Content-Type": "text/plain" });
    response.end("Authorization could not be saved. Return to Codex.");
    console.error(reason instanceof Error ? reason.message : "OAuth exchange failed");
    process.exitCode = 1;
  } finally {
    server.close();
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log("Opening Google authorization in the default browser…");
  spawn("open", [authUrl.toString()]);
});
