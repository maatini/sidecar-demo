import { test, expect } from "@playwright/test";
import { URLS } from "../helpers/urls";

const base = URLS.backend;

test.describe("Backend — direkte API (kein Auth)", () => {
  test("GET /health → 200 ok", async ({ request }) => {
    const res = await request.get(`${base}/health`);
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok" });
  });

  test("GET /api/orders → 200 mit Bestell-Array", async ({ request }) => {
    const res = await request.get(`${base}/api/orders`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.resource).toBe("orders");
    expect(body.items).toBeInstanceOf(Array);
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items[0]).toMatchObject({ id: expect.any(String), status: expect.any(String) });
  });

  test("GET /api/profile → 200 mit Nachricht", async ({ request }) => {
    const res = await request.get(`${base}/api/profile`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.resource).toBe("profile");
    expect(body.message).toBeTruthy();
  });

  test("GET /api/admin → 200 (Backend hat keine eigene Auth-Logik)", async ({ request }) => {
    const res = await request.get(`${base}/api/admin`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.resource).toBe("admin");
  });

  test("GET /api/userinfo → 200 mit Benutzerinfo und Rollenprofil", async ({ request }) => {
    const res = await request.get(`${base}/api/userinfo`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.user_id).toBeTruthy();
    expect(body.roles).toBeInstanceOf(Array);
    expect(body.permissions).toBeInstanceOf(Array);
    expect(body.enrichment).toMatchObject({
      department: expect.any(String),
      region: expect.any(String),
    });
  });

  test("GET /api/userinfo propagiert X-Auth-User-Id Header", async ({ request }) => {
    const res = await request.get(`${base}/api/userinfo`, {
      headers: { "x-auth-user-id": "alice" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.auth_headers_seen?.x_auth_user_id).toBe("alice");
  });
});
