// LOGAN OS — Handoff — CLIENTE: detalle + interruptor (DEC-LOGAN-022, Fase 3.1)
//
// GET   ?projectId=...        → historial de la conversación (solo si es de su proyecto).
// PATCH { projectId, mode }   → cambia BOT/HUMAN (el interruptor), con aislamiento.
//
// Seguridad: exige cookie client_auth_<projectId> Y que la conversación
// pertenezca a ese proyecto (doble verificación de aislamiento).

import { NextRequest, NextResponse } from "next/server";
import {
  getConversationWithMessages,
  setMode,
  conversationBelongsToProject,
} from "@/lib/handoff/store";
import { isClientAuthenticated } from "@/lib/handoff/client-auth";
import type { Mode } from "@/lib/handoff/types";

async function authorize(
  req: NextRequest,
  conversationId: string,
  projectId: string | null,
): Promise<NextResponse | null> {
  if (!projectId) {
    return NextResponse.json({ error: "Falta projectId" }, { status: 400 });
  }
  if (!isClientAuthenticated(req, projectId)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const belongs = await conversationBelongsToProject(conversationId, projectId);
  if (!belongs) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  return null; // autorizado
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const projectId = new URL(req.url).searchParams.get("projectId");
  const denied = await authorize(req, id, projectId);
  if (denied) return denied;

  const conversation = await getConversationWithMessages(id);
  return NextResponse.json({ conversation });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: { projectId?: string; mode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const denied = await authorize(req, id, body.projectId ?? null);
  if (denied) return denied;

  const mode = body.mode as Mode | undefined;
  if (mode !== "BOT" && mode !== "HUMAN") {
    return NextResponse.json(
      { error: 'El campo "mode" debe ser "BOT" o "HUMAN"' },
      { status: 400 },
    );
  }

  const updated = await setMode(id, mode);
  return NextResponse.json({ conversation: updated });
}
