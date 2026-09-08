// LOGAN OS — Handoff — POST /api/handoff/conversations/[id]/reply (DEC-LOGAN-021)
//
// El HUMANO del negocio responde manualmente desde el panel.
// Guarda el mensaje como sender=HUMAN. (En Fase 1/web, el widget del cliente
// hace polling del historial para recibirlo; en WhatsApp/IG el conector de
// canal se encargará de enviarlo por la API de Meta.)
//
// Body: { text }

import { NextResponse } from "next/server";
import { addMessage, getConversationWithMessages } from "@/lib/handoff/store";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "Falta el texto de la respuesta" }, { status: 400 });
  }
  if (text.length > 2000) {
    return NextResponse.json({ error: "La respuesta excede 2000 caracteres" }, { status: 400 });
  }

  try {
    const conversation = await getConversationWithMessages(id);
    if (!conversation) {
      return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
    }
    const message = await addMessage(id, "HUMAN", text);
    return NextResponse.json({ message });
  } catch (err) {
    console.error("[handoff/reply] error:", err);
    return NextResponse.json({ error: "No se pudo enviar la respuesta" }, { status: 500 });
  }
}
