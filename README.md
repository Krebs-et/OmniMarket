# OmniMarket Operations Hub

MVP local del dashboard operativo. La aplicación usa Next.js 15 y PostgreSQL mediante Drizzle ORM. La configuración no depende de un proveedor de hosting: puede ejecutarse localmente y desplegarse posteriormente en Vercel, Railway o una arquitectura AWS compatible con PostgreSQL. El modelo Sprint 2 añade catálogo (`products`) y líneas de pedido (`order_items`).

## Requisitos

- Node.js 20+
- pnpm 9+
- Docker y Docker Compose
- Tailwind CSS 3

## Ejecución local

```bash
cp .env.example .env
pnpm install
docker compose up -d
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Abrir http://localhost:3000.

Credenciales de demo:

```text
Correo: demo@omnimarket.local
Contraseña: omnimarket
```

El dashboard usa Google/GitHub OAuth en producción mediante Auth.js; el login demo con cookie firmada sólo está disponible en desarrollo. El tablero Kanban permite arrastrar tarjetas con mouse, touch o teclado; al soltar, el cambio se persiste mediante `PATCH /api/orders/:id/status` y se revierte si la API falla.

Google y GitHub no vinculan cuentas automáticamente por coincidencia de correo (`allowDangerousEmailAccountLinking=false`). Si una persona ya tiene una cuenta OmniMarket con Google e intenta iniciar sesión con GitHub usando el mismo correo (o viceversa), Auth.js rechaza esa vinculación y requiere entrar con el proveedor ya asociado; el login explica este comportamiento. La aplicación aún no incluye un flujo explícito para enlazar proveedores. Al enlazarlos explícitamente en una versión futura, ambos métodos deberán autenticar al mismo usuario y conservar el mismo rol. La verificación local con credenciales de desarrollo completó el callback de Google y comprobó que GitHub con el mismo correo no se enlaza. El smoke test de producción comprueba que GitHub inicia OAuth, pero no completa un callback de usuario real.

El tablero muestra skeletons mientras carga la información y permite seleccionar varios pedidos para actualizar su estado. La actualización en lote reutiliza la ruta auditada por pedido; si una o más operaciones fallan (por ejemplo, al cancelar pedidos enviados), el aviso informa cuáles no se cambiaron. Las operaciones exitosas no se revierten por fallos en otros pedidos.

El formulario **Nuevo pedido** crea pedidos desde el catálogo mediante `POST /api/orders`. Permite varias líneas sin repetir productos. El payload se valida con Zod y el pedido, sus líneas y el decremento de inventario se persisten en una única transacción; los precios y costos se toman del catálogo en el servidor. Si no existe stock suficiente, la operación responde `409` y no modifica la base.

## Validación

```bash
pnpm audit --prod --audit-level=high
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

`pnpm test` ejecuta las pruebas unitarias sin dependencias externas. `pnpm test:integration` requiere PostgreSQL activo y migrado; las pruebas crean sus propios fixtures. El job de CI también ejecuta seed para validar el conjunto demo en PostgreSQL efímero. `pnpm test:e2e` levanta automáticamente el servidor Next.js y genera `playwright-report/` y artefactos de fallo en `test-results/`.

La UI utiliza Tailwind CSS como pipeline de estilos (`tailwind.config.ts`, `postcss.config.mjs` y `@tailwind` en `src/app/globals.css`). `globals.css` define los design tokens (variables CSS con contraste AA) y las clases semánticas del dashboard; las fuentes DM Sans y Manrope se cargan con `next/font`. Distribución responsiva: en ≤1100 px la barra lateral pasa a un menú off-canvas, el formulario de pedido es un modal ("Nuevo pedido"), el historial de actividad es un panel lateral (bottom sheet en móvil) y el Kanban usa scroll horizontal con snap; en touch el arrastre se activa con pulsación larga para no bloquear el scroll. Los indicadores se calculan con datos reales (sin tendencias ficticias).

### Catálogo, pedidos y exportaciones

El esquema incluye `users`, `accounts`, `sessions` y `verification_tokens` para la integración OAuth, además de `products` y `order_items`, con índices para consultar pedidos por estado/fecha y líneas por pedido/producto. `GET /api/products` requiere una sesión autenticada y devuelve el catálogo ordenado por nombre. Cada producto tiene un umbral de stock bajo configurable (5 unidades de forma predeterminada); el catálogo permite filtrar productos bajo el umbral y exportar pedidos y productos como CSV.

