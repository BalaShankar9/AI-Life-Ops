# AI Life Ops · project guide

A Next.js and Express monorepo with a Python decision engine, daily check-ins and weekly review workflows.

**For:** People exploring structured planning and personal workflow automation.<br>
**Current stage:** Application foundation · known issues documented<br>
**Reviewed:** 8 September 2026, from repository files and available GitHub workflow records. This is a source review, not a fresh application test or production certification.

## Start with the evidence

- [apps](../apps)
- [packages/engine](../packages/engine)
- [docs/KNOWN_ISSUES.md](../docs/KNOWN_ISSUES.md)
- [docs/privacy-boundaries.md](../docs/privacy-boundaries.md)
- [docs/evaluation-metrics.md](../docs/evaluation-metrics.md)

## A useful first demo

Create a fictional profile, complete a daily check-in, inspect the suggested plan and export a weekly review. Demonstrate how the plan changes when availability changes.

## Next release checklist

These are proposed acceptance gates. An unchecked item does not imply its implementation is absent; it means fresh release evidence is still needed.

- [ ] Repair the recorded Python setup and secret-scan failures without disabling the checks; revalidate the historical known-issues list.
- [ ] Verify onboarding, check-in, plan generation and weekly export with a seeded local environment.
- [ ] Evaluate plan usefulness with a small disclosed set of scenarios; document data retention and deletion behaviour.

## What to measure

Weekly reviews completed / weekly reviews started, alongside plan acceptance and manual corrections.

Publish the dataset or evaluation method, date range, sample size and limitations with each result. Code size, feature counts and agent counts do not measure product usefulness.

## What a finished showcase contains

Seeded example profile, reproducible scenario results and an end-to-end weekly review walkthrough.

Keep one dated release record containing the commit, setup steps, required services, checks run, known limitations and rollback instructions. Add screenshots from that version using fictional or consented data; identify demo fixtures clearly.

## Three ways to evaluate this project

| Visitor | Start here | Evidence to look for |
| --- | --- | --- |
| Potential client | The demo scenario above | A repeatable workflow and a measurable outcome |
| Engineering team | Linked source and tests | Design decisions, failure handling and reproducibility |
| Product user or collaborator | README setup and release notes | A supported journey, current limitations and feedback route |

[Repository overview](../README.md) · [Issues](https://github.com/BalaShankar9/AI-Life-Ops/issues) · [More projects](https://github.com/BalaShankar9)
