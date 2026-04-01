# Phase 1: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all bugs, migrate to Supabase, deploy API to Railway, deploy frontend to Vercel, and install the Operion design system foundation — resulting in a live, working app on the internet.

**Architecture:** Next.js 14 frontend on Vercel, Express API on Railway with Redis, PostgreSQL on Supabase (Bala Labs org). Prisma ORM stays — just point `DATABASE_URL` at Supabase. Python engine runs as subprocess on Railway.

**Tech Stack:** Next.js 14, Express 4, Prisma 5, PostgreSQL (Supabase), Redis (Railway), shadcn/ui, Tailwind CSS, Framer Motion, TypeScript, Python 3.9+

---

## File Structure

### Files to modify (bug fixes):
- `packages/engine/src/planner.py` — fix escaped quotes, missing newlines
- `packages/engine/src/engine.py` — fix escaped quotes, remove duplicate main block
- `apps/api/prisma/schema.prisma` — add missing Connector fields (scopes, lastSyncedAt, lastError, tokenExpiresAt)
- `apps/api/src/app.ts` — add orgId to checkin/snapshot creates, fix connector field references

### Files to create (deployment):
- `apps/web/vercel.json` — Vercel deployment config
- `Procfile` — Railway process definition for API
- `railway.json` — Railway build/deploy config
- `apps/api/Dockerfile` — containerized API for Railway (includes Python)

### Files to create (design system):
- `apps/web/components/ui/` — shadcn/ui components (button, card, input, dialog, etc.)
- `apps/web/lib/utils.ts` — cn() utility for Tailwind class merging
- `apps/web/app/globals.css` — Operion theme CSS variables
- `apps/web/tailwind.config.ts` — extended Tailwind config with Operion tokens
- `apps/web/components/layout/header.tsx` — redesigned app header
- `apps/web/components/layout/sidebar.tsx` — new sidebar navigation
- `apps/web/components/layout/app-shell.tsx` — main layout wrapper

---

## Task 1: Fix Python Engine Syntax Errors

**Files:**
- Modify: `packages/engine/src/planner.py`
- Modify: `packages/engine/src/engine.py`
- Test: `packages/engine/tests/` (existing tests)

- [ ] **Step 1: Fix escaped quotes in planner.py**

In `packages/engine/src/planner.py`, replace all `\"` with `"` in the following locations:

Line 31 — change:
```python
            \"focus_preference\": \"mixed\",
```
to:
```python
            "focus_preference": "mixed",
```

Line 35 — change:
```python
    damage_control = checkin[\"available_time_hours\"] < 2
```
to:
```python
    damage_control = checkin["available_time_hours"] < 2
```

Line 44 — change:
```python
    breakdown = {\"energy\": checkin[\"energy_level\"], \"money\": 20 - checkin[\"money_pressure\"],
```
to:
```python
    breakdown = {"energy": checkin["energy_level"], "money": 20 - checkin["money_pressure"],
```

Line 95 — fix the collapsed line. Change:
```python
        "free_time_summary": schedule_result["free_time_summary"],        \"personalization_effects\": personalization_effects,    }
```
to:
```python
        "free_time_summary": schedule_result["free_time_summary"],
        "personalization_effects": personalization_effects,
    }
```

Line 275 — change:
```python
    \"\"\"Rank actions by risk reduction, then effort and time, with personalization utility.\"\"\"
```
to:
```python
    """Rank actions by risk reduction, then effort and time, with personalization utility."""
```

Line 276 — change:
```python
    risk_weight = {\"low\": 0, \"medium\": 2, \"high\": 3}
```
to:
```python
    risk_weight = {"low": 0, "medium": 2, "high": 3}
```

Lines 281-290 — change all escaped quotes in the risk_aversion block:
```python
    highest_risk = max([flags.get(key, \"low\") for key in [\"burnout_risk\", \"financial_risk\", \"compliance_risk\", \"overload_risk\"]])
```
to:
```python
    highest_risk = max([flags.get(key, "low") for key in ["burnout_risk", "financial_risk", "compliance_risk", "overload_risk"]])
```

Lines 283-291 — change:
```python
        used.append(f\"Risk tolerance: high ({risk_aversion:.1f})\")
    elif risk_aversion > 0.7:
        used.append(f\"Risk aversion: high ({risk_aversion:.1f})\")
    else:
        used.append(f\"Risk aversion: moderate ({risk_aversion:.1f})\")
    
    focus_pref = personalization[\"focus_preference\"]
    if focus_pref != \"mixed\":
        used.append(f\"Focus preference: {focus_pref}\")
```
to:
```python
        used.append(f"Risk tolerance: high ({risk_aversion:.1f})")
    elif risk_aversion > 0.7:
        used.append(f"Risk aversion: high ({risk_aversion:.1f})")
    else:
        used.append(f"Risk aversion: moderate ({risk_aversion:.1f})")
    
    focus_pref = personalization["focus_preference"]
    if focus_pref != "mixed":
        used.append(f"Focus preference: {focus_pref}")
```

