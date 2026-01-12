# Incident Response Runbook

## Purpose
This document provides step-by-step procedures for responding to security and operational incidents in AI Life Ops.

## Incident Classification

### Severity Levels

**P0 - Critical**
- Data breach or unauthorized access to user data
- Complete service outage
- Security vulnerability actively being exploited
- **Response Time**: Immediate (within 15 minutes)

**P1 - High**
- Partial service outage affecting multiple users
- Authentication or authorization bypass
- Data integrity issue
- **Response Time**: Within 1 hour

**P2 - Medium**
- Single-user service degradation
- Monitoring alert for suspicious patterns
- Non-critical feature failure
- **Response Time**: Within 4 hours

**P3 - Low**
- Minor bugs or performance issues
- Documentation errors
- **Response Time**: Within 24 hours

## Incident Response Team

| Role | Responsibilities | Contact |
|------|-----------------|---------|
| Incident Commander | Overall coordination, stakeholder communication | On-call engineer |
| Technical Lead | Root cause analysis, remediation | Backend engineer |
| Security Lead | Security assessment, forensics | Security-trained engineer |
| Communications Lead | User communication, status updates | Product owner |

## Response Procedures

### Phase 1: Detection & Triage (0-15 minutes)

1. **Detect Incident**
   - Monitoring alert triggers
   - User report received
   - Manual discovery during operations

2. **Initial Assessment**
   ```bash
   # Check service health
   curl https://api.ailife.ops/health
   
   # Check monitoring events
   curl -X GET https://api.ailife.ops/api/org/monitoring \
     -H "Cookie: auth_token=..." \
     -H "X-Org-Id: ..."
   
   # Check recent audit logs
   curl -X GET https://api.ailife.ops/api/audit?limit=100 \
     -H "Cookie: auth_token=..."
   ```

3. **Assign Severity**
   - Use classification matrix above
   - Document initial assessment

4. **Notify Team**
   - Alert incident response team
   - Create incident tracking ticket

### Phase 2: Containment (15-60 minutes)

**For Security Incidents:**

1. **Isolate Affected Systems**
   ```bash
   # Revoke compromised access tokens
   # (Manual DB operation if needed)
   psql -d ai_life_ops -c "DELETE FROM sessions WHERE user_id = '<compromised_user>';"
   
   # Rotate secrets if compromised
   export JWT_SECRET="<new_secret>"
   export CSRF_SECRET="<new_secret>"
   # Restart service
   ```

2. **Block Malicious Traffic**
   - Update firewall rules
   - Rate limit suspicious IP addresses
   - Temporarily disable affected features if needed

3. **Preserve Evidence**
   ```bash
   # Export audit logs
   curl -X GET "https://api.ailife.ops/api/audit?limit=1000" > audit_$(date +%Y%m%d_%H%M%S).json
   
   # Export monitoring events
   curl -X GET "https://api.ailife.ops/api/org/monitoring?limit=500" > monitoring_$(date +%Y%m%d_%H%M%S).json
   
   # Database backup
   pg_dump ai_life_ops > backup_incident_$(date +%Y%m%d_%H%M%S).sql
   ```

**For Service Outages:**

1. **Check Infrastructure**
   ```bash
   # Database connectivity
   psql -d ai_life_ops -c "SELECT 1;"
   
   # Check Docker containers
   docker ps
   docker logs ai-life-ops-api
   
   # Check disk space
   df -h
   ```

2. **Enable Degraded Mode**
   - Return cached data if database unavailable
   - Disable non-critical features
   - Display maintenance message

### Phase 3: Eradication & Recovery (1-4 hours)

1. **Root Cause Analysis**
   - Review logs and monitoring events
   - Identify vulnerability or failure point
   - Document technical details

2. **Apply Fix**
   ```bash
   # Deploy patch
   git pull origin main
   npm install
   npm run build
   pm2 restart ai-life-ops-api
   
   # Verify fix
   npm test
   curl https://api.ailife.ops/health
   ```

3. **Verify Resolution**
   - Test affected functionality
   - Monitor for recurrence
   - Confirm with users if applicable

4. **Restore Normal Operations**
   - Remove containment measures
   - Re-enable disabled features
   - Update status page

### Phase 4: Post-Incident (24-72 hours)

1. **Post-Mortem Document**
   - Timeline of events
   - Root cause analysis
   - Impact assessment (users affected, data exposed, downtime)
   - Actions taken
   - Lessons learned

2. **Corrective Actions**
   - Preventive measures identified
   - Assign owners and deadlines
   - Track in project management system

3. **User Communication**
   - If data breach: Email all affected users within 72 hours
   - If service outage: Status page update and post-mortem
   - Transparency about what happened and how it's fixed

4. **Update Documentation**
   - Add incident to knowledge base
   - Update runbooks with new procedures
   - Update monitoring alerts if gaps identified

## Specific Incident Scenarios

### Data Breach

**Indicators:**
- Unauthorized access in audit logs
- Unusual data export patterns
- Monitoring event: `AUTH_FAILURE_PATTERN`

