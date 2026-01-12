"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ProfileInputSchema } from "@ai-life-ops/shared";
import type {
  PriorityBias,
  Profile,
  ProfileInput,
  WorkPattern
} from "@ai-life-ops/shared";

import { useAuth } from "../components/auth-provider";
import { fetchProfile, updateProfile } from "../lib/api";

type FormState = ProfileInput;
type FieldErrors = Partial<Record<keyof FormState, string>>;

const WORK_PATTERNS: { value: WorkPattern; label: string; note: string }[] = [
  { value: "day", label: "Day shift", note: "Most focus happens in daytime." },
  {
    value: "night",
    label: "Night shift",
    note: "Primary work happens overnight."
  },
  {
    value: "mixed",
    label: "Mixed schedule",
    note: "Your schedule shifts week to week."
  },
  {
    value: "unemployed",
    label: "Unemployed",
    note: "Focus on stability and flexibility."
  }
];

const PRIORITY_BIASES: {
  value: PriorityBias;
  label: string;
  note: string;
}[] = [
  {
    value: "stability_first",
    label: "Stability first",
    note: "Favor risk reduction and recovery."
  },
  {
    value: "income_first",
    label: "Income first",
    note: "Favor actions that protect cash flow."
  },
  {
    value: "growth_first",
    label: "Growth first",
    note: "Favor compounding and learning."
  }
];

const DOMAIN_OPTIONS = [
  "bills",
  "visa/legal",
  "taxes",
  "contracts",
  "insurance",
  "healthcare"
];

const STEP_TITLES = [
  {
    title: "Work context",
    description: "Timezone and work pattern to align timing."
  },
  {
    title: "Daily windows",
    description: "Wake/sleep windows and focus capacity."
  },
  {
    title: "Priorities + compliance",
    description: "Bias and compliance domains to tailor risk actions."
  }
];

const TIME_PATTERN = /^\d{2}:\d{2}$/;

