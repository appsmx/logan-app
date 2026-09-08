// LOGAN OS — Handoff — CLIENTE: responder manualmente (DEC-LOGAN-022, Fase 3.1)
//
// POST { projectId, text } → el dueño del negocio responde desde su panel.
// Si la conversación es de WhatsApp, se envía por ese canal (dentro de 24h).
// Con aislamiento: cookie del cliente + conversación de su proyecto.

import { NextRequest, NextResponse } from "next/server";
import {
  addMessage,
  getConversationWithMessages,
  conversationBelongsToProject,
} from "@/lib/handoff/store";
import { isClientAuthenticated } from "@/lib/handoff/client-auth";
import { sendWhatsAppText, within24hWindow } from "@/lib/handoff/channels/whatsapp";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: { projectId?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { projectId, text } = body;
  if (!projectId) {
    return NextResponse.json({ error: "Falta projectId" }, { status: 400 });
  }
  if (!isClientAuthenticated(req, projectId)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const belongs = await conversationBelongsToProject(id, projectId);
  if (!belongs) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const clean = text?.trim();
  if (!clean) {
    return NextResponse.json({ error: "Falta el texto" }, { status: 400 });
  }
  if (clean.length > 2000) {
    return NextResponse.json({ error: "La respuesta excede 2000 caracteres" }, { status: 400 });
  }

  const conversation = await getConversationWithMessages(id);
  if (!conversation) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  // Entregar por WhatsApp si aplica (dentro de la ventana de 24h).
  if (conversation.channel === "whatsapp") {
    if (!within24hWindow(conversation.lastCustomerMessageAt)) {
      return NextResponse.json(
        {
          error:
            "Fuera de la ventana de 24h de WhatsApp. Solo se permiten plantillas pre-aprobadas fuera de ese plazo (pendiente).",
        },
        { status: 409 },
      );
    }
    try {
      await sendWhatsAppText(conversation.externalId, clean);
    } catch (sendErr) {
      console.error("[client/reply] envío WhatsApp falló:", sendErr);
      return NextResponse.json(
        { error: "No se pudo entregar el mensaje por WhatsApp" },
        { status: 502 },
      );
    }
  }

  const message = await addMessage(id, "HUMAN", clean);
  return NextResponse.json({ message });
}
