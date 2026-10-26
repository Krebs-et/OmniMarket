import { expect, Page, test } from "@playwright/test";

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill("omnimarket");
  await page.getByRole("button", { name: "Entrar al dashboard" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("viewer is read-only in the UI and the API", async ({ page }) => {
  await loginAs(page, "viewer@omnimarket.local");
  await page.goto("/orders");
  await expect(page.getByRole("region", { name: "Tablero Kanban de pedidos" })).toHaveAttribute("aria-busy", "false", { timeout: 25000 });
  await expect(page.getByRole("button", { name: "Nuevo pedido" })).toHaveCount(0);
  await expect(page.locator(".role-badge")).toHaveText("Lectura");

  const orders = await page.request.get("/api/orders?limit=1");
  expect(orders.status()).toBe(200);
  const create = await page.request.post("/api/orders", { data: { customerName: "Viewer Attempt", items: [] } });
  expect(create.status()).toBe(403);
  const product = await page.request.post("/api/products", { data: { sku: "VIEWER-1", name: "Nope", price: 1, cost: 1, stock: 1 } });
  expect(product.status()).toBe(403);

  await page.goto("/products");
  await expect(page.getByRole("heading", { name: "Productos" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Nuevo producto" })).toHaveCount(0);
});

test("operator manages orders but not the catalog", async ({ page }) => {
  await loginAs(page, "operator@omnimarket.local");
  await page.goto("/orders");
  await expect(page.getByRole("button", { name: "Nuevo pedido" })).toBeVisible();
  const product = await page.request.post("/api/products", { data: { sku: "OPERATOR-1", name: "Nope", price: 1, cost: 1, stock: 1 } });
  expect(product.status()).toBe(403);
  await page.goto("/products");
  await expect(page.getByRole("button", { name: "Nuevo producto" })).toHaveCount(0);
});

test("observability is available to admins only", async ({ page }) => {
  await loginAs(page, "viewer@omnimarket.local");
  await expect(page.getByRole("link", { name: "Observabilidad" })).toHaveCount(0);
  await page.goto("/observability");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Centro de operaciones" })).toBeVisible();
});

test("admin can review aggregate API metrics", async ({ page }) => {
  await loginAs(page, "demo@omnimarket.local");
  await expect(page.getByRole("link", { name: "Observabilidad" })).toBeVisible();
  await page.goto("/observability");
  await expect(page.getByRole("heading", { name: "Observabilidad" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Rutas API" }).getByRole("table")).toBeVisible();
});

test("admin creates, adjusts and deactivates a product", async ({ page }) => {
  await loginAs(page, "demo@omnimarket.local");
  const sku = `E2E-${Date.now()}`;
  await page.goto("/products");
  await page.getByRole("button", { name: "Nuevo producto" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("SKU").fill(sku);
  await dialog.getByLabel("Nombre").fill(`Producto ${sku}`);
  await dialog.getByLabel("Precio").fill("49.90");
  await dialog.getByLabel("Costo").fill("20");
  await dialog.getByLabel("Stock inicial").fill("5");
  await dialog.getByRole("button", { name: "Guardar" }).click();
  await expect(page.locator(".alert.success")).toContainText("Producto creado");

  await page.getByLabel("Buscar productos").fill(sku);
  const row = page.getByRole("row", { name: new RegExp(sku) });
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: /Ajustar stock/ }).click();
  await page.getByRole("dialog").getByLabel("Cantidad a sumar o restar").fill("-10");
  await page.getByRole("dialog").getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("negative stock");
  await page.getByRole("dialog").getByLabel("Cantidad a sumar o restar").fill("4");
  await page.getByRole("dialog").getByRole("button", { name: "Guardar" }).click();
  await expect(row.locator("td").nth(4)).toHaveText(/^9(?:\D|$)/);

  await row.getByRole("button", { name: /Desactivar/ }).click();
  await expect(page.getByRole("row", { name: new RegExp(sku) })).toHaveCount(0);
});

test("evaluation API paginates quickly and resets only the demo dataset", async ({ request }) => {
  const firstPage = await request.get("/api/test/analytics?page=1&limit=2");
  if (firstPage.status() === 404) test.skip(true, "Evaluation API is disabled in the reused local server");
  expect(firstPage.ok(), await firstPage.text()).toBe(true);
  const invalidPagination = await request.get("/api/test/analytics?page=0&limit=50");
  expect(invalidPagination.status()).toBe(400);
  const firstPageData = await firstPage.json();
  expect(firstPageData).toMatchObject({ page: 1, limit: 2 });
  expect(firstPageData.items).toHaveLength(2);
  expect(firstPageData.total).toBeGreaterThanOrEqual(2);

  for (let sample = 0; sample < 5; sample += 1) {
    const startedAt = performance.now();
    const response = await request.get("/api/test/analytics?page=1&limit=50");
    expect(performance.now() - startedAt).toBeLessThan(300);
    expect(response.ok(), await response.text()).toBe(true);
    const appDuration = response.headers()["server-timing"]?.match(/(?:^|,\s*)app;dur=([\d.]+)/)?.[1];
    expect(appDuration, "Expected an application duration in Server-Timing").toBeDefined();
    expect(Number(appDuration)).toBeLessThan(300);
  }

  expect((await request.post("/api/test/reset-data")).status()).toBe(401);
  const reset = await request.post("/api/test/reset-data", {
    headers: { "x-evaluation-reset-secret": "evaluation-reset-secret-for-ci-only" },
  });
  expect(reset.ok(), await reset.text()).toBe(true);
  await expect(reset.json()).resolves.toMatchObject({ status: "reset", orders: 6, products: 6 });
  const repeatedReset = await request.post("/api/test/reset-data", {
    headers: { "x-evaluation-reset-secret": "evaluation-reset-secret-for-ci-only" },
  });
  expect(repeatedReset.ok(), await repeatedReset.text()).toBe(true);
  await expect(repeatedReset.json()).resolves.toMatchObject({ status: "reset", orders: 6, products: 6 });

  const refreshedAnalytics = await request.get("/api/test/analytics?page=1&limit=50");
  await expect(refreshedAnalytics.json()).resolves.toMatchObject({ total: 6, items: expect.arrayContaining([
    expect.objectContaining({ orderNumber: "OM-1001" }),
  ]) });
  const kanbanStatus = await request.get("/api/test/kanban-status?orderNumber=OM-1001");
  await expect(kanbanStatus.json()).resolves.toMatchObject({ orderNumber: "OM-1001", status: "PENDING" });
});
