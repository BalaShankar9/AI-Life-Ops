# Logging and Monitoring

## Overview
AI Life Ops implements comprehensive logging and monitoring for security, operational health, and compliance.

## Logging Architecture

### Log Types

#### 1. Application Logs
**Purpose**: Debug, performance, errors  
**Tool**: Pino logger  
**Location**: `apps/api/src/app.ts`  
**Retention**: 30 days (rotated daily)

**Log Levels:**
- `fatal`: Service cannot start (missing secrets)
- `error`: Request failures, unexpected exceptions
- `warn`: Degraded performance, deprecated features
- `info`: Request/response logging (default)
- `debug`: Detailed debugging (dev only)

**What's Logged:**
- Request ID, method, path, status code, duration
- User ID (if authenticated)
- Org ID (if multi-tenant context)
- Safe error messages (no PII)

**What's NOT Logged:**
- User notes, comments, free-text input
- Personal health information
- Raw passwords or tokens
- Full request/response bodies

#### 2. Audit Logs
**Purpose**: Security events, compliance trail  
**Storage**: `AuditLog` table in PostgreSQL  
**Retention**: 730 days (configurable per org)

**Event Types (30+):**
- Authentication: `LOGIN`, `LOGOUT`, `REGISTER`, `LOGIN_FAILED`
- Profile: `PROFILE_CREATED`, `PROFILE_UPDATED`
- Data: `CHECKIN_CREATED`, `SNAPSHOT_CREATED`, `WEEKLY_REPORT_GENERATED`
- Connectors: `CONNECTOR_CONNECTED`, `CONNECTOR_DISCONNECTED`, `CONNECTOR_SYNC_RUN`
- Multi-tenancy: `ORG_CREATED`, `ORG_MEMBER_ADDED`, `ORG_MEMBER_REMOVED`
- Sharing: `SHARING_CONSENT_GRANTED`, `SHARING_CONSENT_REVOKED`, `SHARED_DATA_ACCESSED`
- DSR: `DSR_EXPORT_REQUESTED`, `DSR_DELETE_REQUESTED`, `DSR_DELETE_COMPLETED`
- Access Reviews: `ACCESS_REVIEW_CREATED`, `ACCESS_REVIEW_COMPLETED`, `ACCESS_REVIEW_EVIDENCE_EXPORTED`
- Retention: `RETENTION_PURGE_RUN`, `RETENTION_POLICY_UPDATED`

**Audit Log Schema:**
```typescript
{
  id: string;
  userId: string;
  orgId?: string;
  eventType: string;
  metadata?: JSON;  // Safe metadata only, no PII
  createdAt: DateTime;
}
```

**Immutability**: Audit logs cannot be modified or deleted (enforced at application level).

#### 3. Monitoring Events
**Purpose**: Operational alerts, failure tracking  
**Storage**: `MonitoringEvent` table in PostgreSQL  
**Retention**: 180 days

**Event Types:**
- `CONNECTOR_SYNC_FAILURE`: External API sync error
- `RETENTION_PURGE_FAILURE`: Data purge job failure
- `AUTH_FAILURE_PATTERN`: Suspicious login attempts
- `REPEATED_LOGIN_FAILURES`: Brute force indicator
- `OAUTH_CALLBACK_FAILURE`: OAuth flow error

**Schema:**
```typescript
{
  id: string;
  eventType: string;
  orgId?: string;
  userId?: string;
  metadata?: JSON;  // Error details, counts, etc.
  createdAt: DateTime;
}
```

**Access**: Admin/owner only via `GET /api/org/monitoring`

#### 4. Access Logs
**Purpose**: Track shared data access  
**Storage**: `SharedAccessLog` table in PostgreSQL  
**Retention**: 180 days (configurable)

**Schema:**
```typescript
{
  id: string;
  orgId: string;
  ownerId: string;       // User whose data was accessed
  viewerId: string;      // User who accessed data
  action: string;        // "view_weekly", "view_today", etc.
  accessedAt: DateTime;
}
```

**Privacy**: No content logged, only metadata (who, what, when).

## Monitoring Architecture

### Key Metrics

#### Health Checks
- **Endpoint**: `GET /health` (public, no auth)
- **Response**: `{ status: "ok", timestamp: "..." }`
- **Monitoring**: Uptime check every 1 minute

#### Performance Metrics
- **Request Duration**: p50, p95, p99 latencies
- **Error Rate**: % of 5xx responses
- **Throughput**: Requests per second

#### Business Metrics
- **Active Users**: Daily/weekly/monthly
- **Check-ins Created**: Per day
- **Connector Syncs**: Success vs failure rate
- **Retention Purges**: Records deleted per run

### Alerting Thresholds

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Error Rate | >1% | >5% | Check logs, rollback if needed |
| Response Time (p95) | >2s | >5s | Scale up, optimize queries |
| Failed Logins | >10/5min | >50/5min | Rate limit IP, check for brute force |
| Disk Usage | >80% | >90% | Purge old data, scale storage |
| Database Connections | >80% pool | >95% pool | Investigate connection leaks |
| Connector Sync Failure | >10% | >50% | Check OAuth tokens, API status |

### Monitoring Endpoints

#### Application Monitoring
```bash
# Health check
GET /health

# Monitoring events (admin only)
GET /api/org/monitoring?limit=50

# Audit logs (user scoped)
GET /api/audit?limit=100
```

#### Database Monitoring
```sql
-- Active connections
SELECT count(*) FROM pg_stat_activity;

-- Long-running queries
SELECT pid, now() - query_start AS duration, query
FROM pg_stat_activity
WHERE state = 'active' AND now() - query_start > interval '5 seconds';

-- Database size
SELECT pg_size_pretty(pg_database_size('ai_life_ops'));

-- Table sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename))
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC
LIMIT 10;
```

