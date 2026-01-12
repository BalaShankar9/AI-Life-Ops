import { spawn } from "child_process";

import type { Logger } from "pino";
import type { PrismaClient, Profile, Snapshot, WeeklyReport } from "@prisma/client";
import {
  EngineOutputSchema,
  WeeklyReviewSchema
} from "@ai-life-ops/shared";
import type { EngineOutput, WeeklyReview } from "@ai-life-ops/shared";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type WeeklyReportOutput = {
  id: string;
  week_start: string;
  week_end: string;
  created_at: string;
  content: WeeklyReview;
};

export type WeeklyReportListItem = {
  id: string;
  week_start: string;
  week_end: string;
  created_at: string;
};

export function parseWeekStart(weekStart: string) {
  if (!DATE_PATTERN.test(weekStart)) {
    throw new Error("weekStart must be YYYY-MM-DD");
  }

  const startDate = new Date(`${weekStart}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime())) {
    throw new Error("weekStart is not a valid date");
  }

  const endDate = addDays(startDate, 6);
  const endExclusive = addDays(startDate, 7);

  return {
    weekStart,
    weekEnd: formatDate(endDate),
    startDate,
    endDate,
    endExclusive
  };
}

export function serializeWeeklyReport(report: WeeklyReport): WeeklyReportOutput {
  return {
    id: report.id,
    week_start: formatDate(report.weekStart),
    week_end: formatDate(report.weekEnd),
    created_at: report.createdAt.toISOString(),
    content: report.content as WeeklyReview
  };
}

export function serializeWeeklyReportListItem(
  report: WeeklyReport
): WeeklyReportListItem {
  return {
    id: report.id,
    week_start: formatDate(report.weekStart),
    week_end: formatDate(report.weekEnd),
    created_at: report.createdAt.toISOString()
  };
}

export async function generateWeeklyReport(params: {
  prisma: PrismaClient;
  logger: Logger;
  userId: string;
  weekStart: string;
  requestId?: string;
}): Promise<WeeklyReportOutput> {
  const { prisma, logger, userId, weekStart, requestId } = params;
  const range = parseWeekStart(weekStart);

  const profile = await prisma.profile.findUnique({ where: { userId } });
  if (!profile || !profile.onboarding_completed_at) {
    throw new Error("Complete onboarding before generating a weekly review");
  }

  const snapshots = await prisma.snapshot.findMany({
    where: {
      userId,
      createdAt: {
        gte: range.startDate,
        lt: range.endExclusive
      }
    },
    orderBy: { createdAt: "asc" }
  });

  const weeklySnapshots = buildWeeklySnapshots(snapshots, logger, requestId);
  const profileContext = buildProfileContext(profile);

  const payload = {
    weekly_snapshots: weeklySnapshots,
    profile_context: profileContext,
    week_range: {
      start: range.weekStart,
      end: range.weekEnd
    }
  };

  const rawOutput = await runWeeklyEngine(payload, logger, requestId);
  const parsed = WeeklyReviewSchema.safeParse(rawOutput);
  if (!parsed.success) {
    logger.error(
      { request_id: requestId, issues: parsed.error.issues },
      "Weekly review output failed schema validation"
    );
    throw new Error("Weekly review output invalid");
  }

  const report = await prisma.$transaction(async (tx) => {
    const upserted = await tx.weeklyReport.upsert({
      where: {
        userId_weekStart: {
          userId,
          weekStart: range.startDate
        }
      },
      update: {
        weekEnd: range.endDate,
        content: parsed.data
      },
      create: {
        userId,
        weekStart: range.startDate,
        weekEnd: range.endDate,
        content: parsed.data
      }
    });

    await tx.auditLog.create({
      data: {
        userId,
        eventType: "WEEKLY_REPORT_GENERATED",
        metadata: {
          weeklyReportId: upserted.id,
          weekStart: range.weekStart
        }
      }
    });

    return upserted;
  });

  return serializeWeeklyReport(report);
}

export async function fetchWeeklyReport(params: {
  prisma: PrismaClient;
  userId: string;
  weekStart: string;
}): Promise<WeeklyReportOutput | null> {
  const { prisma, userId, weekStart } = params;
  const range = parseWeekStart(weekStart);

  const report = await prisma.weeklyReport.findUnique({
    where: {
      userId_weekStart: {
        userId,
        weekStart: range.startDate
      }
    }
  });

  return report ? serializeWeeklyReport(report) : null;
}

export async function fetchLatestWeeklyReport(params: {
  prisma: PrismaClient;
  userId: string;
}): Promise<WeeklyReportOutput | null> {
  const { prisma, userId } = params;
  const report = await prisma.weeklyReport.findFirst({
    where: { userId },
    orderBy: { weekStart: "desc" }
  });

  return report ? serializeWeeklyReport(report) : null;
}

export async function fetchWeeklyReportList(params: {
  prisma: PrismaClient;
  userId: string;
  limit: number;
}): Promise<WeeklyReportListItem[]> {
  const { prisma, userId, limit } = params;
  const reports = await prisma.weeklyReport.findMany({
    where: { userId },
    orderBy: { weekStart: "desc" },
    take: limit
  });

  return reports.map(serializeWeeklyReportListItem);
}

export function buildWeeklyPdfHtml(report: WeeklyReportOutput) {
  const content = report.content;
  const topRisks = content.top_risks
    .map((risk) =>
      `<li><strong>${escapeHtml(risk.flag.replace(/_/g, " "))}</strong> (${risk.frequency} days) - ${escapeHtml(risk.why_it_matters)}</li>`
    )
    .join("");
  const wins = content.wins.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const misses = content.misses
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  const focus = content.next_week_focus
    .map(
      (item) =>
        `<li><strong>${escapeHtml(item.title)}</strong> - ${escapeHtml(
          item.why
        )} <em>${escapeHtml(item.target)}</em></li>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Weekly Review</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1f2937; margin: 32px; }
    h1 { font-size: 22px; margin-bottom: 6px; }
    h2 { font-size: 16px; margin-top: 24px; }
    p { font-size: 13px; line-height: 1.5; }
    .meta { font-size: 12px; color: #6b7280; }
    .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-top: 12px; }
    ul { padding-left: 18px; }
    li { margin-bottom: 6px; font-size: 13px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  </style>
</head>
<body>
  <h1>AI Life Ops Weekly Review</h1>
  <p class="meta">Week ${escapeHtml(report.week_start)} to ${escapeHtml(
    report.week_end
  )}</p>
  <div class="card">
    <p>${escapeHtml(content.summary)}</p>
  </div>
  <div class="card">
    <h2>Score trend</h2>
    <p>Start: ${content.score_trend.start_score} | End: ${
    content.score_trend.end_score
  } | Delta: ${content.score_trend.delta}</p>
  </div>
  <div class="card">
    <h2>Top risks</h2>
    <ul>${topRisks || "<li>No recurring risks</li>"}</ul>
  </div>
  <div class="card grid">
    <div>
      <h2>Wins</h2>
      <ul>${wins || "<li>No wins logged</li>"}</ul>
    </div>
    <div>
      <h2>Misses</h2>
      <ul>${misses || "<li>No misses logged</li>"}</ul>
    </div>
  </div>
  <div class="card">
    <h2>Next week focus</h2>
    <ul>${focus || "<li>No focus items yet</li>"}</ul>
  </div>
</body>
</html>`;
}

export async function renderWeeklyPdf(html: string) {
  const puppeteerModule = await import("puppeteer");
  const puppeteer =
    (puppeteerModule as { default?: typeof import("puppeteer") }).default ??
    puppeteerModule;
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    return await page.pdf({ format: "A4", printBackground: true });
  } finally {
    await browser.close();
  }
}

function buildWeeklySnapshots(
  snapshots: Snapshot[],
  logger: Logger,
  requestId?: string
) {
  const byDate = new Map<string, Snapshot>();
  for (const snapshot of snapshots) {
    const dateKey = formatDate(snapshot.createdAt);
    byDate.set(dateKey, snapshot);
  }

  const unique = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, snapshot]) => snapshot);

  return unique.map((snapshot) => {
    const parsed = EngineOutputSchema.safeParse(snapshot.output);
    if (!parsed.success) {
      logger.error(
        { request_id: requestId, issues: parsed.error.issues },
        "Stored snapshot output failed schema validation"
      );
      throw new Error("Stored snapshot output invalid");
    }
    const output: EngineOutput = parsed.data;
    return {
      date: formatDate(snapshot.createdAt),
      life_stability_score: output.life_stability_score,
      breakdown: output.breakdown,
      flags: output.flags,
      priorities: output.priorities.map((item) => ({
        title: item.title,
        category: item.category
      }))
    };
  });
}

function buildProfileContext(profile: Profile) {
  return {
    timezone: profile.timezone,
    wake_window_start: profile.wake_window_start,
    wake_window_end: profile.wake_window_end,
    sleep_window_start: profile.sleep_window_start,
    sleep_window_end: profile.sleep_window_end,
    work_pattern: profile.work_pattern,
    max_daily_focus_blocks: profile.max_daily_focus_blocks,
    priority_bias: profile.priority_bias,
    compliance_domains: profile.compliance_domains
  };
}

async function runWeeklyEngine(
  input: unknown,
  logger: Logger,
  requestId?: string
): Promise<unknown> {
  const entrypoint =
    process.env.WEEKLY_ENGINE_ENTRYPOINT || "../../packages/engine/weekly_cli.py";
  const pythonPath = process.env.ENGINE_PYTHON_PATH || "python3";
  const timeoutEnv = Number(process.env.WEEKLY_ENGINE_TIMEOUT_MS || process.env.ENGINE_TIMEOUT_MS || 5000);
  const timeoutMs = Number.isFinite(timeoutEnv) ? timeoutEnv : 5000;

  return new Promise((resolve, reject) => {
    const child = spawn(pythonPath, [entrypoint], {
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Weekly engine timeout"));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        logger.error(
          { request_id: requestId, code, stderr },
          "Weekly engine process failed"
        );
        reject(new Error("Weekly engine failed"));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        logger.error(
          { request_id: requestId, stderr },
          "Weekly engine output parse error"
        );
        reject(new Error("Weekly engine output invalid"));
      }
    });

    child.stdin.write(JSON.stringify(input));
    child.stdin.end();
  });
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
