import { test, expect } from "@playwright/test";
import { URLS } from "../helpers/urls";
import { getToken, USERS } from "../helpers/keycloak";

const envoy = URLS.envoy;

test.describe("Envoy — Auth-Flow durch Sidecar", () => {
  test.describe("kein Token", () => {
    test("GET /api/orders ohne Token → 401", async ({ request }) => {
      const res = await request.get(`${envoy}/api/orders`);
      expect(res.status()).toBe(401);
    });

    test("GET /api/admin ohne Token → 401", async ({ request }) => {
      const res = await request.get(`${envoy}/api/admin`);
      expect(res.status()).toBe(401);
    });

    test("GET /userinfo ohne Token → 200 (kein Auth erforderlich)", async ({ request }) => {
      const res = await request.get(`${envoy}/userinfo`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.user_id).toBeTruthy();
    });
  });

  // Bekannter Sidecar-Bug: getCachedAuthContext() ruft UniBlockingAwait auf dem Vert.x
  // Event-Loop-Thread auf → IllegalStateException → alle Auth-Requests geben 401.
  // Tests mit test.fail() markiert: schlagen fehl bis Bug im Sidecar behoben ist.
  // Bugfix-Kandidat: getCachedAuthContext muss Uni<AuthContext> zurückgeben (reaktiv).
  test.describe("alice (customer-Rolle)", () => {
    let token: string;

    test.beforeAll(async ({ request }) => {
      token = await getToken(request, USERS.alice);
    });

    test.fail("GET /api/orders → 200 [sidecar-bug: 401]", async ({ request }) => {
      const res = await request.get(`${envoy}/api/orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.resource).toBe("orders");
      expect(body.items).toBeInstanceOf(Array);
    });

    test.fail("GET /api/profile → 200 [sidecar-bug: 401]", async ({ request }) => {
      const res = await request.get(`${envoy}/api/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.resource).toBe("profile");
    });

    test.fail("GET /api/admin → 403 (keine admin-Rolle) [sidecar-bug: 401]", async ({ request }) => {
      const res = await request.get(`${envoy}/api/admin`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status()).toBe(403);
    });

    test.fail("Sidecar setzt X-Auth-User-Id Header zum Backend [sidecar-bug]", async ({ request }) => {
      const res = await request.get(`${envoy}/api/orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json();
      expect(body.auth_headers_seen?.x_auth_user_id).toBeTruthy();
    });

    test.fail("Sidecar setzt X-Enriched-Roles Header zum Backend [sidecar-bug]", async ({ request }) => {
      const res = await request.get(`${envoy}/api/orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json();
      expect(body.auth_headers_seen?.x_enriched_roles).toBeTruthy();
    });
  });

  test.describe("admin (admin-Rolle)", () => {
    let token: string;

    test.beforeAll(async ({ request }) => {
      token = await getToken(request, USERS.admin);
    });

    test.fail("GET /api/orders → 200 [sidecar-bug: 401]", async ({ request }) => {
      const res = await request.get(`${envoy}/api/orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status()).toBe(200);
    });

    test.fail("GET /api/profile → 200 [sidecar-bug: 401]", async ({ request }) => {
      const res = await request.get(`${envoy}/api/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status()).toBe(200);
    });

    test.fail("GET /api/admin → 200 [sidecar-bug: 401]", async ({ request }) => {
      const res = await request.get(`${envoy}/api/admin`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.resource).toBe("admin");
    });
  });

  test.describe("/userinfo-Routing (kein Auth-Check)", () => {
    test("GET /userinfo → Backend antwortet direkt (kein Sidecar)", async ({ request }) => {
      const res = await request.get(`${envoy}/userinfo`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("user_id");
      expect(body).toHaveProperty("roles");
      expect(body).toHaveProperty("permissions");
    });

    test("GET /userinfo mit Token → user_id aus Token extrahiert", async ({ request }) => {
      const token = await getToken(request, USERS.alice);
      const res = await request.get(`${envoy}/userinfo`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.user_id).toBe("alice");
    });
  });

  test.describe("ungültiger Token", () => {
    test("GET /api/orders mit manipuliertem Token → 401", async ({ request }) => {
      const res = await request.get(`${envoy}/api/orders`, {
        headers: { Authorization: "Bearer invalid.token.value" },
      });
      expect(res.status()).toBe(401);
    });

    test("GET /api/orders mit abgelaufenem Token → 401", async ({ request }) => {
      // Statisch abgelaufener JWT (exp in Vergangenheit)
      const expiredToken =
        "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9" +
        ".eyJzdWIiOiJ0ZXN0IiwiZXhwIjoxNjAwMDAwMDAwLCJpc3MiOiJodHRwOi8vbG9jYWxob3N0OjgwODEvcmVhbG1zL3NpZGVjYXItZGVtbyJ9" +
        ".invalidsignature";
      const res = await request.get(`${envoy}/api/orders`, {
        headers: { Authorization: `Bearer ${expiredToken}` },
      });
      expect(res.status()).toBe(401);
    });
  });
});
