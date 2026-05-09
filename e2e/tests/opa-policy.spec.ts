import { test, expect } from "@playwright/test";
import { URLS } from "../helpers/urls";

const OPA_ALLOW = `${URLS.opa}/v1/data/sidecar/authz/allow`;
const OPA_DENY_REASON = `${URLS.opa}/v1/data/sidecar/authz/deny_reason`;

function input(roles: string[], path: string, method = "get") {
  return { input: { roles, path, method } };
}

test.describe("OPA Policy — sidecar.authz", () => {
  test.describe("customer-Rolle", () => {
    test("GET /api/orders → erlaubt", async ({ request }) => {
      const res = await request.post(OPA_ALLOW, { data: input(["customer"], "/api/orders") });
      expect(res.status()).toBe(200);
      expect(await res.json()).toMatchObject({ result: true });
    });

    test("GET /api/profile → erlaubt", async ({ request }) => {
      const res = await request.post(OPA_ALLOW, { data: input(["customer"], "/api/profile") });
      expect((await res.json()).result).toBe(true);
    });

    test("GET /api/admin → verweigert", async ({ request }) => {
      const res = await request.post(OPA_ALLOW, { data: input(["customer"], "/api/admin") });
      expect((await res.json()).result).toBe(false);
    });

    test("POST /api/orders → verweigert (nur GET erlaubt)", async ({ request }) => {
      const res = await request.post(OPA_ALLOW, { data: input(["customer"], "/api/orders", "post") });
      expect((await res.json()).result).toBe(false);
    });
  });

  test.describe("admin-Rolle", () => {
    test("GET /api/orders → erlaubt", async ({ request }) => {
      const res = await request.post(OPA_ALLOW, { data: input(["admin"], "/api/orders") });
      expect((await res.json()).result).toBe(true);
    });

    test("GET /api/profile → erlaubt", async ({ request }) => {
      const res = await request.post(OPA_ALLOW, { data: input(["admin"], "/api/profile") });
      expect((await res.json()).result).toBe(true);
    });

    test("GET /api/admin → erlaubt", async ({ request }) => {
      const res = await request.post(OPA_ALLOW, { data: input(["admin"], "/api/admin") });
      expect((await res.json()).result).toBe(true);
    });

    test("POST /api/admin → erlaubt (kein Method-Filter für admin)", async ({ request }) => {
      const res = await request.post(OPA_ALLOW, { data: input(["admin"], "/api/admin", "post") });
      expect((await res.json()).result).toBe(true);
    });
  });

  test.describe("admin + customer (kombiniert)", () => {
    test("GET /api/admin → erlaubt", async ({ request }) => {
      const res = await request.post(OPA_ALLOW, {
        data: input(["customer", "admin"], "/api/admin"),
      });
      expect((await res.json()).result).toBe(true);
    });
  });

  test.describe("keine Rolle", () => {
    test("GET /api/orders → verweigert", async ({ request }) => {
      const res = await request.post(OPA_ALLOW, { data: input([], "/api/orders") });
      expect((await res.json()).result).toBe(false);
    });

    test("GET /api/admin → verweigert", async ({ request }) => {
      const res = await request.post(OPA_ALLOW, { data: input([], "/api/admin") });
      expect((await res.json()).result).toBe(false);
    });

    test("beliebiger Pfad → verweigert", async ({ request }) => {
      const res = await request.post(OPA_ALLOW, { data: input([], "/unknown") });
      expect((await res.json()).result).toBe(false);
    });
  });

  test.describe("unbekannte Rolle", () => {
    test("GET /api/orders → verweigert", async ({ request }) => {
      const res = await request.post(OPA_ALLOW, { data: input(["viewer"], "/api/orders") });
      expect((await res.json()).result).toBe(false);
    });
  });

  test.describe("deny_reason", () => {
    test("bei Verweigerung → missing_required_role_for_resource", async ({ request }) => {
      const res = await request.post(OPA_DENY_REASON, {
        data: input(["customer"], "/api/admin"),
      });
      expect(res.status()).toBe(200);
      expect((await res.json()).result).toBe("missing_required_role_for_resource");
    });

    test("bei Erlaubnis → kein deny_reason", async ({ request }) => {
      const res = await request.post(OPA_DENY_REASON, {
        data: input(["customer"], "/api/orders"),
      });
      const body = await res.json();
      expect(body.result).toBeUndefined();
    });
  });

  test.describe("Pfad-Präfix-Matching", () => {
    test("GET /api/orders/123 → erlaubt für customer", async ({ request }) => {
      const res = await request.post(OPA_ALLOW, {
        data: input(["customer"], "/api/orders/123"),
      });
      expect((await res.json()).result).toBe(true);
    });

    test("GET /api/admin/settings → erlaubt für admin", async ({ request }) => {
      const res = await request.post(OPA_ALLOW, {
        data: input(["admin"], "/api/admin/settings"),
      });
      expect((await res.json()).result).toBe(true);
    });
  });
});
