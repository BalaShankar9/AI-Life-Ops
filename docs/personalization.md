# Personalization & Bounded Learning

## Overview

The AI Life Ops engine incorporates **explainable personalization** with **bounded learning** to improve action recommendations over time while maintaining transparency and preventing optimization runaway.

## Design Principles

1. **Bounded Updates**: Weight changes are capped at ±0.03 per recalibration to prevent runaway optimization
2. **Minimum Feedback Threshold**: Requires 8+ feedback entries before adjusting weights
3. **Privacy-Preserving**: Feedback records never include raw user notes, only aggregated patterns
4. **Explainable**: All personalization effects are surfaced in engine output
5. **Safety-First**: Risk reduction always takes precedence over personalization

## How It Works

### 1. Personalization Profile

Each user has a `PersonalizationProfile` containing:

- **Weights** (5 categories: energy, money, obligations, growth, stability)
  - Each weight: 0.05 ≤ w ≤ 0.40
  - Sum: 0.95 ≤ Σw ≤ 1.05
  - Default: 0.2 for all categories
  
- **Risk Aversion** (0.0 to 1.0)
  - Higher = prioritize safety/compliance actions
  - Lower = prioritize growth/experimental actions
  - Default: 0.6
  
- **Focus Preference** (deep_work | mixed | light_tasks)
  - Influences schedule block sizing
  - deep_work: longer blocks, fewer context switches
  - light_tasks: shorter blocks, more variety
  - Default: mixed

### 2. Action Ranking

The engine ranks actions in two phases:

**Phase 1: Risk-Based Primary Sort**
- Actions ranked first by risk reduction (highest risk targets = highest priority)
- This ensures safety/compliance always comes first
- Unaffected by personalization

**Phase 2: Utility-Based Tie-Breaking**
- For actions with equal risk reduction, personalization determines order
- Utility computed as:
  ```
  utility = (risk_reduction * risk_aversion) + system_boost - effort_cost
  ```
- `system_boost`: category weight × impact × 10
- `effort_cost`: effort × 2
- Higher utility = higher rank

### 3. Focus Preference Application

After priorities are selected, focus preference adjusts the schedule:

- **deep_work**: Extends blocks to 90-120 min where possible, reduces transitions
- **mixed**: Keeps engine defaults (60-90 min blocks)
- **light_tasks**: Shortens blocks to 30-45 min, increases variety

### 4. Feedback Collection

Users provide feedback on priorities via:
- 👍 **Helped**: Action was valuable, perceived impact matched or exceeded expectations
- 😐 **Neutral**: Action was fine but not impactful
- 👎 **Didn't Help**: Action felt misranked or wasted time

Feedback records store:
- Snapshot ID (for context: checkin state, flags, risk levels)
- Action title + category
- Whether action was scheduled or just a priority
- Feedback type (helped/neutral/didnt_help)
- Optional: perceived effort (1-5), perceived impact (1-5), comment

**Privacy Note**: Raw user notes never stored in `ActionFeedback` table.

### 5. Bounded Learning (Recalibration)

Users can request recalibration via `/api/personalization/recalibrate`:

**Requirements**:
- Minimum 8 feedback entries
- Looks back at last 50-100 feedback records

**Algorithm** (`update_weights_from_feedback` in `personalization.py`):
1. Group feedback by category
2. Compute adjustment direction:
   - `helped` → increase weight
   - `neutral` → no change
   - `didnt_help` → decrease weight
3. Clamp per-category change to ±0.03
4. Normalize weights to sum = 1.0
5. Re-clamp individual weights to [0.05, 0.40]
6. Normalize again to maintain sum = 1.0

**Confidence Scoring**:
- Based on feedback volume and consistency
- Low confidence (< 0.5): "Not enough data, keep using system"
- Medium confidence (0.5-0.7): "Moderate patterns, cautious adjustment recommended"
- High confidence (> 0.7): "Strong patterns, adjustment recommended"

**Output**:
- Proposed new weights
- Proposed risk aversion adjustment
- Confidence score
- List of changes with explanations
- `recommendApply` boolean
- Human-readable message

## API Endpoints

### `GET /api/personalization`
Returns current profile or defaults if none exists.

**Response**:
```json
{
  "ok": true,
  "data": {
    "weights": { "energy": 0.2, "money": 0.2, "obligations": 0.2, "growth": 0.2, "stability": 0.2 },
    "riskAversion": 0.6,
    "focusPreference": "mixed",
    "isDefault": true
  }
}
```

### `PUT /api/personalization`
Update profile with new settings. Normalizes weights automatically.

**Request**:
```json
{
  "weights": { "energy": 0.25, "money": 0.15, "obligations": 0.2, "growth": 0.25, "stability": 0.15 },
  "riskAversion": 0.7,
  "focusPreference": "deep_work"
}
```

**Response**: Same as GET, with `isDefault: false`

**Audit Event**: `PERSONALIZATION_UPDATED`

### `POST /api/feedback`
Submit feedback for an action from a snapshot.

**Request**:
```json
{
  "snapshotId": "uuid",
  "actionTitle": "File taxes - gather documents",
  "actionCategory": "obligations",
  "scheduled": true,
  "feedback": "helped",
  "perceivedEffort": 3,
  "perceivedImpact": 5,
  "comment": "Felt easier than expected, huge relief"
}
```

**Response**:
```json
{
  "ok": true,
  "data": { "feedbackId": "uuid" }
}
```

