# OmniMarket Project Guidelines

## Scope and maintenance

These instructions are the source of truth for agent-assisted development in this repository. When the stack, scripts, routes, environment variables, test counts, deployment target, or architecture changes, update this file and the related `README.md` in the same change. Remove obsolete rules instead of adding contradictory exceptions.

## Stack

- Next.js 15 App Router, React 18, TypeScript strict mode.
- Tailwind CSS 3 through `tailwind.config.ts`, `postcss.config.mjs`, and `src/app/globals.css` (design tokens as CSS variables, AA-contrast colors, minimum 12px text, `:focus-visible` states). Fonts load through `next/font`, not CSS `@import`. UI conventions: new-order form is a modal, order activity is a side drawer, sidebar is off-canvas at ≤1100px, no hardcoded/fake metrics in the UI.
- PostgreSQL with Drizzle ORM and `postgres`; the Sprint 2 model includes OAuth `users/accounts/sessions`, `products`, `orders`, `order_items`, and status history.
- Auth.js v5 with Google and GitHub OAuth in production; demo login is development-only.
- Google/GitHub account linking by matching email is explicitly disabled; users must use the provider already linked to their account until a secure explicit linking flow exists.
- Upstash Redis and `@upstash/ratelimit` for production API limits and temporary IP bans.
- `@dnd-kit` for Kanban interactions.
- Vitest for unit/integration tests and Playwright for E2E.
- Vercel for the current application deployment; Amazon RDS/Aurora PostgreSQL is the compatible production database target.

## Architecture

- Keep domain code framework-free under `src/domain`.
- Put orchestration and validation in `src/application`.
- Keep PostgreSQL and external I/O under `src/infrastructure`.
- Keep Next.js routes and UI under `src/app` and `src/presentation`.
- Route handlers validate input and authentication, then call application use cases. Do not put business rules in route handlers.
- Validate external input with Zod and preserve strict TypeScript types.

## Security and data safety

- Never print, commit, or paste `DATABASE_URL`, `AUTH_SECRET`, passwords, or cookies.
- Never use production RDS for destructive tests, seed, or reset operations.
- Use an isolated PostgreSQL service/container for CI integration tests. CI verifies that Drizzle journal/SQL migration files are present, then migrates and seeds only the ephemeral integration database. Integration tests must still create their own required fixtures.
- Keep `sslmode=require` for remote PostgreSQL connections and `DB_POOL_MAX=1` for serverless deployments unless measured evidence justifies a change.
- Configure both Upstash REST secrets in production; API requests fail closed with `503` when the limiter is unavailable. The ingress proxy must overwrite `x-real-ip` with a trusted client address; production does not trust a client-supplied `x-forwarded-for`.
- `/api/test/analytics`, `/api/test/kanban-status` and `/api/test/reset-data` are enabled only when `APP_ENV=evaluation` and `EVALUATION_API_ENABLED=true`; when `NODE_ENV=production`, they additionally require `VERCEL_ENV=preview`, and are always disabled on Vercel Production. The reset also requires `EVALUATION_RESET_SECRET` (at least 32 random bytes). Keep Preview's PostgreSQL, Upstash, Auth.js secret and OAuth credentials separate from Production; never enable these routes against production data.

## Validation

Run the smallest relevant checks, then the full gate before finalizing:

```bash
pnpm audit --prod --audit-level=high
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

Current application routes are `GET/POST /api/orders`, `GET/PUT /api/orders/:id` (pending-order editing), `PATCH /api/orders/status` (bulk, set-based, transactional, max 100 ids), `PATCH /api/orders/:id/status`, `GET /api/orders/:id/history`, `GET /api/analytics`, `GET/POST /api/products` (paginated `{items,total,page,limit}`; `catalog:write` to create or `includeInactive`), `PATCH /api/products/:id`, `POST /api/products/:id/stock` (audited adjustment, never negative), `GET /api/users`, `PATCH /api/users/:id/role`, `GET /api/exports/orders`, `GET /api/exports/products`, `GET /api/health`, `POST /api/auth/login`, `POST /api/auth/logout`, and Auth.js `/api/auth/*`. Evaluation-only routes are `GET /api/test/analytics?page=1&limit=50`, `GET /api/test/kanban-status?orderNumber=...` and `POST /api/test/reset-data`; the reset is secret-protected and replaces business fixtures transactionally, while preserving auth identities and API metrics. They return `404` unless the evaluation environment is explicitly enabled and are always disabled on Vercel Production. Order creation validates with Zod, persists order/items transactionally, and decrements stock only when sufficient inventory exists. Cancelling eligible orders restores stock transactionally and idempotently; shipped or delivered orders cannot be cancelled. Real status transitions are audited with actor and timestamp, and the dashboard exposes the selected order's activity panel. The Kanban includes loading skeletons and multi-selection with sequential status updates; partial failures are reported per order. `GET /api/orders` is paginated (`status`, `q`, `sort`, `dir`, `page`, `limit`) and `GET /api/products` accepts `q` and `limit`; analytics are aggregated in SQL. Pages are `/` (Resumen), `/orders` (Kanban/table with per-column "Ver más" pagination, no horizontal or inner scrolling), `/products`, `/users` and `/observability` (admin only), and `/analytics`, each a dedicated route behind the session layout. `/observability` displays PostgreSQL-backed five-minute API aggregates and in-product alerts; it contains no raw request payload, IP or dynamic resource IDs.

Authorization is role-based (`admin`, `operator`, `viewer`; `src/domain/value-objects/role.ts`). Routes call `authorize(request, permission)` from `src/lib/authorize.ts` (401 unauthenticated, 403 without permission). Roles resolve in this order: `ADMIN_EMAILS` (comma-separated), `users.role` in the database, development-only demo accounts (`demo@`, `operator@`, `viewer@omnimarket.local`), else `viewer`. Products are soft-deleted (`active=false`); every stock change is recorded in `stock_movements`. The `/products` page manages the catalog.

API route handlers use `src/lib/api-observability.ts` to log structured request outcomes and durations and persist aggregate metrics. Metrics use a five-minute bucket keyed by method and route template, with counters for 4xx/5xx/slow requests and cumulative latency histogram boundaries; no raw request IDs, query strings, bodies, IP addresses, or dynamic IDs are persisted. `/observability` is admin-only, reports 24-hour approximate p50/p95/p99 and five-minute in-product alerts (>5% 5xx or estimated p95 >1s), and prunes buckets older than 30 days when loaded. A failed metric write logs `api_metrics_persist_failed` without changing the API handler response. Handler duration excludes the subsequent metrics-write time; these estimates are not an SLA or external notification.

The project currently has 31 unit tests, 28 integration tests, and 23 E2E tests. Development OAuth callbacks have been exercised with development credentials: Google sign-in succeeds and a GitHub account with the same email is rejected as `OAuthAccountNotLinked`. Production smoke tests verify GitHub OAuth initiation and rate-limit headers, but do not complete a user callback or verify abuse-blocking behavior. Do not claim a latency SLA that has not been measured. Performance targets must state endpoint, dataset, environment, sample count, and percentile.

`SLO-SLA.md` is a proposed, non-contractual readiness draft (99.5% monthly availability, API p95 ≤1s). Availability and production latency have not been observed for a full 30-day period; do not represent these targets as a customer guarantee.

Run `pnpm bench` (local PostgreSQL only) after query or index changes; never quote its numbers as an SLA.

Deploy workflow (`.github/workflows/deploy.yml`): after CI succeeds on `main` or `master`, it migrates RDS (secret `PRODUCTION_DATABASE_URL`, never seed) and runs a read-only smoke test against production, including GitHub OAuth initiation.

## Change protocol

For every structural change:

1. Update this file and related documentation if the rule or public behavior changes.
2. Add or update focused tests, including relational coverage when changing the database schema.
3. Run lint, typecheck, relevant tests, and build.
4. Report any unverified external dependency, such as Vercel or RDS connectivity.
