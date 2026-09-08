// LOGAN OS — Handoff — /api/handoff/conversations/[id] (DEC-LOGAN-021)
//
// GET   → historial completo de la conversación (para el panel).
// PATCH → cambia el modo bot/humano (EL INTERRUPTOR).  Body: { mode: "BOT" | "HUMAN" }

import { NextResponse } from "next/server";
import { getConversationWithMessages, setMode } from "@/lib/handoff/store";
import type { Mode } from "@/lib/handoff/types";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const conversation = await getConversationWithMessages(id);
    if (!conversation) {
      return NextResponse.json(
        { error: "Conversación no encontrada" },
        { status: 404 },
      );
    }
    return NextResponse.json({ conversation });
  } catch (err) {
    console.error("[handoff/conversations/:id GET] error:", err);
    return NextResponse.json({ error: "Error al leer la conversación" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: { mode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const mode = body.mode as Mode | undefined;
  if (mode !== "BOT" && mode !== "HUMAN") {
    return NextResponse.json(
      { error: 'El campo "mode" debe ser "BOT" o "HUMAN"' },
      { status: 400 },
    );
  }

  try {
    const updated = await setMode(id, mode);
    return NextResponse.json({ conversation: updated });
  } catch (err) {
    console.error("[handoff/conversations/:id PATCH] error:", err);
    return NextResponse.json({ error: "No se pudo cambiar el modo" }, { status: 500 });
  }
}
