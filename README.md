# OmniMarket Operations Hub

MVP local del dashboard operativo. La aplicación usa Next.js y PostgreSQL mediante Drizzle ORM. La configuración no depende de un proveedor de hosting: puede ejecutarse localmente y desplegarse posteriormente en Vercel, Railway o una arquitectura AWS compatible con PostgreSQL. El modelo Sprint 2 añade catálogo (`products`) y líneas de pedido (`order_items`).

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

El tablero muestra skeletons mientras carga la información y permite seleccionar varios pedidos para actualizar su estado. La actualización en lote reutiliza la ruta auditada por pedido; si una o más operaciones fallan (por ejemplo, al cancelar pedidos enviados), el aviso informa cuáles no se cambiaron. Las operaciones exitosas no se revierten por fallos en otros pedidos.

El formulario **Nuevo pedido** crea pedidos desde el catálogo mediante `POST /api/orders`. Permite varias líneas sin repetir productos. El payload se valida con Zod y el pedido, sus líneas y el decremento de inventario se persisten en una única transacción; los precios y costos se toman del catálogo en el servidor. Si no existe stock suficiente, la operación responde `409` y no modifica la base.

## Validación

```bash
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

`pnpm test` ejecuta las pruebas unitarias sin dependencias externas. `pnpm test:integration` requiere PostgreSQL activo y migrado; las pruebas crean sus propios fixtures. El job de CI también ejecuta seed para validar el conjunto demo en PostgreSQL efímero. `pnpm test:e2e` levanta automáticamente el servidor Next.js y genera `playwright-report/` y artefactos de fallo en `test-results/`.

La UI utiliza Tailwind CSS como pipeline de estilos (`tailwind.config.ts`, `postcss.config.mjs` y `@tailwind` en `src/app/globals.css`). `globals.css` define los design tokens (variables CSS con contraste AA) y las clases semánticas del dashboard; las fuentes DM Sans y Manrope se cargan con `next/font`. Distribución responsiva: en ≤1100 px la barra lateral pasa a un menú off-canvas, el formulario de pedido es un modal ("Nuevo pedido"), el historial de actividad es un panel lateral (bottom sheet en móvil) y el Kanban usa scroll horizontal con snap; en touch el arrastre se activa con pulsación larga para no bloquear el scroll. Los indicadores se calculan con datos reales (sin tendencias ficticias).

### Catálogo y migraciones

El esquema incluye `users`, `accounts`, `sessions` y `verification_tokens` para la integración OAuth, además de `products` y `order_items`, con índices para consultar pedidos por estado/fecha y líneas por pedido/producto. `GET /api/products` requiere una sesión autenticada y devuelve el catálogo ordenado por nombre.

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

La aplicación tiene cuatro rutas dedicadas: `/` (Resumen), `/orders` (Tablero/Tabla), `/products` (catálogo) y `/analytics`. Los roles son `admin` (todo), `operator` (pedidos; catálogo en lectura) y `viewer` (solo lectura); se asignan con `ADMIN_EMAILS` (separados por comas) o con `users.role`, y los usuarios nuevos entran como `viewer`. En desarrollo existen las cuentas demo `demo@`, `operator@` y `viewer@omnimarket.local`. El catálogo usa baja lógica y cada cambio de inventario queda en `stock_movements`. `GET /api/orders` admite `status`, `q`, `sort` (`created|total|customer`), `dir`, `page` y `limit`; `GET /api/products` admite `q` y `limit`. El Kanban se adapta al ancho (6, 3, 2 o 1 columnas según la ventana, sin scroll horizontal ni interno), muestra 4 pedidos por columna con un borde difuminado y el botón "Ver más (N)", y el total real; la tabla pagina y ordena en servidor. `PATCH /api/orders/status` actualiza hasta 100 pedidos por conjuntos en una transacción y reporta fallos parciales. El modal de nuevo pedido busca productos en servidor y admite hasta 50 líneas.

En el dashboard, selecciona cualquier tarjeta del Kanban para abrir su panel de actividad y revisar las transiciones registradas.

Después de actualizar una base existente, aplica la nueva migración antes de ejecutar el seed:

```bash
pnpm db:migrate:deploy
pnpm db:seed
```

La suite actual tiene 7 pruebas unitarias, 9 de integración y 11 E2E (incluye verificación de overflow en móvil/tablet/desktop y menú móvil). Las pruebas OAuth externas y el rate limiting real requieren configurar proveedores y Upstash; esas dependencias no se verifican localmente sin sus credenciales.

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
