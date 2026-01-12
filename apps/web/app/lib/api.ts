import {
  ApiErrorSchema,
  AuditResponseSchema,
  CheckinResponseSchema,
  CompareResponseSchema,
  ConnectorAuthUrlResponseSchema,
  ConnectorDisconnectResponseSchema,
  ConnectorsResponseSchema,
  ConnectorSyncResponseSchema,
  HistoryResponseSchema,
  OnboardingStatusResponseSchema,
  PersonalizationResponseSchema,
  ProfileResponseSchema,
  ScenarioPackListResponseSchema,
  ScenarioPackResponseSchema,
  SimulateResponseSchema,
  TodayResponseSchema,
  WeeklyReportListResponseSchema,
  WeeklyReportResponseSchema
} from "@ai-life-ops/shared";
import type {
  CheckinInput,
  HistoryItem,
  AuditEvent,
  ConnectorSummary,
  ProfileInput,
  Snapshot,
  Scenario,
  ScenarioPack,
  ScenarioPackInput,
  ScenarioPackListItem,
  SimulationResult,
  ComparisonResult,
  WeeklyReport,
  WeeklyReportListItem,
  PersonalizationResponse
} from "@ai-life-ops/shared";

export type AuthUser = {
  id: string;
  email: string;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:4000";

export async function createCheckin(input: CheckinInput): Promise<Snapshot> {
  const payload = await apiRequest("/api/checkins", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  const parsed = CheckinResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("Unexpected check-in response");
  }

  return parsed.data.data.snapshot;
}

export async function fetchToday(): Promise<Snapshot> {
  const payload = await apiRequest("/api/today", {
    method: "GET",
    cache: "no-store"
  });

  const parsed = TodayResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("Unexpected today response");
  }

  return parsed.data.data.snapshot;
}

export async function fetchHistory(limit = 30): Promise<HistoryItem[]> {
  const payload = await apiRequest(`/api/history?limit=${limit}`, {
    method: "GET",
    cache: "no-store"
  });

  const parsed = HistoryResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("Unexpected history response");
  }

  return parsed.data.data.items;
}

export async function fetchAuditEvents(limit = 100): Promise<AuditEvent[]> {
  const payload = await apiRequest(`/api/audit?limit=${limit}`, {
    method: "GET",
    cache: "no-store"
  });

  const parsed = AuditResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("Unexpected audit response");
  }

  return parsed.data.data.events;
}

export async function fetchScenarioPacks(): Promise<ScenarioPackListItem[]> {
  const payload = await apiRequest("/api/scenario-packs", {
    method: "GET",
    cache: "no-store"
  });

  const parsed = ScenarioPackListResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("Unexpected scenario pack list response");
  }

  return parsed.data.data.packs;
}

export async function fetchScenarioPack(id: string): Promise<ScenarioPack> {
  const payload = await apiRequest(`/api/scenario-packs/${id}`, {
    method: "GET",
    cache: "no-store"
  });

  const parsed = ScenarioPackResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("Unexpected scenario pack response");
  }

  return parsed.data.data.pack;
}

export async function createScenarioPack(
  input: ScenarioPackInput
): Promise<ScenarioPack> {
  const payload = await apiRequest("/api/scenario-packs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  const parsed = ScenarioPackResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("Unexpected scenario pack response");
  }

  return parsed.data.data.pack;
}

