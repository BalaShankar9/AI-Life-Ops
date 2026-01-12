# Secure Development Lifecycle

## Overview
This document defines secure development practices for AI Life Ops to ensure code quality, security, and compliance.

## Environment Management

### Secrets Management

**Required Secrets:**
- `JWT_SECRET` - JWT token signing (min 32 characters)
- `CSRF_SECRET` - CSRF token HMAC key (min 32 characters)
- `CONNECTOR_ENCRYPTION_KEY` - Connector token encryption (min 32 characters)
- `GOOGLE_OAUTH_CLIENT_SECRET` - Google OAuth credentials
- `DATABASE_URL` - PostgreSQL connection string

**Storage:**
- **Production**: Environment variables set in hosting platform (never in code)
- **Development**: `.env` file (git ignored)
- **CI/CD**: Encrypted secrets in pipeline configuration

**Validation:**
```typescript
// apps/api/src/app.ts
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  logger.fatal("JWT_SECRET must be at least 32 characters");
  process.exit(1);
}
```

**Rotation:**
- JWT/CSRF secrets: Rotate every 90 days (or immediately if compromised)
- OAuth secrets: Rotate if Google notifies of breach
- Encryption keys: Never rotate (would break existing connector tokens)

### Environment Separation

| Environment | Purpose | Data | Access |
|-------------|---------|------|--------|
| **Development** | Local coding | Fake/test data | All engineers |
| **Staging** | Pre-production testing | Anonymized prod data | Engineers + QA |
| **Production** | Live service | Real user data | On-call engineers only |

**Configuration Differences:**
```typescript
// Development
NODE_ENV=development
CSRF_SECRET=dev-csrf-secret-32-chars-min
LOG_LEVEL=debug
HSTS=false

// Production
NODE_ENV=production
CSRF_SECRET=<strong-random-secret>
LOG_LEVEL=info
HSTS=true
```

## Code Review Process

### Pull Request Checklist

**Security:**
- [ ] No secrets or credentials in code
- [ ] User input validated/sanitized
- [ ] SQL queries use parameterized statements (Prisma ORM)
- [ ] Authentication/authorization checks present
- [ ] CSRF protection applied to state-changing endpoints
- [ ] Audit logs created for security-relevant actions

**Privacy:**
- [ ] User notes/comments never logged or echoed
- [ ] PII redacted in error messages
- [ ] Sensitive fields excluded from export by default
- [ ] Consent checks for shared data access

**Testing:**
- [ ] Unit tests pass (`npm test`)
- [ ] E2E tests pass (if applicable)
- [ ] Manual testing in staging environment
- [ ] No regressions in existing functionality

**Documentation:**
- [ ] API changes documented in code comments
- [ ] Breaking changes noted in PR description
- [ ] Runbook updated if new operational procedures

### Review Requirements

| Change Type | Reviewers Required | Approval |
|-------------|-------------------|----------|
| Feature | 1 engineer | Standard |
| Bug fix | 1 engineer | Standard |
| Security change | 2 engineers (1 security-trained) | Elevated |
| Database schema | 2 engineers | Elevated |
| Config/secrets | 2 engineers + lead | Elevated |

### Prohibited Practices

❌ **NEVER:**
- Commit secrets or API keys
- Log user notes, passwords, or tokens
- Disable security middleware in production
- Use `eval()` or dynamic SQL (`SELECT * FROM ${table}`)
- Expose internal stack traces to users
- Store passwords in plaintext

✅ **ALWAYS:**
- Use environment variables for secrets
- Hash passwords with bcrypt
- Validate input with Zod schemas
- Use Prisma ORM for database queries
- Return safe error messages to users
- Enable CSRF protection on write endpoints

## Dependency Management

### NPM Audit

**Frequency**: Weekly + on every PR  
**Command**: `npm audit`  
**Action**:
- High/Critical vulnerabilities: Fix immediately
- Moderate vulnerabilities: Fix within 30 days
- Low vulnerabilities: Review and prioritize

