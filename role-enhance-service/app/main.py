import os
from pathlib import Path

import yaml
from fastapi import FastAPI

app = FastAPI(title="role-enhance-service", version="1.0.0")

_PROFILES_PATH = Path(os.getenv("PROFILES_PATH", "/app/profiles.yaml"))

_FALLBACK_PROFILE = {
    "roles": ["customer"],
    "permissions": ["orders:read"],
    "department": "unknown",
    "region": "unknown",
}


def _load_profiles() -> dict:
    if not _PROFILES_PATH.exists():
        return {}
    with _PROFILES_PATH.open() as f:
        data = yaml.safe_load(f)
    return data.get("profiles", {})


_ROLE_PROFILES: dict = _load_profiles()


def profile_for(user_id: str) -> dict:
    return _ROLE_PROFILES.get(user_id, _FALLBACK_PROFILE)


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
