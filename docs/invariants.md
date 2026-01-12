# Invariants

## Engine invariants
- The plan includes at most three primary priorities; anything else is supporting detail.
- Compliance and burnout guardrails are enforced: rest blocks and recovery tasks cannot be dropped when risk flags are present.
- When available time is low, the plan is compressed to the smallest viable sequence with explicit time bounds.
- Schedule-aware planning uses only canonical busy blocks (no raw calendar titles or attendee data).
- Time blocks never overlap with busy blocks and always fall within wake/sleep bounds.
- Splitting is allowed only for recovery, admin, and compliance actions; deep focus actions are never split.
- Compression reduces optional actions first and keeps compliance/recovery intact where possible.
- Weekly reviews are derived solely from stored daily snapshots and never from external sources.
- Weekly next-week focus items are capped at three and aligned to the user's priority bias.
- **Personalization never overrides risk-based primary ranking**: actions are first sorted by risk reduction, then by personalization utility for tie-breaking only.

## Personalization invariants
- Weight changes are bounded to ±0.03 per recalibration to prevent runaway optimization.
- Recalibration requires minimum 8 feedback entries before adjusting weights.
- Individual weights clamped to [0.05, 0.40]; total sum must be 0.95-1.05.
- Risk aversion clamped to [0.0, 1.0].
- Focus preference must be one of: deep_work, mixed, light_tasks.
- Feedback records never include raw user notes, only aggregated patterns (privacy-preserving).
- Personalization effects are always surfaced in engine output for explainability.

## Security invariants
- No API keys or secrets in frontend code or bundles.
- All secrets and credentials are provided via environment variables only.
- Sensitive values are never logged or returned to clients.
- **Multi-tenancy**: All data queries must be scoped by `orgId` via `requireOrgAccess` middleware.
- **Cross-org access denied**: Users cannot access data from orgs they don't belong to, even with guessed IDs.
- **RBAC enforcement**: Role hierarchy (owner > admin > member > coach > viewer) enforced server-side.
- **Org audit access**: Org audit endpoints require admin or owner role (`requireRole("admin")`).
- **Consent-scoped access**: Viewers can only access data for which explicit consent exists and is active.
- **Redaction required**: All shared data must be redacted - no raw notes, comments, or personal assumptions.
- **Immutable audit logs**: Audit logs are append-only and cannot be modified or deleted.
- **Export safety**: Exports (JSON, PDF) must exclude raw notes/comments - metadata only.
- **DSR export**: Tokens (P0) never exported. Sensitive fields (P1: notes, comments) excluded by default, included only with `include_sensitive=true` flag.
- **DSR deletion**: Requires 2-step confirmation: HMAC-SHA256 token (15min expiry) + phrase `DELETE MY DATA`. Personal org deletion can delete account if no other memberships; team org deletion only removes user-scoped data.
- **Retention enforcement**: Data older than retention policy is purged (snapshots: 365d, audit: 730d, access logs: 180d, feedback: 365d default). Purge respects foreign key constraints and logs counts in audit trail.
- **Token security**: Deletion tokens hashed with HMAC-SHA256 using JWT secret. Stored token hashes prevent replay attacks even if database compromised.

## Safety invariants
- No diagnosis or clinical language is used in outputs.
- No directives that could cause harm; recommendations remain supportive and opt-in.
- Crisis-safe output path triggers a safety notice and pauses normal planning.
- Expected outcomes are framed as variability ranges, not guarantees.

## UX invariants
- Tone remains calm, respectful, and neutral; no urgency inflation.
- The user sees no more than they can act on; plans are concise and scannable.
- Every recommendation includes a short rationale and a clear next action.

## Data invariants
- Saved snapshots are immutable; changes create a new snapshot version.
- Sensitive actions (export, delete, permission changes) create audit log entries.
- Timestamps are recorded in UTC with source and device context.
- Weekly reports and PDFs are generated from stored weekly content to ensure repeatability.

## SOC2 Security Invariants
- **CSRF Required**: All POST/PUT/DELETE requests must include valid CSRF token. GET/HEAD/OPTIONS exempt.
- **Security Headers**: Every response includes X-Content-Type-Options, X-Frame-Options, Referrer-Policy, CSP.
- **CSRF Token Lifecycle**: 2-hour expiry, HMAC-SHA256 signed with CSRF_SECRET, double-submit cookie pattern.
- **Access Reviews Required**: Organizations must conduct access reviews to maintain SOC2 compliance posture.
- **Access Review Evidence**: Evidence PDFs include metadata only (consents, access logs), never user notes or PII.
- **Evidence Integrity**: SHA256 hashes verify evidence snapshots at creation and completion.
- **Monitoring Events**: Failures (connector sync, retention purge, auth patterns) emit monitoring events for admin review.
- **Security Headers in Production**: HSTS enabled only in production. CSP allows 'unsafe-eval' in dev for HMR.
- **Audit Trail for Reviews**: ACCESS_REVIEW_CREATED, ACCESS_REVIEW_COMPLETED, ACCESS_REVIEW_EVIDENCE_EXPORTED events logged.
- **Role-Based Access Review**: Only admin/owner roles can create, complete, or export access review evidence.
