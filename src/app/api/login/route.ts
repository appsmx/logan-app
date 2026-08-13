// Login endpoint — verifica la contraseña y setea cookie de autenticación.
// La contraseña se configura via env var LOGAN_ADMIN_PASSWORD.

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { password } = await req.json();

  const adminPassword = process.env.LOGAN_ADMIN_PASSWORD || "logan2026";

  if (password === adminPassword) {
    const res = NextResponse.json({ success: true });
    res.cookies.set("logan_auth", "authenticated", {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 60 * 60 * 24 * 7, // 7 días
      path: "/",
    });
    return res;
  }

  return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });
}

export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.delete("logan_auth");
  return res;
}
