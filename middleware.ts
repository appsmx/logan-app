// LOGAN OS middleware — protege el panel de administración + CORS para API pública.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_ROUTES = [
  "/showcase",
  "/login",
  "/api/login",
  "/api/showcase",
  "/api/assistant/chat",
  "/api/projects/", // Needed for update-vision endpoint (protected by its own secret)
  "/api/usage",
  "/_next",
  "/favicon",
  "/logo",
];

// Dominios permitidos para CORS (productos creados con LOGAN)
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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  } else {
    // Para cualquier otro origen, permitir (el endpoint es público)
    headers["Access-Control-Allow-Origin"] = "*";
  }

  return headers;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const origin = request.headers.get("origin");

  // --- CORS preflight (OPTIONS) para rutas de API pública ---
  if (request.method === "OPTIONS" && pathname.startsWith("/api/")) {
    const corsHeaders = getCorsHeaders(origin);
    return new NextResponse(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // --- Agregar CORS headers a respuestas de API pública ---
  if (pathname.startsWith("/api/assistant/") || pathname.startsWith("/api/showcase/")) {
    const authed = isAuthenticated(request);
    
    // Estas rutas son públicas, dejar pasar
    const response = NextResponse.next();
    const corsHeaders = getCorsHeaders(origin);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    return response;
  }

  // --- Lógica de autenticación existente ---

  // Raíz:
  // - Si autenticado → dejar pasar a LOGAN OS
  // - Si no autenticado → redirigir al showcase
  if (pathname === "/") {
    const authed = isAuthenticated(request);
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
  const authed = isAuthenticated(request);
  if (authed) {
    return NextResponse.next();
  }

  // No autenticado → redirigir al showcase
  return NextResponse.redirect(new URL("/showcase", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
