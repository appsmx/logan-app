// LOGAN OS — Handoff — endpoints del CLIENTE (DEC-LOGAN-022, Fase 3.1)
//
// GET /api/handoff/client/conversations?projectId=...
//   Lista las conversaciones del proyecto, PERO solo si el request está
//   autenticado como cliente de ESE proyecto (cookie client_auth_<projectId>).
//   El cliente NO puede ver conversaciones de otros proyectos.
//
// Nota: este endpoint queda PÚBLICO en el middleware (no requiere logan_auth de
// admin), pero se auto-protege verificando la cookie del cliente aquí.

import { NextRequest, NextResponse } from "next/server";
import { listConversations } from "@/lib/handoff/store";
import { isClientAuthenticated } from "@/lib/handoff/client-auth";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "Falta projectId" }, { status: 400 });
  }

  // Aislamiento: solo el cliente autenticado en ESTE proyecto puede leer.
  if (!isClientAuthenticated(req, projectId)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const conversations = await listConversations(projectId);
    return NextResponse.json({ conversations });
  } catch (err) {
    console.error("[client/conversations] error:", err);
    return NextResponse.json(
      { error: "No se pudieron listar las conversaciones" },
      { status: 500 },
    );
  }
}
