// LOGAN OS middleware — protege el panel de administración + CORS para API.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_ROUTES = [
  "/showcase",
  "/login",
  "/api/login",
  "/api/showcase",
  "/api/assistant",
  "/api/projects",
  "/api/usage",
  "/_next",
  "/favicon",
  "/logo",
];

// Dominios permitidos para CORS
const ALLOWED_ORIGINS = [
  "https://mrtramite.mx",
  "https://www.mrtramite.mx",
  "https://mrtramite.vercel.app",
  "https://logancorp.vercel.app",
  "http://localhost:3000",
  "http://localhost:3001",
];

function isPublicRoute(pathname: string): boolean {
  if (pathname === "/") return false;
  return PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
}

function isAuthenticated(request: NextRequest): boolean {
  const authCookie = request.cookies.get("logan_auth");
  return authCookie?.value === "authenticated";
}

function getCorsHeaders(origin: string | null) {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  } else {
    headers["Access-Control-Allow-Origin"] = "*";
  }

  return headers;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const origin = request.headers.get("origin");

  // --- ALL /api/ routes get CORS headers ---
  if (pathname.startsWith("/api/")) {
    // Preflight OPTIONS → respond immediately
    if (request.method === "OPTIONS") {
      return new NextResponse(null, {
        status: 204,
        headers: getCorsHeaders(origin),
      });
    }

    // For actual requests to public API routes, add CORS headers and pass through
    if (isPublicRoute(pathname)) {
      const response = NextResponse.next();
      const corsHeaders = getCorsHeaders(origin);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
      return response;
    }

    // Non-public API routes: check auth, still add CORS if authenticated
    if (isAuthenticated(request)) {
      const response = NextResponse.next();
      const corsHeaders = getCorsHeaders(origin);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
      return response;
    }

    // Not authenticated, not public → 401
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // --- Non-API routes: authentication logic ---

  if (pathname === "/") {
    if (isAuthenticated(request)) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/showcase", request.url));
  }

  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  if (isAuthenticated(request)) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/showcase", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
