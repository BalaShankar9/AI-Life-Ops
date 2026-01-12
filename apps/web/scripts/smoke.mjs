import { setTimeout as delay } from "node:timers/promises";

const WEB_BASE_URL = process.env.WEB_BASE_URL || "http://localhost:3000";
const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:4000";

const CHECKIN_PAYLOAD = {
  sleep_hours: 7,
  energy_level: 6,
  stress_level: 5,
  money_pressure: 5,
  today_deadlines_count: 2,
  critical_deadline: false,
  available_time_hours: 6,
  notes: "Web smoke test"
};

const PROFILE_PAYLOAD = {
  timezone: "UTC",
  wake_window_start: "07:00",
  wake_window_end: "10:00",
  sleep_window_start: "22:00",
  sleep_window_end: "06:00",
  work_pattern: "day",
  max_daily_focus_blocks: 2,
  priority_bias: "stability_first",
  compliance_domains: ["bills", "visa/legal"]
};

function getWeekStart() {
  const now = new Date();
  const utcDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const day = utcDate.getUTCDay();
  const offset = (day + 6) % 7;
  utcDate.setUTCDate(utcDate.getUTCDate() - offset);
  return utcDate.toISOString().slice(0, 10);
}

async function main() {
  await waitFor(`${API_BASE_URL}/health`, "API");
  await waitFor(`${WEB_BASE_URL}/login`, "Web");

  const cookieJar = new Map();
  const credentials = buildCredentials();

  const register = await fetchWithCookies(
    `${API_BASE_URL}/auth/register`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(credentials)
    },
    cookieJar
  );

  if (!register.ok) {
    const body = await safeJson(register);
    throw new Error(
      `Register failed (${register.status}): ${JSON.stringify(body)}`
    );
  }

  const profile = await fetchWithCookies(
    `${API_BASE_URL}/api/profile`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(PROFILE_PAYLOAD)
    },
    cookieJar
  );

  if (!profile.ok) {
    const body = await safeJson(profile);
    throw new Error(
      `Onboarding profile failed (${profile.status}): ${JSON.stringify(body)}`
    );
  }

  const checkinPage = await fetchWithCookies(
    `${WEB_BASE_URL}/checkin`,
    { headers: { Accept: "text/html" }, redirect: "manual" },
    cookieJar
  );

  if (checkinPage.status >= 300 && checkinPage.status < 400) {
    throw new Error("Check-in page redirected (auth or onboarding issue)");
  }

  const checkin = await fetchWithCookies(
    `${API_BASE_URL}/api/checkins`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(CHECKIN_PAYLOAD)
    },
    cookieJar
  );

  const checkinBody = await safeJson(checkin);
  if (!checkin.ok) {
    throw new Error(
      `Check-in failed (${checkin.status}): ${JSON.stringify(checkinBody)}`
    );
  }

  const score =
    checkinBody?.data?.snapshot?.output?.life_stability_score ?? null;
  if (typeof score !== "number") {
    throw new Error("Check-in response missing life_stability_score");
  }
  const schedulePlan = checkinBody?.data?.snapshot?.output?.schedule_plan;
  if (!Array.isArray(schedulePlan) || schedulePlan.length === 0) {
    throw new Error("Check-in response missing schedule plan");
  }

  const weekStart = getWeekStart();
  const weekly = await fetchWithCookies(
    `${API_BASE_URL}/api/weekly/generate?weekStart=${weekStart}`,
    { method: "POST", headers: { Accept: "application/json" } },
    cookieJar
  );

  const weeklyBody = await safeJson(weekly);
  if (!weekly.ok) {
    throw new Error(
      `Weekly generate failed (${weekly.status}): ${JSON.stringify(weeklyBody)}`
    );
  }

  const summary = weeklyBody?.data?.report?.content?.summary;
  const focusItems = weeklyBody?.data?.report?.content?.next_week_focus;
  const weeklyConfidenceReasons =
    weeklyBody?.data?.report?.content?.confidence_reasons;
  if (typeof summary !== "string") {
    throw new Error("Weekly report missing summary");
  }
  if (!Array.isArray(focusItems) || focusItems.length === 0) {
    throw new Error("Weekly report missing next_week_focus");
  }
  if (!Array.isArray(weeklyConfidenceReasons) || weeklyConfidenceReasons.length === 0) {
    throw new Error("Weekly report missing confidence reasons");
  }

  const today = await fetchWithCookies(
    `${API_BASE_URL}/api/today`,
    { headers: { Accept: "application/json" } },
    cookieJar
  );

  if (!today.ok) {
    throw new Error(`Today API failed (${today.status})`);
  }

  const todayBody = await safeJson(today);
  const output = todayBody?.data?.snapshot?.output;
  if (!output || typeof output.life_stability_score !== "number") {
    throw new Error("Today API response missing score");
  }
  if (!Array.isArray(output.priorities) || output.priorities.length === 0) {
    throw new Error("Today API response missing priorities");
  }
  if (!Array.isArray(output.confidence_reasons) || output.confidence_reasons.length === 0) {
    throw new Error("Today API response missing confidence reasons");
  }

  const todayPage = await fetchWithCookies(
    `${WEB_BASE_URL}/today`,
    { headers: { Accept: "text/html" }, redirect: "manual" },
    cookieJar
  );

  if (todayPage.status >= 300 && todayPage.status < 400) {
    throw new Error("Today page redirected (auth or onboarding issue)");
  }

  const html = await todayPage.text();
  const normalized = html.replace(/&#x27;|&#39;/g, "'");
  const priorityTitle = output.priorities[0]?.title || "";

  if (!normalized.includes("Life Stability Score")) {
    throw new Error("Today page missing Life Stability Score section");
  }
  if (!normalized.includes("Today's Time Plan")) {
    throw new Error("Today page missing time plan section");
  }
  if (!normalized.includes(String(output.life_stability_score))) {
    throw new Error("Today page missing stability score value");
  }
  if (priorityTitle && !normalized.includes(priorityTitle)) {
    throw new Error("Today page missing priority content");
  }
  if (!normalized.includes("Confidence")) {
    throw new Error("Today page missing confidence section");
  }
  const confidenceReason = output.confidence_reasons[0] || "";
  if (confidenceReason && !normalized.includes(confidenceReason)) {
    throw new Error("Today page missing confidence reason");
  }

  const weeklyPage = await fetchWithCookies(
    `${WEB_BASE_URL}/weekly`,
    { headers: { Accept: "text/html" }, redirect: "manual" },
    cookieJar
  );

  if (weeklyPage.status >= 300 && weeklyPage.status < 400) {
    throw new Error("Weekly page redirected (auth or onboarding issue)");
  }

  const weeklyHtml = await weeklyPage.text();
  const normalizedWeekly = weeklyHtml.replace(/&#x27;|&#39;/g, "'");
  if (!normalizedWeekly.includes("Weekly review")) {
    throw new Error("Weekly page missing title");
  }
  if (!normalizedWeekly.includes(summary)) {
    throw new Error("Weekly page missing summary content");
  }
  if (!normalizedWeekly.includes("Confidence")) {
    throw new Error("Weekly page missing confidence section");
  }
  const weeklyConfidenceReason =
    weeklyBody?.data?.report?.content?.confidence_reasons?.[0] || "";
  if (weeklyConfidenceReason && !normalizedWeekly.includes(weeklyConfidenceReason)) {
    throw new Error("Weekly page missing confidence reason");
  }

  const pdf = await fetchWithCookies(
    `${API_BASE_URL}/api/weekly/pdf?weekStart=${weekStart}`,
    { method: "POST", headers: { Accept: "application/pdf" } },
    cookieJar
  );
  if (!pdf.ok) {
    throw new Error(`Weekly PDF failed (${pdf.status})`);
  }
  const pdfType = pdf.headers.get("content-type") || "";
  if (!pdfType.includes("application/pdf")) {
    throw new Error("Weekly PDF response missing application/pdf content type");
  }

  const simulatePage = await fetchWithCookies(
    `${WEB_BASE_URL}/simulate`,
    { headers: { Accept: "text/html" }, redirect: "manual" },
    cookieJar
  );

  if (simulatePage.status >= 300 && simulatePage.status < 400) {
    throw new Error("Simulate page redirected (auth or onboarding issue)");
  }

  const scenarioPack = await fetchWithCookies(
    `${API_BASE_URL}/api/scenario-packs`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        name: "Smoke test pack",
        description: "Testing scenario simulation",
        baseline_source: "latest_checkin",
        scenarios: [
          {
            id: "smoke-job",
            type: "add_job",
            params: {
              hours_per_week: 20,
              shift_type: "day",
              commute_min_per_day: 30,
              pay_per_month: 2500
            }
          },
          {
            id: "smoke-expense",
            type: "increase_expense",
            params: {
              amount_per_month: 400,
              category: "housing"
            }
          }
        ]
      })
    },
    cookieJar
  );

  if (!scenarioPack.ok) {
    const body = await safeJson(scenarioPack);
    throw new Error(
      `Scenario pack creation failed (${scenarioPack.status}): ${JSON.stringify(body)}`
    );
  }

  const compareResult = await fetchWithCookies(
    `${API_BASE_URL}/api/compare`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        scenarios: [
          {
            id: "smoke-job",
            type: "add_job",
            params: {
              hours_per_week: 20,
              shift_type: "day",
              commute_min_per_day: 30,
              pay_per_month: 2500
            }
          },
          {
            id: "smoke-expense",
            type: "increase_expense",
            params: {
              amount_per_month: 400,
              category: "housing"
            }
          }
        ]
      })
    },
    cookieJar
  );

  if (!compareResult.ok) {
    const body = await safeJson(compareResult);
    throw new Error(
      `Scenario comparison failed (${compareResult.status}): ${JSON.stringify(body)}`
    );
  }

  const compareData = await safeJson(compareResult);
  if (!compareData?.data?.comparison?.ranked) {
    throw new Error("Compare result missing ranked scenarios");
  }

  const auditPage = await fetchWithCookies(
    `${WEB_BASE_URL}/audit`,
    { headers: { Accept: "text/html" }, redirect: "manual" },
    cookieJar
  );

  if (auditPage.status >= 300 && auditPage.status < 400) {
    throw new Error("Audit page redirected (auth or onboarding issue)");
  }

  const auditHtml = await auditPage.text();
  const normalizedAudit = auditHtml.replace(/&#x27;|&#39;/g, "'");
  if (!normalizedAudit.includes("Audit log")) {
    throw new Error("Audit page missing title");
  }
  if (!normalizedAudit.includes("Account created")) {
    throw new Error("Audit page missing expected event content");
  }

  console.log("Web smoke test passed");
}

async function waitFor(url, label) {
  const timeoutMs = 20000;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { method: "GET" });
      if (response.ok) {
        return;
      }
    } catch {
      // ignore until timeout
    }
    await delay(500);
  }

  throw new Error(`${label} not reachable at ${url}`);
}

async function safeJson(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function buildCredentials() {
  const seed = Date.now().toString(36);
  return {
    email: `smoke-${seed}@ai-life-ops.local`,
    password: `Test${seed}#1`
  };
}

async function fetchWithCookies(url, options, jar) {
  const headers = new Headers(options?.headers || {});
  const cookie = serializeCookies(jar);
  if (cookie) {
    headers.set("Cookie", cookie);
  }
  const response = await fetch(url, { ...options, headers });
  storeCookies(jar, response);
  return response;
}

function storeCookies(jar, response) {
  const setCookies = extractSetCookies(response);
  for (const cookie of setCookies) {
    const [pair] = cookie.split(";");
    const [name, value] = pair.split("=");
    if (name && value) {
      jar.set(name.trim(), value.trim());
    }
  }
}

function extractSetCookies(response) {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }
  const header = response.headers.get("set-cookie");
  return header ? [header] : [];
}

function serializeCookies(jar) {
  return Array.from(jar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
