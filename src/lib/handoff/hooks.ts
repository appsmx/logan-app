"use client";

// LOGAN OS — Handoff — React Query hooks para el panel (DEC-LOGAN-021).

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Channel, ConversationStatus, Mode, MessageSender } from "./types";

export type ConversationRow = {
  id: string;
  projectId: string;
  channel: Channel;
  externalId: string;
  mode: Mode;
  status: ConversationStatus;
  lastCustomerMessageAt: string;
  createdAt: string;
  updatedAt: string;
};

export type MessageRow = {
  id: string;
  conversationId: string;
  sender: MessageSender;
  content: string;
  createdAt: string;
};

export type ConversationWithMessages = ConversationRow & { messages: MessageRow[] };

const qk = {
  list: (pid: string) => ["handoff", "conversations", pid] as const,
  detail: (id: string) => ["handoff", "conversation", id] as const,
};

/** Lista de conversaciones del proyecto. Refresca cada 5s (para ver "esperando"). */
export function useConversations(projectId: string | null) {
  return useQuery({
    queryKey: qk.list(projectId ?? ""),
    enabled: !!projectId,
    refetchInterval: 5000,
    queryFn: () =>
      api<{ conversations: ConversationRow[] }>(
        `/api/handoff/conversations?projectId=${encodeURIComponent(projectId!)}`,
      ).then((r) => r.conversations),
  });
}

/** Historial de una conversación. Refresca cada 3s mientras está abierta. */
export function useConversation(conversationId: string | null) {
  return useQuery({
    queryKey: qk.detail(conversationId ?? ""),
    enabled: !!conversationId,
    refetchInterval: 3000,
    queryFn: () =>
      api<{ conversation: ConversationWithMessages }>(
        `/api/handoff/conversations/${conversationId}`,
      ).then((r) => r.conversation),
  });
}

/** Cambia el modo BOT/HUMAN — el interruptor. */
export function useSetMode(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, mode }: { id: string; mode: Mode }) =>
      api(`/api/handoff/conversations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ mode }),
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: qk.detail(vars.id) });
      if (projectId) qc.invalidateQueries({ queryKey: qk.list(projectId) });
    },
  });
}

/** El humano envía una respuesta manual. */
export function useHumanReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      api(`/api/handoff/conversations/${id}/reply`, {
        method: "POST",
        body: JSON.stringify({ text }),
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: qk.detail(vars.id) });
    },
  });
}
