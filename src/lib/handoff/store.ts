// LOGAN OS — Handoff — capa de persistencia (DEC-LOGAN-021).
//
// Operaciones sobre Conversation / Message. Multi-tenant por projectId.
//
// IMPORTANTE (aprendizaje restaurant-pos): evitar nested creates sobre tablas
// tenant-scoped; hacer operaciones .create() individuales. Aquí creamos la
// Conversation y los Message por separado.

import { db } from "@/lib/db";
import type { Channel, Mode, MessageSender } from "./types";

/**
 * Busca la conversación (projectId + channel + externalId) o la crea si no existe.
 * Devuelve el registro de la conversación.
 */
export async function getOrCreateConversation(
  projectId: string,
  channel: Channel,
  externalId: string,
) {
  const existing = await db.conversation.findUnique({
    where: {
      projectId_channel_externalId: { projectId, channel, externalId },
    },
  });
  if (existing) return existing;

  return db.conversation.create({
    data: { projectId, channel, externalId },
  });
}

/** Añade un mensaje a una conversación. */
export async function addMessage(
  conversationId: string,
  sender: MessageSender,
  content: string,
) {
  return db.message.create({
    data: { conversationId, sender, content },
  });
}

/** Marca el timestamp del último mensaje del cliente (para la ventana de 24h). */
export async function touchCustomerMessage(conversationId: string) {
  return db.conversation.update({
    where: { id: conversationId },
    data: { lastCustomerMessageAt: new Date() },
  });
}

/** Cambia el modo (BOT ↔ HUMAN) — EL INTERRUPTOR del panel. */
export async function setMode(conversationId: string, mode: Mode) {
  return db.conversation.update({
    where: { id: conversationId },
    // Al pasar a HUMAN marcamos que hay alguien esperando atención.
    data: {
      mode,
      status: mode === "HUMAN" ? "WAITING_HUMAN" : "OPEN",
    },
  });
}

/** Marca la conversación como esperando atención humana. */
export async function markWaitingHuman(conversationId: string) {
  return db.conversation.update({
    where: { id: conversationId },
    data: { status: "WAITING_HUMAN" },
  });
}

/** Lista conversaciones de un proyecto (para el panel del negocio). */
export async function listConversations(projectId: string, onlyWaiting = false) {
  return db.conversation.findMany({
    where: {
      projectId,
      ...(onlyWaiting ? { status: "WAITING_HUMAN" } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
}

/** Historial completo de una conversación. */
export async function getConversationWithMessages(conversationId: string) {
  return db.conversation.findUnique({
    where: { id: conversationId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
}

/**
 * Verifica que una conversación pertenece a un proyecto dado.
 * Usado por los endpoints del cliente para aislamiento (un cliente solo puede
 * operar conversaciones de SU proyecto).
 */
export async function conversationBelongsToProject(
  conversationId: string,
  projectId: string,
): Promise<boolean> {
  const conv = await db.conversation.findUnique({
    where: { id: conversationId },
    select: { projectId: true },
  });
  return conv?.projectId === projectId;
}
