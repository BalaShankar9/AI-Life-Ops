# Security Policy

## Reporting Security Issues

**DO NOT** create public GitHub issues for security vulnerabilities.

Instead, please email security concerns to: [Your security contact email]

We take security seriously and will respond within 48 hours.

## Secret Management

### Never Commit Secrets

- **Never** commit API keys, passwords, tokens, or private keys to version control
- All secrets must be stored in `.env` files (which are gitignored)
- Use `.env.example` files to document required environment variables with placeholder values
- Before pushing code, run `npm run verify:secrets` to scan for accidentally committed secrets

### Environment Variables

Required secrets for local development:

**API Service** (`apps/api/.env`):
- `JWT_SECRET` - JSON Web Token signing secret (min 32 chars)
- `CSRF_SECRET` - CSRF token signing secret (min 64 chars)
- `CONNECTOR_ENCRYPTION_KEY` - 64-char hex string for encrypting OAuth tokens
- `GOOGLE_OAUTH_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_OAUTH_CLIENT_SECRET` - Google OAuth client secret
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string

**Web Service** (`apps/web/.env.local`):
- `NEXT_PUBLIC_API_URL` - API endpoint URL

### Secret Rotation

Rotate secrets immediately if:
- A team member with access leaves
- You suspect a secret has been compromised
- A secret is accidentally committed to version control
- Every 90 days as a best practice (for production)

#### Rotation Procedure

1. Generate new secret value (use `openssl rand -hex 32` for cryptographic secrets)
2. Update secret in deployment environment (staging first, then production)
3. Restart affected services with new secret
4. Verify services are functioning correctly
5. Revoke old secret if possible (e.g., OAuth credentials)
6. Update team documentation

### Key Generation

Generate secure secrets:

```bash
# JWT_SECRET (32 bytes)
openssl rand -hex 32

# CSRF_SECRET (64 bytes)
openssl rand -hex 64

# CONNECTOR_ENCRYPTION_KEY (64 bytes hex)
openssl rand -hex 64
```

## Data Protection

### Personal Data (GDPR/Privacy)

- All user data is protected by multi-tenancy isolation
- Data access requires explicit sharing consent
- Users can request data export via `/api/dsr/export`
- Users can request deletion via `/api/dsr/delete` (2-step confirmation)
- Data retention policies are configurable per organization
- See [docs/gdpr.md](./gdpr.md) for full DSR implementation

### Encryption

- OAuth tokens are encrypted at rest using `CONNECTOR_ENCRYPTION_KEY`
- Passwords are hashed using bcrypt (never stored plaintext)
- Sessions use HttpOnly, Secure, SameSite cookies
- HTTPS required for production deployments

## Security Features

### CSRF Protection

- All state-changing endpoints require CSRF tokens
- Tokens are signed with HMAC-SHA256 using `CSRF_SECRET`
- Tokens expire after 2 hours
- Web client automatically includes CSRF token in API requests

### Security Headers

The API sets the following security headers:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `Content-Security-Policy` (strict CSP with nonce-based inline scripts)
- `Referrer-Policy: strict-origin-when-cross-origin`

### Access Controls

- Role-based access control (RBAC) with 5 roles: owner, admin, member, coach, viewer
- Audit logging for all data access and modifications
- Regular access reviews required (see [docs/soc2-pack/access-review-policy.md](./soc2-pack/access-review-policy.md))

## Incident Response

If you discover a security incident:

1. **Contain**: Immediately revoke compromised credentials
2. **Assess**: Determine scope of access/data exposure
3. **Notify**: Contact security team and affected users if needed
4. **Document**: Record timeline, impact, and actions taken
5. **Remediate**: Fix vulnerability and rotate affected secrets
6. **Review**: Conduct post-mortem to prevent recurrence

See [docs/soc2-pack/incident-response.md](./soc2-pack/incident-response.md) for detailed procedures.

## Dependencies

### Vulnerability Scanning

- CI runs `npm audit` on every build
- Update dependencies regularly with `npm update`
- Review GitHub Dependabot alerts promptly
- Pin major versions in package.json to avoid breaking changes

### Trusted Dependencies

- Only use well-maintained packages with active communities
- Review dependency changes in pull requests
- Minimize dependencies to reduce attack surface

## Compliance

### SOC2 Controls

This project implements SOC2 Type II controls including:
- Access management and reviews
- Change management via GitHub PRs
- Logging and monitoring
- Incident response procedures
- Secure development lifecycle

See [docs/soc2-pack/](./soc2-pack/) for full control documentation.

### GDPR Compliance

- Right to access: Data export API
- Right to erasure: Deletion request API with 2-step confirmation
- Data minimization: Configurable retention policies
- Purpose limitation: Explicit sharing consent required

## Security Checklist for Contributors

Before submitting a pull request:

- [ ] No secrets in code (run `npm run verify:secrets`)
- [ ] All tests pass (`npm run verify:quick`)
- [ ] Sensitive data properly encrypted
- [ ] Input validation for user-provided data
- [ ] CSRF protection for state-changing endpoints
- [ ] Authentication required for protected routes
- [ ] Authorization checks enforce least privilege
- [ ] Error messages don't leak sensitive information
- [ ] Dependencies are up to date (`npm audit`)

## Production Deployment

Additional security requirements for production:

1. Use strong, unique secrets (not dev values)
2. Enable HTTPS with valid TLS certificates
3. Set `NODE_ENV=production`
4. Configure strict CORS with specific origins
5. Enable rate limiting on API endpoints
6. Set up monitoring and alerting
7. Regular security audits and penetration testing
8. Backup and disaster recovery procedures

## Questions?

For security questions or concerns, contact: [Your security contact]

Last updated: [Date]
