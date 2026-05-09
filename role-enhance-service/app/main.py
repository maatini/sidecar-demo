from fastapi import FastAPI

app = FastAPI(title="role-enhance-service", version="1.0.0")


ROLE_PROFILES = {
    "demo-user": {
        "roles": ["customer", "tier-gold"],
        "permissions": ["orders:read", "profile:read"],
        "department": "digital-sales",
        "region": "eu-central",
    },
    "alice": {
        "roles": ["customer"],
        "permissions": ["orders:read", "profile:read"],
        "department": "retail",
        "region": "eu-west",
    },
    "admin": {
        "roles": ["admin", "support"],
        "permissions": ["orders:read", "profile:read", "admin:read", "admin:write"],
        "department": "platform",
        "region": "global",
    },
}


def profile_for(user_id: str) -> dict:
    if user_id in ROLE_PROFILES:
        return ROLE_PROFILES[user_id]
    return {
        "roles": ["customer"],
        "permissions": ["orders:read"],
        "department": "unknown",
        "region": "unknown",
    }


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.get("/api/v1/users/{user_id}/roles")
async def roles(user_id: str) -> dict:
    profile = profile_for(user_id)
    return {
        "userId": user_id,
        "roles": profile["roles"],
        "enrichment": {
            "department": profile["department"],
            "region": profile["region"],
            "source": "role-enhance-service",
        },
    }


@app.get("/api/v1/users/{user_id}/permissions")
async def permissions(user_id: str) -> dict:
    profile = profile_for(user_id)
    return {
        "userId": user_id,
        "permissions": profile["permissions"],
        "source": "role-enhance-service",
    }