export async function updateScenarioPack(
  id: string,
  input: ScenarioPackInput
): Promise<ScenarioPack> {
  const payload = await apiRequest(`/api/scenario-packs/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  const parsed = ScenarioPackResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("Unexpected scenario pack response");
  }

  return parsed.data.data.pack;
}

export async function deleteScenarioPack(id: string): Promise<void> {
  await apiRequest(`/api/scenario-packs/${id}`, {
    method: "DELETE"
  });
}

export async function simulateScenario(
  scenario: Scenario,
  baselineDate?: string
): Promise<SimulationResult> {
  const payload = await apiRequest("/api/simulate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      scenario,
      baseline_date: baselineDate
    })
  });

  const parsed = SimulateResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("Unexpected simulate response");
  }

  return parsed.data.data.result;
}

export async function compareScenarios(
  scenarios: Scenario[],
  baselineDate?: string,
  packId?: string
): Promise<{
  comparison: ComparisonResult;
  simulations: SimulationResult[];
}> {
  const payload = await apiRequest("/api/compare", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      scenarios,
      baseline_date: baselineDate,
      pack_id: packId
    })
  });

  const parsed = CompareResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("Unexpected compare response");
  }

  return parsed.data.data;
}

export async function fetchConnectors(): Promise<ConnectorSummary[]> {
  const payload = await apiRequest("/api/connectors", {
    method: "GET",
    cache: "no-store"
  });

  const parsed = ConnectorsResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("Unexpected connectors response");
  }

  return parsed.data.data.connectors;
}

export async function fetchConnectorAuthUrl(provider: string): Promise<string> {
  const payload = await apiRequest(`/api/connectors/${provider}/auth-url`, {
    method: "GET"
  });

  const parsed = ConnectorAuthUrlResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("Unexpected connector auth response");
  }

  return parsed.data.data.url;
}

export async function syncConnector(provider: string): Promise<string> {
  const payload = await apiRequest(`/api/connectors/${provider}/sync`, {
    method: "POST"
  });

  const parsed = ConnectorSyncResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("Unexpected connector sync response");
  }

  return parsed.data.data.job_id;
}

export async function disconnectConnector(
  provider: string
): Promise<ConnectorSummary> {
  const payload = await apiRequest(`/api/connectors/${provider}/disconnect`, {
    method: "POST"
  });

  const parsed = ConnectorDisconnectResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("Unexpected connector disconnect response");
  }

  return parsed.data.data.connector;
}

export async function fetchLatestWeeklyReport(): Promise<WeeklyReport | null> {
  const payload = await apiRequest("/api/weekly/latest", {
    method: "GET",
    cache: "no-store"
  });

  const parsed = WeeklyReportResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("Unexpected weekly report response");
  }

  return parsed.data.data.report;
}

export async function fetchWeeklyReportList(
  limit = 12
): Promise<WeeklyReportListItem[]> {
  const payload = await apiRequest(`/api/weekly/list?limit=${limit}`, {
    method: "GET",
    cache: "no-store"
  });

  const parsed = WeeklyReportListResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("Unexpected weekly report list response");
  }

  return parsed.data.data.items;
}

export async function generateWeeklyReport(
  weekStart: string
): Promise<WeeklyReport> {
  const payload = await apiRequest(
    `/api/weekly/generate?weekStart=${encodeURIComponent(weekStart)}`,
    {
      method: "POST"
    }
  );

  const parsed = WeeklyReportResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("Unexpected weekly report response");
  }

  const report = parsed.data.data.report;
  if (!report) {
    throw new Error("Weekly report not returned");
  }

  return report;
}

export async function downloadWeeklyPdf(weekStart: string): Promise<Blob> {
  const response = await fetch(
    `${API_BASE_URL}/api/weekly/pdf?weekStart=${encodeURIComponent(weekStart)}`,
    {
      method: "POST",
      headers: {
        Accept: "application/pdf"
      },
      credentials: "include"
    }
  );

  if (response.ok) {
    return await response.blob();
  }

  const { json, text } = await parseResponse(response);
  throw new Error(extractErrorMessage(json, text, response.status));
}

export async function fetchProfile() {
  const payload = await apiRequest("/api/profile", {
    method: "GET",
    cache: "no-store"
  });

  const parsed = ProfileResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("Unexpected profile response");
  }

  return parsed.data.data.profile;
}

export async function updateProfile(input: ProfileInput) {
  const payload = await apiRequest("/api/profile", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  const parsed = ProfileResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("Unexpected profile response");
  }

  if (!parsed.data.data.profile) {
    throw new Error("Profile not returned");
  }

  return parsed.data.data.profile;
}

export async function fetchOnboardingStatus() {
  const payload = await apiRequest("/api/onboarding/status", {
    method: "GET",
    cache: "no-store"
  });

  const parsed = OnboardingStatusResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("Unexpected onboarding status response");
  }

  return parsed.data.data.completed;
}

export async function loginRequest(email: string, password: string) {
  await apiRequest("/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });
  
  // Fetch CSRF token after successful login
  await initCsrfToken();
}

export async function registerRequest(email: string, password: string) {
  await apiRequest("/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });
}

export async function logoutRequest() {
  await apiRequest("/auth/logout", {
    method: "POST"
  });
}

export async function fetchMe(): Promise<AuthUser | null> {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    method: "GET",
    headers: {
      Accept: "application/json"
    },
    credentials: "include",
    cache: "no-store"
  });

  if (response.status === 401 || response.status === 403) {
    return null;
  }

  const { json, text } = await parseResponse(response);

  if (!response.ok) {
    throw new Error(extractErrorMessage(json, text, response.status));
  }

  const user = extractUser(json);
  if (!user) {
    throw new Error("Auth response missing user details");
  }

  return user;
}

// CSRF Token management
let csrfToken: string | null = null;

async function fetchCsrfToken(): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/csrf`, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include",
      cache: "no-store"
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (data.ok && data.data?.csrfToken) {
      csrfToken = data.data.csrfToken;
      return csrfToken;
    }
  } catch (error) {
    console.error("Failed to fetch CSRF token:", error);
  }
  return null;
}

