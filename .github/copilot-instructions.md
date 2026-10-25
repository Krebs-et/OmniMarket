# OmniMarket Project Guidelines

## Scope and maintenance

These instructions are the source of truth for agent-assisted development in this repository. When the stack, scripts, routes, environment variables, test counts, deployment target, or architecture changes, update this file and the related `README.md` in the same change. Remove obsolete rules instead of adding contradictory exceptions.

## Stack

- Next.js 14 App Router, React, TypeScript strict mode.
- Tailwind CSS 3 through `tailwind.config.ts`, `postcss.config.mjs`, and `src/app/globals.css`.
- PostgreSQL with Drizzle ORM and `postgres`; the Sprint 2 catalog model includes `products` and `order_items`.
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
- Use an isolated PostgreSQL service/container for CI integration tests.
- Keep `sslmode=require` for remote PostgreSQL connections and `DB_POOL_MAX=1` for serverless deployments unless measured evidence justifies a change.
- Do not add `/api/test/*` routes without an explicit threat model and production guard.

## Validation

Run the smallest relevant checks, then the full gate before finalizing:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

Current application routes are `GET/POST /api/orders`, `PATCH /api/orders/:id/status`, `GET /api/analytics`, `GET /api/products`, `/api/health`, `/api/auth/login`, and `/api/auth/logout`. Order creation validates with Zod, persists order/items transactionally, and decrements stock only when sufficient inventory exists. Do not refer to unimplemented `/api/test/*` routes as existing functionality.

The project currently has 4 unit tests, 2 integration tests, and 4 E2E tests. Do not claim a test count or latency SLA that has not been measured. Performance targets must state endpoint, dataset, environment, and percentile.

## Change protocol

For every structural change:

1. Update this file and related documentation if the rule or public behavior changes.
2. Add or update focused tests, including relational coverage when changing the database schema.
3. Run lint, typecheck, relevant tests, and build.
4. Report any unverified external dependency, such as Vercel or RDS connectivity.
