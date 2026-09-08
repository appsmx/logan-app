// LOGAN OS middleware — protege el panel de administración + CORS para API.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_ROUTES = [
  "/showcase",
  "/pos",
  "/voz",
  "/api/voz",
  "/login",
  "/api/login",
  "/api/showcase",
  "/api/assistant",
  // Handoff (DEC-LOGAN-021): la ENTRADA de mensajes del cliente es pública
  // (widget web / webhook de canal). Los endpoints del PANEL
  // (/api/handoff/conversations*) NO se listan aquí → quedan protegidos por auth.
  "/api/handoff/message",
  "/api/handoff/whatsapp", // webhook de Meta (verificación GET + mensajes POST)
  // Panel del cliente (DEC-LOGAN-022): login + endpoints del cliente. NO usan
  // logan_auth de admin; se auto-protegen con la cookie client_auth_<projectId>.
  "/api/handoff/client-login",
  "/api/handoff/client",
  "/panel", // la página del panel del cliente (se protege dentro con su login)
  "/api/projects",
  "/api/usage",
  "/api/export-context",
  "/api/llm",
  "/_next",
  "/favicon",
  "/logo",
  // PWA (DEC-LOGAN-022, Fase 3.4): manifest y service worker deben ser públicos
  // para que el navegador pueda instalar la app.
  "/manifest.webmanifest",
  "/sw.js",
];

// Dominios permitidos para CORS
const ALLOWED_ORIGINS = [
  "https://mrtramite.mx",
  "https://www.mrtramite.mx",
  "https://mrtramite.vercel.app",
  "https://loganos.com",
  "https://www.loganos.com",
  // Dominio anterior en Vercel — se mantiene temporalmente mientras propaga
  // el DNS de loganos.com. Puede eliminarse una vez completada la migración.
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

// Subdominios reservados que NO son paneles de cliente.
const RESERVED_SUBDOMAINS = new Set(["www", "loganos", "app", "api", ""]);

/**
 * Detecta el panel de cliente por subdominio (DEC-LOGAN-022, Fase 3.5).
 * Si el host es {slug}.loganos.com (y no un subdominio reservado), devuelve el
 * slug; si no, null.
 */
function getClientSlug(host: string | null): string | null {
  if (!host) return null;
  const hostname = host.split(":")[0]; // quita el puerto
  // Solo aplica a *.loganos.com
  if (!hostname.endsWith(".loganos.com")) return null;
  const sub = hostname.slice(0, -".loganos.com".length);
  if (!sub || sub.includes(".")) return null; // solo un nivel de subdominio
  if (RESERVED_SUBDOMAINS.has(sub)) return null;
  return sub;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  // --- Routing por subdominio del panel del cliente (Fase 3.5) ---
  // {slug}.loganos.com → reescribe internamente a /panel/by-slug/{slug}
  // (la URL en el navegador se mantiene bonita; el resolver hace slug→projectId).
  const clientSlug = getClientSlug(host);
  if (clientSlug) {
    // Las llamadas a la API deben seguir funcionando normal desde el subdominio;
    // solo reescribimos las rutas de página (no /api, /_next, assets).
    if (
      !pathname.startsWith("/api/") &&
      !pathname.startsWith("/_next") &&
      !pathname.startsWith("/panel/") &&
      pathname !== "/sw.js" &&
      pathname !== "/manifest.webmanifest" &&
      !pathname.startsWith("/logo")
    ) {
      const url = request.nextUrl.clone();
      url.pathname = `/panel/by-slug/${clientSlug}`;
      return NextResponse.rewrite(url);
    }
  }

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
    // Sin sesión → al login del admin (antes iba a /showcase, lo que creaba un
    // bucle: el botón "App LOGAN OS" apunta a "/" y nunca se llegaba al login).
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  if (isAuthenticated(request)) {
    return NextResponse.next();
  }

  // Rutas protegidas del admin sin sesión → al login (no al showcase).
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
