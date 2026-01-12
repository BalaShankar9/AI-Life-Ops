# Scenario simulator

## Overview

The scenario simulator is a deterministic modeling layer that allows users to compare potential life changes before committing to them. It provides explainable, confidence-scored projections of how different scenarios would affect life stability scores, risk levels, constraints, and mitigation strategies.

## Design principles

1. **Deterministic**: All simulations use rule-based logic. No LLM inference.
2. **Explainable**: Every score change, risk shift, and mitigation plan includes reasoning.
3. **Privacy-preserving**: No raw checkin notes stored in scenario runs; only metadata references.
4. **Investor-grade**: UI and outputs are operator-focused, calm, and consulting-tool quality.
5. **Non-medical**: Clear disclaimers that simulations are models, not guarantees or medical advice.

## Architecture

### Engine (Python)

The engine CLI (`packages/engine/src/engine.py`) supports three modes:

- **analyze** (default): Standard checkin analysis (backward compatible)
- **simulate**: Evaluate a single scenario against a baseline
- **compare**: Evaluate multiple scenarios and rank them

Input format:
```json
{
  "mode": "compare",
  "baseline_input": {
    "checkin": {...},
    "profile_context": {...},
    "schedule": {...}
  },
  "scenarios": [...]
}
```

The simulator (`packages/engine/src/simulator.py`) implements:
- Scenario normalization and validation
- Baseline computation
- Scenario effect application
- Delta calculation (score, breakdown, flags, constraints)
- Risk change detection
- Mitigation plan generation
- Confidence scoring based on data quality and missing params

### Database

Three tables support scenario operations:

- **ScenarioPack**: User-created collections of scenarios with name, description, baseline source
- **Scenario**: Individual scenario definitions (type + params) within a pack
- **ScenarioRun**: Audit trail of simulations/comparisons with baseline metadata and result JSON

**Privacy rule**: `ScenarioRun.baselineRef` stores only checkin_id, profile_id, and date—never raw notes.

### API

Authenticated endpoints (apps/api):

- `GET /api/scenario-packs` — List user's packs
- `GET /api/scenario-packs/:id` — Get pack with scenarios
- `POST /api/scenario-packs` — Create pack
- `PUT /api/scenario-packs/:id` — Update pack
- `DELETE /api/scenario-packs/:id` — Delete pack
- `POST /api/simulate` — Run single scenario (stores ScenarioRun)
- `POST /api/compare` — Run comparison (stores ScenarioRun with pack_id)

Baseline construction:
- Uses latest checkin for user (or latest snapshot reference)
- Fetches profile context (required)
- Builds schedule from canonical Events store for baseline_date (default: today)

### Web UI

Route: `/simulate` (protected, requires onboarding)

Features:
- **Scenario pack panel**: List, load, create, delete packs
- **Scenario editor**: Add up to 6 scenarios with type-specific forms
- **Comparison execution**: Compare button triggers `/api/compare`
- **Results view**: 
  - Ranked list with net benefit, tradeoffs, top risks
  - Expandable detail panels: score deltas, risk changes, constraints, mitigation plan, assumptions, sensitivity, confidence
  - Non-medical disclaimer

## Scenario types

| Type | Params |
|------|--------|
| `add_job` | hours_per_week, shift_type, commute_min_per_day, pay_per_month |
| `drop_job` | hours_per_week, shift_type, commute_min_per_day, pay_per_month |
| `increase_expense` | amount_per_month, category |
| `reduce_expense` | amount_per_month, category |
| `add_recurring_obligation` | hours_per_week, deadline_pressure |
| `remove_recurring_obligation` | hours_per_week, deadline_pressure |
| `sleep_schedule_change` | sleep_hours_delta, bedtime_shift_min |
| `commute_change` | delta_min_per_day, days_per_week |
| `study_plan` | hours_per_week, intensity, deadline_pressure |

All params have strict validation (min/max bounds) enforced via Zod schemas in `packages/shared/src/scenario.ts`.

