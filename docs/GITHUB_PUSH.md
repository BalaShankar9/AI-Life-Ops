# GitHub Push Checklist

This guide walks you through pushing your local repository to GitHub with production-grade security settings.

## Pre-Push Verification

Before pushing to GitHub, ensure everything passes locally:

```bash
# 1. Run full verification suite
npm run verify

# Expected output:
# ✅ Secrets scan: No secrets detected
# ✅ Typecheck: All TypeScript files valid
# ✅ Tests: All tests passing
# ✅ Build: All packages build successfully
```

If any step fails, fix the issues before proceeding.

## Initial Git Setup

If this is a new repository:

```bash
# 1. Initialize git (if not already done)
git init

# 2. Add all files
git add .

# 3. Verify no secrets will be committed
npm run verify:secrets

# 4. Create initial commit
git commit -m "Initial commit: AI Life Ops monorepo with SOC2 controls"
```

## Create GitHub Repository

1. Go to https://github.com/new
2. Repository name: `ai-life-ops` (or your preferred name)
3. **Keep repository PRIVATE** (contains business logic)
4. **Do NOT** initialize with README, .gitignore, or license (we already have these)
5. Click "Create repository"

## Push to GitHub

```bash
# 1. Add remote origin (replace YOUR_USERNAME and YOUR_REPO)
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git

# 2. Verify remote is correct
git remote -v

# 3. Push main branch
git branch -M main
git push -u origin main
```

## Configure Branch Protection

Protect your main branch to enforce code quality:

### Via GitHub Web UI

1. Go to: `Settings` → `Branches` → `Add rule`
2. Branch name pattern: `main`
3. Enable these protections:

**Required checks:**
- ✅ Require status checks to pass before merging
  - ✅ Status checks: `verify` (CI workflow)
  - ✅ Require branches to be up to date before merging

**Pull request requirements:**
- ✅ Require pull request reviews before merging
  - Number of required approvals: `1` (adjust for team size)
- ✅ Dismiss stale pull request approvals when new commits are pushed
- ✅ Require review from Code Owners (if using CODEOWNERS file)

**Additional protections:**
- ✅ Require linear history (prevents messy merge commits)
- ✅ Include administrators (even admins must follow process)
- ✅ Do not allow bypassing the above settings

4. Click "Create" or "Save changes"

### Via GitHub CLI (Optional)

If you have `gh` CLI installed:

```bash
gh repo create ai-life-ops --private --source=. --remote=origin --push

gh api repos/:owner/:repo/branches/main/protection \
  --method PUT \
  -f required_status_checks='{"strict":true,"contexts":["verify"]}' \
  -f enforce_admins=true \
  -f required_pull_request_reviews='{"required_approving_review_count":1,"dismiss_stale_reviews":true}' \
  -f required_linear_history=true
```

## Configure GitHub Secrets

Set up secrets for CI/CD (if deploying from GitHub Actions):

1. Go to: `Settings` → `Secrets and variables` → `Actions`
2. Click "New repository secret"
3. Add production secrets:
   - `DATABASE_URL` - Production database connection string
   - `REDIS_URL` - Production Redis connection string
   - `JWT_SECRET` - Production JWT signing secret
   - `CSRF_SECRET` - Production CSRF token secret
   - `CONNECTOR_ENCRYPTION_KEY` - Production encryption key
   - `GOOGLE_OAUTH_CLIENT_ID` - Production Google OAuth client ID
   - `GOOGLE_OAUTH_CLIENT_SECRET` - Production Google OAuth secret

**Note:** CI uses `.env.ci` for tests. These secrets are for production deployment only.

## Enable Dependabot

Keep dependencies up to date automatically:

1. Go to: `Settings` → `Code security and analysis`
2. Enable:
   - ✅ Dependency graph
   - ✅ Dependabot alerts
   - ✅ Dependabot security updates
   - ✅ Dependabot version updates

3. Create `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
    
  - package-ecosystem: "npm"
    directory: "/apps/api"
    schedule:
      interval: "weekly"
    
  - package-ecosystem: "npm"
    directory: "/apps/web"
    schedule:
      interval: "weekly"
    
  - package-ecosystem: "pip"
    directory: "/packages/engine"
    schedule:
      interval: "weekly"
```

## Configure Code Owners (Optional)

Create `.github/CODEOWNERS` to auto-assign reviewers:

```
# Default owners for everything
*                           @your-username

# Security-critical files require security team review
/docs/SECURITY.md           @security-team
/docs/soc2-pack/*           @security-team
/.github/workflows/*        @devops-team

# Backend changes require backend team review
/apps/api/*                 @backend-team
/packages/engine/*          @backend-team

# Frontend changes require frontend team review
/apps/web/*                 @frontend-team
```

## Workflow for Future Changes

After initial setup, use this workflow:

```bash
# 1. Create feature branch
git checkout -b feature/your-feature-name

# 2. Make changes and commit
git add .
git commit -m "feat: description of changes"

# 3. Verify locally before pushing
npm run verify:quick

# 4. Push branch
git push -u origin feature/your-feature-name

# 5. Open pull request on GitHub
# 6. Wait for CI to pass
# 7. Request review from teammate
# 8. Merge when approved and CI passes
```

## Post-Push Verification

After your first push:

1. **Check CI is running**: Go to `Actions` tab → Verify "CI" workflow is running
2. **Ensure CI passes**: First run should be green ✅
3. **Test branch protection**: Try to push directly to `main` → Should be blocked
4. **Create test PR**: Create a test branch and PR to verify workflow

## Troubleshooting

### CI Fails on First Run

**Common issues:**

1. **Missing Python dependencies**
   - Solution: Check `packages/engine/setup.py` exists and has all deps
   
2. **Prisma migrations fail**
   - Solution: Verify `.env.ci` has correct `DATABASE_URL`
   
3. **Tests timeout**
   - Solution: Check service health checks in `.github/workflows/ci.yml`

4. **Secrets scan fails**
   - Solution: Run `npm run verify:secrets` locally to find leaked secrets
   - Add false positives to `.secrets-scan-ignore.json`

### Can't Push to Main

This is expected if branch protection is enabled. Use pull requests:

```bash
git checkout -b fix/branch-name
git push -u origin fix/branch-name
# Then open PR on GitHub
```

### Forgot to Run Verify

If you pushed code that fails CI:

```bash
# 1. Fix issues locally
npm run verify

# 2. Commit fix
git add .
git commit -m "fix: resolve CI failures"

# 3. Push fix
git push
```

## Security Reminders

- ✅ Never push `.env` files (they're gitignored)
- ✅ Always run `npm run verify:secrets` before committing
- ✅ Rotate secrets immediately if accidentally committed
- ✅ Keep `main` branch protected at all times
- ✅ Review all PRs, even from trusted contributors
- ✅ Monitor GitHub Security tab for vulnerability alerts

## Additional Resources

- [GitHub Branch Protection Rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Dependabot Configuration](https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/configuration-options-for-the-dependabot.yml-file)
- [Security Policy](./SECURITY.md)

---

**Ready to push?** Run `npm run verify` one more time, then follow the steps above!
