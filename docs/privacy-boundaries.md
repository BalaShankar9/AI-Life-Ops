# Privacy Boundaries

AI Life Ops is privacy-first and data-minimal by design. We only store what is necessary to deliver deterministic planning and auditability.

## What we store
- Account identifiers (user id, email).
- Profile settings required for planning (timezone, schedule windows, work pattern, focus caps, bias, compliance domains).
- Check-in inputs (including notes if provided).
- Engine snapshots and weekly reviews (immutable outputs).
- Audit log events (event type, timestamp, safe metadata summary).
- Connector events limited to calendar busy blocks (no titles or attendee data).

## What we do not store
- Medical or mental health records.
- Crisis or therapy transcripts.
- Full-text logs of raw requests beyond what is required for storage.
- Full third-party payloads or OAuth tokens in plaintext.

## Redaction principles
- Notes are treated as sensitive: they are never logged, echoed in audit summaries, or returned outside the check-in context.
- Audit metadata is summarized and safe by default; no raw payloads are exposed.
- Debug logs avoid user content and focus on technical signals only.

## Data Subject Rights (GDPR)

### Export My Data (Article 15)
- Users can export all their data as JSON via `POST /api/privacy/export`.
- **Default behavior**: Excludes sensitive fields (notes, comments) and tokens.
- **With `include_sensitive=true`**: Includes notes and comments (P1 data), but still excludes tokens (P0 data).
- Export includes: profile, check-ins, snapshots, weekly reports, scenarios, audit logs, sharing consents, connectors, calendar events, feedback, retention policy, organization memberships.
- Downloaded as `lifeops-export-{orgname}-{date}.json`.

### Delete My Data (Article 17)
- Two-step confirmation process:
  1. `POST /api/privacy/delete/request` generates a short-lived token (15 minutes) with HMAC-SHA256 hash.
  2. `POST /api/privacy/delete/confirm` validates token + confirmation phrase (`DELETE MY DATA`).
- **Personal org deletion**: Deletes all data and the account if no other organization memberships exist.
- **Team org deletion**: Leaves the organization and deletes only user-scoped data (check-ins, snapshots, feedback).
- All connectors are disconnected first to prevent orphaned tokens.
- Immutable audit trail logs `DSR_DELETE_REQUESTED` and `DSR_DELETE_COMPLETED` events.

### Token Security
- Deletion tokens use HMAC-SHA256 with JWT secret as key.
- Tokens expire after 15 minutes.
- Tokens are hashed before storage to prevent replay attacks.
- Token is only returned in API response in development mode (NODE_ENV !== "production").

### Data Classification
- **P0 (Never Exported)**: Password hashes, OAuth tokens, session tokens, HMAC secrets.
- **P1 (Sensitive, Opt-In)**: Check-in notes, feedback comments, scenario notes.
- **P2 (Default Export)**: Life scores, breakdowns, profile settings, audit logs (metadata only).
- **P3 (Aggregate, Shareable)**: Weekly summaries, redacted insights, aggregate metrics.
