import { NextRequest, NextResponse } from "next/server";

const gatewayInternalUrl = process.env.SIDECAR_GATEWAY_INTERNAL_URL || "http://envoy:8080";
const backendInternalUrl = process.env.BACKEND_INTERNAL_URL || "http://backend:8080";

/**
 * API-Gateway-Proxy:
 * - /userinfo       → direkt zum Backend (kein Auth-Check nötig)
 * - alle anderen    → durch Envoy (ext_authz via Sidecar + Routing zum Backend)
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  try {
    const { path } = await context.params;
    const upstreamPath = `/${(path || []).join("/")}`;
    const isUserinfoPath = upstreamPath === "/userinfo";
    const upstreamBase = isUserinfoPath ? backendInternalUrl : gatewayInternalUrl;
    const resolvedPath = isUserinfoPath ? "/api/userinfo" : upstreamPath;
    const upstreamBaseNormalized = upstreamBase.replace(/\/+$/, "");
    const upstreamUrl = `${upstreamBaseNormalized}${resolvedPath}${request.nextUrl.search}`;

    const upstreamHeaders = new Headers();
    const authorization = request.headers.get("authorization");
    if (authorization) {
      upstreamHeaders.set("authorization", authorization);
    }
    upstreamHeaders.set("x-forwarded-method", request.method);

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