**Automated Scanning**: Dependabot enabled on GitHub

### Dependency Updates

```bash
# Check for outdated packages
npm outdated

# Update with caution (test thoroughly)
npm update

# Major version upgrades require manual review
```

**Policy:**
- Security patches: Apply within 48 hours
- Minor version updates: Monthly batch update
- Major version updates: Quarterly with full regression testing

### Allowed Dependencies

**Core:**
- `express` - Web framework
- `@prisma/client` - Database ORM
- `bcryptjs` - Password hashing
- `jsonwebtoken` - JWT tokens
- `zod` - Input validation
- `pino` - Logging

**Prohibited:**
- Any package with known high/critical CVEs
- Packages with <1000 weekly downloads (unless well-vetted)
- Packages maintained by single unknown maintainer

## Secure Coding Standards

### Input Validation

**Use Zod Schemas:**
```typescript
import { z } from "zod";

const CheckinInputSchema = z.object({
  energy: z.number().min(1).max(10),
  focus: z.number().min(1).max(10),
  mood: z.number().min(1).max(10),
  stress: z.number().min(1).max(10),
  notes: z.string().optional()
});

// Validate
const parsed = CheckinInputSchema.safeParse(req.body);
if (!parsed.success) {
  return sendError(res, 400, "Invalid checkin payload", req.requestId);
}
```

**Never Trust User Input:**
```typescript
// BAD
const userId = req.query.userId;
const user = await prisma.user.findUnique({ where: { id: userId } });

// GOOD
const userId = req.user!.id; // From authenticated session
const user = await prisma.user.findUnique({ where: { id: userId } });
```

### SQL Injection Prevention

**Use Prisma ORM:**
```typescript
// Prisma automatically parameterizes queries
const user = await prisma.user.findUnique({
  where: { email } // Safe, parameterized
});

// NEVER use raw SQL with user input
const user = await prisma.$queryRaw`SELECT * FROM User WHERE email = ${email}`; // Still safe with Prisma
```

### Cross-Site Scripting (XSS) Prevention

**Backend:**
- Return JSON, never HTML with user content
- Set `Content-Type: application/json` header
- Use Content Security Policy header

**Frontend:**
- React automatically escapes content
- Never use `dangerouslySetInnerHTML` with user input
- Sanitize any third-party content

### Authentication & Authorization

**Require Auth Middleware:**
```typescript
app.use("/api", requireAuth); // All /api routes require authentication

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return sendError(res, 401, "Unauthorized", req.requestId);
  }
  req.user = user;
  next();
}
```

**Require Org Access:**
```typescript
app.post("/api/checkins", requireOrgAccess, async (req, res) => {
  // req.orgId is validated and set by middleware
  const checkin = await prisma.checkin.create({
    data: {
      userId: req.user!.id,
      orgId: req.orgId!, // Safe, validated by middleware
      ...
    }
  });
});
```

**Require Role:**
```typescript
app.delete("/api/org/members/:id", 
  requireOrgAccess,
  requireRole("admin"), // Only admin/owner can delete members
  async (req, res) => {
    // ...
  }
);
```

### CSRF Protection

**Apply to All Write Endpoints:**
```typescript
app.use("/api", validateCsrf); // Automatically validates POST/PUT/DELETE

// OAuth callbacks are exempt (checked in middleware)
if (req.path.includes("/oauth/callback")) {
  return next(); // Skip CSRF
}
```

**Client Must Include Token:**
```typescript
// Web client automatically attaches X-CSRF-Token header
fetch("/api/checkins", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-CSRF-Token": csrfToken // Fetched after login
  },
  body: JSON.stringify(checkin)
});
```

## Testing Strategy

### Unit Tests

**Coverage Target**: >80% for critical paths  
**Tool**: Jest  
**Location**: `apps/api/tests/`

**Test Priorities:**
1. Authentication/authorization logic
2. Input validation
3. Business logic (engine, scenarios)
4. Privacy controls (redaction, consent checks)
5. CSRF validation
6. Access review creation/completion