Line 289 (also in `_build_used_personalization`):
```python
    action_dict = {\"category\": action.category, \"effort\": action.effort}
```
to:
```python
    action_dict = {"category": action.category, "effort": action.effort}
```

Line 299-300 — fix collapsed line. Change:
```python
        personalization_effects.append(\"High risk aversion: safety-focused actions prioritized.\")    elif personalization["risk_aversion"] < 0.4:
```
to:
```python
        personalization_effects.append("High risk aversion: safety-focused actions prioritized.")
    elif personalization["risk_aversion"] < 0.4:
```

**Strategy:** Run `sed` or use editor find-replace to change all `\"` to `"` in planner.py, then manually verify the file parses. Also fix the two collapsed lines (95, 299-300) where newlines are missing.

- [ ] **Step 2: Fix escaped quotes in engine.py**

In `packages/engine/src/engine.py`, fix lines 256-301:

Lines 257-270 — replace all `\"` with `"`:
```python
def _extract_personalization(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Extract and validate personalization from payload, returning defaults if missing."""
    personalization = payload.get("personalization", {})
    
    default_weights = {"energy": 0.2, "money": 0.2, "obligations": 0.2, "growth": 0.2, "stability": 0.2}
    weights = personalization.get("weights", default_weights)
    
    if not validate_weights(weights):
        weights = normalize_weights(weights)
    
    return {
        "weights": weights,
        "risk_aversion": personalization.get("risk_aversion", 0.6),
        "focus_preference": personalization.get("focus_preference", "mixed"),
    }
```

Lines 273-293 — replace all `\"` with `"`:
```python
def _build_used_personalization(personalization: Dict[str, Any]) -> List[str]:
    """Build list of personalization settings used."""
    used = []
    
    weights = personalization["weights"]
    top_weight = max(weights, key=weights.get)
    used.append(f"Weights: {top_weight} emphasized ({weights[top_weight]:.2f})")
    
    risk_aversion = personalization["risk_aversion"]
    if risk_aversion < 0.4:
        used.append(f"Risk tolerance: high ({risk_aversion:.1f})")
    elif risk_aversion > 0.7:
        used.append(f"Risk aversion: high ({risk_aversion:.1f})")
    else:
        used.append(f"Risk aversion: moderate ({risk_aversion:.1f})")
    
    focus_pref = personalization["focus_preference"]
    if focus_pref != "mixed":
        used.append(f"Focus preference: {focus_pref}")
    
    return used
```

Lines 296-301 — remove duplicate `__main__` block. Change:
```python
if __name__ == \"__main__\":
    main()


if __name__ == "__main__":
    main()
```
to:
```python
if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Verify Python files parse correctly**

Run: `cd packages/engine && python3 -c "import ast; ast.parse(open('src/planner.py').read()); print('planner.py OK')" && python3 -c "import ast; ast.parse(open('src/engine.py').read()); print('engine.py OK')"`

Expected: Both files print OK with no SyntaxError.

- [ ] **Step 4: Run engine tests**

Run: `cd packages/engine && python3 -m pytest tests/ -v`

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/planner.py packages/engine/src/engine.py
git commit -m "fix: resolve Python syntax errors in engine (escaped quotes, missing newlines)"
```

---

## Task 2: Fix Prisma Schema — Add Missing Connector Fields

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (lines 263-282)

The code in `apps/api/src/connectors/tokens.ts` references `connector.scopes`, `connector.tokenExpiresAt`, and `connector.lastError`, but the Prisma schema for `Connector` doesn't have these fields.

- [ ] **Step 1: Add missing fields to Connector model**

In `apps/api/prisma/schema.prisma`, change the Connector model (lines 263-282) from:

```prisma
model Connector {
  id                   String            @id @default(uuid())
  userId               String
  orgId                String
  provider             ConnectorProvider
  status               ConnectorStatus   @default(disconnected)
  encryptedAccessToken String?
  encryptedRefreshToken String?
  expiresAt            DateTime?
  metadata             Json              @default("{}")
  createdAt            DateTime          @default(now())
  updatedAt            DateTime          @updatedAt

  user User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  org  Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  runs ConnectorRun[]

  @@unique([userId, provider])
  @@index([orgId])
}
```

