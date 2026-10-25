import { expect, Page, test } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Entrar al dashboard" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Centro de operaciones" })).toBeVisible();
}

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "desktop", width: 1440, height: 900 },
];

for (const viewport of viewports) {
  test(`dashboard has no page-level horizontal overflow on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("mobile navigation menu opens and closes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await expect(page.locator(".sidebar.is-open")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".sidebar.is-open")).toHaveCount(0);
});

for (const route of ["/orders", "/analytics"]) {
  test(`${route} has no page-level horizontal overflow on mobile`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("sidebar links navigate between dedicated sections", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Pedidos" }).click();
  await expect(page).toHaveURL(/\/orders$/);
  await expect(page.getByRole("link", { name: "Pedidos" })).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "Analítica" }).click();
  await expect(page).toHaveURL(/\/analytics$/);
  await expect(page.getByRole("heading", { name: "Analítica" })).toBeVisible();
});
