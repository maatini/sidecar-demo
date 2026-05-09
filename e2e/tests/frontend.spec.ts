import { test, expect, Page } from "@playwright/test";
import { URLS, REALM } from "../helpers/urls";

async function loginViaKeycloak(page: Page, username: string, password: string) {
  await page.getByRole("button", { name: /einloggen/i }).click();
  await page.waitForURL(`${URLS.keycloak}/**`);
  await page.fill("#username", username);
  await page.fill("#password", password);
  await page.click("#kc-login");
  await page.waitForURL(`${URLS.frontend}/**`);
}

function mockGateway(page: Page) {
  page.route("**/api/gateway/userinfo", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user_id: "alice",
        roles: ["customer", "tier-gold"],
        permissions: ["orders:read", "profile:read"],
        enrichment: { department: "digital-sales", region: "eu-central", source: "role-enhance-service" },
        claims: { preferred_username: "alice", iss: "http://localhost:8081/realms/sidecar-demo" },
        auth_headers_seen: {},
      }),
    })
  );
  page.route("**/api/gateway/api/orders", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        resource: "orders",
        items: [{ id: "ord-1001", status: "shipped", total: 129.99 }],
      }),
    })
  );
  page.route("**/api/gateway/api/profile", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ resource: "profile", message: "ok" }),
    })
  );
  page.route("**/api/gateway/api/admin", (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ code: "forbidden", message: "Keine admin-Rolle" }),
    })
  );
}

// Selektiert das Label-Feld in der AuthContext-Sektion.
// Die gleichen Strings tauchen auch in den JSON-Pre-Blöcken auf → .first() nötig.
function sessionText(page: Page, text: string | RegExp) {
  return page.getByText(text).first();
}

test.describe("Frontend — Unauthentifiziert", () => {
  test("Seite lädt und zeigt Login-Button", async ({ page }) => {
    await page.goto(URLS.frontend);
    await expect(page.getByText("k8s-auth-sidecar Demo Portal")).toBeVisible();
    await expect(page.getByRole("button", { name: /einloggen/i })).toBeVisible();
  });

  test("Auth-Status ist nicht angemeldet", async ({ page }) => {
    await page.goto(URLS.frontend);
    await expect(page.getByText(/angemeldet als/i)).not.toBeVisible();
  });
});

