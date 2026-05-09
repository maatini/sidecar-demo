"use client";

import type { KeycloakProfile, KeycloakTokenParsed } from "keycloak-js";
import { useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle, ShieldAlert, ShieldCheck } from "lucide-react";

type RequestResult = {
  path: string;
  ok: boolean;
  status: number;
  body: string;
};

type UserInfoPayload = Record<string, unknown>;
type KeycloakClient = {
  token?: string;
  tokenParsed?: KeycloakTokenParsed;
  init: (options: Record<string, unknown>) => Promise<boolean>;
  loadUserProfile: () => Promise<KeycloakProfile>;
  login: (options: Record<string, unknown>) => Promise<void>;
  logout: (options: Record<string, unknown>) => Promise<void>;
};

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export default function Dashboard() {
  const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || "http://127.0.0.1:18080";
  // Default to real login mode unless explicitly enabled.
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [keycloakClient, setKeycloakClient] = useState<KeycloakClient | null>(null);
  const [tokenParsed, setTokenParsed] = useState<KeycloakTokenParsed | undefined>();
  const [profile, setProfile] = useState<KeycloakProfile | undefined>();
  const [userinfo, setUserinfo] = useState<UserInfoPayload | null>(null);
  const [userinfoError, setUserinfoError] = useState<string | null>(null);
  const [requestResult, setRequestResult] = useState<RequestResult | null>(null);
  const [loadingPath, setLoadingPath] = useState<string | null>(null);

  async function fetchGateway(path: string, init?: RequestInit): Promise<Response> {
    return fetch(`/api/gateway${path}`, init);
  }

  useEffect(() => {
    if (demoMode) {
      setIsAuthenticated(true);
      setIsReady(true);
      setTokenParsed({
        preferred_username: "demo-user",
        realm_access: { roles: ["customer"] },
      } as unknown as KeycloakTokenParsed);
      setProfile({ username: "demo-user" } as KeycloakProfile);
      return;
    }

    async function initKeycloak() {
      try {
        const { default: Keycloak } = await import("keycloak-js");
        const kc = new Keycloak({
          url: process.env.NEXT_PUBLIC_KEYCLOAK_URL || "http://localhost:8081",
          realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM || "sidecar-demo",
          clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID || "demo-frontend",
        }) as unknown as KeycloakClient;
        setKeycloakClient(kc);
        const authenticated = await kc.init({
          onLoad: "check-sso",
          silentCheckSsoRedirectUri: `${window.location.origin}/silent-check-sso.html`,
          pkceMethod: "S256",
        });
        setIsAuthenticated(authenticated);
        setTokenParsed(kc.tokenParsed);
        if (authenticated) {
          const p = await kc.loadUserProfile();
          setProfile(p);
        }
      } catch (error) {
        const errorText = error instanceof Error ? error.message : "unbekannter Fehler";
        setUserinfoError(`Keycloak Init Fehler: ${errorText}`);
      } finally {
        setIsReady(true);
      }
    }
    initKeycloak();
  }, []);

  function setDemoSession(active: boolean) {
    setIsAuthenticated(active);
    if (active) {
      setTokenParsed({
        preferred_username: "demo-user",
        realm_access: { roles: ["customer"] },
      } as unknown as KeycloakTokenParsed);
      setProfile({ username: "demo-user" } as KeycloakProfile);
      return;
    }
    setTokenParsed(undefined);
    setProfile(undefined);
    setUserinfo(null);
    setUserinfoError(null);
    setRequestResult(null);
  }

  const token = demoMode ? "demo-mode-token" : keycloakClient?.token;
  const enrichedRoles = asStringArray(userinfo?.roles);
  const enrichedPermissions = asStringArray(userinfo?.permissions);
  const enrichment =
    userinfo?.enrichment && typeof userinfo.enrichment === "object"
      ? (userinfo.enrichment as Record<string, unknown>)
      : null;

  async function doLogin() {
    if (demoMode) {
      setDemoSession(true);
      return;
    }
    if (!keycloakClient) return;
    await keycloakClient.login({ redirectUri: window.location.href });
  }

  async function doLogout() {
    if (demoMode) {
      setDemoSession(false);
      return;
    }
    if (!keycloakClient) return;
    await keycloakClient.logout({ redirectUri: window.location.origin });
  }

  async function loadUserInfo() {
    if (!token) return;
    setUserinfoError(null);
    try {
      const executeFetch = () =>
        fetchGateway("/userinfo", {
          headers: demoMode ? {} : { Authorization: `Bearer ${token}` },
        });
      // Retry once to handle short startup races of gateway/sidecar.
      let res = await executeFetch();
      if (!res.ok && res.status >= 500) {
        await new Promise((resolve) => setTimeout(resolve, 350));
        res = await executeFetch();
      }
      const json = await res.json();
      if (!res.ok) {
        setUserinfoError(pretty(json));
        setUserinfo(null);
        return;
      }
      setUserinfo(json);
    } catch (error) {
      setUserinfoError(
        `Gateway nicht erreichbar (${gatewayUrl}). Bitte pruefe, ob Envoy auf Port 18080 laeuft.`
      );
    }
  }

  async function callProtected(path: string) {
    if (!token) return;
    setLoadingPath(path);
    try {
      const res = await fetchGateway(path, {
        headers: demoMode ? {} : { Authorization: `Bearer ${token}` },
      });
      const contentType = res.headers.get("content-type");
      const body = contentType?.includes("application/json")
        ? pretty(await res.json())
        : await res.text();
      setRequestResult({
        path,
        ok: res.ok,
        status: res.status,
        body,
      });
    } catch (error) {
      setRequestResult({
        path,
        ok: false,
        status: 0,
        body: String(error),
      });
    } finally {
      setLoadingPath(null);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10">
      <div className="mb-8 rounded-xl border border-slate-700 bg-slate-900/60 p-6 shadow-xl">
        <h1 className="text-3xl font-bold">k8s-auth-sidecar Demo Portal</h1>
        <p className="mt-2 text-slate-300">
          Zeigt OIDC Login, Userinfo-Anreicherung und Policy-basierte Autorisierung.
        </p>
      </div>

      {!isReady ? (
        <div className="flex items-center gap-2 text-slate-300">
          <LoaderCircle className="animate-spin" />
          Initialisiere Auth...
        </div>
      ) : !isAuthenticated ? (
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-8">
          <p className="mb-4 text-slate-200">Nicht eingeloggt.</p>
          <button onClick={doLogin} className="rounded-md bg-indigo-600 px-4 py-2 font-medium hover:bg-indigo-500">
            {demoMode ? "Demo-Login starten" : "Mit Keycloak einloggen"}
          </button>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <section className="space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-5 lg:col-span-1">
            <h2 className="text-xl font-semibold">Session</h2>
            <p className="text-sm text-slate-300">
              Angemeldet als{" "}
              <span className="font-semibold">
                {profile?.username || String(tokenParsed?.preferred_username || "unbekannt")}
              </span>
            </p>
            <div className="flex gap-2">
              <button onClick={loadUserInfo} className="rounded-md bg-emerald-600 px-3 py-2 text-sm hover:bg-emerald-500">
                /userinfo laden
              </button>
              <button onClick={doLogout} className="rounded-md bg-slate-700 px-3 py-2 text-sm hover:bg-slate-600">
                Logout
              </button>
            </div>
            <div>
              <p className="mb-1 text-sm text-slate-400">Token Claims</p>
              <pre className="max-h-64 overflow-auto rounded-md bg-slate-950 p-3 text-xs">{pretty(tokenParsed)}</pre>
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-5 lg:col-span-2">
            <h2 className="text-xl font-semibold">Geschuetzte Aufrufe</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { path: "/api/orders", label: "Meine Bestellungen" },
                { path: "/api/profile", label: "Profil laden" },
                { path: "/api/admin", label: "Admin-Bereich laden" },
              ].map((item) => (
                <button
                  key={item.path}
                  onClick={() => callProtected(item.path)}
                  disabled={loadingPath !== null}
                  className="rounded-lg border border-slate-600 bg-slate-800 p-4 text-left hover:bg-slate-700 disabled:opacity-50"
                >
                  <p className="font-medium">{item.label}</p>
                  <p className="text-xs text-slate-400">{item.path}</p>
                </button>
              ))}
            </div>

            {requestResult && (
              <div
                className={`rounded-lg border p-4 ${
                  requestResult.ok ? "border-emerald-600 bg-emerald-950/30" : "border-red-600 bg-red-950/30"
                }`}
              >
                <div className="mb-2 flex items-center gap-2">
                  {requestResult.ok ? (
                    <>
                      <CheckCircle2 className="text-emerald-400" />
                      <span className="font-semibold text-emerald-300">Erlaubt ({requestResult.status})</span>
                    </>
                  ) : (
                    <>
                      <ShieldAlert className="text-red-400" />
                      <span className="font-semibold text-red-300">Verweigert ({requestResult.status})</span>
                    </>
                  )}
                  <span className="text-sm text-slate-300">{requestResult.path}</span>
                </div>
                <pre className="max-h-64 overflow-auto rounded-md bg-slate-950 p-3 text-xs">{requestResult.body}</pre>
              </div>
            )}
          </section>

          <section className="space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-5 lg:col-span-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="text-indigo-400" />
              <h2 className="text-xl font-semibold">AuthContext /userinfo</h2>
            </div>
            {userinfoError && (
              <div className="rounded-md border border-red-700 bg-red-950/30 p-3 text-sm text-red-300">{userinfoError}</div>
            )}
            {userinfo && (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-md border border-slate-700 bg-slate-950/60 p-3">
                  <p className="mb-2 text-sm text-slate-400">Angereicherte Rollen</p>
                  <p className="text-sm text-slate-200">{enrichedRoles.length ? enrichedRoles.join(", ") : "Keine Rollen"}</p>
                </div>
                <div className="rounded-md border border-slate-700 bg-slate-950/60 p-3">
                  <p className="mb-2 text-sm text-slate-400">Permissions</p>
                  <p className="text-sm text-slate-200">
                    {enrichedPermissions.length ? enrichedPermissions.join(", ") : "Keine Permissions"}
                  </p>
                </div>
                <div className="rounded-md border border-slate-700 bg-slate-950/60 p-3">
                  <p className="mb-1 text-sm text-slate-400">Department</p>
                  <p className="text-sm text-slate-200">{String(enrichment?.department || "unbekannt")}</p>
                </div>
                <div className="rounded-md border border-slate-700 bg-slate-950/60 p-3">
                  <p className="mb-1 text-sm text-slate-400">Region</p>
                  <p className="text-sm text-slate-200">{String(enrichment?.region || "unbekannt")}</p>
                </div>
              </div>
            )}
            <pre className="max-h-80 overflow-auto rounded-md bg-slate-950 p-3 text-xs">
              {userinfo ? pretty(userinfo) : "Noch keine Userinfo geladen."}
            </pre>
          </section>
        </div>
      )}
    </main>
  );
}
