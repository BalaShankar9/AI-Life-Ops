# AI Life Ops — Full Transformation Design Spec

**Date:** 2026-04-01
**Status:** Approved
**Approach:** Phased Rocketship (4 waves)

---

## 1. Vision

Transform AI Life Ops from a working MVP into an elite, production-grade decision orchestration platform that competes with Sunsama, Motion, and Reclaim.ai — while offering something none of them have: AI-powered decision briefings grounded in deterministic, auditable scoring.

**Target users:** All high-pressure operators — founders, on-call engineers, caregivers, managers — served through flexible personalization, not persona-specific features.

---

## 2. Architecture

### 2.1 Deployment Topology

```
VERCEL (Frontend)
├── Next.js 14 App Router
├── shadcn/ui + Tailwind (Operion design system)
├── Server Components + Server Actions
├── Edge Middleware (auth routing)
└── Vercel AI SDK (Groq streaming)

RAILWAY (Backend API)
├── Express.js API (existing, cleaned up)
├── Groq API integration (AI layer)
├── Python engine (subprocess, unchanged)
├── BullMQ workers (connector sync, AI jobs)
└── Redis 7 (job queue + caching)

SUPABASE (Bala Labs org)
├── PostgreSQL (migrated from local Prisma)
├── Realtime (live dashboard updates — Phase 4)
├── Storage (PDF exports, attachments)
└── Row Level Security (multi-tenant data isolation)
```

### 2.2 Key Decisions

- **Vercel** hosts frontend: global CDN, preview deployments, zero-config Next.js
- **Railway** hosts Express API + Python engine + Redis: keeps existing backend intact, avoids serverless rewrite
- **Supabase** replaces local Postgres: adds Realtime, Storage, and managed infra under Bala Labs org
- **Prisma stays** as ORM — works with Supabase Postgres connection string, no migration needed
- **Python engine unchanged** — deterministic, subprocess call, JSON stdin/stdout
- **Existing JWT auth stays** for Phase 1 — proven, works, no need to rewrite during foundation phase

---

## 3. Design System — "Operion"

### 3.1 Design Pillars

- **Dark-first, high contrast** — near-black backgrounds, electric accents
- **Data-dense but breathable** — operator-grade information density with clear hierarchy
- **Motion with purpose** — animations that communicate state changes, not decoration
- **Unique identity** — not a Vercel clone, not a Linear clone, distinctly AI Life Ops

### 3.2 Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-primary` | `#0A0A0F` | Page backgrounds |
| `--bg-card` | `#12121A` | Card surfaces |
| `--bg-elevated` | `#1A1A2E` | Elevated surfaces, hover states |
| `--border` | `#2A2A3E` | Subtle borders |
| `--text-primary` | `#F0F0F5` | Primary text |
| `--text-secondary` | `#8888A0` | Secondary/muted text |
| `--accent-primary` | `#7C3AED` | Electric violet — primary actions, focus |
| `--accent-secondary` | `#06B6D4` | Cyan — secondary actions, links |
| `--status-positive` | `#10B981` | Emerald — good scores, completed |
| `--status-warning` | `#F59E0B` | Amber — risk flags, attention needed |
| `--status-danger` | `#EF4444` | Red — crisis flags, errors |
| `--gradient-primary` | `violet → cyan` | Hero elements, primary CTAs |

### 3.3 Typography

- **UI text:** Inter (system font stack fallback)
- **Data/metrics:** JetBrains Mono — scores, percentages, timestamps
- **Scale:** 12/14/16/20/24/32/48px with consistent line heights

### 3.4 Components

- **Foundation:** shadcn/ui primitives, customized with Operion theme
- **Cards:** Frosted glass effect (`backdrop-blur-xl`), subtle gradient borders
- **Animations:** Framer Motion — page transitions, score counters, card reveals
- **Charts:** Custom SVG sparklines, animated ring gauges, heat maps
- **Interactions:** Drag-to-reorder priorities, slider-based scenario tuning

---

## 4. AI Engine Design

### 4.1 Philosophy

Deterministic Python engine = the brain (decisions).
Groq LLM = the voice (communication).

Two-pass architecture:
```
User input → Groq (extract structured data) → Python Engine (score/plan) → Groq (narrate) → Stream to UI
```

### 4.2 AI Stack

- **Production:** Groq API — Llama 3.3 70B (500+ tok/sec, generous free tier)
- **Development:** Ollama — local inference, same model family
- **Abstraction:** Vercel AI SDK — handles streaming, provider swapping, tool calling

### 4.3 AI Features

#### Conversational Check-in
- User chats naturally: "Slept 5 hours, stressed about investor meeting, 4 hours free"
- Groq extracts structured fields: `{sleep: 5, stress: 8, available_time: 4, notes: "investor meeting"}`
- Feeds into Python engine (unchanged)
- Traditional form always available as fallback
- Extraction prompt is deterministic (system prompt + JSON schema enforcement)

#### AI Daily Briefing
- After engine output, Groq narrates the plan in natural language
- Grounded strictly in engine output — no hallucinated advice
- Streams with typewriter effect (Groq speed makes this near-instant)
- Explains *why* priorities were chosen, *what* risks were detected
- Example: "Your stability score dropped to 62 from sleep debt. I've moved the hiring call to tomorrow so you can focus on the investor deck — your deadline clustering flag is active."

