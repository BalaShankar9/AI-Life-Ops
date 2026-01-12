# GDPR Compliance

## Overview

AI Life Ops is committed to GDPR compliance and protecting user privacy. This document outlines our data handling practices and Data Subject Rights (DSR) implementation.

## Data Subject Rights

Under GDPR, users have the following rights:

### 1. Right to Access (Article 15)
Users can export all their personal data through the `/privacy` page or `POST /api/privacy/export` endpoint.

**What's included in export:**
- User profile and email
- Personalization settings and preferences
- Check-ins and snapshots (excluding sensitive fields by default)
- Weekly reports and evaluations
- Scenario packs and simulation runs
- Audit logs (user actions)
- Sharing consents
- Connector metadata (status, sync times - never tokens)
- Event time blocks (calendar busy times only)

**Sensitive data handling:**
By default, exports exclude sensitive free-text fields (notes, comments, detailed assumptions). Users can request full export with `include_sensitive=true`.

### 2. Right to Erasure / "Right to be Forgotten" (Article 17)
Users can request data deletion through the `/privacy` page or API endpoints.

**Deletion scope:**
- **Personal Org**: Deletes all user data in personal org and the org itself. If user has no other org memberships, deletes the entire account.
- **Team Org**: User can leave the org and delete all their data scoped to that org. Org-level data belonging to other members remains intact.

**Deletion process:**
1. User requests deletion → system generates time-limited token (15 min expiry)
2. User confirms with phrase "DELETE MY DATA" + token
3. System:
   - Disconnects connectors (clears encrypted tokens)
   - Deletes user-scoped data respecting referential integrity
   - Revokes all sharing consents involving the user
   - Writes immutable audit event: `DSR_DELETE_COMPLETED`

**What's NOT deleted:**
- Org-level audit logs required for security compliance (user references may be pseudonymized)
- Data belonging to other org members

### 3. Right to Rectification (Article 16)
Users can update their profile, preferences, and settings through the UI.

### 4. Right to Restriction of Processing (Article 18)
Users can revoke sharing consents to restrict who can view their data.

### 5. Right to Data Portability (Article 20)
Export functionality provides structured JSON format for portability.

## Data Classification

### P0 - Highly Sensitive (Never Shared)
- Connector access tokens (encrypted at rest, never exported)
- Password hashes
- Session tokens

### P1 - Personal Sensitive (Opt-in for Export)
- Free-text notes on check-ins
- Free-text comments on priorities
- Detailed assumptions in personalization

### P2 - Personal Standard (Exported by Default)
- Life stability scores
- Breakdown values (energy, money, obligations, growth, stability)
- Risk flags
- Weekly summaries
- Scenario configurations
- Connector status metadata

### P3 - Aggregate/Metadata (Shareable with Consent)
- Score trends
- Flag patterns
- Redacted weekly reports
- Redacted daily plans

## Data Retention

Default retention periods:
- **Snapshots**: 365 days
- **Audit logs**: 730 days (2 years)
- **Access logs**: 180 days
- **Feedback**: 365 days

Organizations can customize retention policies. Automated purge jobs delete data older than configured retention periods.

## Lawful Basis for Processing

- **Contract Performance**: Processing necessary to provide the service
- **Legitimate Interest**: Analytics for service improvement, security monitoring
- **Consent**: Sharing data with coaches/mentors in organizations

## Data Minimization

- Calendar events: Only busy/free time blocks stored, never event titles or descriptions
- Sharing: Redacted views only, no raw notes
- Exports: Sensitive fields opt-in only

## Security Measures

- Encryption at rest (database)
- Encryption in transit (HTTPS)
- Role-based access control (RBAC)
- Multi-tenant isolation
- Immutable audit logs
- Token expiry and rotation

## Data Controller & Processor

AI Life Ops acts as:
- **Data Controller**: For user's own data in Personal org
- **Data Processor**: For team org data (org owner is controller)

## Cross-Border Transfers

Data stored in US-based infrastructure. EU users consent to transfer under standard contractual clauses.

## Contact

For GDPR inquiries or to exercise your rights:
- Email: privacy@ai-life-ops.com
- DPO: dpo@ai-life-ops.com

## Audit Trail

All DSR actions create immutable audit events:
- `DSR_EXPORT_REQUESTED`
- `DSR_EXPORT_COMPLETED`
- `DSR_DELETE_REQUESTED`
- `DSR_DELETE_COMPLETED`
- `RETENTION_PURGE_RUN`

---

**Last Updated**: January 11, 2026
