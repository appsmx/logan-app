// LOGAN OS — Handoff — Webhook de WhatsApp Cloud API (DEC-LOGAN-021, Fase 2)
//
// GET  → handshake de verificación de Meta (echo de hub.challenge).
// POST → mensajes entrantes del cliente → núcleo del handoff → si modo BOT,
//        envía la respuesta de la IA por WhatsApp; si modo HUMAN, no responde
//        (queda esperando que el humano conteste desde el panel).
//
// Mapeo número→proyecto: para la Fase 2 (un número de prueba) se usa la env var
// WHATSAPP_PROJECT_ID (a qué proyecto pertenece ese número). Cuando se manejen
// varios números/clientes, este mapeo se moverá a la BD (metadata.phone_number_id).
//
// La ENTRADA es pública (middleware permite /api/handoff/whatsapp/... vía prefijo
// que agregamos). La verificación de Meta protege el resto.

import { NextResponse } from "next/server";
import { handleIncomingMessage } from "@/lib/handoff/core";
import {
  parseInboundMessages,
  sendWhatsAppText,
  within24hWindow,
} from "@/lib/handoff/channels/whatsapp";
import { getConversationWithMessages } from "@/lib/handoff/store";

// ─── GET: verificación del webhook (handshake de Meta) ──────────────────────
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && token && token === verifyToken) {
    // Meta espera el challenge en texto plano.
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

// ─── POST: mensajes entrantes ───────────────────────────────────────────────
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    // Meta espera 200 aunque el cuerpo sea raro, para no reintentar en bucle.
    return NextResponse.json({ ok: true });
  }

  const projectId = process.env.WHATSAPP_PROJECT_ID;
  if (!projectId) {
    console.error("[whatsapp/webhook] Falta WHATSAPP_PROJECT_ID");
    return NextResponse.json({ ok: true }); // 200 para no provocar reintentos de Meta
  }

  const messages = parseInboundMessages(body);

  // Procesa cada mensaje entrante. Responder rápido a Meta (200) es importante;
  // aquí lo hacemos secuencial pero acotado (suele venir 1 mensaje por webhook).
  for (const msg of messages) {
    try {
      const result = await handleIncomingMessage({
        projectId,
        channel: "whatsapp",
        externalId: msg.from,
        text: msg.text,
      });

      // Modo BOT → enviar la respuesta de la IA por WhatsApp (si estamos en la ventana de 24h).
      if (result.handledBy === "bot" && result.reply) {
        const conv = await getConversationWithMessages(result.conversationId);
        const withinWindow = conv
          ? within24hWindow(conv.lastCustomerMessageAt)
          : true;
        if (withinWindow) {
          const sent = await sendWhatsAppText(msg.from, result.reply);
          if (!sent.ok) {
            console.error(
              `[whatsapp/webhook] El bot respondió pero WhatsApp NO entregó (${sent.status ?? "error"}): ${sent.error}. ` +
                (sent.status === 401
                  ? "El token expiró/inválido — regenera WHATSAPP_TOKEN en Meta."
                  : ""),
            );
          }
        } else {
          console.warn(
            "[whatsapp/webhook] Fuera de la ventana de 24h; se requiere plantilla (pendiente).",
          );
        }
      }
      // Modo HUMAN → no se envía nada; el humano responderá desde el panel
      // (el endpoint /reply se encarga de enviarlo por WhatsApp).
    } catch (err) {
      console.error("[whatsapp/webhook] error procesando mensaje:", err);
      // Continúa con los demás mensajes; devolvemos 200 igual.
    }
  }

  return NextResponse.json({ ok: true });
}
