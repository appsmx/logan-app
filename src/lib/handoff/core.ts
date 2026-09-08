// LOGAN OS — Handoff — el "cerebro" (DEC-LOGAN-021).
//
// Recibe cada mensaje entrante del cliente (de CUALQUIER canal) y decide:
//   - mode = BOT   → genera la respuesta con IA (/api/llm vía callLLM) y la guarda.
//   - mode = HUMAN → NO llama a la IA; marca WAITING_HUMAN y espera al panel.
//
// Este núcleo es canal-agnóstico. Los conectores de canal (web, whatsapp, ...)
// solo se encargan de recibir/enviar por su medio; la decisión vive aquí.

import { callLLM } from "@/lib/llm/client";
import {
  getOrCreateConversation,
  addMessage,
  touchCustomerMessage,
  markWaitingHuman,
  getConversationWithMessages,
} from "./store";
import type { IncomingMessage, HandleResult } from "./types";

const MAX_HISTORY = 20;

/**
 * Procesa un mensaje entrante del cliente y devuelve cómo se manejó.
 * Núcleo del handoff — usado por todos los conectores de canal.
 */
export async function handleIncomingMessage(
  incoming: IncomingMessage,
): Promise<HandleResult> {
  const { projectId, channel, externalId, text } = incoming;

  // 1. Conversación (crear si no existe) + registrar mensaje del cliente.
  const conv = await getOrCreateConversation(projectId, channel, externalId);
  await addMessage(conv.id, "CUSTOMER", text);
  await touchCustomerMessage(conv.id);

  // 2. EL INTERRUPTOR: si está en modo humano, no responde la IA.
  if (conv.mode === "HUMAN") {
    await markWaitingHuman(conv.id);
    return {
      handledBy: "human",
      reply: null,
      conversationId: conv.id,
      status: "WAITING_HUMAN",
    };
  }

  // 3. Modo BOT → generar respuesta con IA usando el historial reciente.
  const full = await getConversationWithMessages(conv.id);
  const history =
    full?.messages
      .slice(-MAX_HISTORY)
      .map((m) => ({
        role: (m.sender === "CUSTOMER" ? "user" : "assistant") as
          | "user"
          | "assistant",
        content: m.content,
      })) ?? [];

  // El último turno del cliente ya está en `history`; lo usamos como userMessage
  // y pasamos el resto como contexto previo.
  const priorHistory = history.slice(0, -1);

  const llm = await callLLM({
    task: "assistant",
    systemPrompt:
      "Eres el asistente del negocio. Responde de forma breve, cordial y útil, " +
      "en el idioma del cliente. Si no puedes resolver algo, indícalo con claridad.",
    userMessage: text,
    history: priorHistory,
    maxTokens: 500,
    temperature: 0.6,
  });

  const reply = llm.text?.trim() || "Gracias por tu mensaje. En un momento te atendemos.";
  await addMessage(conv.id, "BOT", reply);

  return { handledBy: "bot", reply, conversationId: conv.id };
}
