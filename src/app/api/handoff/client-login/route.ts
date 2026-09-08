// LOGAN OS — Handoff — login del panel del cliente (DEC-LOGAN-022, Fase 3.1)
//
// POST { projectId, password } → si coincide con Project.clientPanelPassword,
// setea la cookie client_auth_<projectId>. Login SIMPLE por proyecto (Opción A).
//
// DELETE { projectId } → cierra sesión (borra la cookie de ese proyecto).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientCookieName } from "@/lib/handoff/client-auth";

export async function POST(req: NextRequest) {
  let body: { projectId?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { projectId, password } = body;
  if (!projectId || !password) {
    return NextResponse.json(
      { error: "Faltan projectId o password" },
      { status: 400 },
    );
  }

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, clientPanelPassword: true },
  });

  if (!project || !project.clientPanelPassword) {
    // No revelamos si el proyecto existe o si el panel no está habilitado.
    return NextResponse.json({ error: "Acceso no disponible" }, { status: 403 });
  }

  if (password !== project.clientPanelPassword) {
    return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });
  }

  const res = NextResponse.json({ success: true });
  res.cookies.set(clientCookieName(projectId), "authenticated", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 días
    path: "/",
  });
  return res;
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const res = NextResponse.json({ success: true });
  if (projectId) res.cookies.delete(clientCookieName(projectId));
  return res;
}