Los pedidos `PENDING` pueden editarse desde el panel de actividad. La edición conserva los precios y costos snapshot de líneas existentes, usa valores actuales del catálogo para nuevas líneas y ajusta las diferencias de inventario en la misma transacción, con un movimiento auditado `order_edit` por producto. Los pedidos que avanzaron de estado no son editables.

Las exportaciones autenticadas están disponibles en `GET /api/exports/orders` y `GET /api/exports/products`. El CSV protege celdas que podrían interpretarse como fórmulas en una hoja de cálculo.

`POST /api/orders` requiere sesión y acepta:

```json
{
  "customerName": "Cliente Demo",
  "items": [{ "productId": "uuid-del-producto", "quantity": 2 }]
}
```

El stock se descuenta con una actualización condicionada (`stock >= quantity`) para evitar inventario negativo bajo solicitudes concurrentes.

Al cancelar un pedido en estado `PENDING`, `CONFIRMED` o `PROCESSING`, sus cantidades se reintegran al inventario dentro de la misma transacción. La cancelación es idempotente: repetirla no duplica el stock. Los pedidos `SHIPPED` o `DELIVERED` no pueden cancelarse y responden `409`.

Cada transición real de estado se registra en `order_status_history` con estado anterior, estado nuevo, correo del actor y fecha. Las transiciones repetidas no crean eventos adicionales. El historial autenticado se consulta mediante `GET /api/orders/:id/history`.

## Escalabilidad y navegación

La aplicación tiene cinco rutas dedicadas: `/` (Resumen), `/orders` (Tablero/Tabla), `/products` (catálogo), `/analytics` y `/users` (gestión de usuarios, solo admin). Los roles son `admin` (todo), `operator` (pedidos; catálogo en lectura) y `viewer` (solo lectura); se asignan con `ADMIN_EMAILS` (separados por comas) o con `users.role`, y los usuarios nuevos entran como `viewer`. Los administradores pueden cambiar el rol de otros usuarios; las cuentas incluidas en `ADMIN_EMAILS`, el cambio del propio rol y la eliminación del último administrador efectivo están protegidos. En desarrollo existen las cuentas demo `demo@`, `operator@` y `viewer@omnimarket.local`. El catálogo usa baja lógica y cada cambio de inventario queda en `stock_movements`. `GET /api/orders` admite `status`, `q`, `sort` (`created|total|customer`), `dir`, `page` y `limit`; `GET /api/products` admite `q`, `limit`, `page`, `includeInactive` y `lowStockOnly`. El Kanban se adapta al ancho (6, 3, 2 o 1 columnas según la ventana, sin scroll horizontal ni interno), muestra 4 pedidos por columna con un borde difuminado y el botón "Ver más (N)", y el total real; la tabla pagina y ordena en servidor. `PATCH /api/orders/status` actualiza hasta 100 pedidos por conjuntos en una transacción y reporta fallos parciales. El modal de nuevo pedido busca productos en servidor y admite hasta 50 líneas.

En el dashboard, selecciona cualquier tarjeta del Kanban para abrir su panel de actividad y revisar las transiciones registradas.

Después de actualizar una base existente, aplica la nueva migración antes de ejecutar el seed:

```bash
pnpm db:migrate:deploy
pnpm db:seed
```

La suite vigente contiene 29 pruebas unitarias, 28 de integración y 22 E2E (incluye verificación de overflow en móvil/tablet/desktop, menú móvil y el mensaje de cuenta OAuth ya vinculada). Las pruebas de integración requieren una base PostgreSQL aislada y migrada; nunca deben ejecutarse contra RDS de producción. Los callbacks OAuth se han probado con credenciales de desarrollo, no con las credenciales de producción. CI/deploy verifica el inicio OAuth de GitHub y la presencia de headers de rate limit; no completa callbacks de usuario ni prueba externamente el bloqueo por abuso.

## Primer despliegue en Vercel

El proyecto incluye [vercel.json](./vercel.json) y usa el build nativo de Next.js. Desde Vercel:

