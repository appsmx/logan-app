// LOGAN OS middleware — protege el panel de administración.
// Solo el showcase, login y endpoints públicos están abiertos.
// Todo lo demás requiere autenticación (cookie logan_auth).

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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Raíz → redirigir al showcase
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/showcase", request.url));
  }

  // Rutas públicas → dejar pasar
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // Todo lo demás → verificar autenticación
  const authCookie = request.cookies.get("logan_auth");
  if (authCookie?.value === "authenticated") {
    return NextResponse.next();
  }

  // No autenticado → redirigir al showcase
  return NextResponse.redirect(new URL("/showcase", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
