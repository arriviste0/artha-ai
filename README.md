# ArthaAI — Personal Finance SaaS

AI-powered personal finance management for the Indian market. Supports salaried, freelance, and business-owner income modes.

## Quick start (< 10 minutes)

### Prerequisites
- Node.js 20 LTS
- pnpm (`npm install -g pnpm`)
- MongoDB Atlas cluster (free tier works)
- Google Cloud project with OAuth 2.0 credentials
- Google AI Studio API key (for Gemini, only needed for Phase 3+)

### 1. Install
```bash
pnpm install
```

### 2. Environment variables
```bash
cp .env.example .env.local
```
Fill in at minimum:
- `MONGODB_URI` — your Atlas connection string
- `NEXTAUTH_SECRET` — run `openssl rand -base64 32`
- `NEXTAUTH_URL=http://localhost:3000`
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (skip if only using email/password auth)

### 3. Run
```bash
pnpm dev
```
Open http://localhost:3000. Sign up → complete 4-step onboarding → you're in.

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16, App Router, TypeScript strict |
| Database | MongoDB Atlas via Mongoose |
| Auth | NextAuth v5 (email + Google OAuth), JWT sessions |
| UI | Tailwind CSS v4 + shadcn/ui (new-york style) |
| Charts | Recharts |
| Forms | react-hook-form + zod |
| State | TanStack Query (server state) |
| AI | Google Gemini (primary) · Ollama (local fallback) |

## Money conventions

All monetary values are stored as **integer paise** (₹1 = 100 paise). No floats touch the database. Use `lib/money.ts` for all conversions and formatting.

## Project structure

```
app/
  (auth)/login, signup    — public auth pages
  (app)/...               — protected app pages (layout checks session)
  onboarding/             — 4-step wizard
  api/                    — route handlers, all behind withAuth
components/
  ui/                     — shadcn primitives
  layout/                 — sidebar, header, mobile nav
  onboarding/             — wizard step components
lib/
  db.ts                   — mongoose singleton with pooling
  auth.ts                 — NextAuth config
  with-auth.ts            — API route wrapper (injects userId)
  money.ts                — paise ↔ rupees, formatINR
  finance.ts              — XIRR, CAGR, savings rate, emergency runway
  validators/             — zod schemas (shared client + server)
models/                   — mongoose schemas
```

## Build phases

| Phase | Status | What it adds |
|-------|--------|-------------|
| 1 | ✅ Done | Auth, onboarding, app shell, empty states |
| 2 | Planned | Manual accounts + transactions, dashboard widgets |
| 3 | Planned | Statement upload + AI parsing (PDF/CSV) |
| 4 | Planned | Budgets, goals, emergency fund wizard |
| 5 | Planned | Investment tracking + XIRR/CAGR |
| 6 | Planned | AI Financial Planner + conversational chat |
| 7 | Planned | Bank integration (Mock + Setu Account Aggregator) |
| 8 | Planned | Export, account deletion, Lighthouse ≥ 90 |

## Running tests
```bash
pnpm test          # unit tests (vitest)
pnpm test:e2e      # end-to-end (playwright)
```

## Disclaimer

ArthaAI is an educational tool. It is **not** SEBI-registered investment advice.