1. Importa el repositorio y selecciona `OmniMarket` como **Root Directory**.
2. Usa `pnpm` como package manager. El build configurado es `pnpm vercel-build`.
3. Configura estas variables en **Settings → Environment Variables** para `Preview` y `Production`:

```text
DATABASE_URL
APP_ENV=production
AUTH_SECRET
AUTH_TRUST_HOST=true
AUTH_GOOGLE_ID
AUTH_GOOGLE_SECRET
AUTH_GITHUB_ID
AUTH_GITHUB_SECRET
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
DB_POOL_MAX=1
```

`AUTH_SECRET`, credenciales OAuth, credenciales Redis y `DATABASE_URL` deben configurarse como secretos reales. El acceso demo no debe habilitarse en producción. Configura callbacks OAuth para `https://TU-DOMINIO/api/auth/callback/google` y `https://TU-DOMINIO/api/auth/callback/github`; para desarrollo local, usa `http://localhost:3000/api/auth/callback/google` y `/api/auth/callback/github`.

Upstash es obligatorio en producción: el middleware limita las APIs a 100 solicitudes/minuto/IP y `/api/analytics` añade 30 solicitudes/10 segundos/IP. Más de tres infracciones repetidas, más de 15 respuestas de autenticación fallida por minuto o tres rutas API desconocidas activan un bloqueo temporal de 24 horas. Sin las credenciales Redis, las APIs protegidas responden `503`. El proxy de entrada debe proporcionar `x-real-ip` confiable y sobrescribir cualquier valor enviado por el cliente; no se confía en `x-forwarded-for` en producción.

### PostgreSQL compatible con RDS/AWS

`DATABASE_URL` puede apuntar a Amazon RDS PostgreSQL, Aurora PostgreSQL, Railway PostgreSQL o cualquier PostgreSQL compatible. Para RDS/Aurora utiliza el endpoint DNS y TLS:

```text
postgres://omnimarket_app:CONTRASENA@mi-db.xxxxxx.us-east-1.rds.amazonaws.com:5432/omnimarket?sslmode=require
```

El usuario de aplicación debe tener sólo los permisos necesarios para las tablas de OmniMarket. Para una presentación con Vercel, RDS debe ser accesible desde internet mediante TLS; Vercel no ofrece una IP de salida única fiable para una allowlist tradicional. Para producción privada, mantén la base en una VPC y despliega la aplicación en AWS o mediante un conector privado.

### Migraciones

El build de Vercel **no ejecuta migraciones ni seed**. Esto evita que un build o preview modifique la base de datos. Ejecuta las migraciones una vez contra la base destino, desde una máquina segura con `DATABASE_URL` configurada:

```bash
pnpm install --frozen-lockfile
pnpm db:migrate:deploy
```

El seed es destructivo y está pensado para local o para PostgreSQL efímero de CI:

```bash
pnpm db:seed
```

No ejecutes `pnpm db:seed` contra Production porque elimina y recrea los pedidos.

### Verificación post-despliegue

Después del deploy valida:

```bash
curl -i https://TU-DOMINIO.vercel.app/api/health
```

La respuesta esperada es:

```json
{"status":"ok","database":"ok"}
```

Los secretos deben configurarse únicamente en Vercel, AWS Secrets Manager o el proveedor elegido; nunca deben subirse al repositorio.

## Despliegue y verificación en producción

Vercel despliega desde Git. El flujo [`deploy.yml`](./.github/workflows/deploy.yml) se ejecuta cuando CI termina con éxito en `main` o `master` (o manualmente): aplica `pnpm db:migrate:deploy` a RDS y corre una verificación de humo de sólo lectura (`/api/health` 200, `/login` 200, `/api/orders` 401, `/api/nope` 404, cabeceras CSP y `X-RateLimit-*`). Requiere el secreto `PRODUCTION_DATABASE_URL` (entorno `production`, con `sslmode=require`), RDS accesible desde los runners de GitHub y, opcionalmente, la variable `PRODUCTION_URL`. Nunca ejecuta seed. Producción requiere `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`; sin ellos toda `/api/*` responde 503. El middleware vive en `src/middleware.ts`.

## Rendimiento y observabilidad

