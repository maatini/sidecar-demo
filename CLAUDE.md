# CLAUDE.md — sidecar-demo

## Karpathy Skills

Diese vier Verhaltensregeln gelten für alle Änderungen in diesem Projekt.

**1. Think Before Coding — Annahmen benennen**
Annahmen explizit aussprechen. Bei Unklarheit nachfragen statt still entscheiden. Wenn eine Anfrage mehrdeutig ist, Interpretationen nennen und klären lassen.

**2. Simplicity First — minimaler Code**
Nur das schreiben, was konkret gefordert ist. Keine spekulativen Abstraktionen, kein Vorbauen für hypothetische Anforderungen.

**3. Surgical Changes — präzise Eingriffe**
Nur Code anfassen, der direkt zur Aufgabe gehört. Bestehenden Stil beibehalten, funktionierende Teile nicht refaktorieren, jede geänderte Zeile muss auf die Anforderung zurückführbar sein.

**4. Goal-Driven Execution — messbares Erfolgsziel**
Was soll hinterher anders/besser sein? Lieber ein prüfbares Kriterium definieren als den Lösungsweg vorschreiben.

---

## Projekt: k8s-auth-sidecar Demo

Lern- und Präsentationsumgebung für das Auth-Sidecar-Pattern in Kubernetes. Kein Produktionscode. Ziel: sichtbar machen, wann Zugriff erlaubt (grün) und wann verweigert (rot) wird.

---

## Stack

| Service | Technologie | Port |
|---|---|---|
| `frontend` | Next.js 15 + Tailwind + TypeScript | 3000 |
| `envoy` | Envoy Proxy (ext_authz) | 18080 |
| `auth-sidecar` | `ghcr.io/maatini/k8s-auth-sidecar` | 8090 |
| `opa` | Open Policy Agent 0.63 | 8181 |
| `backend` | FastAPI + httpx | 8082 |
| `role-enhance-service` | FastAPI | 8089 |
| `keycloak` | Keycloak 26 | 8081 |
| `wiremock-oidc` | WireMock 3.13 | 8091 |

---

## Request-Flow

```
Browser
  → frontend (Next.js, Port 3000)
      → /api/gateway/[...path] (Next.js Route Handler)
          → Envoy :18080      (für alle /api/* Pfade)
              → auth-sidecar  (ext_authz: /api/authorize)
                  → OPA       (data.sidecar.authz.allow)
                  → Role-Enhance-Service (Rollen holen)
              → backend :8080 (nur bei allow=true)
          → backend :8080     (direkt, für /userinfo — kein authz)
```

Headers, die der Sidecar bei allow setzt und das Backend sieht:
- `X-Auth-User-Id`
- `X-Enriched-Roles`
- `X-Auth-Context`

---

## Schlüsseldateien

| Datei | Zweck |
|---|---|
| `docker-compose.yml` | gesamter lokaler Stack |
| `sidecar/policies/authz.rego` | OPA RBAC-Policy |
| `sidecar/config.yaml` | Referenzkonfiguration Sidecar |
| `infra/envoy/envoy.yaml` | Envoy-Routing + ext_authz |
| `backend/app/main.py` | FastAPI Backend-Endpunkte |
| `role-enhance-service/app/main.py` | Rollen-Profile (hartcodiert) |
| `frontend/src/app/api/gateway/[...path]/route.ts` | Next.js Gateway-Proxy |
| `frontend/src/components/dashboard.tsx` | Haupt-UI |
| `keycloak/realm-export.json` | Keycloak Realm-Import |

---

## Lokaler Start

```bash
docker compose up --build
```

Test ohne Frontend:
```bash
curl -i http://localhost:18080/api/orders   # → 200 (customer-Rolle)
curl -i http://localhost:18080/api/admin    # → 403 (keine admin-Rolle)
curl -i http://localhost:18080/userinfo     # → 200 (kein authz)
```

Role-Enhance-Service direkt:
```bash
curl -s http://localhost:8089/api/v1/users/demo-user/roles | jq
curl -s http://localhost:8089/api/v1/users/admin/permissions | jq
```

---

## OPA-Policy (authz.rego)

Rollen und ihre Rechte:

| Rolle | erlaubte Pfade |
|---|---|
| `customer` | GET `/api/orders`, GET `/api/profile` |
| `admin` | GET `/api/orders`, GET `/api/profile`, alle `/api/admin` |

Hardcodierte Demo-User im Role-Enhance-Service: `demo-user` (customer + tier-gold), `alice` (customer), `admin` (admin + support).

---

## Bekannte Eigenheiten

- **Issuer-Mismatch**: `OIDC_TOKEN_ISSUER` zeigt auf `localhost:8081`, Container sprechen aber über `keycloak:8080`. Bei echter Token-Validierung führt das zu `401`.
- **Envoy → Sidecar Port**: `envoy.yaml` konfiguriert Port `8000`, Sidecar läuft auf `8080` — bei Änderungen am Sidecar-Port darauf achten.
- **`/userinfo`**: Frontend-Proxy umgeht Envoy und geht direkt ans Backend. Envoy leitet `/userinfo` per `prefix_rewrite` zum Sidecar-Cluster (nicht zum Backend).
- **Demo-User**: Das Backend extrahiert die User-ID aus dem Bearer-Token (Base64-Decode), fällt auf `"demo-user"` zurück wenn kein Token vorhanden.

---

## Modi

| Variable | Demo-Mode | Prod-like |
|---|---|---|
| `NEXT_PUBLIC_DEMO_MODE` | `true` | `false` |
| `AUTH_ENABLED` | `false` | `true` |
| `AUTHZ_ENABLED` | `false` | `true` |
| OIDC-Quelle | WireMock | Keycloak |