to:

```prisma
model Connector {
  id                    String            @id @default(uuid())
  userId                String
  orgId                 String
  provider              ConnectorProvider
  status                ConnectorStatus   @default(disconnected)
  encryptedAccessToken  String?
  encryptedRefreshToken String?
  tokenExpiresAt        DateTime?
  scopes                String[]          @default([])
  lastSyncedAt          DateTime?
  lastError             String?
  metadata              Json              @default("{}")
  createdAt             DateTime          @default(now())
  updatedAt             DateTime          @updatedAt

  user User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  org  Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  runs ConnectorRun[]

  @@unique([userId, provider])
  @@index([orgId])
}
```

Changes: renamed `expiresAt` to `tokenExpiresAt` (matches tokens.ts line 20), added `scopes String[] @default([])`, added `lastSyncedAt DateTime?`, added `lastError String?`.

- [ ] **Step 2: Generate Prisma client**

Run: `cd apps/api && npx prisma generate`

Expected: "Generated Prisma Client"

- [ ] **Step 3: Commit**

```bash
git add apps/api/prisma/schema.prisma
git commit -m "fix: add missing Connector fields (scopes, tokenExpiresAt, lastSyncedAt, lastError)"
```

---

## Task 3: Fix TypeScript Type Errors in app.ts

**Files:**
- Modify: `apps/api/src/app.ts` (lines 546-562, 1623-1631, 1682-1689)

- [ ] **Step 1: Add orgId to checkin and snapshot creates**

In `apps/api/src/app.ts`, the checkin create at line 547 is missing `orgId`. Change:

```typescript
        const checkin = await tx.checkin.create({
          data: {
            userId: req.user!.id,
            payload: input
          }
        });
```

to:

```typescript
        const checkin = await tx.checkin.create({
          data: {
            userId: req.user!.id,
            orgId: req.orgId!,
            payload: input
          }
        });
```

The snapshot create at line 554 is also missing `orgId`. Change:

```typescript
        const snapshotRecord = await tx.snapshot.create({
          data: {
            userId: req.user!.id,
            checkinId: checkin.id,
            output,
            lifeStabilityScore: output.life_stability_score,
            flags: output.flags
          }
        });
```

to:

```typescript
        const snapshotRecord = await tx.snapshot.create({
          data: {
            userId: req.user!.id,
            orgId: req.orgId!,
            checkinId: checkin.id,
            output,
            lifeStabilityScore: output.life_stability_score,
            flags: output.flags
          }
        });
```

- [ ] **Step 2: Fix connector upsert — add orgId, remove scopes from create**

At line 1623, the connector upsert create block has `scopes: []` but scopes is now on the model. Also missing `orgId`. Change:

```typescript
        const connector = await prisma.connector.upsert({
          where: { userId_provider: { userId: req.user!.id, provider } },
          update: {},
          create: {
            userId: req.user!.id,
            provider,
            status: "connected",
            scopes: []
          }
        });
```

to:

```typescript
        const connector = await prisma.connector.upsert({
          where: { userId_provider: { userId: req.user!.id, provider } },
          update: {
            status: "connected",
          },
          create: {
            userId: req.user!.id,
            orgId: req.orgId!,
            provider,
            status: "connected",
          }
        });
```

(`scopes` defaults to `[]` in the schema now, no need to pass explicitly. `orgId` added to create.)

- [ ] **Step 3: Fix connector list response mapping**

At line 1682, the connector list maps to `connector.lastSyncedAt` and `connector.lastError` — these now exist in the schema after Task 2. Verify the field names match:

```typescript
          connectors: connectors.map((connector) => ({
            provider: connector.provider,
            status: connector.status,
            last_synced_at: connector.lastSyncedAt
              ? connector.lastSyncedAt.toISOString()
              : null,
            last_error: connector.lastError
          }))
```

This should now compile cleanly after the schema update in Task 2.

- [ ] **Step 4: Search for any other missing orgId creates**

Run: `grep -n "\.create({" apps/api/src/app.ts | head -30`

For each create call, verify it includes `orgId` where the model requires it. Common pattern: any model with `orgId String` in the schema needs `orgId: req.orgId!` in the create data.

Fix any additional missing `orgId` fields found.

- [ ] **Step 5: Run typecheck**

Run: `cd apps/api && npx tsc --noEmit`

