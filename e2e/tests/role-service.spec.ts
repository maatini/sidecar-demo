import { test, expect } from "@playwright/test";
import { URLS } from "../helpers/urls";

const base = URLS.roleService;

test.describe("Role-Enhance-Service", () => {
  test("GET /health → 200 ok", async ({ request }) => {
    const res = await request.get(`${base}/health`);
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok" });
  });

  test.describe("Rollen", () => {
    test("demo-user hat customer + tier-gold", async ({ request }) => {
      const res = await request.get(`${base}/api/v1/users/demo-user/roles`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.userId).toBe("demo-user");
      expect(body.roles).toContain("customer");
      expect(body.roles).toContain("tier-gold");
    });

    test("alice hat customer-Rolle", async ({ request }) => {
      const res = await request.get(`${base}/api/v1/users/alice/roles`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.roles).toContain("customer");
      expect(body.enrichment.department).toBe("retail");
      expect(body.enrichment.region).toBe("eu-west");
    });

    test("admin hat admin + support", async ({ request }) => {
      const res = await request.get(`${base}/api/v1/users/admin/roles`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.roles).toContain("admin");
      expect(body.roles).toContain("support");
      expect(body.enrichment.department).toBe("platform");
      expect(body.enrichment.region).toBe("global");
    });

    test("unbekannter User → Fallback customer", async ({ request }) => {
      const res = await request.get(`${base}/api/v1/users/nobody-special/roles`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.roles).toContain("customer");
    });

    test("Antwort enthält source: role-enhance-service", async ({ request }) => {
      const res = await request.get(`${base}/api/v1/users/alice/roles`);
      const body = await res.json();
      expect(body.enrichment.source).toBe("role-enhance-service");
    });
  });

  test.describe("Permissions", () => {
    test("demo-user hat orders:read und profile:read", async ({ request }) => {
      const res = await request.get(`${base}/api/v1/users/demo-user/permissions`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.permissions).toContain("orders:read");
      expect(body.permissions).toContain("profile:read");
    });

    test("admin hat alle Permissions inkl. admin:write", async ({ request }) => {
      const res = await request.get(`${base}/api/v1/users/admin/permissions`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.permissions).toContain("orders:read");
      expect(body.permissions).toContain("profile:read");
      expect(body.permissions).toContain("admin:read");
      expect(body.permissions).toContain("admin:write");
    });

    test("alice hat kein admin:read", async ({ request }) => {
      const res = await request.get(`${base}/api/v1/users/alice/permissions`);
      const body = await res.json();
      expect(body.permissions).not.toContain("admin:read");
    });

    test("unbekannter User → Fallback orders:read", async ({ request }) => {
      const res = await request.get(`${base}/api/v1/users/nobody-special/permissions`);
      const body = await res.json();
      expect(body.permissions).toContain("orders:read");
    });
  });
});
