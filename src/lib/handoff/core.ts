// LOGAN OS — Handoff — el "cerebro" (DEC-LOGAN-021).
//
// Recibe cada mensaje entrante del cliente (de CUALQUIER canal) y decide:
//   - mode = BOT   → genera la respuesta con IA (/api/llm vía callLLM) y la guarda.
//   - mode = HUMAN → NO llama a la IA; marca WAITING_HUMAN y espera al panel.
//
// Este núcleo es canal-agnóstico. Los conectores de canal (web, whatsapp, ...)
// solo se encargan de recibir/enviar por su medio; la decisión vive aquí.

import { callLLM } from "@/lib/llm/client";
import { db } from "@/lib/db";
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
 * Delega la respuesta al "cerebro" del proyecto (DEC-LOGAN-021, Opción A).
 * Llama al endpoint del agente del negocio (ej. /api/chat de Mariscos) con
 * {message, history} y devuelve su texto. El negocio mantiene su catálogo,
 * tono y tools (crear_pedido, etc.) en su propio endpoint.
 * Lanza error si el endpoint falla, para que el caller caiga al prompt genérico.
 */
async function askProjectBrain(
  endpointUrl: string,
  message: string,
  history: { role: "user" | "assistant"; content: string }[],
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(endpointUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`bot endpoint HTTP ${res.status}`);
    }
    const data = await res.json();
    const text = (data?.content || data?.text || "").trim();
    if (!text) throw new Error("bot endpoint devolvió respuesta vacía");
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

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

  // 3. Modo BOT → generar respuesta usando el historial reciente.
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

  // 3a. Si el proyecto tiene un "cerebro" propio (endpoint del negocio),
  // delegamos ahí — así responde con SU catálogo, tono y tools (Opción A).
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { botEndpointUrl: true },
  });

  let reply: string | null = null;
  if (project?.botEndpointUrl) {
    try {
      reply = await askProjectBrain(project.botEndpointUrl, text, priorHistory);
    } catch (err) {
      console.error("[handoff] cerebro del proyecto falló, uso prompt genérico:", err);
      reply = null; // cae al genérico
    }
  }

  // 3b. Fallback (o proyectos sin cerebro propio): LLM genérico de LOGAN.
  if (!reply) {
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
    reply = llm.text?.trim() || "Gracias por tu mensaje. En un momento te atendemos.";
  }

  await addMessage(conv.id, "BOT", reply);
  return { handledBy: "bot", reply, conversationId: conv.id };
}
