import "server-only";
import { createSign } from "node:crypto";
import { headers } from "next/headers";

import { WorkbookUnavailableError } from "@/lib/excel/repository";

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new WorkbookUnavailableError(`Google Sheets setting ${name} is not configured.`);
  return value;
};

const base64Url = (value: string) => Buffer.from(value).toString("base64url");

async function serviceAccountAccessToken() {
  const serviceAccountEmail = required("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const privateKey = required("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const unsignedToken = [
    base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" })),
    base64Url(JSON.stringify({
      iss: serviceAccountEmail,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })),
  ].join(".");
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();
  const assertion = `${unsignedToken}.${signer.sign(privateKey, "base64url")}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    const details = await response.json().catch(() => null) as { error?: string } | null;
    throw new WorkbookUnavailableError(`Google service account could not provide a Sheets access token (${details?.error ?? response.status}).`);
  }
  const payload = await response.json() as { access_token?: string };
  if (!payload.access_token) throw new WorkbookUnavailableError("Google returned no Sheets access token for the service account.");
  return payload.access_token;
}

async function oauthRefreshTokenAccessToken() {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: required("GOOGLE_SHEETS_CLIENT_ID"),
      client_secret: required("GOOGLE_SHEETS_CLIENT_SECRET"),
      refresh_token: required("GOOGLE_SHEETS_REFRESH_TOKEN"),
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    const details = await response.json().catch(() => null) as { error?: string } | null;
    throw new WorkbookUnavailableError(`Google OAuth could not provide a Sheets access token (${details?.error ?? response.status}).`);
  }
  const payload = await response.json() as { access_token?: string };
  if (!payload.access_token) throw new WorkbookUnavailableError("Google OAuth returned no Sheets access token.");
  return payload.access_token;
}

async function workloadIdentityAccessToken() {
  const serviceAccountEmail = required("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const projectNumber = required("GOOGLE_CLOUD_PROJECT_NUMBER");
  const poolId = required("GOOGLE_WORKLOAD_IDENTITY_POOL_ID");
  const providerId = required("GOOGLE_WORKLOAD_IDENTITY_PROVIDER_ID");
  const audience = `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`;
  const subjectToken = (await headers()).get("x-vercel-oidc-token") || process.env.VERCEL_OIDC_TOKEN;
  if (!subjectToken) throw new WorkbookUnavailableError("Vercel did not provide an OIDC token for Google Workload Identity Federation.");

  const exchangeResponse = await fetch("https://sts.googleapis.com/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      audience,
      requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
      subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
      subject_token: subjectToken,
      scope: "https://www.googleapis.com/auth/cloud-platform",
    }),
    cache: "no-store",
  });
  const exchangePayload = await exchangeResponse.json().catch(() => null) as { access_token?: string; error?: string } | null;
  if (!exchangeResponse.ok || !exchangePayload?.access_token) {
    throw new WorkbookUnavailableError(`Google Workload Identity Federation could not exchange the Vercel token (${exchangePayload?.error ?? exchangeResponse.status}).`);
  }

  const impersonationResponse = await fetch(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccountEmail)}:generateAccessToken`, {
    method: "POST",
    headers: { Authorization: `Bearer ${exchangePayload.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ scope: ["https://www.googleapis.com/auth/spreadsheets"], lifetime: "3600s" }),
    cache: "no-store",
  });
  const impersonationPayload = await impersonationResponse.json().catch(() => null) as { accessToken?: string; error?: { status?: string } } | null;
  if (!impersonationResponse.ok || !impersonationPayload?.accessToken) {
    throw new WorkbookUnavailableError(`Google could not issue a short-lived Sheets token for the service account (${impersonationPayload?.error?.status ?? impersonationResponse.status}).`);
  }
  return impersonationPayload.accessToken;
}

async function accessToken() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) return serviceAccountAccessToken();
  const hasWorkloadIdentitySettings = Boolean(process.env.GOOGLE_CLOUD_PROJECT_NUMBER || process.env.GOOGLE_WORKLOAD_IDENTITY_POOL_ID || process.env.GOOGLE_WORKLOAD_IDENTITY_PROVIDER_ID);
  if (hasWorkloadIdentitySettings) return workloadIdentityAccessToken();
  return oauthRefreshTokenAccessToken();
}

const sheetName = () => process.env.GOOGLE_SHEETS_TAB_NAME ?? "your-sheet-tab";
const spreadsheetId = () => required("GOOGLE_SHEETS_SPREADSHEET_ID");

async function request(path: string, init: RequestInit = {}) {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId())}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, ...(init.headers ?? {}) },
    cache: "no-store",
  });
  if (!response.ok) {
    const details = await response.json().catch(() => null) as { error?: { status?: string; message?: string } } | null;
    const isWrite = init.method === "POST" || path.includes("batchUpdate");
    const operation = isWrite ? "write" : "request";
    const googleMessage = details?.error?.message;
    const permissionHint = response.status === 403 && isWrite ? " The configured service account needs Editor access to this spreadsheet." : "";
    throw new WorkbookUnavailableError(`Google Sheets ${operation} failed (${details?.error?.status ?? response.status}).${permissionHint}${googleMessage ? ` ${googleMessage}` : ""}`);
  }
  return response;
}

export async function markGoogleSheetTicketCompleted(ticketNumber: string, staffName: string, completedAt: string) {
  const range = `${sheetName()}!S2:S`;
  const valuesResponse = await request(`/values/${encodeURIComponent(range)}`);
  const values = await valuesResponse.json() as { values?: unknown[][] };
  const offset = (values.values ?? []).findIndex((row) => String(row[0] ?? "").trim() === ticketNumber.trim());
  if (offset < 0) throw new WorkbookUnavailableError(`The source intake row for ticket ${ticketNumber} could not be found.`);
  const row = offset + 2;
  const body = {
    valueInputOption: "USER_ENTERED",
    data: [
      { range: `${sheetName()}!K${row}`, values: [["Yes"]] },
      { range: `${sheetName()}!P${row}`, values: [[completedAt]] },
      { range: `${sheetName()}!R${row}`, values: [[staffName]] },
    ],
  };
  await request("/values:batchUpdate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function readGoogleSheetIntakeRows() {
  const range = `${sheetName()}!A2:S`;
  const response = await request(`/values/${encodeURIComponent(range)}`);
  const payload = await response.json() as { values?: unknown[][] };
  return payload.values ?? [];
}

export async function updateGoogleSheetIntakeRow(row: number, updates: Array<[string, string]>) {
  await updateGoogleSheetIntakeRows([{ row, updates }]);
}

export async function updateGoogleSheetIntakeRows(rows: Array<{ row: number; updates: Array<[string, string]> }>) {
  await request("/values:batchUpdate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      valueInputOption: "USER_ENTERED",
      data: rows.flatMap(({ row, updates }) => updates.map(([column, value]) => ({ range: `${sheetName()}!${column}${row}`, values: [[value]] }))),
    }),
  });
}
