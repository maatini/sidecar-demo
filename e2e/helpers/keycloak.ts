import { APIRequestContext } from "@playwright/test";
import { CLIENT_ID, REALM, URLS } from "./urls";

export interface TestUser {
  username: string;
  password: string;
}

export const USERS = {
  alice: { username: "alice", password: "alice123" },
  admin: { username: "admin", password: "admin123" },
} satisfies Record<string, TestUser>;

export async function getToken(
  request: APIRequestContext,
  user: TestUser
): Promise<string> {
  const response = await request.post(
    `${URLS.keycloak}/realms/${REALM}/protocol/openid-connect/token`,
    {
      form: {
        grant_type: "password",
        client_id: CLIENT_ID,
        username: user.username,
        password: user.password,
      },
    }
  );
  const body = await response.json();
  if (!body.access_token) {
    throw new Error(
      `Token-Anfrage fehlgeschlagen für ${user.username}: ${JSON.stringify(body)}`
    );
  }
  return body.access_token as string;
}
