# Risk Register

## Product risks
- Plan feels irrelevant or generic, leading to abandonment. Mitigation: require explicit inputs, show rationale, support fast edits.
- Users over-rely on recommendations and stop checking constraints. Mitigation: always surface constraints and allow overrides.
- Onboarding friction blocks activation. Mitigation: stub onboarding with minimal required fields and defer details.

## Data risks
- Incomplete or stale data leads to bad plans. Mitigation: show last-updated timestamps and prompt for confirmation.
- Data loss during sync or storage. Mitigation: immutable snapshots, backups, and retryable writes.
- Timezone or date misalignment corrupts history. Mitigation: UTC storage, explicit local display conversions.

## Safety risks
- Plans encourage overwork or skip recovery. Mitigation: enforce rest guardrails and cap daily load.
- Advice in sensitive domains causes harm. Mitigation: refuse or defer with neutral guidance and require human judgment.

## Security risks
- Secrets exposed to the client or logs. Mitigation: env-only secrets, strict redaction, no secret injection into frontend.
- Unauthorized access to history or exports. Mitigation: auth checks on every read/write and short-lived sessions.
- Injection or malformed inputs to engine. Mitigation: schema validation at boundaries and input sanitization.

## Abuse risks
- Use as a coercive monitoring tool. Mitigation: explicit consent, no covert tracking features.
- Sharing exports without permission. Mitigation: watermarking, access controls, and audit logs.
- Generating plans for harmful activities. Mitigation: policy checks and refusal flows.