export async function initCsrfToken() {
  await fetchCsrfToken();
}

async function apiRequest(path: string, options: RequestInit): Promise<unknown> {
  const headers = new Headers(options.headers || {});
  headers.set("Accept", "application/json");

  // Inject active org ID if available
  if (typeof window !== "undefined") {
    const activeOrgId = localStorage.getItem("activeOrgId");
    if (activeOrgId) {
      headers.set("X-Org-Id", activeOrgId);
    }
  }

  // Attach CSRF token for state-changing requests
  const method = options.method?.toUpperCase() || "GET";
  if (["POST", "PUT", "DELETE"].includes(method)) {
    // Fetch CSRF token if we don't have one
    if (!csrfToken) {
      await fetchCsrfToken();
    }
    
    if (csrfToken) {
      headers.set("X-CSRF-Token", csrfToken);
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: "include"
  });

  const { json, text } = await parseResponse(response);

  if (!response.ok) {
    // If we get CSRF error, try to refresh token and retry once
    if (response.status === 403 && text.includes("CSRF")) {
      csrfToken = null;
      await fetchCsrfToken();
      
      if (csrfToken && ["POST", "PUT", "DELETE"].includes(method)) {
        headers.set("X-CSRF-Token", csrfToken);
        
        const retryResponse = await fetch(`${API_BASE_URL}${path}`, {
          ...options,
          headers,
          credentials: "include"
        });
        
        const retryParsed = await parseResponse(retryResponse);
        if (retryResponse.ok) {
          return retryParsed.json;
        }
      }
    }
    
    throw new Error(extractErrorMessage(json, text, response.status));
  }

  if (json === null) {
    throw new Error("Empty response from API");
  }

  return json;
}

async function parseResponse(
  response: Response
): Promise<{ json: unknown | null; text: string }> {
  const text = await response.text();
  if (!text) {
    return { json: null, text: "" };
  }

  try {
    return { json: JSON.parse(text), text };
  } catch {
    return { json: null, text };
  }
}

function extractErrorMessage(
  payload: unknown,
  text: string,
  status: number
): string {
  if (status === 401 || status === 403) {
    return "Please sign in to continue.";
  }

  const parsed = ApiErrorSchema.safeParse(payload);
  if (parsed.success) {
    const requestId = parsed.data.error.request_id;
    if (requestId) {
      return `${parsed.data.error.message} (request ${requestId})`;
    }
    return parsed.data.error.message;
  }

  const trimmed = text.trim();
  if (trimmed) {
    return trimmed.slice(0, 180);
  }

  return `Request failed (${status})`;
}

function extractUser(payload: unknown): AuthUser | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const root = payload as Record<string, unknown>;
  const data = root.data && typeof root.data === "object" ? root.data : null;
  const candidate =
    data && "user" in data ? (data as Record<string, unknown>).user : root.user;

  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const user = candidate as Record<string, unknown>;
  const email = typeof user.email === "string" ? user.email : null;
  const id = typeof user.id === "string" ? user.id : null;

  if (!email) {
    return null;
  }

  return {
    id: id || email,
    email
  };
}

// Generic API client for personalization and other endpoints
export async function apiClient<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  const payload = await apiRequest(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store"
  });

  const response = payload as { ok: boolean; data?: T };
  if (!response.ok || !response.data) {
    throw new Error("API request failed");
  }

  return response.data;
}

