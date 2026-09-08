// LOGAN OS — Módulo de Handoff Humano (DEC-LOGAN-021) — types.
//
// Permite que el negocio apague el agente de IA y tome control manual de una
// conversación con su cliente, en cualquier canal (web, WhatsApp, IG/Messenger).
//
// A diferencia del Asistente IA (DEC-LOGAN-011, stateless), el handoff persiste
// el estado bot/humano y el historial en la BD (Conversation, Message).
//
// Spanish UI text; English code comments.

/** Canales soportados. Fase 1 = "web". Fases siguientes añaden WhatsApp/IG. */
export type Channel = "web" | "whatsapp" | "instagram" | "messenger";

/** El interruptor: BOT = responde la IA; HUMAN = responde una persona. */
export type Mode = "BOT" | "HUMAN";

export type ConversationStatus = "OPEN" | "CLOSED" | "WAITING_HUMAN";

export type MessageSender = "CUSTOMER" | "BOT" | "HUMAN";

/** Entrada genérica de un mensaje del cliente (independiente del canal). */
export type IncomingMessage = {
  projectId: string;
  channel: Channel;
  /** Id del cliente en ese canal (número E.164 en WhatsApp, sessionId en web). */
  externalId: string;
  text: string;
};

/** Resultado de procesar un mensaje entrante. */
export type HandleResult =
  | { handledBy: "bot"; reply: string; conversationId: string }
  | { handledBy: "human"; reply: null; conversationId: string; status: "WAITING_HUMAN" };