**Audit Event**: `ACTION_FEEDBACK_SUBMITTED`

### `GET /api/feedback?limit=50`
List recent feedback entries for the user.

**Response**:
```json
{
  "ok": true,
  "data": {
    "feedback": [
      {
        "id": "uuid",
        "snapshotId": "uuid",
        "actionTitle": "Exercise 30 min",
        "actionCategory": "energy",
        "scheduled": true,
        "feedback": "helped",
        "perceivedEffort": 4,
        "perceivedImpact": 5,
        "comment": null,
        "createdAt": "2025-01-11T10:00:00Z"
      }
    ]
  }
}
```

### `POST /api/personalization/recalibrate`
Run bounded learning algorithm to propose weight adjustments.

**Request**:
```json
{
  "lookbackDays": 30
}
```

**Response**:
```json
{
  "ok": true,
  "data": {
    "proposedWeights": { "energy": 0.23, "money": 0.17, "obligations": 0.2, "growth": 0.25, "stability": 0.15 },
    "proposedRiskAversion": 0.7,
    "confidence": 0.75,
    "changes": [
      { "category": "energy", "from": 0.2, "to": 0.23, "direction": "increase", "reason": "High positive feedback on energy actions" },
      { "category": "money", "from": 0.2, "to": 0.17, "direction": "decrease", "reason": "Low engagement with money actions" }
    ],
    "recommendApply": true,
    "message": "Strong personalization patterns detected. Applying changes may improve recommendations."
  }
}
```

## Engine Integration

### Input

`PersonalizationContext` passed to engine via JSON payload:

```json
{
  "mode": "analyze",
  "checkin": { ... },
  "flags": { ... },
  "profile_context": { ... },
  "schedule": { ... },
  "personalization": {
    "weights": { "energy": 0.25, "money": 0.15, "obligations": 0.2, "growth": 0.25, "stability": 0.15 },
    "risk_aversion": 0.7,
    "focus_preference": "deep_work"
  }
}
```

### Output

Engine returns personalization metadata in two fields:

**`used_personalization`** (human-readable list):
```json
[
  "risk_aversion: 0.70 (high safety focus)",
  "focus_preference: deep_work",
  "energy weight: 0.25 (+25% vs default)",
  "money weight: 0.15 (-25% vs default)"
]
```

**`personalization_effects`** (applied effects):
```json
[
  "High risk aversion: safety-focused actions prioritized.",
  "Emphasis on energy, growth categories.",
  "Deep work preference: extended focus blocks in schedule."
]
```

## Invariants

Personalization **does not** override core invariants:

1. **Max 3 Priorities**: Always enforced, regardless of weights
2. **Compliance Risk**: Always triggers `damage_control` mode if high
3. **Burnout Risk**: Always triggers `damage_control` if high
4. **Max Focus Blocks**: Enforced regardless of focus preference (bounded by `max_daily_focus_blocks`)

Personalization only influences:
- Ranking of actions **with equal risk reduction**
- Schedule block sizing (within bounds)
- Tie-breaking when multiple actions are equivalently safe

## User Experience

### Settings Page (`/settings/personalization`)

Users can:
- Adjust weight sliders (with live sum validation)
- Set risk aversion slider
- Choose focus preference dropdown
- View explanations of how each setting works
- See bounded learning constraints explained

### Today Page (`/today`)

Users see:
- Feedback buttons (👍 😐 👎) below each priority
- Visual indication of submitted feedback (highlighted button)
- No interruption to core workflow (feedback is optional)

### Audit Trail

All personalization changes logged:
- `PERSONALIZATION_UPDATED`: When user changes settings
- `ACTION_FEEDBACK_SUBMITTED`: When user provides feedback

Enables transparency and debugging of personalization behavior.

## Testing Strategy

### Unit Tests (`test_personalization.py`)

- `test_normalize_weights()`: Clamps [0.05, 0.40], normalizes sum
- `test_update_weights_from_feedback()`: Bounded ±0.03, requires 8+ feedback
- `test_compute_utility()`: Deterministic scoring
- `test_apply_focus_preference()`: Block sizing adjustments

### Integration Tests (`personalization.test.ts`)

- GET /personalization returns defaults for new user
- PUT /personalization normalizes and saves
- POST /feedback requires valid snapshot ownership
- Recalibrate requires 8+ feedback
- Audit events created correctly

### E2E Test (smoke.mjs)

1. Login
2. Set personalization (weights, risk aversion, focus preference)
3. Checkin → verify `used_personalization` in output
4. Submit feedback on priority
5. Verify feedback in audit log
6. Request recalibration (if 8+ feedback)

## Future Enhancements

1. **Auto-Recalibration**: Background job to propose adjustments weekly
2. **Confidence Visualization**: Show confidence meters in UI
3. **Feedback History**: Timeline view of all feedback with filters
4. **A/B Testing**: Compare personalized vs default recommendations
5. **Export**: Download personalization profile as JSON

## References

- **Database Schema**: `apps/api/prisma/schema.prisma` (PersonalizationProfile, ActionFeedback)
- **Shared Schemas**: `packages/shared/src/personalization.ts`
- **Engine Logic**: `packages/engine/src/personalization.py`
- **API Endpoints**: `apps/api/src/app.ts` (lines 547-730)
- **UI Components**: `apps/web/app/settings/personalization/`, `apps/web/app/today/today-view.tsx`
