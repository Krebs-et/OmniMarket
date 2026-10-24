# OmniMarket Operations Hub

MVP local del dashboard operativo. La aplicación usa Next.js y PostgreSQL mediante Drizzle ORM. La configuración no depende de un proveedor de hosting: puede ejecutarse localmente y desplegarse posteriormente en Vercel, Railway o una arquitectura AWS compatible con PostgreSQL.

## Requisitos

- Node.js 20+
- pnpm 9+
- Docker y Docker Compose

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

El dashboard protege la sesión con una cookie HttpOnly firmada. El tablero Kanban permite arrastrar tarjetas con mouse, touch o teclado; al soltar, el cambio se persiste mediante `PATCH /api/orders/:id/status` y se revierte si la API falla.

## Validación

```bash
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

`pnpm test` ejecuta las pruebas unitarias sin dependencias externas. `pnpm test:integration` requiere PostgreSQL activo, migrado y con datos seed. `pnpm test:e2e` levanta automáticamente el servidor Next.js y genera `playwright-report/` y artefactos de fallo en `test-results/`.

## Primer despliegue en Vercel

El proyecto incluye [vercel.json](./vercel.json) y usa el build nativo de Next.js. Desde Vercel:

1. Importa el repositorio y selecciona `OmniMarket` como **Root Directory**.
2. Usa `pnpm` como package manager. El build configurado es `pnpm vercel-build`.
3. Configura estas variables en **Settings → Environment Variables** para `Preview` y `Production`:

```text
DATABASE_URL
APP_ENV=production
AUTH_SECRET
DEMO_EMAIL
DEMO_PASSWORD
DB_POOL_MAX=1
```

`AUTH_SECRET`, `DEMO_PASSWORD` y `DATABASE_URL` deben ser secretos reales; no reutilices los valores de `.env.example`.

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

El seed está pensado para local:

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
