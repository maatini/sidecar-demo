import os
import json
import base64

import httpx
from fastapi import FastAPI, Request, Response, status

app = FastAPI(title="sidecar-demo-backend", version="1.0.0")
ROLE_ENHANCE_URL = os.getenv("ROLE_ENHANCE_SERVICE_URL", "http://role-enhance-service:8080")


def auth_headers(request: Request) -> dict:
    return {
        "x_auth_user_id": request.headers.get("x-auth-user-id"),
        "x_enriched_roles": request.headers.get("x-enriched-roles"),
        "x_auth_context": request.headers.get("x-auth-context"),
    }


def extract_user_id_from_bearer(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        return "demo-user"
    token = authorization.split(" ", 1)[1]
    parts = token.split(".")
    if len(parts) < 2:
        return "demo-user"
    try:
        payload = parts[1]
        payload += "=" * (-len(payload) % 4)
        decoded = base64.urlsafe_b64decode(payload.encode("utf-8")).decode("utf-8")
        claims = json.loads(decoded)
        return str(claims.get("preferred_username") or claims.get("sub") or "demo-user")
    except Exception:
        return "demo-user"


async def role_profile(user_id: str) -> tuple[list[str], list[str], dict]:
    enriched_roles = ["customer"]
    permissions = ["orders:read"]
    enrichment = {
        "department": "unknown",
        "region": "unknown",
        "source": "fallback",
    }
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            roles_res = await client.get(f"{ROLE_ENHANCE_URL}/api/v1/users/{user_id}/roles")
            perms_res = await client.get(f"{ROLE_ENHANCE_URL}/api/v1/users/{user_id}/permissions")
        if roles_res.status_code == 200:
            roles_payload = roles_res.json()
            enriched_roles = roles_payload.get("roles", enriched_roles)
            enrichment = roles_payload.get("enrichment", enrichment)
        if perms_res.status_code == 200:
            perms_payload = perms_res.json()
            permissions = perms_payload.get("permissions", permissions)
    except Exception:
        pass
    return enriched_roles, permissions, enrichment


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.get("/api/orders")
async def orders(request: Request) -> dict:
    return {
        "resource": "orders",
        "items": [
            {"id": "ord-1001", "status": "shipped", "total": 129.99},
            {"id": "ord-1002", "status": "processing", "total": 59.49},
        ],
        "auth_headers_seen": auth_headers(request),
    }


@app.get("/api/profile")
async def profile(request: Request) -> dict:
    return {
        "resource": "profile",
        "message": "Public profile info behind sidecar authz",
        "auth_headers_seen": auth_headers(request),
    }


@app.get("/api/admin")
async def admin(request: Request) -> dict:
    return {
        "resource": "admin",
        "message": "Sensitive admin insights",
        "auth_headers_seen": auth_headers(request),
    }


@app.get("/api/userinfo")
async def userinfo(request: Request) -> dict:
    user_id = extract_user_id_from_bearer(request.headers.get("authorization"))
    enriched_roles, permissions, enrichment = await role_profile(user_id)

    return {
        "user_id": user_id,
        "roles": enriched_roles,
        "permissions": permissions,
        "enrichment": enrichment,
        "claims": {
            "preferred_username": user_id,
            "iss": "wiremock-demo",
        },
        "auth_headers_seen": auth_headers(request),
    }