Expected: Significantly fewer errors. Fix any remaining type errors iteratively.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/app.ts
git commit -m "fix: add missing orgId to database creates, fix Connector field references"
```

---

## Task 4: Set Up Supabase Project

**Files:**
- Modify: `apps/api/.env.example`
- Modify: `apps/api/prisma/schema.prisma` (datasource block)

- [ ] **Step 1: Create Supabase project**

Go to https://supabase.com/dashboard — select the "Bala Labs" organization. Create a new project:
- **Name:** ai-life-ops
- **Region:** closest to your users (e.g., us-east-1)
- **Database password:** generate a strong password, save it securely

After creation, go to **Settings → Database** and copy:
- `Host` (e.g., `db.xxxxxxxxxxxx.supabase.co`)
- `Port` (usually `5432`)
- `Database name` (usually `postgres`)
- `Connection string` (the full `postgresql://` URL)

Also go to **Settings → API** and copy the `anon` public key and `service_role` secret key.

- [ ] **Step 2: Update Prisma datasource for Supabase**

In `apps/api/prisma/schema.prisma`, the datasource block should already be:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

No change needed — just point the env var at Supabase.

- [ ] **Step 3: Update .env with Supabase connection string**

Create `apps/api/.env` (do NOT commit this file) with:

```env
DATABASE_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
```

The `DATABASE_URL` uses the pooler (port 6543) for runtime. The `DIRECT_URL` (port 5432) is for migrations.

Update Prisma schema datasource to include directUrl:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

- [ ] **Step 4: Push schema to Supabase**

Run: `cd apps/api && npx prisma db push`

Expected: Schema synced to Supabase. All 24 tables created.

- [ ] **Step 5: Verify with Prisma Studio**

Run: `cd apps/api && npx prisma studio`

Expected: Opens browser at localhost:5555 showing all tables in Supabase.

- [ ] **Step 6: Commit schema changes**

```bash
git add apps/api/prisma/schema.prisma apps/api/.env.example
git commit -m "feat: configure Prisma for Supabase with connection pooling"
```

---

## Task 5: Deploy API to Railway

**Files:**
- Create: `apps/api/Dockerfile`
- Create: `railway.json`

- [ ] **Step 1: Create Dockerfile for API**

Create `apps/api/Dockerfile`:

```dockerfile
FROM node:20-slim

# Install Python for the decision engine
RUN apt-get update && apt-get install -y python3 python3-pip && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy root package files for workspace resolution
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/

# Install dependencies
RUN npm ci --workspace=apps/api --workspace=packages/shared

# Copy source code
COPY packages/shared/ packages/shared/
COPY packages/engine/ packages/engine/
COPY apps/api/ apps/api/

# Generate Prisma client
RUN cd apps/api && npx prisma generate

# Build shared package
RUN cd packages/shared && npm run build

# Build API
RUN cd apps/api && npm run build

EXPOSE 4000

CMD ["node", "apps/api/dist/app.js"]
```

- [ ] **Step 2: Create railway.json**