## Baseline source

Currently supported: `latest_checkin`

Future: `custom_checkin` (allow user to select a specific past checkin as baseline)

The baseline date controls which schedule busy blocks are used (default: today). This allows simulating "what if I made this change starting tomorrow?"

## Output structure

### SimulationResult

```typescript
{
  scenario_id: string,
  scenario_type: string,
  delta: {
    life_stability_score: number,
    breakdown: { energy, money, obligations, growth, stability }
  },
  new_estimate: {
    life_stability_score: number,
    breakdown: {...},
    flags: {...}
  },
  risk_changes: [{ flag, from, to, why }],
  constraints_impact: {
    free_time_delta_min,
    largest_window_delta_min,
    sleep_delta_hours,
    stress_pressure_delta
  },
  mitigation_plan: {
    priorities: [...],  // top 3
    avoid_today: [...],
    next_best_actions: [...]
  },
  assumptions: [...],
  sensitivity: [{ assumption, if_wrong_effect }],
  confidence: number,  // 0-1
  explanation: string
}
```

### ComparisonResult

```typescript
{
  baseline: { score, breakdown, flags },
  ranked: [{
    scenario_id,
    overall_rank,
    net_benefit_score,
    summary,
    key_tradeoffs,
    top_risks
  }],
  recommendation: {
    best_scenario_id,
    why_best,
    who_should_not_choose_this
  }
}
```

## Confidence and sensitivity

**Confidence** (0-1 scale):
- Starts with baseline checkin confidence
- Reduced by missing scenario params (estimated via defaults)
- Reduced if baseline data quality is poor

**Sensitivity**:
- Lists key assumptions made during simulation
- For each assumption, describes impact if assumption is wrong
- Examples: "Commute time remains constant", "New job workload matches estimate"

Both are displayed in UI to help users understand uncertainty.

## Privacy boundaries

1. Raw checkin notes are **never** stored in `ScenarioRun` table
2. Only metadata references (checkin_id, profile_id, date) are persisted
3. Scenario params are numeric/categorical—no free-text fields that could leak sensitive info
4. Simulation outputs are explainable but don't expose raw notes

## Safety boundaries

1. All simulation UI includes non-medical disclaimer
2. Crisis risk path is never bypassed by simulator
3. If baseline checkin has crisis risk, simulation should not proceed (API validates this)
4. Audit log captures all simulation events (SCENARIO_SIMULATED, SCENARIO_COMPARED)

## Auditability

Every scenario operation creates an audit event:
- `SCENARIO_PACK_CREATED` — metadata: pack_id, name, scenarios_count
- `SCENARIO_PACK_UPDATED` — metadata: pack_id, scenarios_count
- `SCENARIO_PACK_DELETED` — metadata: pack_id
- `SCENARIO_SIMULATED` — metadata: scenario_type, run_id (never params verbatim)
- `SCENARIO_COMPARED` — metadata: pack_id, scenarios_count, run_id

Audit events are queryable via `/api/audit`.

## Testing strategy

1. **Engine tests**: Mode dispatch, invalid mode, simulate/compare correctness
2. **API tests**: Auth enforcement, invalid payloads, scenario pack CRUD, simulate/compare endpoints, audit event creation
3. **E2E tests**: Full flow from login → create scenarios → compare → view results

## Future enhancements (not in S4-0)

- PDF export of comparison results (S4-2)
- Custom baseline checkin selection
- More scenario types (relocate, change work pattern, etc.)
- Historical comparison tracking (trend over time)
- Sensitivity analysis visualization

## Related documentation

- [Evaluation metrics](./evaluation-metrics.md) — How scenarios are scored
- [Invariants](./invariants.md) — What the simulator must preserve
- [Privacy boundaries](./privacy-boundaries.md) — What data is never stored
- [Safety](./safety.md) — Crisis risk handling
- [State model](./state-model.md) — Simulate flow and failure recovery
