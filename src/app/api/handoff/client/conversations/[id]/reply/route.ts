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

  // 1. Guardar SIEMPRE el mensaje del humano primero (no perder el texto aunque
  //    el envío por WhatsApp falle por token/ventana de 24h).
  const message = await addMessage(id, "HUMAN", clean);

  // 2. Entregar por WhatsApp si aplica — "best effort" (no bloquea el guardado).
  let delivery: { delivered: boolean; warning?: string } = { delivered: true };
  if (conversation.channel === "whatsapp") {
    if (!within24hWindow(conversation.lastCustomerMessageAt)) {
      delivery = {
        delivered: false,
        warning:
          "Guardado, pero WhatsApp no lo entregó: pasaron más de 24h desde el último mensaje del cliente. Meta solo permite plantillas fuera de ese plazo.",
      };
    } else {
      const res = await sendWhatsAppText(conversation.externalId, clean);
      if (!res.ok) {
        delivery = {
          delivered: false,
          warning:
            res.status === 401
              ? "Guardado, pero WhatsApp rechazó el envío: el token de acceso expiró o es inválido. Regenéralo en Meta y actualiza WHATSAPP_TOKEN."
              : `Guardado, pero WhatsApp no lo entregó (${res.status ?? "error"}). ${res.error}`,
        };
      }
    }
  }

  return NextResponse.json({ message, ...delivery });
}
