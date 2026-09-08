// LOGAN OS — Handoff — GET /api/handoff/conversations (DEC-LOGAN-021)
//
// Panel del negocio: lista las conversaciones de un proyecto.
// Query: ?projectId=... [&waiting=1]  (waiting=1 → solo las que esperan humano)

import { NextResponse } from "next/server";
import { listConversations } from "@/lib/handoff/store";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const onlyWaiting = searchParams.get("waiting") === "1";

  if (!projectId) {
    return NextResponse.json(
      { error: "Falta el parámetro projectId" },
      { status: 400 },
    );
  }

  try {
    const conversations = await listConversations(projectId, onlyWaiting);
    return NextResponse.json({ conversations });
  } catch (err) {
    console.error("[handoff/conversations] error:", err);
    return NextResponse.json(
      { error: "No se pudieron listar las conversaciones" },
      { status: 500 },
    );
  }
}
