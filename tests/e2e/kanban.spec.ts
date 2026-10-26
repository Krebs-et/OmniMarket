import { expect, Page, test } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Entrar al dashboard" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/orders");
  await expect(page.locator(".order-card").first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Tablero Kanban de pedidos" })).toHaveAttribute("aria-busy", "false", { timeout: 25000 });
}

async function createPendingOrder(page: Page, customerName = `Pendiente E2E ${Date.now()}`) {
  const products = (await (await page.request.get("/api/products?limit=50")).json()).items.filter((product: { stock: number }) => product.stock > 5);
  const response = await page.request.post("/api/orders", { data: { customerName, items: [{ productId: products[0].id, quantity: 1 }] } });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json() as Promise<{ id: string; orderNumber: string }>;
}

test("moves an order between Kanban columns and persists the status", async ({ page }) => {
  await login(page);
  const order = await createPendingOrder(page);
  await page.goto("/orders");
  await expect(page.getByRole("region", { name: "Tablero Kanban de pedidos" })).toHaveAttribute("aria-busy", "false", { timeout: 25000 });

  const pendingColumn = page.locator(".kanban-column").nth(0);
  const processingColumn = page.locator(".kanban-column").nth(2);
  const card = pendingColumn.locator(".order-card").filter({ hasText: order.orderNumber });
  await expect(card).toBeVisible();
  const orderNumber = order.orderNumber;

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
  await page.getByLabel("Buscar pedidos").fill(orderNumber);
  await expect(page.locator(".kanban-column").nth(2).locator(".order-card").filter({ hasText: orderNumber })).toBeVisible();
  const persistedStatus = await page.request.get(`/api/test/kanban-status?orderNumber=${encodeURIComponent(orderNumber)}`);
  expect(persistedStatus.ok(), await persistedStatus.text()).toBe(true);
  await expect(persistedStatus.json()).resolves.toMatchObject({ orderNumber, status: "PROCESSING" });
});

test("rejects unauthenticated API access", async ({ request }) => {
  const response = await request.get("/api/orders");
  expect(response.status()).toBe(401);
  await expect(response.json()).resolves.toEqual({ error: "Authentication required" });
});

test("creates an order from the catalog", async ({ page }) => {
  await login(page);
  const customerName = `Cliente E2E ${Date.now()}`;
  await page.getByRole("button", { name: "Nuevo pedido" }).click();
  await page.getByRole("textbox", { name: "Cliente" }).fill(customerName);
  await page.getByRole("combobox").click();
  await page.getByRole("option").locator("button:enabled").first().click();
  await page.getByRole("spinbutton", { name: "Cantidad 1" }).fill("2");
  await expect(page.getByLabel("Total del pedido")).not.toHaveText("$0");
  await page.getByRole("button", { name: "Crear pedido" }).click();

  await expect(page.locator(".alert.success")).toContainText("creado correctamente");
  await page.getByLabel("Buscar pedidos").fill(customerName);
  await expect(page.locator(".order-card").filter({ hasText: customerName })).toBeVisible();
});

test("updates multiple selected orders and reports the result", async ({ page }) => {
  await login(page);
  const customerNames = [`Bulk E2E A ${Date.now()}`, `Bulk E2E B ${Date.now()}`];
  const orders = await Promise.all(customerNames.map((name) => createPendingOrder(page, name)));
  await page.reload();
  for (const order of orders) {
    await page.locator(".order-card").filter({ hasText: order.orderNumber }).getByRole("checkbox", { name: `Seleccionar ${order.orderNumber}` }).check();
  }
  await page.getByLabel("Nuevo estado para selección").selectOption("CONFIRMED");
  await page.getByRole("button", { name: "Aplicar a selección" }).click();

  await expect(page.locator(".alert.success")).toContainText("2 pedidos actualizados correctamente.");
  const confirmedColumn = page.locator(".kanban-column").filter({ has: page.getByRole("heading", { name: "Confirmados" }) });
  for (const order of orders) {
    await expect(confirmedColumn.locator(".order-card").filter({ hasText: order.orderNumber })).toBeVisible();
  }
});

