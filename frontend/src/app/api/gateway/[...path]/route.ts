import { NextRequest, NextResponse } from "next/server";

const gatewayInternalUrl = process.env.SIDECAR_GATEWAY_INTERNAL_URL || "http://envoy:8080";
const backendInternalUrl = process.env.BACKEND_INTERNAL_URL || "http://backend:8080";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  try {
    const { path } = await context.params;
    const upstreamPath = `/${(path || []).join("/")}`;
    const isUserinfoPath = upstreamPath === "/userinfo";
    const isProtectedApiPath = upstreamPath.startsWith("/api/");
    const upstreamBase = isUserinfoPath || isProtectedApiPath ? backendInternalUrl : gatewayInternalUrl;
    const resolvedPath = isUserinfoPath ? "/api/userinfo" : upstreamPath;
    const upstreamBaseNormalized = upstreamBase.replace(/\/+$/, "");
    const upstreamUrl = `${upstreamBaseNormalized}${resolvedPath}${request.nextUrl.search}`;

    const upstreamHeaders = new Headers();
    const authorization = request.headers.get("authorization");
    if (authorization) {
      upstreamHeaders.set("authorization", authorization);
    }
    upstreamHeaders.set("x-forwarded-method", request.method);

    if (isProtectedApiPath) {
      const authorizeUrl = `${backendInternalUrl.replace(/\/+$/, "")}/api/authorize${upstreamPath}`;
      const authorizeResponse = await fetch(authorizeUrl, {
        method: "GET",
        headers: upstreamHeaders,
        cache: "no-store",
      });
      if (!authorizeResponse.ok) {
        const body = await authorizeResponse.arrayBuffer();
        const contentType = authorizeResponse.headers.get("content-type") || "application/json";
        return new NextResponse(body, {
          status: authorizeResponse.status,
          headers: { "content-type": contentType },
        });
      }
      const authorizeBody = (await authorizeResponse.json()) as Record<string, unknown>;
      if (typeof authorizeBody.x_auth_user_id === "string") {
        upstreamHeaders.set("x-auth-user-id", authorizeBody.x_auth_user_id);
      }
      if (typeof authorizeBody.x_enriched_roles === "string") {
        upstreamHeaders.set("x-enriched-roles", authorizeBody.x_enriched_roles);
      }
      if (typeof authorizeBody.x_auth_context === "string") {
        upstreamHeaders.set("x-auth-context", authorizeBody.x_auth_context);
      }
    }

    const upstreamResponse = await fetch(upstreamUrl, {
      method: "GET",
      headers: upstreamHeaders,
      cache: "no-store",
    });

    const responseBody = await upstreamResponse.arrayBuffer();
    const responseHeaders = new Headers();
    const contentType = upstreamResponse.headers.get("content-type");
    if (contentType) {
      responseHeaders.set("content-type", contentType);
    }

    return new NextResponse(responseBody, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json(
      {
        error: "gateway_unreachable",
        message: `Upstream nicht erreichbar (${gatewayInternalUrl} oder ${backendInternalUrl})`,
      },
      { status: 502 }
    );
  }
}