### Integration Tests

**Scope**: API endpoints with database  
**Tool**: Supertest + Jest  
**Database**: Test database (cleared between tests)

**Example:**
```typescript
test("POST /api/checkins requires CSRF token", async () => {
  const res = await request(app)
    .post("/api/checkins")
    .set("Cookie", authCookie)
    .send(checkinData);
  
  expect(res.status).toBe(403);
  expect(res.body.message).toContain("CSRF");
});
```

### Security Tests

**CSRF Protection:**
- Write endpoints fail without CSRF token
- Write endpoints fail with invalid/expired token
- GET endpoints bypass CSRF validation

**Authorization:**
- Non-admin cannot delete org members
- Viewer cannot access data without consent
- User cannot access other org's data

**Privacy:**
- Export excludes notes by default
- Export never includes tokens
- Audit logs never contain user notes

## Deployment Process

### Pre-Deployment Checklist

- [ ] All tests pass
- [ ] No high/critical npm audit findings
- [ ] Secrets validated in target environment
- [ ] Database migrations reviewed
- [ ] Rollback plan documented

### Deployment Steps

1. **Create deployment branch**
   ```bash
   git checkout -b deploy/v1.2.3
   ```

2. **Run full test suite**
   ```bash
   npm run test:all
   npm run build
   ```

3. **Deploy to staging**
   ```bash
   git push staging deploy/v1.2.3
   ```

4. **Smoke test staging**
   - Login/logout
   - Create check-in
   - Export data
   - Access review (if changed)

5. **Deploy to production**
   ```bash
   git push production main
   ```

6. **Monitor for 1 hour**
   - Check error rates
   - Review application logs
   - Verify health check

7. **Rollback if needed**
   ```bash
   git revert <commit>
   git push production main
   ```

### Database Migration Safety

**Pre-Migration:**
```bash
# Backup production database
pg_dump ai_life_ops > backup_$(date +%Y%m%d_%H%M%S).sql

# Test migration on staging
cd apps/api
npx prisma migrate deploy
```

**Migration Guidelines:**
- Additive changes only (no column drops in same release)
- Add columns as nullable first, backfill, then make required
- Index creation: Use `CREATE INDEX CONCURRENTLY` to avoid locks
- Large table changes: Plan for downtime or use online migration tool

## Incident Response

See [incident-response.md](./incident-response.md) for detailed runbook.

**Quick Reference:**
1. Detect incident (monitoring alert, user report)
2. Triage severity (P0-P3)
3. Contain (revoke access, rate limit, disable feature)
4. Eradicate (deploy fix)
5. Recover (verify resolution)
6. Post-mortem (document lessons learned)

## Compliance Checklist

### Pre-Release

- [ ] Secrets validated and not in code
- [ ] CSRF protection enabled
- [ ] Security headers applied
- [ ] Audit logs created for sensitive actions
- [ ] Privacy boundaries respected (no notes in logs)
- [ ] Input validation on all endpoints
- [ ] Authorization checks on protected endpoints
- [ ] Tests pass (unit + integration)

### Post-Release

- [ ] Monitoring alerts configured
- [ ] Runbook updated if new procedures
- [ ] Documentation updated (API, admin guides)
- [ ] Team notified of changes
- [ ] Rollback plan validated

## Security Training

### Required Training

**Frequency**: Annually for all engineers  
**Topics**:
- OWASP Top 10 vulnerabilities
- Secure coding practices
- Privacy by design principles
- Incident response procedures
- SOC2 control requirements

**Assessment**: Pass security quiz (80% minimum)

### Security Champions

**Role**: Designated security-trained engineer in each team  
**Responsibilities**:
- Review security-sensitive PRs
- Stay current on vulnerabilities
- Lead security training sessions
- Participate in incident response

---

**Document Version**: 1.0  
**Last Updated**: 2026-01-11  
**Next Review**: 2026-04-11  
**Owner**: Engineering Lead
