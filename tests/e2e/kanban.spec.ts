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
