# SOC2 Controls Matrix

## Overview
This document maps AI Life Ops features to SOC2 Trust Services Criteria.

## Common Criteria (CC)

### CC6: Logical and Physical Access Controls

| Control ID | Control Description | Implementation | Evidence Location |
|------------|-------------------|----------------|-------------------|
| CC6.1 | System access is restricted to authorized users | RBAC with role hierarchy (owner > admin > member > coach > viewer) | `apps/api/src/rbac.ts` |
| CC6.2 | Access rights are reviewed and approved | Access Review Records with quarterly cadence | `/api/org/access-reviews` endpoints |
| CC6.3 | Data retention policies are enforced | Configurable retention with manual purge | `DataRetentionPolicy` model, `/api/org/retention` endpoints |
| CC6.6 | Authentication credentials are protected | bcrypt password hashing, JWT tokens, HttpOnly cookies | `apps/api/src/auth.ts` |
| CC6.7 | Passwords meet complexity requirements | Minimum 8 characters enforced at registration | `apps/api/src/app.ts` registration endpoint |
| CC6.8 | Session management is secure | JWT with expiry, CSRF protection for state changes | `apps/api/src/csrf.ts` |

### CC7: System Operations

| Control ID | Control Description | Implementation | Evidence Location |
|------------|-------------------|----------------|-------------------|
| CC7.2 | Systems are monitored for anomalies | MonitoringEvent table tracks failures and suspicious patterns | `apps/api/src/monitoring.ts` |
| CC7.3 | Incidents are identified and escalated | Monitoring events logged for admin review | `/api/org/monitoring` endpoint |
| CC7.4 | Incidents are resolved | Incident response runbook documented | `docs/soc2-pack/incident-response.md` |

### CC8: Change Management

| Control ID | Control Description | Implementation | Evidence Location |
|------------|-------------------|----------------|-------------------|
| CC8.1 | Changes are authorized and tested | Code review required (documented) | `docs/soc2-pack/secure-development.md` |

## Privacy-Specific Criteria (P)

### P3: Data Lifecycle

| Control ID | Control Description | Implementation | Evidence Location |
|------------|-------------------|----------------|-------------------|
| P3.1 | Data is retained according to policy | Retention policy enforced with purge jobs | `DataRetentionPolicy` model |
| P3.2 | Data is disposed of securely | Cascading deletes with referential integrity | Prisma schema with `onDelete: Cascade` |

### P4: Data Subject Rights

| Control ID | Control Description | Implementation | Evidence Location |
|------------|-------------------|----------------|-------------------|
| P4.1 | Data subjects can access their data | Export endpoint provides complete JSON bundle | `/api/privacy/export` |
| P4.2 | Data subjects can delete their data | 2-step deletion with token + phrase confirmation | `/api/privacy/delete/*` |
| P4.3 | Data subject requests are logged | Immutable audit trail with DSR event types | `AuditLog` model |

## Security Headers

| Header | Value | Purpose |
|--------|-------|---------|
| X-Content-Type-Options | nosniff | Prevent MIME sniffing |
| X-Frame-Options | DENY | Prevent clickjacking |
| Referrer-Policy | strict-origin-when-cross-origin | Limit referrer leakage |
| Strict-Transport-Security | max-age=31536000 (prod only) | Enforce HTTPS |
| Content-Security-Policy | restrictive defaults | Prevent XSS |
| Permissions-Policy | geolocation=(), microphone=(), camera=() | Restrict browser features |

## CSRF Protection

- **Implementation**: Double-submit cookie with HMAC-SHA256 signature
- **Token Expiry**: 2 hours
- **Scope**: All POST/PUT/DELETE requests (except OAuth callbacks)
- **Bypass Protection**: Signature validation prevents token forgery

## Audit Trail

All security-relevant events are logged in `AuditLog` with:
- User ID
- Organization ID (for multi-tenant isolation)
- Event type (30+ types including DSR, access reviews, retention)
- Safe metadata (no sensitive PII)
- Timestamp

Audit logs are:
- Immutable (append-only)
- Retained for 730 days by default
- Exportable for compliance review

## Evidence Generation

Access review evidence includes:
- Sharing consents snapshot
- Access logs for review period
- SHA256 hashes for integrity verification
- PDF export without sensitive notes/comments

Generated via: `GET /api/org/access-reviews/:id/evidence.pdf`

## Continuous Monitoring

Monitoring events tracked:
- `CONNECTOR_SYNC_FAILURE` - External data sync errors
- `RETENTION_PURGE_FAILURE` - Data purge job failures
- `AUTH_FAILURE_PATTERN` - Suspicious login attempts
- `OAUTH_CALLBACK_FAILURE` - OAuth integration errors

Accessible to admin/owner via: `GET /api/org/monitoring`

## Compliance Alignment

| Regulation | Controls Implemented |
|------------|---------------------|
| GDPR | Data subject rights (export, delete), retention, consent management, audit trail |
| SOC2 Type II | Access controls, monitoring, incident response, change management |
| CCPA | Consumer data access and deletion rights |
| HIPAA-aligned | No medical data stored, non-medical disclaimer prominent |

## Review Cadence

- **Access Reviews**: Quarterly (configurable per organization)
- **Retention Policy**: Annually reviewed by admin/owner
- **Security Controls**: Continuous monitoring with alert thresholds
- **Audit Log Review**: Monthly for suspicious patterns

## Next Steps for Full SOC2 Compliance

1. **Automated Backups**: Database backup schedule with offsite storage
2. **Disaster Recovery**: Documented recovery time objectives (RTO) and recovery point objectives (RPO)
3. **Vendor Risk Management**: Third-party service inventory (PostgreSQL, Google OAuth)
4. **Security Training**: Annual security awareness training for team
5. **Penetration Testing**: Annual external security assessment
6. **Business Continuity Plan**: Documented procedures for service continuity

---

**Document Version**: 1.0  
**Last Updated**: 2026-01-11  
**Next Review**: 2026-04-11
