import "server-only";
import { WorkbookUnavailableError } from "./repository";

type GraphBody = Record<string, unknown> | undefined;

export class GraphExcelClient {
  private readonly base: string;
  constructor(private readonly accessToken: string, driveId: string, itemId: string) {
    this.base = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/workbook`;
  }

  async createSession() {
    const response = await this.request<{ id: string }>("/createSession", { method: "POST", body: { persistChanges: true } }, false);
    return response.id;
  }

  async closeSession(sessionId: string) {
    await this.request("/closeSession", { method: "POST", sessionId }, false).catch(() => undefined);
  }

  async listTableRows(table: string, sessionId: string) {
    const rows: Array<{ index: number; values: unknown[][] }> = [];
    let path: string | null = `/tables/${encodeURIComponent(table)}/rows?$top=500`;
    while (path) {
      const page: { value?: Array<{ index: number; values: unknown[][] }>; "@odata.nextLink"?: string } = await this.request(path, { sessionId });
      rows.push(...(page.value ?? []));
      path = page["@odata.nextLink"]?.replace(this.base, "") ?? null;
    }
    return rows;
  }

  async listTables(sessionId: string) {
    const response = await this.request<{ value?: Array<{ name: string }> }>("/tables?$select=name", { sessionId });
    return response.value ?? [];
  }

  async addRow(table: string, values: unknown[], sessionId: string) {
    return this.request(`/tables/${encodeURIComponent(table)}/rows/add`, { method: "POST", body: { values: [values] }, sessionId });
  }

  async replaceRow(table: string, index: number, values: unknown[], sessionId: string) {
    return this.request(`/tables/${encodeURIComponent(table)}/rows/itemAt(index=${index})/range`, { method: "PATCH", body: { values: [values] }, sessionId });
  }

  private async request<T = unknown>(path: string, options: { method?: string; body?: GraphBody; sessionId?: string } = {}, retry = true): Promise<T> {
    const url = path.startsWith("https://") ? path : `${this.base}${path}`;
    for (let attempt = 0; attempt < (retry ? 4 : 2); attempt += 1) {
      const response = await fetch(url, {
        method: options.method ?? "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
          ...(options.sessionId ? { "workbook-session-id": options.sessionId } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      if (response.ok) return (response.status === 204 ? undefined : await response.json()) as T;
      const transient = response.status === 429 || response.status === 408 || response.status >= 500;
      if (!transient || attempt === (retry ? 3 : 1)) {
        const requestId = response.headers.get("request-id");
        throw new WorkbookUnavailableError(`Microsoft Graph returned ${response.status}${requestId ? ` (request ${requestId})` : ""}.`);
      }
      const retryAfter = Number(response.headers.get("retry-after"));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt + Math.floor(Math.random() * 150);
      await new Promise((resolve) => setTimeout(resolve, Math.min(delay, 5000)));
    }
    throw new WorkbookUnavailableError();
  }
}

export async function getWorkbookAccessToken() {
  const tenant = process.env.MICROSOFT_TENANT_ID;
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const refreshToken = process.env.WORKBOOK_OPERATOR_REFRESH_TOKEN;
  if (!tenant || !clientId || !clientSecret || !refreshToken) throw new WorkbookUnavailableError("Microsoft workbook authorization is not configured.");

  const response = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token", refresh_token: refreshToken, scope: "offline_access https://graph.microsoft.com/Files.ReadWrite https://graph.microsoft.com/Mail.Send" }),
  });
  if (!response.ok) throw new WorkbookUnavailableError("Microsoft workbook authorization needs administrator attention.");
  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) throw new WorkbookUnavailableError("Microsoft did not return a workbook access token.");
  return payload.access_token;
}
