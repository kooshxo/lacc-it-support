import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";

const credentialPath = process.argv[2];
if (!credentialPath) throw new Error("Pass the downloaded Google OAuth client JSON file path.");
const credential = JSON.parse(await readFile(credentialPath, "utf8"));
const client = credential.installed ?? credential.web;
if (!client?.client_id || !client?.client_secret) throw new Error("The OAuth client JSON is incomplete.");

const port = 45873;
const redirectUri = `http://127.0.0.1:${port}/oauth/callback`;
const verifier = randomBytes(48).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");
const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authUrl.search = new URLSearchParams({
  client_id: client.client_id,
  redirect_uri: redirectUri,
  response_type: "code",
  scope: "https://www.googleapis.com/auth/spreadsheets",
  access_type: "offline",
  prompt: "consent",
  code_challenge: challenge,
  code_challenge_method: "S256",
}).toString();

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", redirectUri);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  if (error || !code) {
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
    await writeFile(".env.local", [
      `GOOGLE_SHEETS_SPREADSHEET_ID=${process.env.GOOGLE_SHEETS_SPREADSHEET_ID ?? "your-google-sheet-id"}`,
      `GOOGLE_SHEETS_TAB_NAME=IT support request`,
      `GOOGLE_SHEETS_CLIENT_ID=${client.client_id}`,
      `GOOGLE_SHEETS_CLIENT_SECRET=${client.client_secret}`,
      `GOOGLE_SHEETS_REFRESH_TOKEN=${tokens.refresh_token}`,
      "",
    ].join("\n"), { mode: 0o600 });
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end("<h1>Google Sheets authorization complete</h1><p>You can close this tab and return to Codex.</p>");
    console.log("GOOGLE_OAUTH_COMPLETE");
  } catch (reason) {
    response.writeHead(500, { "Content-Type": "text/plain" });
    response.end("Authorization could not be saved. Return to Codex.");
    console.error(reason instanceof Error ? reason.message : "OAuth exchange failed");
    process.exitCode = 1;
  } finally {
    server.close();
  }
});

server.listen(port, "127.0.0.1", () => console.log(authUrl.toString()));
