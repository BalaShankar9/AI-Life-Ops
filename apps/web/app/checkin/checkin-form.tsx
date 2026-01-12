"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";

import { CheckinInputSchema } from "@ai-life-ops/shared";

import { createCheckin } from "../lib/api";

type FormState = {
  sleep_hours: string;
  energy_level: string;
  stress_level: string;
  money_pressure: string;
  today_deadlines_count: string;
  critical_deadline: boolean;
  available_time_hours: string;
  notes: string;
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

const initialState: FormState = {
  sleep_hours: "",
  energy_level: "",
  stress_level: "",
  money_pressure: "",
  today_deadlines_count: "",
  critical_deadline: false,
  available_time_hours: "",
  notes: ""
};

const numericFields = [
  {
    name: "sleep_hours" as const,
    label: "Sleep hours",
    help: "Total hours slept in the last 24 hours.",
    min: 0,
    max: 12,
    step: 0.5
  },
  {
    name: "energy_level" as const,
    label: "Energy level (1-10)",
    help: "Your current energy capacity.",
    min: 1,
    max: 10,
    step: 1
  },
  {
    name: "stress_level" as const,
    label: "Stress level (1-10)",
    help: "Your current stress load.",
    min: 1,
    max: 10,
    step: 1
  },
  {
    name: "money_pressure" as const,
    label: "Money pressure (1-10)",
    help: "How tight finances feel right now.",
    min: 1,
    max: 10,
    step: 1
  },
  {
    name: "today_deadlines_count" as const,
    label: "Deadlines due today",
    help: "Count of commitments due today.",
    min: 0,
    max: 10,
    step: 1
  },
  {
    name: "available_time_hours" as const,
    label: "Available focus hours",
    help: "Time you can realistically use today.",
    min: 0,
    max: 16,
    step: 0.5
  }
];

export default function CheckinForm() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialState);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (name: keyof FormState, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);

    const payload = {
      sleep_hours: parseFloatOrNaN(form.sleep_hours),
      energy_level: parseFloatOrNaN(form.energy_level),
      stress_level: parseFloatOrNaN(form.stress_level),
      money_pressure: parseFloatOrNaN(form.money_pressure),
      today_deadlines_count: parseIntOrNaN(form.today_deadlines_count),
      critical_deadline: form.critical_deadline,
      available_time_hours: parseFloatOrNaN(form.available_time_hours),
      notes: form.notes.trim() || undefined
    };

    const parsed = CheckinInputSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(mapErrors(parsed.error.issues));
      setSubmitError("Please correct the highlighted fields.");
      return;
    }

    setIsSubmitting(true);
    try {
      await createCheckin(parsed.data);
      router.push("/today");
    } catch (error) {
      setSubmitError(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        {numericFields.map((field) => {
          const error = errors[field.name];
          return (
            <div key={field.name} className="space-y-2">
              <label
                htmlFor={field.name}
                className="text-sm font-semibold text-slate-700"
              >
                {field.label}
              </label>
              <input
                id={field.name}
                name={field.name}
                type="number"
                inputMode="decimal"
                min={field.min}
                max={field.max}
                step={field.step}
                value={form[field.name]}
                onChange={(event) => handleChange(field.name, event.target.value)}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? `${field.name}-error` : undefined}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
              <p className="text-xs text-slate-500">{field.help}</p>
              {error ? (
                <p
                  id={`${field.name}-error`}
                  role="alert"
                  className="text-xs font-semibold text-rose-600"
                >
                  {error}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
        <input
          id="critical_deadline"
          type="checkbox"
          checked={form.critical_deadline}
          onChange={(event) =>
            handleChange("critical_deadline", event.target.checked)
          }
          className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-300"
        />
        <label htmlFor="critical_deadline" className="text-sm text-slate-700">
          A critical deadline is at risk today.
        </label>
      </div>

      <div className="space-y-2">
        <label htmlFor="notes" className="text-sm font-semibold text-slate-700">
          Notes (optional)
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={4}
          value={form.notes}
          onChange={(event) => handleChange("notes", event.target.value)}
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
        {errors.notes ? (
          <p className="text-xs font-semibold text-rose-600" role="alert">
            {errors.notes}
          </p>
        ) : null}
      </div>

      {submitError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
          {submitError}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
      >
        {isSubmitting ? "Generating today's plan..." : "Generate today's plan"}
      </button>
    </form>
  );
}

function parseFloatOrNaN(value: string): number {
  if (!value.trim()) {
    return Number.NaN;
  }
  return Number.parseFloat(value);
}

function parseIntOrNaN(value: string): number {
  if (!value.trim()) {
    return Number.NaN;
  }
  return Number.parseInt(value, 10);
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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong";
}
