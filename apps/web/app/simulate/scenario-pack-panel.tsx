"use client";

import type { ScenarioPackListItem } from "@ai-life-ops/shared";

type Props = {
  packs: ScenarioPackListItem[];
  loading: boolean;
  selectedPackId: string | null;
  onSelectPack: (packId: string) => void;
  onCreateNew: () => void;
  onDelete: (packId: string) => void;
};

export default function ScenarioPackPanel({
  packs,
  loading,
  selectedPackId,
  onSelectPack,
  onCreateNew,
  onDelete
}: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Saved packs</h2>
        <button
          type="button"
          onClick={onCreateNew}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
        >
          New pack
        </button>
      </div>

      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
          Loading packs...
        </div>
      ) : packs.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
          No saved packs yet
        </div>
      ) : (
        <div className="space-y-2">
          {packs.map((pack) => (
            <div
              key={pack.id}
              className={`group relative rounded-lg border p-4 transition ${
                selectedPackId === pack.id
                  ? "border-slate-900 bg-slate-50"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectPack(pack.id)}
                className="w-full text-left"
              >
                <h3 className="font-medium text-slate-900">{pack.name}</h3>
                <p className="mt-1 text-xs text-slate-500">
                  {pack.scenarios_count}{" "}
                  {pack.scenarios_count === 1 ? "scenario" : "scenarios"} •{" "}
                  {new Date(pack.updated_at).toLocaleDateString()}
                </p>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(pack.id);
                }}
                className="absolute right-2 top-2 rounded p-1.5 text-slate-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                title="Delete pack"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