## Privacy-Preserving Logging

### What We Log
✅ Event types and timestamps  
✅ User/org IDs (for audit trail)  
✅ HTTP status codes and durations  
✅ Safe error messages ("validation failed")  
✅ Aggregate metrics (counts, averages)

### What We DON'T Log
❌ User notes, comments, free-text input  
❌ Personal health information  
❌ Life scores or plan details (unless explicitly audited)  
❌ Full request/response payloads  
❌ Passwords, tokens, or secrets  
❌ Sensitive metadata (email content, calendar titles)

### Redaction Examples

**Before Redaction (BAD):**
```json
{
  "event": "CHECKIN_CREATED",
  "notes": "Feeling anxious about meeting with boss tomorrow"
}
```

**After Redaction (GOOD):**
```json
{
  "event": "CHECKIN_CREATED",
  "has_notes": true,
  "notes_length": 53
}
```

## Log Access & Retention

### Access Control

| Log Type | Who Can Access | How |
|----------|----------------|-----|
| Application Logs | Engineers with server access | SSH, log aggregation tool |
| Audit Logs | User (own events), Admin/owner (org events) | `GET /api/audit` |
| Monitoring Events | Admin/owner | `GET /api/org/monitoring` |
| Access Logs | Data owner (own data), Admin/owner (org-wide) | `/org/audit` page |

### Retention Policy

| Log Type | Default Retention | Configurable | Rationale |
|----------|-------------------|--------------|-----------|
| Application Logs | 30 days | No | Debugging only, rotated frequently |
| Audit Logs | 730 days (2 years) | Yes (min 365 days) | Compliance, long-term forensics |
| Monitoring Events | 180 days | No | Operational trends, not compliance-critical |
| Access Logs | 180 days | Yes (per org) | Privacy balance, SOC2 evidence |

### Log Rotation & Archival

**Application Logs:**
```bash
# Daily rotation with compression
/var/log/ai-life-ops/app.log
/var/log/ai-life-ops/app.log.1.gz
/var/log/ai-life-ops/app.log.2.gz
# ...deleted after 30 days
```

**Database Logs:**
- Managed by retention policy purge jobs
- No automatic archival (deleted after retention period)
- Manual export available for compliance audits

## Security Event Detection

### Patterns to Monitor

#### 1. Brute Force Attacks
**Detection:**
```sql
SELECT user_id, COUNT(*) as failures
FROM "AuditLog"
WHERE event_type = 'LOGIN_FAILED'
AND created_at > NOW() - INTERVAL '5 minutes'
GROUP BY user_id
HAVING COUNT(*) > 10;
```

**Action**: Emit `REPEATED_LOGIN_FAILURES` monitoring event, rate limit IP

#### 2. Unusual Access Patterns
**Detection:**
- Viewer accessing data outside business hours (10pm-6am)
- Viewer accessing >100 times per day
- Geographic anomalies (if IP geolocation available)

**Action**: Flag in monitoring events for manual review

#### 3. Privilege Escalation
**Detection:**
```sql
SELECT user_id, metadata
FROM "AuditLog"
WHERE event_type = 'ORG_MEMBER_ROLE_CHANGED'
AND metadata->>'new_role' IN ('admin', 'owner')
AND created_at > NOW() - INTERVAL '24 hours';
```

**Action**: Audit log review, verify change was authorized

#### 4. Mass Data Export
**Detection:**
- User exports data multiple times in short period
- Export includes `include_sensitive=true`

**Action**: Monitor for data exfiltration, require MFA for future exports

## Operational Runbooks

### Investigating High Error Rate

1. **Check application logs for recent errors**
   ```bash
   tail -n 100 /var/log/ai-life-ops/app.log | grep ERROR
   ```

2. **Check monitoring events**
   ```bash
   curl -X GET https://api.ailife.ops/api/org/monitoring?limit=50
   ```

3. **Identify failing endpoint/feature**
   - Group errors by path/method
   - Check if specific to one org or user

4. **Review recent deployments**
   ```bash
   git log --oneline -n 10
   ```

5. **Rollback if needed** (see incident-response.md)

### Investigating Connector Sync Failure

1. **Check monitoring events for CONNECTOR_SYNC_FAILURE**
2. **Verify Google OAuth API status**
3. **Check connector status in database**
   ```sql
   SELECT * FROM "Connector" WHERE status = 'error';
   ```
4. **Review connector run logs**
   ```sql
   SELECT * FROM "ConnectorRun" 
   WHERE status = 'error' 
   ORDER BY created_at DESC 
   LIMIT 10;
   ```
5. **Test OAuth flow manually** (see connectors.md)

## Compliance Mapping

| Requirement | Implementation | Evidence |
|-------------|----------------|----------|
| **SOC2 CC7.2** - Systems are monitored | Monitoring events, alerts | `MonitoringEvent` table, alert configs |
| **SOC2 CC7.3** - Incidents are identified | Monitoring event detection patterns | Incident response runbook |
| **GDPR Art. 30** - Records of processing | Audit logs with retention policy | `AuditLog` table, 730-day retention |
| **ISO 27001 A.12.4** - Logging and monitoring | Comprehensive log types | This document, log architecture |

## Future Enhancements

1. **Centralized Log Aggregation**: ELK stack or CloudWatch
2. **Real-Time Alerting**: PagerDuty integration for P0/P1 incidents
3. **Anomaly Detection**: ML-based pattern detection for security events
4. **Log Export API**: Allow orgs to export their audit logs programmatically
5. **Metrics Dashboard**: Grafana for operational metrics visualization

---

**Document Version**: 1.0  
**Last Updated**: 2026-01-11  
**Next Review**: 2026-04-11  
**Owner**: Engineering Lead
