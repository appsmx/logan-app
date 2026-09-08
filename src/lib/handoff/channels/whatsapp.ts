// LOGAN OS — Handoff — conector de canal WhatsApp (DEC-LOGAN-021, Fase 2).
//
// Reutiliza las MISMAS credenciales de WhatsApp Cloud API que ya usa el negocio
// (no requiere nuevo número ni nueva app de Meta). Este conector solo:
//   1. Envía mensajes por la Graph API (bot o humano).
//   2. Extrae los mensajes entrantes del payload del webhook de Meta.
//   3. Respeta la ventana de servicio de 24h (texto libre solo dentro de 24h).
//
// Env vars (reutilizadas del bot existente):
//   - WHATSAPP_TOKEN         → token de acceso (Bearer) de la Cloud API.
//   - WHATSAPP_PHONE_NUMBER_ID → Phone Number ID emisor.
//   - WHATSAPP_VERIFY_TOKEN  → token del handshake de verificación del webhook.
//
// NOTA: Meta cambia la versión de la Graph API periódicamente; se deja
// configurable con WHATSAPP_GRAPH_VERSION (default una versión reciente).

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v21.0";

function graphUrl(phoneNumberId: string) {
  return `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;
}

/** ¿Estamos dentro de la ventana de servicio de 24h de Meta? */
export function within24hWindow(lastCustomerMessageAt: Date, now = new Date()): boolean {
  const diffMs = now.getTime() - new Date(lastCustomerMessageAt).getTime();
  return diffMs <= 24 * 60 * 60 * 1000;
}

export type SendResult =
  | { ok: true }
  | { ok: false; error: string; status?: number };

/**
 * Envía un mensaje de texto libre por WhatsApp Cloud API.
 * Úsalo SOLO dentro de la ventana de 24h (fuera de ella Meta rechaza con 131047
 * y hay que usar una plantilla pre-aprobada — pendiente para más adelante).
 *
 * Devuelve un resultado (no lanza) para que el caller decida: normalmente el
 * mensaje ya se guardó y el envío es "best effort" (no debe perderse el texto
 * del humano si Meta rechaza por token expirado o ventana de 24h).
 */
export async function sendWhatsAppText(to: string, text: string): Promise<SendResult> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    return {
      ok: false,
      error: "WhatsApp no configurado: faltan WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID",
    };
  }

  try {
    const res = await fetch(graphUrl(phoneNumberId), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { body: text },
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      // Log detallado para diagnóstico (token expirado = 401; fuera de 24h = 131047).
      console.error(`[whatsapp] send falló (${res.status}): ${errBody.slice(0, 400)}`);
      return { ok: false, error: errBody.slice(0, 300), status: res.status };
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[whatsapp] send excepción:", msg);
    return { ok: false, error: msg };
  }
}

/** Un mensaje entrante ya normalizado desde el payload del webhook. */
export type ParsedInboundMessage = {
  from: string; // número E.164 del cliente (sin +)
  text: string;
  messageId: string;
};

/**
 * Extrae los mensajes de texto entrantes del payload del webhook de Meta.
 * El payload viene anidado varios niveles; puede traer 0..N mensajes.
 * Ignora status updates (delivered/read) y tipos no-texto por ahora.
 */
export function parseInboundMessages(body: unknown): ParsedInboundMessage[] {
  const out: ParsedInboundMessage[] = [];
  try {
    const entries = (body as { entry?: unknown[] })?.entry ?? [];
    for (const entry of entries) {
      const changes = (entry as { changes?: unknown[] })?.changes ?? [];
      for (const change of changes) {
        const value = (change as { value?: Record<string, unknown> })?.value;
        const messages = (value?.messages as unknown[]) ?? [];
        for (const m of messages) {
          const msg = m as {
            from?: string;
            id?: string;
            type?: string;
            text?: { body?: string };
          };
          if (msg.type === "text" && msg.from && msg.text?.body) {
            out.push({
              from: msg.from,
              text: msg.text.body,
              messageId: msg.id ?? "",
            });
          }
        }
      }
    }
  } catch {
    // Payload inesperado → devolvemos lo que se pudo parsear (posiblemente vacío).
  }
  return out;
}
