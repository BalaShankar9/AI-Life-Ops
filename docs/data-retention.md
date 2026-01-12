# Data Retention Policy

## Overview

Data retention policies balance operational needs, compliance requirements, and user privacy. This document defines retention periods and purge procedures.

## Retention Periods by Data Type

### Personal Data

| Data Type | Default Retention | Rationale |
|-----------|-------------------|-----------|
| Snapshots (Check-in Results) | 365 days | Historical trend analysis, year-over-year comparison |
| Feedback (Personalization) | 365 days | Adaptive learning cycle, annual recalibration |
| Weekly Reports | 365 days | Quarterly reviews, annual planning |
| Scenario Runs | 365 days | Decision history, outcome tracking |

### Security & Audit

| Data Type | Default Retention | Rationale |
|-----------|-------------------|-----------|
| Audit Logs | 730 days (2 years) | Compliance requirements (SOC2, GDPR) |
| Shared Access Logs | 180 days | Access review, security monitoring |
| Deletion Requests | 90 days after expiry | Proof of DSR compliance |

### Metadata

| Data Type | Default Retention | Rationale |
|-----------|-------------------|-----------|
| Connector Runs | 90 days | Sync troubleshooting |
| Events (Calendar Blocks) | 365 days | Schedule pattern analysis |

## Retention Policy Configuration

Organizations can customize retention periods via:
- UI: `/org/retention` page (admin/owner only)
- API: `GET/PUT /api/org/retention`

**Model**: `DataRetentionPolicy`
```typescript
{
  orgId: string,
  retentionDaysSnapshots: number,    // default 365
  retentionDaysAudit: number,        // default 730
  retentionDaysAccessLogs: number,   // default 180
  retentionDaysFeedback: number      // default 365
}
```

## Purge Process

### Manual Purge
Admins/owners can trigger purge via:
- UI: `/org/retention` page → "Run Purge Now"
- API: `POST /api/org/retention/purge`

### Automated Purge (Future)
BullMQ job runs nightly:
- Checks each org's retention policy
- Deletes records older than configured days
- Writes audit event: `RETENTION_PURGE_RUN`

### Purge Logic

For each org:
1. **Snapshots**: Delete where `createdAt < NOW() - retentionDaysSnapshots`
2. **Feedback**: Delete where `createdAt < NOW() - retentionDaysFeedback`
3. **Access Logs**: Delete where `createdAt < NOW() - retentionDaysAccessLogs`
4. **Audit Logs**: Optional, delete where `createdAt < NOW() - retentionDaysAudit`
   - ⚠️ May keep critical security events longer for compliance

### Referential Integrity
Purge respects foreign key constraints:
- Deletes children first (e.g., feedback before snapshots)
- Uses transactions to ensure atomicity
- Logs counts of deleted records

## Special Cases

### User Deletion
When user deletes account:
- All user data deleted immediately (regardless of retention policy)
- Audit event preserved for compliance: `DSR_DELETE_COMPLETED`

### Connector Tokens
- Never logged or exported
- Deleted immediately on connector disconnect
- Not subject to retention policy (ephemeral)

### Shared Data
- Viewer access logs purged per retention policy
- Consents kept while active, purged after revocation + 30 days

## Compliance Alignment

### GDPR (Article 5.1.e - Storage Limitation)
"Personal data shall be kept in a form which permits identification of data subjects for no longer than is necessary."

**Our approach**:
- Default 1-year retention for operational data
- 2-year retention for audit (security necessity)
- User can request deletion anytime (overrides retention)

### SOC2 (CC6.3 - Access Removal)
"The entity removes access to data and resources when an individual's employment or relationship ends."

**Our approach**:
- Membership revocation cascades consent revocation
- Access logs prove removal
- Retention policy purges historical access logs

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Data loss | Users can export before purge; purge is manual by default |
| Premature deletion | Conservative defaults (1-2 years) |
| Compliance violation | Audit logs kept longer (2 years) |
| Performance impact | Purge uses batching and transactions |

## Future Enhancements

1. **Tiered Retention**: Archive to cold storage before deletion
2. **User Notification**: Email before data reaches purge threshold
3. **Selective Retention**: Users flag important snapshots for longer retention
4. **Anonymization**: Pseudonymize instead of delete for aggregate analytics

---

**Last Updated**: January 11, 2026  
**Next Review**: July 11, 2026