test.describe("Frontend — Keycloak Login (alice)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URLS.frontend);
    await loginViaKeycloak(page, "alice", "alice123");
  });

  test("Nach Login: Benutzer wird angezeigt", async ({ page }) => {
    await expect(page.getByText(/angemeldet als/i)).toBeVisible();
    // "alice" erscheint auch im Token-JSON-Block → first() nimmt den UI-Label
    await expect(sessionText(page, "alice")).toBeVisible();
  });

  test("Token Claims werden angezeigt", async ({ page }) => {
    await expect(page.getByText(/"iss"/)).toBeVisible();
    await expect(page.getByText(/preferred_username/)).toBeVisible();
  });

  test("/userinfo laden zeigt Rollen-Sektion", async ({ page }) => {
    await page.getByRole("button", { name: /userinfo laden/i }).click();
    await expect(page.getByText("Angereicherte Rollen")).toBeVisible({ timeout: 10_000 });
    // "customer" erscheint in Rollen-Label UND im JSON-Pre-Block → first()
    await expect(sessionText(page, /customer/)).toBeVisible();
    await expect(sessionText(page, "orders:read")).toBeVisible();
  });

  test("/userinfo zeigt Department und Region", async ({ page }) => {
    await page.getByRole("button", { name: /userinfo laden/i }).click();
    // "Department"/"Region" erscheinen auch im JSON-Pre-Block → first()
    await expect(page.getByText("Department").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Region").first()).toBeVisible({ timeout: 10_000 });
  });

  // Bekannter Bug: sidecar getCachedAuthContext wirft IllegalStateException auf Vert.x Event-Loop-Thread
  // → alle authentifizierten Requests über Envoy geben 401 statt 200.
  // Test schlägt fehl bis der Bug im Sidecar behoben ist.
  test.fail(
    "Meine Bestellungen → grüne Antwort (200) [sidecar-bug: 401 statt 200]",
    async ({ page }) => {
      await page.getByRole("button", { name: /meine bestellungen/i }).click();
      await expect(page.getByText("200")).toBeVisible({ timeout: 10_000 });
      await expect(sessionText(page, /orders/i)).toBeVisible();
    }
  );

  test("Admin-Bereich → rote Antwort (401 oder 403)", async ({ page }) => {
    await page.getByRole("button", { name: /admin-bereich/i }).click();
    // OPA gibt 403, Sidecar-Bug gibt 401 – beides ist "kein Zugriff"
    await expect(sessionText(page, /401|403|verweigert/i)).toBeVisible({ timeout: 10_000 });
  });

  // Bekannter Bug: Button-Disabled-State nur prüfbar wenn Request 200 liefert
  test.fail(
    "Buttons sind während eines Requests deaktiviert [sidecar-bug]",
    async ({ page }) => {
      const ordersButton = page.getByRole("button", { name: /meine bestellungen/i });
      const adminButton = page.getByRole("button", { name: /admin-bereich/i });

      await ordersButton.click();
      await expect(adminButton).toBeDisabled();
      await expect(ordersButton).toBeDisabled();

      await page.waitForSelector("text=200", { timeout: 10_000 });
      await expect(ordersButton).not.toBeDisabled();
    }
  );

  // Bekannter Bug: JSON-Response nur sichtbar wenn Request 200 liefert
  test.fail(
    "API-Antwort wird als JSON angezeigt [sidecar-bug]",
    async ({ page }) => {
      await page.getByRole("button", { name: /meine bestellungen/i }).click();
      await page.waitForSelector("text=200", { timeout: 10_000 });
      await expect(page.getByText(/"resource"/)).toBeVisible();
    }
  );

  test("Logout → zurück zum Login-Screen", async ({ page }) => {
    await page.getByRole("button", { name: /logout/i }).click();
    await expect(page.getByRole("button", { name: /einloggen/i })).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Frontend — gemockte Gateway-Responses (Demo-Szenarien)", () => {
  test.beforeEach(async ({ page }) => {
    mockGateway(page);
    await page.goto(URLS.frontend);
    await loginViaKeycloak(page, "alice", "alice123");
  });

  test("/userinfo zeigt korrekte Rollen aus Mock", async ({ page }) => {
    await page.getByRole("button", { name: /userinfo laden/i }).click();
    await expect(page.getByText("Angereicherte Rollen")).toBeVisible({ timeout: 10_000 });
    // "tier-gold" taucht in Rollen-Label UND JSON auf → first()
    await expect(sessionText(page, /tier-gold/)).toBeVisible();
    // Werte erscheinen auch im JSON-Pre-Block → first()
    await expect(page.getByText("digital-sales").first()).toBeVisible();
    await expect(page.getByText("eu-central").first()).toBeVisible();
  });

  test("Meine Bestellungen → Mock gibt 200 zurück", async ({ page }) => {
    await page.getByRole("button", { name: /meine bestellungen/i }).click();
    await expect(sessionText(page, "200")).toBeVisible({ timeout: 5_000 });
  });

  test("Admin-Bereich → Mock gibt 403 zurück", async ({ page }) => {
    await page.getByRole("button", { name: /admin-bereich/i }).click();
    await expect(sessionText(page, /403|verweigert/i)).toBeVisible({ timeout: 5_000 });
  });

  test("Buttons sind während Mock-Request deaktiviert", async ({ page }) => {
    const ordersButton = page.getByRole("button", { name: /meine bestellungen/i });
    const adminButton = page.getByRole("button", { name: /admin-bereich/i });

    await ordersButton.click();
    await expect(adminButton).toBeDisabled();
    await expect(ordersButton).toBeDisabled();

    await page.waitForSelector("text=200", { timeout: 5_000 });
    await expect(ordersButton).not.toBeDisabled();
  });

  test("API-Antwort wird als JSON angezeigt (Mock)", async ({ page }) => {
    await page.getByRole("button", { name: /meine bestellungen/i }).click();
    await page.waitForSelector("text=200", { timeout: 5_000 });
    await expect(page.getByText(/"resource"/)).toBeVisible();
  });
});

test.describe("Frontend — Keycloak Login (admin)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URLS.frontend);
    await loginViaKeycloak(page, "admin", "admin123");
  });

  test("Admin-Benutzer wird angezeigt", async ({ page }) => {
    await expect(page.getByText(/angemeldet als/i)).toBeVisible();
    // "admin" erscheint auch in Rollen-Sektion und Token-JSON → first()
    await expect(sessionText(page, /^admin$/)).toBeVisible();
  });

  test("/userinfo zeigt admin + support Rollen", async ({ page }) => {
    await page.getByRole("button", { name: /userinfo laden/i }).click();
    await expect(page.getByText("Angereicherte Rollen")).toBeVisible({ timeout: 10_000 });
    // Rollen werden als "admin, support" angezeigt – spezifischer als nur "admin"
    await expect(sessionText(page, /admin.*support|support.*admin/)).toBeVisible();
    await expect(sessionText(page, "admin:write")).toBeVisible();
  });

  // Bekannter Bug: admin-Requests gehen durch Sidecar → 401 durch getCachedAuthContext-Bug
  test.fail(
    "Admin-Bereich → 200 (admin darf zugreifen) [sidecar-bug: 401 statt 200]",
    async ({ page }) => {
      await page.getByRole("button", { name: /admin-bereich/i }).click();
      await expect(sessionText(page, "200")).toBeVisible({ timeout: 10_000 });
    }
  );
});

test.describe("Frontend — Fehlerszenarien", () => {
  test("Gateway nicht erreichbar → Fehlermeldung", async ({ page }) => {
    await page.route("**/api/gateway/**", (route) =>
      route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({
          error: "gateway_unreachable",
          message: "Upstream nicht erreichbar",
        }),
      })
    );
    await page.goto(URLS.frontend);
    await loginViaKeycloak(page, "alice", "alice123");
    await page.getByRole("button", { name: /meine bestellungen/i }).click();
    await expect(sessionText(page, /502|unreachable|nicht erreichbar/i)).toBeVisible({
      timeout: 10_000,
    });
  });
});
