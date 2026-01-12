# Evaluation Metrics

## Value metrics
- Adherence rate: percent of planned items marked done or deferred with a reason within 24 hours.
- Reduced overload: weekly self-reported overload score trend (1-5), plus count of days exceeding planned time budget.
- Stability trend: week-over-week variance in planned hours and priority count (lower is better).
- User trust: weekly trust score and accept-vs-edit ratio for proposed plans.

## Quality metrics
- Engine consistency: identical inputs produce equivalent outputs; track diff rate across reruns.
- Confidence handling: low-confidence outputs trigger clarification, not directives; measure clarification rate when confidence < threshold.
- False urgency rate: percent of items labeled urgent that are later downgraded or missed without impact.

## Data sources
- Daily check-ins, plan edits, completion logs, weekly reviews, and user feedback prompts.