Create `railway.json` at the project root:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "dockerfilePath": "apps/api/Dockerfile"
  },
  "deploy": {
    "healthcheckPath": "/health",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

- [ ] **Step 3: Create Railway project and Redis service**

1. Go to https://railway.app/dashboard
2. Create new project: "ai-life-ops-api"
3. Add a Redis service (click "+ New" → "Database" → "Redis")
4. Copy the `REDIS_URL` from the Redis service variables
5. Link your GitHub repo to the project for auto-deploy

- [ ] **Step 4: Set Railway environment variables**

In Railway project settings, add these environment variables:

```
DATABASE_URL=<supabase pooler connection string from Task 4>
DIRECT_URL=<supabase direct connection string from Task 4>
REDIS_URL=<from Railway Redis service>
ENGINE_PYTHON_PATH=python3
ENGINE_ENTRYPOINT=../../packages/engine/engine_cli.py
ENGINE_TIMEOUT_MS=5000
WEEKLY_ENGINE_ENTRYPOINT=../../packages/engine/weekly_cli.py
WEEKLY_ENGINE_TIMEOUT_MS=5000
PORT=4000
LOG_LEVEL=info
JWT_SECRET=<generate with: openssl rand -hex 32>
JWT_TTL_SECONDS=604800
CSRF_SECRET=<generate with: openssl rand -hex 64>
WEB_ORIGIN=https://ai-life-ops.vercel.app
CONNECTOR_ENCRYPTION_KEY=<generate with: openssl rand -hex 32>
GOOGLE_OAUTH_CLIENT_ID=<your google oauth client id>
GOOGLE_OAUTH_CLIENT_SECRET=<your google oauth secret>
GOOGLE_OAUTH_REDIRECT_URI=https://<railway-domain>/api/connectors/google_calendar/callback
```

- [ ] **Step 5: Deploy and verify health check**

Push to trigger deploy, then:

Run: `curl https://<railway-domain>/health`

Expected: `{"status":"ok"}` or similar health response.

- [ ] **Step 6: Commit deployment files**

```bash
git add apps/api/Dockerfile railway.json
git commit -m "feat: add Railway deployment config with Docker + Python engine"
```

---

## Task 6: Deploy Frontend to Vercel

**Files:**
- Create: `apps/web/vercel.json`

- [ ] **Step 1: Create vercel.json**

Create `apps/web/vercel.json`:

```json
{
  "framework": "nextjs",
  "installCommand": "cd ../.. && npm ci",
  "buildCommand": "cd ../.. && npm run build:shared && cd apps/web && npm run build",
  "outputDirectory": ".next"
}
```

- [ ] **Step 2: Create Vercel project**

1. Go to https://vercel.com/dashboard
2. Import Git Repository → select the AI Life Ops repo
3. Set **Root Directory** to `apps/web`
4. Set **Framework Preset** to Next.js
5. Add environment variable: `NEXT_PUBLIC_API_URL=https://<railway-domain>`

- [ ] **Step 3: Deploy and verify**

Vercel should auto-deploy on push. Verify:
- Homepage loads at the Vercel URL
- Login page renders
- API calls reach Railway backend (check browser network tab)

- [ ] **Step 4: Commit**

```bash
git add apps/web/vercel.json
git commit -m "feat: add Vercel deployment config for Next.js frontend"
```

---

## Task 7: Install shadcn/ui and Build Operion Design System

**Files:**
- Modify: `apps/web/package.json` (new deps)
- Modify: `apps/web/tailwind.config.ts` (Operion tokens)
- Modify: `apps/web/app/globals.css` (CSS variables)
- Create: `apps/web/lib/utils.ts` (cn utility)
- Create: `apps/web/components/ui/` (shadcn components)

- [ ] **Step 1: Install shadcn/ui dependencies**

Run:
```bash
cd apps/web && npm install class-variance-authority clsx tailwind-merge lucide-react framer-motion
```

- [ ] **Step 2: Create cn() utility**

Create `apps/web/lib/utils.ts`:

```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 3: Set up Operion CSS variables**

Replace `apps/web/app/globals.css` with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 240 10% 4%;
    --foreground: 240 5% 96%;
    --card: 240 10% 7%;
    --card-foreground: 240 5% 96%;
    --popover: 240 10% 7%;
    --popover-foreground: 240 5% 96%;
    --primary: 263 70% 58%;
    --primary-foreground: 0 0% 100%;
    --secondary: 187 92% 42%;
    --secondary-foreground: 0 0% 100%;
    --muted: 240 10% 15%;
    --muted-foreground: 240 5% 55%;
    --accent: 240 10% 15%;
    --accent-foreground: 240 5% 96%;
    --destructive: 0 84% 60%;
    --destructive-foreground: 0 0% 100%;
    --border: 240 10% 20%;
    --input: 240 10% 20%;
    --ring: 263 70% 58%;
    --radius: 0.75rem;
    --warning: 38 92% 50%;
    --warning-foreground: 0 0% 0%;
    --success: 160 84% 39%;
    --success-foreground: 0 0% 100%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
    font-feature-settings: "rlig" 1, "calt" 1;
  }
}
```

- [ ] **Step 4: Update Tailwind config with Operion tokens**

Update `apps/web/tailwind.config.ts`:

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in": {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(0)" },
        },
        "score-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.3s ease-out",
        "slide-in": "slide-in 0.3s ease-out",
        "score-pulse": "score-pulse 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 5: Initialize shadcn/ui components**

Run:
```bash
cd apps/web && npx shadcn@latest init
```

When prompted:
- Style: Default
- Base color: Slate
- CSS variables: Yes

Then install core components:
```bash
npx shadcn@latest add button card input label dialog dropdown-menu separator badge tooltip tabs avatar sheet scroll-area
```

- [ ] **Step 6: Verify components installed**

Run: `ls apps/web/components/ui/`

