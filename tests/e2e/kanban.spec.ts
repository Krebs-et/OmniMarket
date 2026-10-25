import { expect, Page, test } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Entrar al dashboard" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("moves an order between Kanban columns and persists the status", async ({ page }) => {
  await login(page);

  const pendingColumn = page.locator(".kanban-column").nth(0);
  const processingColumn = page.locator(".kanban-column").nth(2);
  const card = pendingColumn.locator(".order-card").first();
  await expect(card).toBeVisible();
  const orderNumber = await card.locator(".order-number").innerText();

  await card.scrollIntoViewIfNeeded();
  await processingColumn.scrollIntoViewIfNeeded();
  const cardBox = await card.boundingBox();
  const processingBox = await processingColumn.boundingBox();
  if (!cardBox || !processingBox) throw new Error("Kanban drag targets are not visible");
  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(cardBox.x + cardBox.width / 2 + 12, cardBox.y + cardBox.height / 2 + 12, { steps: 5 });
  await page.mouse.move(processingBox.x + processingBox.width / 2, processingBox.y + 80, { steps: 10 });
  await page.mouse.up();

  await expect(page.locator(".alert.success")).toContainText(`${orderNumber} ahora está en proceso.`);
  await expect(processingColumn.locator(".order-card").filter({ hasText: orderNumber })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "En proceso" }).locator("..").locator("..").locator(".order-card").filter({ hasText: orderNumber })).toBeVisible();
});

test("rejects unauthenticated API access", async ({ request }) => {
  const response = await request.get("/api/orders");
  expect(response.status()).toBe(401);
  await expect(response.json()).resolves.toEqual({ error: "Authentication required" });
});

test("creates an order from the catalog", async ({ page }) => {
  await login(page);
  const customerName = `Cliente E2E ${Date.now()}`;
  await page.getByRole("textbox", { name: "Cliente" }).fill(customerName);
  await page.getByLabel("Producto 1").selectOption({ index: 1 });
  await page.getByRole("spinbutton", { name: "Cantidad 1" }).fill("2");
  await page.getByRole("button", { name: "Crear pedido" }).click();

  await expect(page.locator(".alert.success")).toContainText("creado correctamente");
  await expect(page.locator(".order-card").filter({ hasText: customerName })).toBeVisible();
});

test("updates multiple selected orders and reports the result", async ({ page }) => {
  await login(page);
  for (const orderNumber of ["OM-1001", "OM-1002"]) {
    await page.locator(".order-card").filter({ hasText: orderNumber }).getByRole("checkbox", { name: `Seleccionar ${orderNumber}` }).check();
  }
  await page.getByLabel("Nuevo estado para selección").selectOption("CONFIRMED");
  await page.getByRole("button", { name: "Aplicar a selección" }).click();

  await expect(page.locator(".alert.success")).toContainText("2 pedidos actualizados correctamente.");
  const confirmedColumn = page.locator(".kanban-column").filter({ has: page.getByRole("heading", { name: "Confirmados" }) });
  await expect(confirmedColumn.locator(".order-card").filter({ hasText: "OM-1001" })).toBeVisible();
  await expect(confirmedColumn.locator(".order-card").filter({ hasText: "OM-1002" })).toBeVisible();
});

test("opens order activity history", async ({ page }) => {
  await login(page);
  const card = page.locator(".order-card").filter({ hasText: "OM-1001" });
  await expect(card).toBeVisible();
  const orderNumber = await card.locator(".order-number").innerText();
  await card.click();

  const panel = page.getByRole("region", { name: `Historial de ${orderNumber}` });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("En proceso");
  await expect(panel).toContainText("demo@omnimarket.local");
});