export default function OnboardingForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshOnboarding } = useAuth();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(() => createInitialForm());
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [customDomain, setCustomDomain] = useState("");
  const [customDomainError, setCustomDomainError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    fetchProfile()
      .then((profile) => {
        if (!active || !profile) {
          return;
        }
        setForm(profileToForm(profile));
      })
      .catch((error) => {
        if (active) {
          setLoadError(getErrorMessage(error, "Unable to load your profile."));
        }
      })
      .finally(() => {
        if (active) {
          setLoadingProfile(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const stepMeta = STEP_TITLES[step];
  const customDomains = form.compliance_domains.filter(
    (domain) => !DOMAIN_OPTIONS.includes(domain)
  );

  const handleChange = <Key extends keyof FormState>(
    name: Key,
    value: FormState[Key]
  ) => {
    setForm((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleNext = () => {
    setSubmitError(null);
    const stepErrors = validateStep(step, form);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      setSubmitError("Please complete the required fields.");
      return;
    }
    setErrors({});
    setStep((prev) => Math.min(prev + 1, STEP_TITLES.length - 1));
  };

  const handleBack = () => {
    setSubmitError(null);
    setErrors({});
    setStep((prev) => Math.max(prev - 1, 0));
  };

  const toggleDomain = (domain: string) => {
    const normalized = normalizeDomain(domain);
    setForm((prev) => {
      const current = new Set(prev.compliance_domains.map(normalizeDomain));
      if (current.has(normalized)) {
        current.delete(normalized);
      } else {
        current.add(normalized);
      }
      return {
        ...prev,
        compliance_domains: Array.from(current)
      };
    });
    setErrors((prev) => ({ ...prev, compliance_domains: undefined }));
  };

  const addCustomDomain = () => {
    const normalized = normalizeDomain(customDomain);
    if (!normalized) {
      setCustomDomainError("Enter a domain to add.");
      return;
    }
    setCustomDomainError(null);
    setCustomDomain("");
    setForm((prev) => {
      const current = new Set(prev.compliance_domains.map(normalizeDomain));
      current.add(normalized);
      return {
        ...prev,
        compliance_domains: Array.from(current)
      };
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);

    if (step < STEP_TITLES.length - 1) {
      handleNext();
      return;
    }

    const normalized = normalizeForm(form);
    const parsed = ProfileInputSchema.safeParse(normalized);
    if (!parsed.success) {
      setErrors(mapErrors(parsed.error.issues));
      setSubmitError("Please correct the highlighted fields.");
      return;
    }

    setSaving(true);
    try {
      await updateProfile(parsed.data);
      await refreshOnboarding();
      router.replace(getNextPath(searchParams));
    } catch (error) {
      setSubmitError(getErrorMessage(error, "Unable to save onboarding profile."));
    } finally {
      setSaving(false);
    }
  };

  if (loadingProfile) {
    return (
      <div className="rounded-3xl border border-slate-200/70 bg-white/80 p-6 text-sm text-slate-500 shadow-sm">
        Loading your profile...
      </div>
    );
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit} noValidate>
      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Step {step + 1} of {STEP_TITLES.length}
            </p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {stepMeta.title}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {stepMeta.description}
            </p>
          </div>
          <div className="flex gap-2">
            {STEP_TITLES.map((_, index) => (
              <span
                key={index}
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                  index === step
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-500"
                }`}
              >
                {index + 1}
              </span>
            ))}
          </div>
        </div>
      </div>

      {loadError ? (
        <div
          className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700"
          role="alert"
        >
          {loadError}
        </div>
      ) : null}

      {step === 0 ? (
        <div className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="timezone" className="text-sm font-semibold text-slate-700">
              Timezone (IANA)
            </label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                id="timezone"
                name="timezone"
                type="text"
                value={form.timezone}
                onChange={(event) =>
                  handleChange("timezone", event.target.value)
                }
                aria-invalid={Boolean(errors.timezone)}
                aria-describedby={errors.timezone ? "timezone-error" : undefined}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                placeholder="America/Los_Angeles"
              />
              <button
                type="button"
                onClick={() => handleChange("timezone", getDefaultTimezone())}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
              >
                Use my timezone
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Used to align planning windows to your local time.
            </p>
            {errors.timezone ? (
              <p id="timezone-error" role="alert" className="text-xs text-rose-600">
                {errors.timezone}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <label htmlFor="work_pattern" className="text-sm font-semibold text-slate-700">
              Work pattern
            </label>
            <select
              id="work_pattern"
              name="work_pattern"
              value={form.work_pattern}
              onChange={(event) =>
                handleChange("work_pattern", event.target.value as WorkPattern)
              }
              aria-invalid={Boolean(errors.work_pattern)}
              aria-describedby={
                errors.work_pattern ? "work-pattern-error" : undefined
              }
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              {WORK_PATTERNS.map((pattern) => (
                <option key={pattern.value} value={pattern.value}>
                  {pattern.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500">
              {WORK_PATTERNS.find((pattern) => pattern.value === form.work_pattern)
                ?.note ?? "Select the closest schedule."}
            </p>
            {errors.work_pattern ? (
              <p
                id="work-pattern-error"
                role="alert"
                className="text-xs text-rose-600"
              >
                {errors.work_pattern}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="wake_window_start" className="text-sm font-semibold text-slate-700">
                Wake window start
              </label>
              <input
                id="wake_window_start"
                name="wake_window_start"
                type="time"
                value={form.wake_window_start}
                onChange={(event) =>
                  handleChange("wake_window_start", event.target.value)
                }
                aria-invalid={Boolean(errors.wake_window_start)}
                aria-describedby={
                  errors.wake_window_start ? "wake-start-error" : undefined
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
              {errors.wake_window_start ? (
                <p id="wake-start-error" role="alert" className="text-xs text-rose-600">
                  {errors.wake_window_start}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <label htmlFor="wake_window_end" className="text-sm font-semibold text-slate-700">
                Wake window end
              </label>
              <input
                id="wake_window_end"
                name="wake_window_end"
                type="time"
                value={form.wake_window_end}
                onChange={(event) =>
                  handleChange("wake_window_end", event.target.value)
                }
                aria-invalid={Boolean(errors.wake_window_end)}
                aria-describedby={
                  errors.wake_window_end ? "wake-end-error" : undefined
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
              {errors.wake_window_end ? (
                <p id="wake-end-error" role="alert" className="text-xs text-rose-600">
                  {errors.wake_window_end}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <label htmlFor="sleep_window_start" className="text-sm font-semibold text-slate-700">
                Sleep window start
              </label>
              <input
                id="sleep_window_start"
                name="sleep_window_start"
                type="time"
                value={form.sleep_window_start}
                onChange={(event) =>
                  handleChange("sleep_window_start", event.target.value)
                }
                aria-invalid={Boolean(errors.sleep_window_start)}
                aria-describedby={
                  errors.sleep_window_start ? "sleep-start-error" : undefined
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
              {errors.sleep_window_start ? (
                <p id="sleep-start-error" role="alert" className="text-xs text-rose-600">
                  {errors.sleep_window_start}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <label htmlFor="sleep_window_end" className="text-sm font-semibold text-slate-700">
                Sleep window end
              </label>
              <input
                id="sleep_window_end"
                name="sleep_window_end"
                type="time"
                value={form.sleep_window_end}
                onChange={(event) =>
                  handleChange("sleep_window_end", event.target.value)
                }
                aria-invalid={Boolean(errors.sleep_window_end)}
                aria-describedby={
                  errors.sleep_window_end ? "sleep-end-error" : undefined
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
              {errors.sleep_window_end ? (
                <p id="sleep-end-error" role="alert" className="text-xs text-rose-600">
                  {errors.sleep_window_end}
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="max_daily_focus_blocks" className="text-sm font-semibold text-slate-700">
              Max daily focus blocks
            </label>
            <select
              id="max_daily_focus_blocks"
              name="max_daily_focus_blocks"
              value={String(form.max_daily_focus_blocks)}
              onChange={(event) =>
                handleChange(
                  "max_daily_focus_blocks",
                  Number(event.target.value)
                )
              }
              aria-invalid={Boolean(errors.max_daily_focus_blocks)}
              aria-describedby={
                errors.max_daily_focus_blocks
                  ? "focus-blocks-error"
                  : undefined
              }
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              {[1, 2, 3, 4].map((count) => (
                <option key={count} value={count}>
                  {count} block{count > 1 ? "s" : ""}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500">
              Caps deep work so the plan stays realistic.
            </p>
            {errors.max_daily_focus_blocks ? (
              <p
                id="focus-blocks-error"
                role="alert"
                className="text-xs text-rose-600"
              >
                {errors.max_daily_focus_blocks}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="priority_bias" className="text-sm font-semibold text-slate-700">
              Priority bias
            </label>
            <select
              id="priority_bias"
              name="priority_bias"
              value={form.priority_bias}
              onChange={(event) =>
                handleChange("priority_bias", event.target.value as PriorityBias)
              }
              aria-invalid={Boolean(errors.priority_bias)}
              aria-describedby={
                errors.priority_bias ? "priority-bias-error" : undefined
              }
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              {PRIORITY_BIASES.map((bias) => (
                <option key={bias.value} value={bias.value}>
                  {bias.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500">
              {PRIORITY_BIASES.find((bias) => bias.value === form.priority_bias)
                ?.note ?? "Pick the bias that best matches this season."}
            </p>
            {errors.priority_bias ? (
              <p
                id="priority-bias-error"
                role="alert"
                className="text-xs text-rose-600"
              >
                {errors.priority_bias}
              </p>
            ) : null}
          </div>

          <div className="space-y-3">
            <label className="text-sm font-semibold text-slate-700">
              Compliance domains
            </label>
            <div className="flex flex-wrap gap-2">
              {DOMAIN_OPTIONS.map((domain) => {
                const active = form.compliance_domains.includes(domain);
                return (
                  <button
                    key={domain}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleDomain(domain)}
                    className={chipClass(active)}
                  >
                    {domain}
                  </button>
                );
              })}
              {customDomains.map((domain) => {
                const active = form.compliance_domains.includes(domain);
                return (
                  <button
                    key={domain}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleDomain(domain)}
                    className={chipClass(active)}
                  >
                    {domain}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                value={customDomain}
                onChange={(event) => {
                  setCustomDomain(event.target.value);
                  setCustomDomainError(null);
                }}
                placeholder="Add custom domain"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
              <button
                type="button"
                onClick={addCustomDomain}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
              >
                Add
              </button>
            </div>
            {customDomainError ? (
              <p role="alert" className="text-xs text-rose-600">
                {customDomainError}
              </p>
            ) : null}
            {errors.compliance_domains ? (
              <p role="alert" className="text-xs text-rose-600">
                {errors.compliance_domains}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {submitError ? (
        <div
          className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          role="alert"
        >
          {submitError}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleBack}
          disabled={step === 0}
          className="rounded-full border border-slate-200 px-5 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Back
        </button>
        {step < STEP_TITLES.length - 1 ? (
          <button
            type="button"
            onClick={handleNext}
            className="rounded-full bg-slate-900 px-5 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
          >
            Continue
          </button>
        ) : (
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-slate-900 px-6 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
          >
            {saving ? "Saving profile..." : "Finish onboarding"}
          </button>
        )}
      </div>
    </form>
  );
}

function createInitialForm(): FormState {
  const timezone = getDefaultTimezone();
  return {
    timezone,
    wake_window_start: "07:00",
    wake_window_end: "10:00",
    sleep_window_start: "22:00",
    sleep_window_end: "06:00",
    work_pattern: "day",
    max_daily_focus_blocks: 2,
    priority_bias: "stability_first",
    compliance_domains: ["bills", "visa/legal"]
  };
}

function profileToForm(profile: Profile): FormState {
  const domains = profile.compliance_domains.map(normalizeDomain).filter(Boolean);
  return {
    timezone: profile.timezone,
    wake_window_start: profile.wake_window_start,
    wake_window_end: profile.wake_window_end,
    sleep_window_start: profile.sleep_window_start,
    sleep_window_end: profile.sleep_window_end,
    work_pattern: profile.work_pattern,
    max_daily_focus_blocks: profile.max_daily_focus_blocks,
    priority_bias: profile.priority_bias,
    compliance_domains: domains.length
      ? domains
      : ["bills", "visa/legal"]
  };
}

function validateStep(step: number, form: FormState): FieldErrors {
  const errors: FieldErrors = {};
  if (step === 0) {
    if (!form.timezone.trim()) {
      errors.timezone = "Timezone is required.";
    }
    if (!form.work_pattern) {
      errors.work_pattern = "Select a work pattern.";
    }
  }
  if (step === 1) {
    if (!TIME_PATTERN.test(form.wake_window_start)) {
      errors.wake_window_start = "Enter a valid start time.";
    }
    if (!TIME_PATTERN.test(form.wake_window_end)) {
      errors.wake_window_end = "Enter a valid end time.";
    }
    if (!TIME_PATTERN.test(form.sleep_window_start)) {
      errors.sleep_window_start = "Enter a valid start time.";
    }
    if (!TIME_PATTERN.test(form.sleep_window_end)) {
      errors.sleep_window_end = "Enter a valid end time.";
    }
    if (
      !Number.isInteger(form.max_daily_focus_blocks) ||
      form.max_daily_focus_blocks < 1 ||
      form.max_daily_focus_blocks > 4
    ) {
      errors.max_daily_focus_blocks = "Choose 1 to 4 blocks.";
    }
  }
  if (step === 2) {
    if (!form.priority_bias) {
      errors.priority_bias = "Select a priority bias.";
    }
    if (form.compliance_domains.length === 0) {
      errors.compliance_domains = "Select at least one domain.";
    }
  }
  return errors;
}

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeForm(form: FormState): FormState {
  const domains = Array.from(
    new Set(form.compliance_domains.map(normalizeDomain).filter(Boolean))
  );
  return {
    ...form,
    compliance_domains: domains.length ? domains : ["bills", "visa/legal"],
    max_daily_focus_blocks: Math.round(form.max_daily_focus_blocks)
  };
}

function mapErrors(
  issues: { path: (string | number)[]; message: string }[]
): FieldErrors {
  const mapped: FieldErrors = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !mapped[key as keyof FormState]) {
      mapped[key as keyof FormState] = issue.message;
    }
  }
  return mapped;
}

function getNextPath(params: ReturnType<typeof useSearchParams>): string {
  const nextParam = params?.get("next");
  if (nextParam && nextParam.startsWith("/")) {
    return nextParam;
  }
  return "/checkin";
}

function chipClass(active: boolean): string {
  return `rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
    active
      ? "border-slate-900 bg-slate-900 text-white"
      : "border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900"
  }`;
}

function getDefaultTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}