Expected: `button.tsx`, `card.tsx`, `input.tsx`, `label.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `separator.tsx`, `badge.tsx`, `tooltip.tsx`, `tabs.tsx`, `avatar.tsx`, `sheet.tsx`, `scroll-area.tsx`

- [ ] **Step 7: Commit design system foundation**

```bash
git add apps/web/
git commit -m "feat: install Operion design system with shadcn/ui, dark theme, custom tokens"
```

---

## Task 8: Build App Shell (Header + Sidebar + Layout)

**Files:**
- Create: `apps/web/components/layout/app-shell.tsx`
- Create: `apps/web/components/layout/sidebar.tsx`
- Create: `apps/web/components/layout/header.tsx`
- Modify: `apps/web/app/layout.tsx`

- [ ] **Step 1: Create sidebar navigation**

Create `apps/web/components/layout/sidebar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquare,
  Calendar,
  History,
  BarChart3,
  Sliders,
  Settings,
  Link2,
  Shield,
  FlaskConical,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/checkin", label: "Check-in", icon: MessageSquare },
  { href: "/today", label: "Today", icon: Calendar },
  { href: "/history", label: "History", icon: History },
  { href: "/weekly", label: "Weekly", icon: BarChart3 },
  { href: "/simulate", label: "Simulate", icon: FlaskConical },
  { href: "/connectors", label: "Connectors", icon: Link2 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-30 flex h-screen w-64 flex-col border-r border-border bg-card">
      <div className="flex h-16 items-center gap-3 border-b border-border px-6">
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-secondary" />
        <span className="text-lg font-bold tracking-tight text-foreground">
          AI Life Ops
        </span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-4">
        <Link
          href="/safety"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <Shield className="h-3.5 w-3.5" />
          Safety & Resources
        </Link>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Create header bar**

Create `apps/web/components/layout/header.tsx`:

```tsx
"use client";

import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, User, FileText } from "lucide-react";

export function Header() {
  const { user, logout } = useAuth();

  const initials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : "??";

  return (
    <header className="fixed right-0 top-0 z-20 flex h-16 items-center justify-end border-b border-border bg-background/80 px-6 backdrop-blur-xl" style={{ left: "16rem" }}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-9 w-9 rounded-full">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem className="text-xs text-muted-foreground">
            {user?.email}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a href="/settings"><User className="mr-2 h-4 w-4" />Settings</a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href="/audit"><FileText className="mr-2 h-4 w-4" />Audit Log</a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={logout}>
            <LogOut className="mr-2 h-4 w-4" />Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
```

- [ ] **Step 3: Create app shell layout**

Create `apps/web/components/layout/app-shell.tsx`:

```tsx
"use client";

import { Sidebar } from "./sidebar";
import { Header } from "./header";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <Header />
      <main className="pl-64 pt-16">
        <div className="mx-auto max-w-5xl p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Update root layout to use app shell**

Modify `apps/web/app/layout.tsx` to wrap authenticated routes with the AppShell component. Public routes (login, register, privacy, safety) should not use the shell.

```tsx
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Verify layout renders**

Run: `cd apps/web && npm run dev`

Expected: App loads with dark background, sidebar on left, header at top. No errors in console.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/layout/ apps/web/app/layout.tsx
git commit -m "feat: add AppShell layout with sidebar navigation and header"
```

---

## Task 9: Redesign Dashboard Home Page

**Files:**
- Modify: `apps/web/app/page.tsx`
- Create: `apps/web/components/dashboard/stability-gauge.tsx`
- Create: `apps/web/components/dashboard/priority-card.tsx`
- Create: `apps/web/components/dashboard/insight-card.tsx`

- [ ] **Step 1: Create life stability gauge component**

Create `apps/web/components/dashboard/stability-gauge.tsx`:

```tsx
"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function StabilityGauge({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 54;
  const progress = (score / 100) * circumference;
  const color =
    score >= 70 ? "text-success" : score >= 40 ? "text-warning" : "text-destructive";

  return (
    <div className="relative flex items-center justify-center">
      <svg width="140" height="140" viewBox="0 0 120 120">
        <circle
          cx="60" cy="60" r="54"
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth="8"
        />
        <motion.circle
          cx="60" cy="60" r="54"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          className={color}
          transform="rotate(-90 60 60)"
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - progress }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <motion.span
          className={cn("font-mono text-3xl font-bold", color)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          {score}
        </motion.span>
        <span className="text-xs text-muted-foreground">stability</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create priority card component**

Create `apps/web/components/dashboard/priority-card.tsx`:

```tsx
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Priority = {
  title: string;
  category: string;
  effort: number;
  time_estimate_min: number;
};

export function PriorityCard({
  priority,
  rank,
}: {
  priority: Priority;
  rank: number;
}) {
  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur transition-colors hover:border-primary/30">
      <CardContent className="flex items-center gap-4 p-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 font-mono text-sm font-bold text-primary">
          {rank}
        </span>
        <div className="flex-1">
          <p className="font-medium text-foreground">{priority.title}</p>
          <p className="text-xs text-muted-foreground">
            ~{priority.time_estimate_min}min · Effort {priority.effort}/5
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          {priority.category}
        </Badge>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Create insight card component**

Create `apps/web/components/dashboard/insight-card.tsx`:

```tsx
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles } from "lucide-react";

export function InsightCard({ text }: { text: string }) {
  return (
    <Card className="border-secondary/20 bg-secondary/5">
      <CardContent className="flex items-start gap-3 p-4">
        <Sparkles className="mt-0.5 h-4 w-4 text-secondary" />
        <p className="text-sm text-foreground/80">{text}</p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Redesign home page**

Rewrite `apps/web/app/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { AppShell } from "@/components/layout/app-shell";
import { StabilityGauge } from "@/components/dashboard/stability-gauge";
import { PriorityCard } from "@/components/dashboard/priority-card";
import { InsightCard } from "@/components/dashboard/insight-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Plus } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";

const API = process.env.NEXT_PUBLIC_API_URL;

export default function Dashboard() {
  const { user } = useAuth();
  const [today, setToday] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/today`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setToday(data.data);
      })
      .finally(() => setLoading(false));
  }, []);

  if (!user) return null;

  return (
    <AppShell>
      <div className="space-y-8">
        {/* Greeting */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold tracking-tight">
            Good {getTimeOfDay()}, {user.email?.split("@")[0]}
          </h1>
          <p className="text-muted-foreground">
            {today ? "Here's your plan for today." : "Start your day with a check-in."}
          </p>
        </motion.div>

        {!today && !loading && (
          <Card className="border-dashed border-primary/30">
            <CardContent className="flex flex-col items-center gap-4 py-12">
              <p className="text-muted-foreground">No check-in yet today</p>
              <Button asChild>
                <Link href="/checkin">
                  <Plus className="mr-2 h-4 w-4" />
                  Start Check-in
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {today && (
          <div className="grid gap-6 md:grid-cols-3">
            {/* Stability Score */}
            <Card>
              <CardContent className="flex flex-col items-center py-6">
                <StabilityGauge score={today.life_stability_score ?? 0} />
              </CardContent>
            </Card>

            {/* Risk Flags */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Risk Flags
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {today.flags &&
                  Object.entries(today.flags)
                    .filter(([, v]) => v !== "low")
                    .map(([key, value]) => (
                      <Badge
                        key={key}
                        variant={value === "high" ? "destructive" : "outline"}
                        className={
                          value === "high" ? "animate-score-pulse" : ""
                        }
                      >
                        <AlertTriangle className="mr-1 h-3 w-3" />
                        {key.replace(/_/g, " ")}
                      </Badge>
                    ))}
                {today.flags &&
                  Object.values(today.flags).every((v) => v === "low") && (
                    <span className="text-sm text-success">All clear</span>
                  )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Priorities */}
        {today?.priorities && (
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">
              Today's Priorities
            </h2>
            {today.priorities.slice(0, 3).map((p: any, i: number) => (
              <motion.div
                key={p.title}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <PriorityCard priority={p} rank={i + 1} />
              </motion.div>
            ))}
          </section>
        )}

        {/* AI Insight placeholder — Phase 2 */}
        {today && (
          <InsightCard text="AI insights will appear here after Phase 2 — powered by Groq." />
        )}
      </div>
    </AppShell>
  );
}

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}
```

- [ ] **Step 5: Verify dashboard renders**

Run: `cd apps/web && npm run dev`

Expected: Dashboard loads with stability gauge, priority cards, risk badges, dark theme.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/dashboard/ apps/web/app/page.tsx
git commit -m "feat: redesign dashboard with stability gauge, priority cards, risk badges"
```

---

## Task 10: Redesign Remaining Pages (Batch)

This task covers updating the remaining pages to use the Operion design system. Each page follows the same pattern: wrap in `<AppShell>`, use shadcn/ui components, apply dark theme.

**Files to modify:**
- `apps/web/app/checkin/page.tsx`
- `apps/web/app/today/page.tsx`
- `apps/web/app/history/page.tsx`
- `apps/web/app/weekly/page.tsx`
- `apps/web/app/simulate/page.tsx`
- `apps/web/app/settings/page.tsx`
- `apps/web/app/connectors/page.tsx`
- `apps/web/app/sharing/page.tsx`
- `apps/web/app/login/page.tsx`
- `apps/web/app/register/page.tsx`
- `apps/web/app/onboarding/page.tsx`

- [ ] **Step 1: Redesign check-in page**

Update `apps/web/app/checkin/page.tsx` to use:
- `<AppShell>` wrapper
- shadcn `Card`, `Input`, `Label`, `Button` components
- Slider inputs for numeric fields (sleep, energy, stress, money, deadlines, available_time)
- Dark theme styling
- `Textarea` for notes
- Keep existing fetch/submit logic, just update JSX

- [ ] **Step 2: Redesign today page**

Update `apps/web/app/today/page.tsx` to use:
- `<AppShell>` wrapper
- `PriorityCard` components for priorities
- `Badge` for risk flags
- `Card` for schedule plan, avoid actions, reasoning
- Placeholder section for AI briefing (Phase 2)
- Feedback buttons using shadcn `Button` with thumbs up/neutral/down icons

- [ ] **Step 3: Redesign history page**

Update `apps/web/app/history/page.tsx` to use:
- `<AppShell>` wrapper
- `Card` for each snapshot
- `Badge` for stability score (color-coded)
- Pagination with shadcn `Button`

- [ ] **Step 4: Redesign weekly page**

Update `apps/web/app/weekly/page.tsx` to use:
- `<AppShell>` wrapper
- `Card` sections for trends, focus, narrative
- `Button` for PDF export
- Sparkline SVG for trend data (custom, inline SVG)

- [ ] **Step 5: Redesign simulate page**

Update `apps/web/app/simulate/page.tsx` to use:
- `<AppShell>` wrapper
- `Card` for scenario packs
- `Input`/`Select` for scenario parameters
- Side-by-side comparison `Card` layout
- `Badge` for score differences

- [ ] **Step 6: Redesign settings page**

Update `apps/web/app/settings/page.tsx` to use:
- `<AppShell>` wrapper
- `Tabs` for profile / personalization / privacy sections
- `Input`, `Select`, `Label` for form fields
- Slider for personalization weights
- `Button` for save actions

- [ ] **Step 7: Redesign connectors page**

Update `apps/web/app/connectors/page.tsx` to use:
- `<AppShell>` wrapper
- `Card` per connector with status `Badge`
- `Button` for connect/disconnect/sync actions

- [ ] **Step 8: Redesign auth pages (login, register)**

Update login and register pages to use:
- Centered card layout (no AppShell)
- shadcn `Card`, `Input`, `Label`, `Button`
- Gradient accent on the logo/title
- Dark background

- [ ] **Step 9: Redesign onboarding page**

Update onboarding to use:
- Centered card layout (no AppShell)
- Step indicator
- shadcn `Input`, `Select`, `Button`
- Smooth transitions between steps

- [ ] **Step 10: Run full build and verify**

Run: `cd apps/web && npm run build`

Expected: Build succeeds with no errors.

- [ ] **Step 11: Commit all redesigned pages**

```bash
git add apps/web/app/ apps/web/components/
git commit -m "feat: redesign all pages with Operion design system (dark theme, shadcn/ui)"
```

---

## Task 11: CI/CD Integration and Final Verification

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Update CI workflow for Supabase + deployment**

The existing CI workflow uses local Postgres. Keep that for tests (CI database), but add a deployment step. Update `.github/workflows/ci.yml` to add after the build step:

```yaml
    - name: Deploy frontend to Vercel
      if: github.ref == 'refs/heads/main'
      run: npx vercel --prod --token=${{ secrets.VERCEL_TOKEN }}
      env:
        VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
        VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
```

Railway auto-deploys from GitHub, so no CI step needed for the API.

- [ ] **Step 2: Run full verification locally**

Run: `npm run verify`

Expected: Typecheck passes, all tests pass, build succeeds, no secrets detected.

- [ ] **Step 3: Push and verify deployments**

Push to main. Verify:
- Vercel deployment succeeds (check Vercel dashboard)
- Railway deployment succeeds (check Railway dashboard)
- Health check returns OK: `curl https://<railway-domain>/health`
- Frontend loads: visit `https://ai-life-ops.vercel.app`
- Login flow works end-to-end

- [ ] **Step 4: Commit CI changes**

```bash
git add .github/workflows/ci.yml
git commit -m "feat: add Vercel deployment to CI pipeline"
```

---

## Verification Checklist

After all tasks are complete, verify:

- [ ] Python engine tests pass (`npm run test:engine`)
- [ ] TypeScript compiles with no errors (`cd apps/api && npx tsc --noEmit`)
- [ ] API health check works on Railway
- [ ] Frontend loads on Vercel with dark Operion theme
- [ ] Login → Check-in → Today flow works end-to-end
- [ ] Sidebar navigation works on all pages
- [ ] All pages use the new design system
- [ ] Supabase database has all 24 tables
- [ ] No secrets in committed code (`npm run verify:secrets`)
