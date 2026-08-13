// LOGAN OS middleware — protege el panel de administración.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_ROUTES = [
  "/showcase",
  "/login",
  "/api/login",
  "/api/showcase",
  "/api/assistant/chat",
  "/api/usage",
  "/_next",
  "/favicon",
  "/logo",
];

function isPublicRoute(pathname: string): boolean {
  if (pathname === "/") return false;
  return PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
}

function isAuthenticated(request: NextRequest): boolean {
  const authCookie = request.cookies.get("logan_auth");
  return authCookie?.value === "authenticated";
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const authed = isAuthenticated(request);

  // Raíz:
  // - Si autenticado → dejar pasar a LOGAN OS
  // - Si no autenticado → redirigir al showcase
  if (pathname === "/") {
    if (authed) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/showcase", request.url));
  }

  // Rutas públicas → siempre dejar pasar
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // Todo lo demás → verificar autenticación
  if (authed) {
    return NextResponse.next();
  }

  // No autenticado → redirigir al showcase
  return NextResponse.redirect(new URL("/showcase", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
