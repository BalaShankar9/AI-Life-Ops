"use client";

import { useState, useEffect } from "react";
import type {
  Scenario,
  ScenarioPack,
  ScenarioPackListItem,
  ScenarioType,
  ComparisonResult,
  SimulationResult
} from "@ai-life-ops/shared";

import {
  fetchScenarioPacks,
  fetchScenarioPack,
  createScenarioPack,
  updateScenarioPack,
  deleteScenarioPack,
  compareScenarios
} from "../lib/api";
import ScenarioPackPanel from "./scenario-pack-panel";
import ScenarioEditor from "./scenario-editor";
import ComparisonResults from "./comparison-results";

export default function SimulateView() {
  const [packs, setPacks] = useState<ScenarioPackListItem[]>([]);
  const [loadingPacks, setLoadingPacks] = useState(true);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [currentPack, setCurrentPack] = useState<{
    id?: string;
    name: string;
    description?: string;
    scenarios: Scenario[];
  }>({
    name: "New scenario pack",
    scenarios: []
  });
  const [saving, setSaving] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [comparisonResult, setComparisonResult] = useState<{
    comparison: ComparisonResult;
    simulations: SimulationResult[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPacks();
  }, []);

  const loadPacks = async () => {
    try {
      setLoadingPacks(true);
      const data = await fetchScenarioPacks();
      setPacks(data);
    } catch (err) {
      setError("Failed to load scenario packs");
    } finally {
      setLoadingPacks(false);
    }
  };

  const loadPack = async (packId: string) => {
    try {
      setSelectedPackId(packId);
      const pack = await fetchScenarioPack(packId);
      setCurrentPack({
        id: pack.id,
        name: pack.name,
        description: pack.description || undefined,
        scenarios: pack.scenarios
      });
      setComparisonResult(null);
      setError(null);
    } catch (err) {
      setError("Failed to load scenario pack");
    }
  };

  const createNewPack = () => {
    setSelectedPackId(null);
    setCurrentPack({
      name: "New scenario pack",
      scenarios: []
    });
    setComparisonResult(null);
    setError(null);
  };

  const savePack = async () => {
    try {
      setSaving(true);
      setError(null);

      if (!currentPack.name.trim()) {
        setError("Pack name is required");
        return;
      }

      if (currentPack.scenarios.length === 0) {
        setError("At least one scenario is required");
        return;
      }

      const packData = {
        name: currentPack.name,
        description: currentPack.description || null,
        baseline_source: "latest_checkin" as const,
        scenarios: currentPack.scenarios
      };

      if (currentPack.id) {
        await updateScenarioPack(currentPack.id, packData);
      } else {
        const newPack = await createScenarioPack(packData);
        setCurrentPack({ ...currentPack, id: newPack.id });
        setSelectedPackId(newPack.id);
      }

      await loadPacks();
    } catch (err) {
      setError("Failed to save scenario pack");
    } finally {
      setSaving(false);
    }
  };

  const deletePack = async (packId: string) => {
    if (!confirm("Are you sure you want to delete this scenario pack?")) {
      return;
    }

    try {
      await deleteScenarioPack(packId);
      if (selectedPackId === packId) {
        createNewPack();
      }
      await loadPacks();
    } catch (err) {
      setError("Failed to delete scenario pack");
    }
  };

  const runComparison = async () => {
    try {
      setComparing(true);
      setError(null);

      if (currentPack.scenarios.length === 0) {
        setError("At least one scenario is required to compare");
        return;
      }

      const result = await compareScenarios({
        scenarios: currentPack.scenarios,
        pack_id: currentPack.id
      });

      setComparisonResult(result);
    } catch (err) {
      setError("Failed to run comparison");
    } finally {
      setComparing(false);
    }
  };

  const updateScenarios = (scenarios: Scenario[]) => {
    setCurrentPack({ ...currentPack, scenarios });
    setComparisonResult(null);
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <ScenarioPackPanel
          packs={packs}
          loading={loadingPacks}
          selectedPackId={selectedPackId}
          onSelectPack={loadPack}
          onCreateNew={createNewPack}
          onDelete={deletePack}
        />

        <div className="lg:col-span-2">
          <ScenarioEditor
            pack={currentPack}
            onUpdateName={(name: string) => setCurrentPack({ ...currentPack, name })}
            onUpdateDescription={(description: string) =>
              setCurrentPack({ ...currentPack, description })
            }
            onUpdateScenarios={updateScenarios}
            onSave={savePack}
            onCompare={runComparison}
            saving={saving}
            comparing={comparing}
          />
        </div>
      </div>

      {comparisonResult && (
        <ComparisonResults
          comparison={comparisonResult.comparison}
          simulations={comparisonResult.simulations}
        />
      )}
    </div>
  );
}
