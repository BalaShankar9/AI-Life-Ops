# Connectors

Connectors bring external data into AI Life Ops without exposing secrets to the frontend. All external payloads are normalized into a canonical events store before use.

## Principles
- Tokens are never sent to the frontend.
- Tokens are encrypted at rest with AES-256-GCM and a key from the environment.
- The engine reads only canonical events, never vendor payloads.
- Sync is job-based, idempotent, and auditable.

Environment requirement:
- `CONNECTOR_ENCRYPTION_KEY` must be 32 bytes (64 hex chars).
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and `GOOGLE_OAUTH_REDIRECT_URI` are required for Google Calendar.

## Provider lifecycle
1. Disconnected: no tokens stored.
2. Connected: tokens encrypted at rest; last sync tracked.
3. Error: sync failures captured with a safe error summary.

## Sync jobs
- Sync requests enqueue a job in the connector queue.
- Each job records a ConnectorRun with start/end time, status, and counts.
- Events are replaced within a rolling sync window to avoid stale busy blocks.
- Audit logs capture sync requested/completed/failed events.

## Data minimization policy
- Store only fields needed for planning (time window, type, minimal title/location).
- Drop raw vendor payloads after normalization.
- Avoid storing sensitive content beyond what is required for scheduling.

## Google Calendar (FreeBusy)
- Uses the FreeBusy API to fetch busy time blocks only (no event titles).
- Sync window: now - 7 days through now + 14 days.
- Busy blocks are normalized into canonical `calendar_busy_block` events with minimal metadata.