`pnpm bench` (requiere `BENCH_DATABASE_URL` apuntando a un PostgreSQL **local**; rechaza hosts remotos) siembra 20 000 pedidos, ~60 000 líneas y 1 000 productos y mide los casos de uso en secuencia (200 muestras, una conexión, sin red ni Next.js). Resultados en PostgreSQL 16 local (Docker):

| Operación | p50 | p95 | p99 |
|---|---|---|---|
| `getOrders` página 1 / página 500 | 9 / 13 ms | 10 / 14 ms | 11 / 15 ms |
| `getOrders` búsqueda `q` (índice trigram) | 15 ms | 17 ms | 18 ms |
| `getAnalytics` | 14 ms | 16 ms | 16 ms |
| `createOrder` 1 línea / 50 líneas | 20 / 50 ms | 22 / 53 ms | 24 / 54 ms |

Estas cifras no incluyen latencia de red a RDS ni Vercel y no constituyen un SLA. Optimizaciones derivadas: el descuento de stock de `createOrder` es una sola sentencia set-based (50 líneas: 213 → 50 ms) y la migración `0005` añade índices GIN `pg_trgm` para las búsquedas `ILIKE` (búsqueda de pedidos: 52 → 15 ms).

Observabilidad: las rutas API emiten una línea JSON por respuesta con método, plantilla de ruta (sin IDs), status HTTP, resultado, duración, request ID y nivel. Las excepciones se vuelven a lanzar para preservar el manejo de errores de Next.js y solo se registra su tipo, nunca el mensaje, cuerpo, query string ni dirección IP. Las respuestas incluyen `X-Request-Id` y `Server-Timing` con la duración de la ruta; `/api/health` agrega el tiempo de la consulta PostgreSQL (`db;dur`) y `databaseLatencyMs`.

El middleware usa el `x-vercel-id` provisto por Vercel como correlación cuando está presente; si no, genera un UUID y lo propaga a las rutas. Los logs de aplicación usan los eventos `api_request`, `slow_api_request` (duración ≥ 1000 ms), `api_request_failed` (respuesta 5xx o excepción) y `api_metrics_persist_failed` cuando falla el registro agregado. Los rechazos del middleware siguen registrados como `api_request_rejected` y `unknown_api_path`. En Vercel, busca estos eventos en **Logs** y correlaciónalos con `X-Request-Id`.

La ruta `/observability`, visible solo para `admin`, muestra métricas reales agregadas en PostgreSQL por plantilla de ruta/método y ventanas de 5 minutos: solicitudes, errores 4xx/5xx, solicitudes lentas y p50/p95/p99 aproximados. El histograma conserva límites de latencia (50, 100, 250, 500, 1 000, 2 000 y 5 000 ms), por lo que los percentiles se expresan como el límite superior del intervalo o `> 5 s`; no son mediciones exactas ni un SLA. El panel muestra alertas de la ventana reciente si el error 5xx supera 5% o el p95 estimado supera 1 s. Son avisos dentro del producto, no notificaciones externas. Los registros de métricas omiten request IDs, IDs dinámicos, query strings, cuerpos e IPs; los buckets anteriores a 30 días se eliminan al cargar el panel. Si falla la escritura de métricas, se registra `api_metrics_persist_failed` sin cambiar la respuesta del handler.

El borrador no contractual de objetivos y el plan de evidencia de 30 días están en [`SLO-SLA.md`](./SLO-SLA.md). El objetivo inicial propuesto es 99.5% de disponibilidad mensual y p95 de API ≤1 s; son metas aún no verificadas en producción. Se requiere un monitor externo de `/api/health` y 30 días de mediciones antes de declarar un SLA.

`pnpm bench` mide casos de uso de forma secuencial contra PostgreSQL local, con muestra y percentiles p50/p95/p99; no mide latencia de red, middleware ni renderizado de Vercel. No mezcles resultados de producción con el benchmark local.

## Seguridad de dependencias

El workflow de CI ejecuta `pnpm audit --prod --audit-level=high` antes de lint/typecheck/tests/build y falla ante vulnerabilidades altas o críticas en dependencias de producción. Dependabot revisa semanalmente dependencias npm/pnpm y GitHub Actions. El smoke de despliegue comprueba que Auth.js expone GitHub y que una solicitud CSRF válida inicia OAuth y redirige a GitHub; no completa el consentimiento de un usuario externo.