#### AI Weekly Insights
- Takes 7-day trend data + all snapshots
- Generates narrative analysis with pattern detection
- Identifies recurring patterns the deterministic engine can't see
- Example: "You consistently underestimate Wednesday workloads. Consider blocking Wednesday afternoons for overflow."

#### Smart Scenario Suggestions
- Analyzes recent check-in patterns
- Suggests relevant scenarios to simulate
- Example: "Money stress flagged 5 of 7 days. Want to simulate picking up 10hrs/week freelance?"

---

## 5. Integration Hub

### 5.1 Connector Architecture

All connectors follow the existing pattern:
1. OAuth flow → encrypted token storage (AES-256-GCM)
2. BullMQ sync job → canonical event normalization
3. No raw vendor payloads stored
4. Configurable sync windows

### 5.2 Integrations

| Integration | Data | Direction | Phase |
|---|---|---|---|
| Google Calendar | Busy blocks, meetings | Pull | Done |
| Slack | Daily briefing push, `/lifeops` check-in | Push + Pull | 3 |
| Todoist / Linear | Open tasks, deadlines, project load | Pull | 3 |
| Apple Health / Oura | Sleep, HRV, recovery score | Pull | 3 |
| Gmail / Outlook | Meeting invites, deadline mentions | Pull | 3 |
| Notion | Weekly reviews, goals | Push + Pull | 4 |
| Plaid | Account balances, spending → financial stress | Pull | 4 |

---

## 6. Screen Designs

### 6.1 Dashboard / Home (`/`)
- Life stability gauge (animated ring, 0-100)
- Today's top 3 priorities (cards with drag-reorder)
- Upcoming calendar blocks (next 4 hours)
- AI insight of the day (one-liner from weekly patterns)
- Risk flag badges (pulsing if active)
- Quick check-in CTA if not done today

### 6.2 Check-in (`/checkin`)
- **Mode A — Conversational:** Chat interface, AI extracts data, confirms with user before submitting
- **Mode B — Quick form:** Traditional 6-field form for speed
- Toggle between modes
- After submit: instant transition to AI briefing

### 6.3 Today / AI Briefing (`/today`)
- AI-narrated briefing (streaming typewriter)
- Priority cards (ranked, with effort/impact badges)
- Schedule timeline (calendar blocks + priority slots)
- "Avoid" actions section
- Risk flags with explanations
- Feedback buttons per priority (helped / neutral / didn't help)

### 6.4 Weekly Review (`/weekly`)
- Interactive trend dashboard (5 metrics, 7 days)
- Day-by-day heatmap (color = stability score)
- AI narrative summary (streaming)
- Focus recommendations (max 3)
- PDF export button
- Week-over-week comparison

### 6.5 Scenario Simulator (`/simulate`)
- Visual slider-based parameter input
- Real-time score preview as sliders move
- Side-by-side card comparison (baseline vs scenarios)
- AI-suggested scenarios at top
- Sensitivity range visualization

### 6.6 Settings (`/settings`)
- Profile section (timezone, sleep/wake, work pattern)
- Personalization weights (visual sliders with live preview)
- Connected integrations (status badges, sync controls)
- Data & privacy controls
- Theme preferences

---

## 7. Phase Plan

### Phase 1: Foundation
**Goal:** Working app live on the internet with elite design

1. Fix Python syntax errors in engine (`planner.py`, `engine.py`)
2. Fix ~70 TypeScript type errors in `apps/api/src/app.ts`
3. Create Supabase project in Bala Labs org
4. Migrate Prisma schema to Supabase Postgres
5. Deploy Express API to Railway (with Redis)
6. Install shadcn/ui in Next.js app
7. Build Operion design system (theme, tokens, base components)
8. Redesign all pages with new design system
9. Deploy frontend to Vercel
10. Set up CI/CD: GitHub → Vercel (frontend) + Railway (API)

### Phase 2: AI Core
**Goal:** AI-powered experience no competitor can match

1. Install Vercel AI SDK + Groq provider
2. Configure Ollama for local development
3. Build conversational check-in (chat → extraction → engine → briefing)
4. Build AI daily briefing with streaming
5. Build AI weekly narrative insights
6. Build smart scenario suggestions
7. Add AI briefing to dashboard home

### Phase 3: Integration Hub
**Goal:** Auto-pilot data collection

1. Slack bot — daily push notifications + `/lifeops` slash command
2. Todoist/Linear connector — task and deadline sync
3. Apple Health/Oura connector — sleep and recovery data
4. Gmail connector — commitment and deadline detection
5. Integration management UI in settings

### Phase 4: Scale & Delight
**Goal:** Elite-tier completeness

1. Notion connector — export weekly reviews, sync goals
2. Plaid connector — financial data for stress scoring
3. Mobile PWA — installable, offline check-in, push notifications
4. Supabase Realtime — live dashboard updates
5. Admin analytics dashboard
6. Animated onboarding wizard
7. Public landing page with product marketing

---

## 8. Success Criteria

- **Phase 1:** App is live, all pages render, check-in → plan flow works end-to-end
- **Phase 2:** User can chat a check-in and receive a streaming AI briefing in < 3 seconds
- **Phase 3:** At least 3 integrations auto-pulling data without manual entry
- **Phase 4:** App is installable as PWA, onboarding converts new users, landing page is live

---

## 9. Non-Goals

- Native mobile apps (iOS/Android) — PWA covers this
- Replacing the Python engine with an LLM — engine stays deterministic
- Social features / community — this is a personal operator tool
- Real-time collaboration — single-user focus per account
- Medical/legal/financial advice — ethical boundary maintained
