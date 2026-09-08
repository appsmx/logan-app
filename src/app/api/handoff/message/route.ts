// LOGAN OS — Handoff — POST /api/handoff/message (DEC-LOGAN-021)
//
// Entrada genérica de mensajes del cliente para el canal WEB (Fase 1).
// Ejecuta el núcleo del handoff (decide bot/humano). Los canales WhatsApp/IG
// (fases siguientes) reusan el mismo núcleo desde su propio webhook.
//
// Body: { projectId, externalId, text }
//   - externalId: identifica al cliente en el canal web (ej. un sessionId del widget).
//
// Respuesta:
//   - modo BOT   → { handledBy: "bot", reply }
//   - modo HUMAN → { handledBy: "human", reply: null, status: "WAITING_HUMAN" }

import { NextResponse } from "next/server";
import { handleIncomingMessage } from "@/lib/handoff/core";

export async function POST(req: Request) {
  let body: { projectId?: string; externalId?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { projectId, externalId, text } = body;
  if (!projectId || !externalId || !text?.trim()) {
    return NextResponse.json(
      { error: "Faltan campos requeridos: projectId, externalId, text" },
      { status: 400 },
    );
  }
  if (text.length > 2000) {
    return NextResponse.json(
      { error: "El mensaje excede 2000 caracteres" },
      { status: 400 },
    );
  }

  try {
    const result = await handleIncomingMessage({
      projectId,
      channel: "web",
      externalId,
      text,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[handoff/message] error:", err);
    return NextResponse.json(
      { error: "No se pudo procesar el mensaje" },
      { status: 500 },
    );
  }
}
