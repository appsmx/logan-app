// Login endpoint — verifica la contraseña y setea cookie de autenticación.
// La contraseña se configura via env var LOGAN_ADMIN_PASSWORD.
// Si no está configurada, usa el default.

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const password = body.password || "";

    // Leer contraseña de env var. Si no existe, usar default.
    const adminPassword = process.env.LOGAN_ADMIN_PASSWORD || "logan2026";

    console.log("[login] Attempting login. Env var set:", !!process.env.LOGAN_ADMIN_PASSWORD);
    console.log("[login] Password provided length:", password.length);

    if (password === adminPassword) {
      const res = NextResponse.json({ success: true });
      res.cookies.set("logan_auth", "authenticated", {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
        path: "/",
      });
      return res;
    }

    return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });
  } catch (e) {
    return NextResponse.json({ error: "Error: " + (e as Error).message }, { status: 500 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.delete("logan_auth");
  return res;
}
