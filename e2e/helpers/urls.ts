export const URLS = {
  frontend:    process.env.FRONTEND_URL    ?? "http://localhost:3000",
  envoy:       process.env.ENVOY_URL       ?? "http://localhost:18080",
  backend:     process.env.BACKEND_URL     ?? "http://localhost:8082",
  roleService: process.env.ROLE_SERVICE_URL ?? "http://localhost:8089",
  opa:         process.env.OPA_URL         ?? "http://localhost:8181",
  keycloak:    process.env.KEYCLOAK_URL    ?? "http://localhost:8081",
  sidecar:     process.env.SIDECAR_URL     ?? "http://localhost:8090",
};

export const REALM = "sidecar-demo";
export const CLIENT_ID = "demo-frontend";
