# Access Review Policy

## Purpose
Define the cadence, scope, and procedures for reviewing access controls in AI Life Ops organizations.

## Policy Statement
All organizations must conduct periodic access reviews to ensure:
- Only authorized users have access
- Access permissions align with roles and responsibilities
- Sharing consents are current and appropriate
- Inactive accounts and expired consents are revoked

## Review Cadence

### Quarterly Access Reviews (Recommended)
- **Frequency**: Every 90 days
- **Owner**: Organization admin or owner
- **Scope**: All sharing consents, organization memberships

### Trigger-Based Reviews
- New admin/owner appointed
- User role changes
- Data breach or security incident
- Regulatory audit request

## Review Scope

### What to Review

1. **Organization Memberships**
   - Active vs inactive users
   - Role appropriateness (owner, admin, member, coach, viewer)
   - Pending invitations

2. **Sharing Consents**
   - Data owner and viewer relationships
   - Consent scope (weekly_summary_only → insights_metrics_only)
   - Consent status (active vs revoked)
   - Last access timestamp

3. **Access Logs**
   - Shared data access patterns
   - Unusual access times or frequencies
   - Viewers accessing data outside their scope

### What NOT to Review
- Individual user notes or check-in content (privacy-protected)
- Personal health information
- Specific life scores or scenarios (unless consent granted)

## Review Process

### Step 1: Create Access Review Record
```bash
POST /api/org/access-reviews/create
{
  "period_start": "2026-01-01T00:00:00Z",
  "period_end": "2026-03-31T23:59:59Z"
}
```

**System Actions:**
- Generates evidence snapshot of all consents
- Captures access logs for review period
- Creates SHA256 hash for evidence integrity
- Logs `ACCESS_REVIEW_CREATED` audit event

### Step 2: Review Evidence

**Via API:**
```bash
GET /api/org/access-reviews
```

**Review Checklist:**
- [ ] All active consents are still valid
- [ ] No unexpected viewers have access
- [ ] Access logs show appropriate usage patterns
- [ ] No suspicious access attempts or patterns
- [ ] Inactive users identified for removal

### Step 3: Remediate Issues

**Revoke Inappropriate Consent:**
```bash
POST /api/org/shared-data/:consent_id/revoke
```

**Remove Inactive Member:**
```bash
DELETE /api/org/members/:member_id
```

**Change Member Role:**
```bash
PUT /api/org/members/:member_id/role
{
  "role": "viewer"  // Downgrade from admin
}
```

### Step 4: Complete Review
```bash
POST /api/org/access-reviews/:id/complete
{
  "confirm": true
}
```

**System Actions:**
- Generates completion snapshot
- Creates SHA256 hash for completion integrity
- Logs `ACCESS_REVIEW_COMPLETED` audit event
- Allows evidence PDF export

### Step 5: Export Evidence
```bash
GET /api/org/access-reviews/:id/evidence.pdf
```

**Evidence PDF Contains:**
- Review period and reviewer
- Sharing consents snapshot (owner, viewer, scope, status)
- Access logs for period (who accessed what, when)
- Evidence hashes (creation + completion)
- SOC2 compliance disclaimer

**Evidence PDF Does NOT Contain:**
- User notes, comments, or free-text content
- Personal health information
- Specific life scores or plan details

## Evidence Retention

- **Access Review Records**: Retained for 7 years (SOC2 requirement)
- **Evidence PDFs**: Stored securely for audit purposes
- **Supporting Audit Logs**: Retained per retention policy (730 days default)

## Roles & Responsibilities

| Role | Responsibilities |
|------|------------------|
| **Organization Owner** | Ultimate accountability for access reviews, approve major changes |
| **Organization Admin** | Conduct quarterly reviews, export evidence, remediate issues |
| **Data Owner (User)** | Grant/revoke sharing consents, monitor who accesses their data |
| **Viewer** | Access only consented data, respect scope limitations |

## Access Review Findings

### Common Issues

1. **Orphaned Consents**
   - **Issue**: User left org but consent still active
   - **Remediation**: Auto-revoke consents when user leaves

2. **Scope Creep**
   - **Issue**: Viewer has broader access than needed
   - **Remediation**: Reduce scope to minimum required (e.g., weekly_summary_only)

3. **Inactive Viewers**
   - **Issue**: Consent granted but viewer never accessed data
   - **Remediation**: Revoke after 90 days of inactivity

4. **Excessive Admin Roles**
   - **Issue**: Too many users with admin/owner privileges
   - **Remediation**: Downgrade to member role, follow least privilege principle

## Metrics & Reporting

### Key Metrics

- **Access Review Completion Rate**: % of scheduled reviews completed on time
- **Average Remediation Time**: Days from review start to issue resolution
- **Consent Revocation Rate**: % of consents revoked during review
- **Access Pattern Anomalies**: Flagged suspicious access attempts

### Quarterly Report Template

```markdown
# Access Review Report - Q1 2026

**Review Period**: 2026-01-01 to 2026-03-31  
**Reviewer**: admin@example.com  
**Completion Date**: 2026-04-05

## Summary
- Total Active Consents: 12
- Consents Reviewed: 12
- Consents Revoked: 2
- Role Changes: 1
- Findings: 3 minor issues resolved

## Findings
1. **Medium**: Inactive viewer (viewer@example.com) had consent but no access in 90 days
   - **Remediation**: Revoked consent on 2026-04-03

2. **Low**: Admin role assigned to user who only needs viewer access
   - **Remediation**: Downgraded role on 2026-04-04

3. **Low**: Consent scope too broad (insights_metrics_only when weekly_summary_only sufficient)
   - **Remediation**: Reduced scope on 2026-04-05

## Evidence
- Evidence PDF: `access-review-Q1-2026.pdf`
- Evidence Hash (Creation): `a3f5...`
- Evidence Hash (Completion): `b2e1...`

## Next Review
Scheduled for: 2026-07-01
```

## Automation Opportunities

### Future Enhancements

1. **Auto-Schedule Reviews**
   - Create review record automatically every 90 days
   - Send email reminder to admin/owner

2. **Anomaly Detection**
   - Flag consents with >N accesses per day
   - Alert on access outside normal hours
   - Detect geographic anomalies

3. **Smart Recommendations**
   - Suggest consent revocation for inactive viewers
   - Recommend scope reduction based on access patterns
   - Identify role changes based on activity

## Compliance Mapping

| Regulation | Requirement | How This Policy Addresses |
|------------|-------------|---------------------------|
| **SOC2 CC6.2** | Periodic access reviews | Quarterly cadence with evidence |
| **GDPR Art. 5(1)(f)** | Integrity and confidentiality | Ensures only authorized access to personal data |
| **GDPR Art. 32** | Security of processing | Regular review of access controls |
| **ISO 27001 A.9.2** | User access management | Documented review process with audit trail |

## Training & Awareness

### Admin Training
- **Frequency**: Annually or upon role assignment
- **Topics**: How to conduct review, export evidence, remediate issues
- **Assessment**: Complete mock review successfully

### User Awareness
- **Frequency**: At onboarding
- **Topics**: How to manage own sharing consents, monitor access logs
- **Resources**: Self-service docs in `/settings` page

---

**Policy Version**: 1.0  
**Effective Date**: 2026-01-11  
**Next Review**: 2026-07-11  
**Policy Owner**: Security Lead
