# SOC2 Readiness

This document outlines the security and compliance controls implemented for SOC2 readiness.

## Current Controls

### 1. Multi-Tenancy & Tenant Isolation
- **Organization Model**: Every user belongs to at least one Organization (Personal org auto-created)
- **Membership RBAC**: Role hierarchy (owner > admin > member > coach > viewer) enforced server-side
- **Tenant Scoping**: All data queries scoped by `orgId` via `requireOrgAccess` middleware
- **Cross-Org Denial**: Users cannot access data from orgs they don't belong to, even with guessed IDs

### 2. Consent-Based Sharing
- **Explicit Consent**: Users must explicitly grant scoped access to viewers (6 granularity levels)
- **Redaction by Design**: All shared data is redacted - no raw notes, comments, or personal assumptions
- **Revocation**: Owners can revoke consent at any time; access immediately denied
- **Audit Logging**: All consent grants/revokes logged in `AuditLog` with metadata

### 3. Audit Logging
- **Immutable Logs**: Append-only `AuditLog` table tracks all critical events
- **Events Tracked**:
  - `REGISTER`, `LOGIN`, `LOGOUT`
  - `ORG_CREATED`, `MEMBER_INVITED`, `MEMBER_ROLE_CHANGED`, `MEMBER_REVOKED`
  - `CONSENT_GRANTED`, `CONSENT_REVOKED`
  - `ORG_AUDIT_VIEWED`, `ORG_ACCESS_REVIEW_EXPORTED_JSON`, `ORG_ACCESS_REVIEW_EXPORTED_PDF`
- **Metadata Safety**: Audit metadata includes only safe references (org_id, user_id, role, scope) - never free-text notes

### 4. Shared Access Logging
- **Access Tracking**: Every viewer access to shared data creates a `SharedAccessLog` entry
- **Actions Logged**: `VIEW_WEEKLY_REPORT`, `VIEW_HISTORY`, `VIEW_TODAY`
- **Queryable**: Admins can filter logs by owner/viewer/action for access reviews

### 5. Org Audit Center (Admin/Owner Only)
- **Access Control**: `requireRole("admin")` enforces that only org admins/owners can access
- **Visibility**: Org-wide audit events, current access map (memberships + consents), shared access logs
- **Exports**:
  - **JSON**: Machine-readable snapshot of access review (memberships, consents, 30-day access summary)
  - **PDF**: Human-readable compliance report with disclaimers
- **Export Safety**: No personal notes or comments in exports - metadata only

### 6. Data Redaction
- **Redaction Utility**: `redactText()` strips emails, phone numbers, addresses from shared text
- **Redacted Schemas**: Separate TypeScript schemas for shared views (RedactedWeeklyReport, RedactedToday, etc.)
- **Server-Side Enforcement**: Redaction happens in API layer before response - clients never see raw data

### 7. Role-Based Access Control (RBAC)
- **Middleware**: `requireOrgAccess()` resolves active org, `requireRole(minRole)` enforces minimum role
- **Hierarchy**: Owner can do everything, admin can manage members (except other admins), member/coach/viewer read-only
- **Self-Protection**: Users cannot change own role or revoke own membership

## Remaining Work for Full SOC2 Compliance

### 1. Incident Response
- [ ] Define incident response plan for security events
- [ ] Create runbook for handling data breach notifications
- [ ] Test incident response drills quarterly

### 2. Access Review Cadence
- [ ] Schedule quarterly access reviews (automate reminders)
- [ ] Document access review process
- [ ] Archive access review reports for audit trail

### 3. Encryption at Rest
- [ ] Enable database encryption for PII fields (email, names)
- [ ] Rotate encryption keys quarterly
- [ ] Document key management procedures

### 4. Background Checks
- [ ] Require background checks for employees with data access
- [ ] Document onboarding/offboarding procedures

### 5. Training & Awareness
- [ ] Annual security training for all team members
- [ ] Phishing simulation tests
- [ ] Document training completion

### 6. Vendor Management
- [ ] Maintain vendor risk register (AWS, PrismaDB, etc.)
- [ ] Review vendor SOC2 reports annually
- [ ] Document data processing agreements

### 7. Penetration Testing
- [ ] Annual penetration test by third-party
- [ ] Remediate findings within 30 days
- [ ] Document remediation plans

### 8. Change Management
- [ ] Require code review for all production changes
- [ ] Document deployment procedures
- [ ] Maintain change log

## Compliance Mapping

### Trust Service Criteria

**CC6.1 - Logical Access**
- ✅ RBAC enforced at API layer
- ✅ Password hashing with scrypt
- ✅ Session tokens with expiration
- ✅ Cross-org access denied

**CC6.2 - System Monitoring**
- ✅ Audit logs for critical events
- ✅ Shared access logs for data views
- ✅ Export capability for reviews

**CC6.3 - Access Removal**
- ✅ Membership revocation cascades consent revocation
- ✅ Consent revocation immediate
- ✅ Logout clears session tokens

**CC7.2 - Confidentiality**
- ✅ Redaction for shared data
- ✅ No personal notes in exports
- ✅ Email masking for viewers

**CC8.1 - Change Management**
- ⏳ Code review required (policy needed)
- ⏳ Deployment procedures documented (in progress)

## Recommendations

1. **Automate Access Reviews**: Create a scheduled job to email org admins quarterly with access review reminders
2. **Rate Limiting**: Add rate limiting to prevent abuse of audit/export endpoints
3. **MFA**: Require multi-factor authentication for org owners/admins
4. **IP Whitelisting**: Allow org admins to configure IP whitelist for sensitive endpoints
5. **Data Retention**: Define and enforce data retention policies (e.g., delete old audit logs after 7 years)

## Contact

For SOC2 audit questions, contact: [security@ai-life-ops.com](mailto:security@ai-life-ops.com)

---

**Last Updated**: January 11, 2026
**Next Review**: April 11, 2026