**Response:**
1. Immediately revoke all active sessions
2. Force password reset for affected users
3. Export audit logs for forensics
4. Assess scope: What data was accessed?
5. Notify affected users within 72 hours
6. File incident report with appropriate authorities if required

**Communication Template:**
```
Subject: Security Incident Notification

We are writing to inform you of a security incident that may have affected your account.

What Happened: [Brief description]
What Data Was Affected: [Specific data types]
What We're Doing: [Remediation steps]
What You Should Do: [User actions - password reset, etc.]

We take security seriously and have implemented additional measures to prevent future incidents.

For questions: security@ailife.ops
```

### Connector Sync Failure

**Indicators:**
- Monitoring event: `CONNECTOR_SYNC_FAILURE`
- Users report missing calendar data
- OAuth token refresh failures

**Response:**
1. Check Google OAuth API status
2. Review connector logs in monitoring events
3. Test OAuth flow manually
4. If OAuth credentials compromised: Rotate and re-deploy
5. Notify users to reconnect if token refresh failed

**SQL Query for Affected Users:**
```sql
SELECT DISTINCT u.email
FROM "User" u
JOIN "Connector" c ON c."userId" = u.id
WHERE c.status = 'error';
```

### Retention Purge Failure

**Indicators:**
- Monitoring event: `RETENTION_PURGE_FAILURE`
- Audit log shows failed RETENTION_PURGE_RUN
- Storage growth continues despite policy

**Response:**
1. Check database constraints and foreign keys
2. Review purge job logs
3. Run manual cleanup if safe:
   ```sql
   -- Check referential integrity first
   SELECT * FROM "Snapshot" WHERE "createdAt" < NOW() - INTERVAL '365 days';
   
   -- Delete if no dependencies
   DELETE FROM "Snapshot" 
   WHERE "createdAt" < NOW() - INTERVAL '365 days'
   AND "orgId" = '<org_id>';
   ```
4. Update purge job with improved error handling
5. Schedule follow-up purge once fixed

### Suspicious Login Pattern

**Indicators:**
- Multiple failed login attempts from same IP
- Logins from unusual geographic locations
- Monitoring event: `REPEATED_LOGIN_FAILURES`

**Response:**
1. Review audit logs for user
2. Check if account compromised:
   ```sql
   SELECT * FROM "AuditLog" 
   WHERE "userId" = '<user_id>' 
   AND "eventType" IN ('LOGIN', 'LOGIN_FAILED')
   ORDER BY "createdAt" DESC
   LIMIT 50;
   ```
3. If compromised:
   - Force logout all sessions
   - Require password reset
   - Notify user via email
4. If brute force attack:
   - Rate limit IP address
   - Consider CAPTCHA after N failures

## Monitoring & Alerting

### Key Metrics to Monitor

1. **Error Rate**
   - Alert if >1% of requests fail
   - Check: `GET /api/org/monitoring`

2. **Response Time**
   - Alert if p95 >2 seconds
   - Check: Application logs

3. **Failed Logins**
   - Alert if >10 failures in 5 minutes for single user
   - Check: Audit logs with `eventType = 'LOGIN_FAILED'`

4. **Database Connections**
   - Alert if connection pool exhausted
   - Check: Database monitoring

5. **Disk Space**
   - Alert if >80% utilized
   - Check: Server monitoring

### Alert Channels

- **Email**: incidents@ailife.ops
- **Slack**: #incidents channel
- **PagerDuty**: For P0/P1 incidents

## Rollback Procedures

### Application Rollback
```bash
# Revert to previous version
git log --oneline
git checkout <previous_commit>
npm install
npm run build
pm2 restart ai-life-ops-api

# Verify
curl https://api.ailife.ops/health
```

### Database Rollback
```bash
# Only if schema change caused issue
# Restore from backup
pg_restore -d ai_life_ops backup_<timestamp>.sql

# Verify integrity
psql -d ai_life_ops -c "SELECT COUNT(*) FROM \"User\";"
```

**CAUTION**: Database rollbacks may cause data loss. Only use if forward fix not possible.

## Emergency Contacts

| Team Member | Role | Email | Phone | Availability |
|-------------|------|-------|-------|--------------|
| Primary On-Call | Incident Commander | oncall@ailife.ops | +1-XXX-XXX-XXXX | 24/7 |
| Backend Lead | Technical Lead | backend@ailife.ops | +1-XXX-XXX-XXXX | Business hours + on-call rotation |
| Security Lead | Security Expert | security@ailife.ops | +1-XXX-XXX-XXXX | Business hours |

## Compliance Requirements

### GDPR Breach Notification
- **Timeline**: Within 72 hours of becoming aware
- **Authority**: Relevant EU Data Protection Authority
- **Content**: Nature of breach, categories/approximate number affected, likely consequences, measures taken

### SOC2 Incident Reporting
- **Timeline**: Documented within 24 hours
- **Retention**: Incident records retained for 7 years
- **Content**: Full post-mortem with root cause and corrective actions

---

**Document Version**: 1.0  
**Last Updated**: 2026-01-11  
**Next Review**: 2026-04-11  
**Owner**: Security Lead
