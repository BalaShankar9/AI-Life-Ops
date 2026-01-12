# AI Life Ops

Investor-grade monorepo scaffold with SOC2 controls, GDPR compliance, and production-ready CI/CD.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start databases
npm run db:up

# 3. Copy environment files
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# 4. Update secrets in apps/api/.env (see SECURITY.md for key generation)

# 5. Run migrations + seed
npm run prisma:migrate -w apps/api
npm run prisma:seed -w apps/api

# 6. Start all services (web + api + worker)
npm run preview
```

**Web**: http://localhost:3000  
**API**: http://localhost:4000/health

## Verification

Before pushing code, always verify:

```bash
# Quick verification (typecheck + tests + secrets scan)
npm run verify:quick

# Full verification (includes builds)
npm run verify
```

## Local setup
1. Install dependencies: `npm install`
2. Start databases: `npm run db:up`
3. Configure envs:
   - `cp apps/api/.env.example apps/api/.env`
   - `cp apps/web/.env.example apps/web/.env.local`
4. Update `apps/api/.env`:
   - Set `JWT_SECRET` to a dev value.
   - Ensure `ENGINE_ENTRYPOINT` points to `packages/engine/engine_cli.py`.
   - Ensure `WEEKLY_ENGINE_ENTRYPOINT` points to `packages/engine/weekly_cli.py`.
   - Set `WEB_ORIGIN` to `http://localhost:3000`.
5. Run migrations + seed:
   - `npm run prisma:migrate -w apps/api`
   - `npm run prisma:seed -w apps/api`
6. Run API + web: `npm run dev`

Web: http://localhost:3000  
API: http://localhost:4000/health

## Auth + onboarding
- Register at `/register` or use the seeded user from `DEV_USER_EMAIL` / `DEV_USER_PASSWORD`.
- Complete `/onboarding` once to unlock `/checkin`, `/today`, `/history`, `/weekly`, `/settings`.

## Weekly review + PDF
- Open `/weekly` and generate a review for the current week window.
- Use "Download weekly PDF" to export the stored weekly report.

## Background jobs (scaffold)
- Run the worker in a separate terminal: `npm run worker -w apps/api`.
- The scheduler stub lives in `apps/api/src/scheduler.ts` and is meant to be called by an external cron in production.

## Ports
- Web: 3000
- API: 4000
- Postgres: 5432
- Redis: 6379

## Repo structure
- `apps/web` - Next.js (App Router) + Tailwind + TypeScript
- `apps/api` - Node.js + Express + TypeScript
- `packages/engine` - Python decision engine CLI (stdin/stdout JSON)
- `packages/shared` - Shared TS schemas/types (Zod)
- `docs` - Architecture and product documentation
- `docker-compose.yml` - Local Postgres + Redis

## Configuration
- `apps/api/.env` drives the API, Prisma, engine execution, and auth.
- `apps/web/.env.local` defines `NEXT_PUBLIC_API_URL` for API calls.
- `ENGINE_PYTHON_PATH`, `ENGINE_ENTRYPOINT`, and `WEEKLY_ENGINE_ENTRYPOINT` must point to the Python engine CLIs.
- PDF export uses Puppeteer; ensure Chromium can download on install.
- Auth uses an HttpOnly cookie; no tokens are stored in localStorage.

## Verification
- Engine tests: `npm run test:engine` (requires `pytest` installed)
- API smoke test: `npm run test:api`
- Web smoke test (expects API + web running): `npm run test:web`

## Troubleshooting
- Prisma migrate fails: ensure Postgres is running (`npm run db:up`) and `DATABASE_URL` is correct.
- API returns 401: ensure you are logged in and `WEB_ORIGIN` matches the web URL.
- Onboarding required: complete `/onboarding` before submitting check-ins.
- Engine errors: check `ENGINE_PYTHON_PATH` and `ENGINE_ENTRYPOINT` in `apps/api/.env`.
- Weekly engine errors: check `WEEKLY_ENGINE_ENTRYPOINT` in `apps/api/.env`.
- PDF export fails: ensure Puppeteer finished installing Chromium.
- Web smoke test fails: confirm `npm run dev`, migrations/seed, and that cookies are set (CORS).
- Shared package import errors: run `npm run build -w packages/shared` to regenerate `packages/shared/dist`.

## Security notes
- No secrets are committed; use local `.env` files only.
- Run `npm run verify:secrets` before every commit to scan for leaked secrets.
- See [docs/SECURITY.md](docs/SECURITY.md) for secret management, key rotation, and security policies.
- SOC2 controls documented in [docs/soc2-pack/](docs/soc2-pack/)
- GDPR compliance with data export and deletion APIs

## CI/CD

GitHub Actions workflow runs on every push/PR:
- Secrets scanning
- TypeScript type checking
- Full test suite (API + Engine + Web)
- Production builds

See [docs/GITHUB_PUSH.md](docs/GITHUB_PUSH.md) for GitHub setup and branch protection.

## Available Commands

**Development:**
- `npm run dev` - Start web + api (without worker)
- `npm run preview` - Start web + api + worker (full stack)
- `npm run db:up` - Start Postgres + Redis
- `npm run db:down` - Stop databases
- `npm run db:reset` - Reset database with migrations + seed

**Verification:**
- `npm run verify:quick` - Typecheck + tests + secrets scan (fast)
- `npm run verify` - Full verification including builds
- `npm run verify:secrets` - Scan for accidentally committed secrets
- `npm run verify:typecheck` - TypeScript type checking
- `npm run verify:test` - Run all tests
- `npm run verify:build` - Build all packages

**Testing:**
- `npm run test:engine` - Python engine tests
- `npm run test:api` - API tests
- `npm run test:web` - Web smoke tests
- `npm run test` - All tests

**Building:**
- `npm run build` - Build all packages
- `npm run build:api` - Build API only
- `npm run build:web` - Build web only
- `npm run build:shared` - Build shared package only

## Security notes
- No secrets are committed; use local `.env` files only.
- Postgres and Redis are bound to `127.0.0.1` for local access.
- Replace dev credentials for any shared or production environment.
