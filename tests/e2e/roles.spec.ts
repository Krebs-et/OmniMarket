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
