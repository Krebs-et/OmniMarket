# OmniMarket Operations Hub — desarrollo asistido y CI/CD

Este documento define el contrato de trabajo para Copilot, revisiones humanas y automatización CI/CD. La versión vigente debe permanecer alineada con [`.github/copilot-instructions.md`](./.github/copilot-instructions.md), [`.github/workflows/ci.yml`](./.github/workflows/ci.yml), [`package.json`](./package.json) y [`README.md`](./README.md).

## 1. Stack vigente

- Next.js 14 App Router, React y TypeScript en modo estricto.
- Tailwind CSS 3 como pipeline obligatorio de estilos mediante `tailwind.config.ts`, `postcss.config.mjs` y las directivas `@tailwind` de `src/app/globals.css`.
- PostgreSQL gestionado, compatible con Amazon RDS/Aurora, usando Drizzle ORM y `postgres`.
- Modelo de catálogo Sprint 2 con `products` y `order_items`, relaciones e índices de consulta.
- `@dnd-kit` para el tablero Kanban.
- Vitest para pruebas unitarias e integración.
- Playwright para pruebas E2E.
- Vercel como despliegue actual de la aplicación.

No se debe introducir Python, SQLModel, NextAuth, Redis, endpoints `/api/test/*` o Tailwind alternativo como si ya existieran. Si una tarea incorpora una de estas tecnologías, debe actualizar este contrato, la documentación y las pruebas en el mismo cambio.

## 2. Arquitectura

```text
src/domain          reglas puras y objetos de dominio
src/application     casos de uso, DTOs y validación
src/infrastructure   PostgreSQL, Drizzle y adaptadores externos
src/app              rutas Next.js, layouts y API Route Handlers
src/presentation     componentes y experiencia de usuario
```

Los Route Handlers autentican, validan con Zod e invocan casos de uso. No deben contener reglas de negocio. Las consultas y mutaciones PostgreSQL viven en infraestructura o application, no en componentes React.

## 3. Seguridad y datos

- Nunca imprimir, commitear o compartir `DATABASE_URL`, `AUTH_SECRET`, passwords o cookies.
- Las conexiones remotas PostgreSQL deben usar `sslmode=require`.
- Mantener `DB_POOL_MAX=1` para el runtime serverless salvo que existan mediciones que justifiquen otro valor.
- No ejecutar `pnpm db:seed` contra producción: elimina y recrea pedidos.
- No usar el RDS de producción para pruebas destructivas.
- CI usa PostgreSQL efímero. Las pruebas de integración no deben apuntar a RDS.
- No añadir endpoints de prueba sin guardas de entorno y revisión de seguridad.

## 4. Comandos oficiales

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
pnpm db:migrate:deploy
pnpm db:seed
```

El build de Vercel ejecuta `pnpm vercel-build`; no ejecuta migraciones ni seed.

## 5. Evidencia actual

La suite actual contiene:

- 4 pruebas unitarias.
- 9 pruebas de integración.
- 6 pruebas E2E.

No declarar diez pruebas ni un SLA de 300 ms como hechos hasta implementarlos y medirlos. Toda afirmación de rendimiento debe indicar endpoint, dataset, entorno, número de muestras y percentil.

Las rutas existentes son:

```text
GET    /api/orders
POST   /api/orders
PATCH  /api/orders/:id/status
GET    /api/orders/:id/history
GET    /api/analytics
GET    /api/products
GET    /api/health
POST   /api/auth/login
POST   /api/auth/logout
```

## 6. Ciclo de cambio

Para cada cambio estructural:

1. Revisar el contrato y los archivos relacionados.
2. Implementar siguiendo las capas existentes y Tailwind CSS.
3. Añadir o actualizar pruebas enfocadas.
4. Actualizar README, `.env*.example`, workflow o esta guía si cambia el comportamiento.
5. Ejecutar lint, typecheck, pruebas relevantes y build.
6. Reportar dependencias externas no verificadas, como conectividad Vercel/RDS.

Si un cambio modifica stack, comandos, rutas, variables, arquitectura, criterios de seguridad o estrategia de pruebas, actualizar `agentic.md` y `.github/copilot-instructions.md` en el mismo pull request. Esta regla es obligatoria y evita que las instrucciones se vuelvan obsoletas.

## 7. CI/CD

GitHub Actions ejecuta tres gates y valida que cada migración SQL esté referenciada por el journal antes de migrar:

1. `quality`: instalación reproducible, ESLint, TypeScript, unitarias y build.
2. `integration`: PostgreSQL 16 efímero, verificación de metadatos Drizzle, migración, seed y pruebas de integración con fixtures propios.
3. `e2e`: PostgreSQL efímero, verificación de metadatos Drizzle, migración, seed, Chromium y flujos Playwright.

Los reportes Playwright se publican como artefactos cuando el job termina. Vercel sólo debe desplegar una revisión que haya pasado estos gates.

## 8. Sprint 2 — base de catálogo

La primera entrega del Sprint 2 incorpora:

- `products` con SKU único, precio, costo y stock.
- `order_items` con referencias a pedido y producto, cantidades y snapshots de precio/costo.
- Índices para estado/fecha de pedidos y referencias de líneas.
- Seed local determinista de seis productos y seis líneas de pedido.
- `GET /api/products`, protegido por la sesión existente.
- `POST /api/orders` con validación Zod y transacción atómica de pedido y líneas usando precios/costos del catálogo.
- Control de inventario: permite múltiples productos sin duplicados, descuenta stock con una condición SQL atómica y revierte toda la transacción ante stock insuficiente (`409`).
- Cancelación segura: `PENDING`, `CONFIRMED` y `PROCESSING` reintegran líneas al stock en una transacción; repetir la cancelación no duplica inventario y `SHIPPED`/`DELIVERED` responden `409`.
- Auditoría: cada transición real se registra en `order_status_history` con estado anterior, estado nuevo, actor y fecha; el historial se consulta mediante `GET /api/orders/:id/history`.
- UI de auditoría: las tarjetas del Kanban abren un panel autenticado con las transiciones, actor y fecha del pedido seleccionado.

Las migraciones se ejecutan explícitamente con `pnpm db:migrate:deploy`; el build y Vercel no modifican el esquema. El seed sigue siendo destructivo y sólo debe ejecutarse contra una base local o efímera conocida.

Auth.js/OAuth, CSP, rate limiting, Redis, vistas de skeleton, edición masiva y observabilidad quedan como incrementos posteriores del Sprint 2. No se deben simular como implementados.

## 9. Evolución

Las futuras incorporaciones de Auth.js/OAuth, CSP, rate limiting, Redis, productos, `order_items`, observabilidad o medición de latencia deben:

- Definir alcance y variables nuevas.
- Actualizar este documento y las instrucciones de Copilot.
- Añadir pruebas.
- Evitar romper el contrato de despliegue Vercel/RDS.
