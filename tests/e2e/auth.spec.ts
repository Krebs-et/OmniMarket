import { expect, test } from "@playwright/test";

test("redirects unauthenticated visitors to login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Bienvenido de nuevo" })).toBeVisible();
});

test("logs in and renders the operations dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill("demo@omnimarket.local");
  await page.getByLabel("Contraseña").fill("omnimarket");
  await page.getByRole("button", { name: "Entrar al dashboard" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Buenos días, equipo" })).toBeVisible();
  await expect(page.getByText("Pedidos totales")).toBeVisible();
  await expect(page.getByRole("region", { name: "Tablero Kanban de pedidos" })).toBeVisible();
});
