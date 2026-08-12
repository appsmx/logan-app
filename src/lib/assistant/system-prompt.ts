// LOGAN Assistant — REDUCED system prompt for customer-facing chatbots.
//
// (Task 35) The Core/LOGAN system prompt includes the full Biblia + the 10
// Constitution articles + the OS manual + Roles + the authority hierarchy +
// a Memory Report. That's appropriate when LOGAN is talking to the project
// owner (who needs the methodological context), but it's wasteful when the
// same LLM is talking to an END CUSTOMER of a reseller project — someone who
// asks "¿cuánto cuesta X?" doesn't need to know about Art. III or the
// Authority Hierarchy.
//
// This module produces a SHORT system prompt that gives the chatbot only the
// product knowledge it needs to answer customer questions:
//   - Product name + tagline
//   - Vision (truncated to ~2 sentences)
//   - Users (one line)
//   - Services/products (bullet list, max 10)
//   - Pricing (if provided)
//   - Contact info (WhatsApp, email)
//   - FAQ (max 5 Q&As)
//
// Skipped: stack tecnológico, decisions, phase progress, session context,
// audit, backlog, Constitution articles, OS manual, roles. The customer
// doesn't need to know about LOGAN internals.
//
// This is a building block: a future `POST /api/assistant/chat` endpoint
// (not yet in this sandbox — only the deployed Vercel repo has it) will call
// `buildAssistantSystemPrompt(project, extra)` and then callLLM({ task:
// "assistant", systemPrompt, userMessage, modelOverride: project.llmModel }).
// In the local sandbox, the Core "Hablar con LOGAN" section already serves
// the assistant role; this module is provided as the reseller-ready short
// prompt for when the customer-facing endpoint is added.

import type { ProjectBibliaContext } from "@/lib/core/types";

function parseUsers(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
    return [];
  } catch {
    return [];
  }
}

/** Truncate a long text to the first N sentences. */
function firstSentences(text: string, maxSentences: number): string {
  if (!text) return "";
  const trimmed = text.trim();
  // Naive sentence splitter — good enough for a chatbot prompt.
  const sentences = trimmed
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length === 0) return trimmed;
  return sentences.slice(0, maxSentences).join(" ");
}

export interface AssistantExtraContext {
  /** Services/products the chatbot should know about. Max 10 are rendered. */
  services?: string[];
  /** Free-form pricing text (already human-readable). */
  pricing?: string;
  /** Contact info: phone, WhatsApp, email, etc. */
  contact?: {
    whatsapp?: string;
    email?: string;
    phone?: string;
    extra?: string;
  };
  /** FAQ pairs. Max 5 are rendered. */
  faq?: Array<{ question: string; answer: string }>;
  /** Optional tagline (one-liner under the product name). */
  tagline?: string;
}

/**
 * Builds the reduced Biblia context string for a customer-facing chatbot.
 * This is the "what the bot knows about the business" section of the prompt.
 *
 * Inputs:
 *   - `project` — the standard ProjectBibliaContext (from the Project row).
 *   - `extra`   — optional services / pricing / contact / FAQ. These fields
 *     don't exist in the Project schema (yet); the future assistant endpoint
 *     will load them from a separate config table or fetch them from the
 *     project's marketing assets. For now, callers can pass them inline.
 */
export function buildReducedBibliaContext(
  project: ProjectBibliaContext,
  extra?: AssistantExtraContext,
): string {
  const users = parseUsers(project.users);
  const lines: string[] = [
    `## ${project.name}`,
    "",
  ];

  if (extra?.tagline) {
    lines.push(`*${extra.tagline.trim()}*`, "");
  }

  // Vision — truncate to 2 sentences max.
  if (project.vision && project.vision.trim().length > 0) {
    const short = firstSentences(project.vision, 2);
    lines.push(`**Visión:** ${short}`, "");
  }

  // Users — single line.
  if (users.length > 0) {
    lines.push(`**Audiencia:** ${users.join("; ")}.`, "");
  }

  // Services — bullet list, max 10.
  if (extra?.services && extra.services.length > 0) {
    lines.push("**Servicios / productos:**");
    for (const s of extra.services.slice(0, 10)) {
      lines.push(`- ${s}`);
    }
    lines.push("");
  }

  // Pricing — free-form text.
  if (extra?.pricing && extra.pricing.trim().length > 0) {
    lines.push("**Precios:**", "", extra.pricing.trim(), "");
  }

  // Contact info.
  const c = extra?.contact;
  if (c && (c.whatsapp || c.email || c.phone || c.extra)) {
    lines.push("**Contacto:**");
    if (c.whatsapp) lines.push(`- WhatsApp: ${c.whatsapp}`);
    if (c.email) lines.push(`- Correo: ${c.email}`);
    if (c.phone) lines.push(`- Teléfono: ${c.phone}`);
    if (c.extra) lines.push(`- ${c.extra}`);
    lines.push("");
  }

  // FAQ — max 5.
  if (extra?.faq && extra.faq.length > 0) {
    lines.push("**Preguntas frecuentes:**");
    for (const pair of extra.faq.slice(0, 5)) {
      lines.push(`- **${pair.question}** — ${pair.answer}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

const ASSISTANT_BEHAVIOR = `## Tu rol

Eres el asistente virtual de este producto. Hablas con clientes finales: personas que tienen preguntas concretas sobre el producto, los servicios, los precios o cómo contactar al equipo.

Tu estilo:
- **Cálido y directo.** Saluda, responde y ofrece ayudar con algo más.
- **Honesto.** Si no sabes algo (ej. un precio específico que no está en tu contexto), dilo y ofrece conectar con el equipo por WhatsApp o correo.
- **Breve.** El cliente quiere una respuesta, no un ensayo. 2-3 frases suele ser suficiente para la mayoría de preguntas.
- **En español.** Usa el tono del producto (formal si es corporativo, casual si es lifestyle).

Lo que NUNCA haces:
- No mencionas LOGAN, la Constitución, la metodología, los roles, ni nada de la infraestructura interna. El cliente no debe ver nada de eso.
- No inventas servicios, precios o datos que no estén en tu contexto. Si algo no está, dices "no estoy seguro, déjame conectar con el equipo".
- No pides datos sensibles (tarjetas, contraseñas). Si el cliente quiere pagar, lo diriges al canal oficial.
- No prometes descuentos ni condiciones especiales. Esas decisiones las toma el equipo humano.

Si el cliente quiere hablar con una persona, lo conectas con el contacto que tienes en tu contexto.`;

/**
 * Builds the full system prompt for the customer-facing assistant chatbot.
 * Uses the reduced Biblia context — NOT the full Constitution/OS manual/etc.
 *
 * Pass this as `systemPrompt` to callLLM with `task: "assistant"` and
 * `modelOverride: project.llmModel` (the per-project model override, Task 35).
 */
export function buildAssistantSystemPrompt(
  project: ProjectBibliaContext,
  extra?: AssistantExtraContext,
): string {
  return [
    "# Asistente virtual",
    "",
    buildReducedBibliaContext(project, extra),
    "",
    ASSISTANT_BEHAVIOR,
    "",
    "## Tu formato de respuesta",
    "",
    "Responde en texto natural al usuario — NO devuelvas JSON, NO uses bloques de código markdown. Una sola voz, cálida, en español. Si la pregunta es de pricing/servicios, usa el contexto de arriba. Si no lo tienes, di 'no estoy seguro' y conecta con el contacto del equipo.",
  ].join("\n");
}
