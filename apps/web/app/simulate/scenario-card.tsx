"use client";

import type { Scenario } from "@ai-life-ops/shared";

type Props = {
  scenario: Scenario;
  index: number;
  onUpdate: (scenario: Scenario) => void;
  onRemove: () => void;
};

export default function ScenarioCard({
  scenario,
  index,
  onUpdate,
  onRemove
}: Props) {
  const updateParam = (key: string, value: any) => {
    onUpdate({
      ...scenario,
      params: { ...scenario.params, [key]: value }
    } as Scenario);
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h4 className="font-medium text-slate-900">
            Scenario {index + 1}: {getScenarioLabel(scenario.type)}
          </h4>
          <p className="mt-0.5 text-xs text-slate-500">{scenario.id}</p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="rounded p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
          title="Remove scenario"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div className="space-y-3">
        {renderFields(scenario, updateParam)}
      </div>
    </div>
  );
}

function getScenarioLabel(type: string): string {
  const labels: Record<string, string> = {
    add_job: "Add job",
    drop_job: "Drop job",
    increase_expense: "Increase expense",
    reduce_expense: "Reduce expense",
    add_recurring_obligation: "Add obligation",
    remove_recurring_obligation: "Remove obligation",
    sleep_schedule_change: "Sleep schedule change",
    commute_change: "Commute change",
    study_plan: "Study plan"
  };
  return labels[type] || type;
}

function renderFields(
  scenario: Scenario,
  updateParam: (key: string, value: any) => void
) {
  const { type, params } = scenario;

  switch (type) {
    case "add_job":
    case "drop_job":
      return (
        <>
          <NumberField
            label="Hours per week"
            value={params.hours_per_week}
            onChange={(v) => updateParam("hours_per_week", v)}
            min={0}
            max={80}
          />
          <SelectField
            label="Shift type"
            value={params.shift_type}
            onChange={(v) => updateParam("shift_type", v)}
            options={[
              { value: "day", label: "Day" },
              { value: "night", label: "Night" },
              { value: "mixed", label: "Mixed" }
            ]}
          />
          <NumberField
            label="Commute (min per day)"
            value={params.commute_min_per_day}
            onChange={(v) => updateParam("commute_min_per_day", v)}
            min={0}
            max={180}
          />
          <NumberField
            label="Pay per month"
            value={params.pay_per_month}
            onChange={(v) => updateParam("pay_per_month", v)}
            min={0}
            max={20000}
          />
        </>
      );

    case "increase_expense":
    case "reduce_expense":
      return (
        <>
          <NumberField
            label="Amount per month"
            value={params.amount_per_month}
            onChange={(v) => updateParam("amount_per_month", v)}
            min={0}
            max={20000}
          />
          <TextField
            label="Category"
            value={params.category}
            onChange={(v) => updateParam("category", v)}
            placeholder="e.g., housing, food, transport"
          />
        </>
      );

    case "add_recurring_obligation":
    case "remove_recurring_obligation":
      return (
        <>
          <NumberField
            label="Hours per week"
            value={params.hours_per_week}
            onChange={(v) => updateParam("hours_per_week", v)}
            min={0}
            max={40}
          />
          <NumberField
            label="Deadline pressure (1-10)"
            value={params.deadline_pressure}
            onChange={(v) => updateParam("deadline_pressure", v)}
            min={1}
            max={10}
            step={1}
          />
        </>
      );

    case "sleep_schedule_change":
      return (
        <>
          <NumberField
            label="Sleep hours delta"
            value={params.sleep_hours_delta}
            onChange={(v) => updateParam("sleep_hours_delta", v)}
            min={-4}
            max={4}
            step={0.5}
          />
          <NumberField
            label="Bedtime shift (minutes)"
            value={params.bedtime_shift_min}
            onChange={(v) => updateParam("bedtime_shift_min", v)}
            min={-240}
            max={240}
            step={15}
          />
        </>
      );

    case "commute_change":
      return (
        <>
          <NumberField
            label="Delta minutes per day"
            value={params.delta_min_per_day}
            onChange={(v) => updateParam("delta_min_per_day", v)}
            min={-120}
            max={120}
            step={5}
          />
          <NumberField
            label="Days per week"
            value={params.days_per_week}
            onChange={(v) => updateParam("days_per_week", v)}
            min={0}
            max={7}
            step={1}
          />
        </>
      );

    case "study_plan":
      return (
        <>
          <NumberField
            label="Hours per week"
            value={params.hours_per_week}
            onChange={(v) => updateParam("hours_per_week", v)}
            min={0}
            max={30}
          />
          <NumberField
            label="Intensity (1-3)"
            value={params.intensity}
            onChange={(v) => updateParam("intensity", v)}
            min={1}
            max={3}
            step={1}
          />
          <NumberField
            label="Deadline pressure (1-10)"
            value={params.deadline_pressure}
            onChange={(v) => updateParam("deadline_pressure", v)}
            min={1}
            max={10}
            step={1}
          />
        </>
      );

    default:
      return null;
  }
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700">
        {label}
      </label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        min={min}
        max={max}
        step={step}
        className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
      />
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