test("reports each order that fails a bulk status update", async ({ page }) => {
  await login(page);
  const pendingName = `Bulk pending E2E ${Date.now()}`;
  const shippedName = `Bulk shipped E2E ${Date.now()}`;
  const pending = await createPendingOrder(page, pendingName);
  const shipped = await createPendingOrder(page, shippedName);
  const shipResponse = await page.request.patch(`/api/orders/${shipped.id}/status`, { data: { status: "SHIPPED" } });
  expect(shipResponse.ok(), await shipResponse.text()).toBe(true);
  await page.reload();
  for (const order of [pending, shipped]) {
    await page.locator(".order-card").filter({ hasText: order.orderNumber }).getByRole("checkbox", { name: `Seleccionar ${order.orderNumber}` }).check();
  }
  await page.getByLabel("Nuevo estado para selección").selectOption("CANCELLED");
  await page.getByRole("button", { name: "Aplicar a selección" }).click();

  await expect(page.locator(".alert.success")).toContainText("1 de 2 pedidos actualizados correctamente.");
  await expect(page.locator(".alert.error")).toContainText("1 pedido no se pudo actualizar.");
  const failures = page.locator(".bulk-failure-details");
  await failures.locator("summary").click();
  await expect(failures).toContainText(shipped.orderNumber);
  await expect(failures).toContainText("Orders shipped or delivered cannot be cancelled");
});

test("keeps only the drag overlay visible when dragging a card outside the board", async ({ page }) => {
  await login(page);
  const created = await createPendingOrder(page, `Drag outside E2E ${Date.now()}`);
  await page.reload();
  const card = page.locator(".kanban-column").nth(0).locator(".order-card").filter({ hasText: created.orderNumber });
  await card.scrollIntoViewIfNeeded();
  const box = await card.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error("Kanban card or viewport is unavailable");

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 14, box.y + box.height / 2 + 14, { steps: 5 });
  await expect(card).toHaveClass(/is-drag-source/);
  await expect(card).toBeHidden();
  const overlay = page.locator(".order-card.is-drag-overlay");
  await expect(overlay).toBeVisible();
  await page.mouse.move(8, viewport.height - 8, { steps: 5 });
  await expect(overlay).toBeVisible();
  await page.mouse.up();

  await expect(overlay).toHaveCount(0);
  await expect(page.locator(".kanban-column").nth(0).locator(".order-card").filter({ hasText: created.orderNumber })).toBeVisible();
});

test("opens order activity history", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Entrar al dashboard" }).click();
  await expect(page).toHaveURL(/\/$/);
  const customerName = `Historial E2E ${Date.now()}`;
  const products = (await (await page.request.get("/api/products?limit=50")).json()).items.filter((product: { stock: number }) => product.stock > 5);
  const created = await (await page.request.post("/api/orders", { data: { customerName, items: [{ productId: products[0].id, quantity: 1 }] } })).json();
  const moved = await page.request.patch(`/api/orders/${created.id}/status`, { data: { status: "PROCESSING" } });
  expect(moved.ok(), await moved.text()).toBe(true);

  await page.goto("/orders");
  await page.getByLabel("Buscar pedidos").fill(customerName);
  const card = page.locator(".order-card").filter({ hasText: customerName });
  await expect(card).toBeVisible();
  const orderNumber = await card.locator(".order-number").innerText();
  await card.click();

  const panel = page.getByRole("region", { name: `Historial de ${orderNumber}` });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("En proceso");
  await expect(panel).toContainText("demo@omnimarket.local");
});

test("searches, switches to the table, sorts and paginates", async ({ page }) => {
  await login(page);
  const created = await createPendingOrder(page, `Table E2E ${Date.now()}`);
  const confirmed = await page.request.patch(`/api/orders/${created.id}/status`, { data: { status: "CONFIRMED" } });
  expect(confirmed.ok(), await confirmed.text()).toBe(true);
  await page.reload();
  await page.getByRole("tab", { name: "Tabla" }).click();
  const rows = page.locator(".orders-table tbody tr");
  await expect(rows.first()).toBeVisible();
  await page.getByRole("button", { name: /^Total/ }).click();
  await expect(page.getByRole("columnheader", { name: /Total/ })).toHaveAttribute("aria-sort", "descending");
  await page.getByLabel("Filtrar por estado").selectOption("CONFIRMED");
  const createdRow = rows.filter({ hasText: created.orderNumber });
  await expect(createdRow.locator(".status-chip")).toHaveText("Confirmado");
  await page.getByLabel("Buscar pedidos").fill(created.orderNumber);
  await expect(rows).toHaveCount(1);
  await expect(page.locator(".pagination")).toContainText("1 pedidos");
});

test("adds many product lines to one order and shows a live total", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Nuevo pedido" }).click();
  const search = page.getByRole("combobox");
  for (let index = 0; index < 3; index += 1) {
    await search.click();
    await page.getByRole("option").locator("button:enabled").nth(index).click();
  }
  await expect(page.locator(".order-line")).toHaveCount(3);
  await page.getByRole("spinbutton", { name: "Cantidad 1" }).fill("5000");
  await expect(page.getByRole("spinbutton", { name: "Cantidad 1" })).toHaveValue("1000");
  await expect(page.getByText("Excede el stock disponible").first()).toBeVisible();
  await page.getByRole("button", { name: "Eliminar producto 3" }).click();
  await expect(page.locator(".order-line")).toHaveCount(2);
});
