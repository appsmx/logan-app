import { NextRequest, NextResponse } from "next/server";
import { callLLM } from "@/lib/llm/client";

/**
 * POST /api/voz — Logan Voice Assistant endpoint.
 *
 * Receives the user's spoken message (already transcribed by the browser)
 * and returns Logan's response. Uses the shared LLM client (DeepSeek primary).
 *
 * Keeps a short conversation via the `history` array sent from the client.
 *
 * Request: { message: string, history?: {role, content}[] }
 * Response: { response: string }
 */

const SYSTEM_PROMPT = `Eres Logan, un asistente de voz personal — inteligente, directo y con personalidad, al estilo de Jarvis de Iron Man pero en español.

Reglas:
1. Respondes en español, de forma CONVERSACIONAL y BREVE (máximo 2-3 frases), porque tu respuesta se va a leer en voz alta.
2. Eres cercano, con un toque de personalidad y confianza, pero siempre útil.
3. NO uses markdown, listas con viñetas, ni formato — solo texto plano fluido, porque se convierte en voz.
4. Si te piden guardar una nota o recordatorio, confirma que lo harás de forma natural (ej: "Listo, lo anoté").
5. Si no sabes algo, dilo con honestidad y brevedad.
6. Puedes hacer cálculos, dar la hora aproximada, responder preguntas generales, y conversar.
7. Trata al usuario con familiaridad (es tu jefe/dueño).`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message = (body.message || "").trim();
    const history = Array.isArray(body.history) ? body.history.slice(-8) : [];

    if (!message) {
      return NextResponse.json({ error: "Mensaje vacío" }, { status: 400 });
    }

    const result = await callLLM({
      task: "assistant",
      systemPrompt: SYSTEM_PROMPT,
      userMessage: message,
      history,
      maxTokens: 500,
      temperature: 0.8,
    });

    return NextResponse.json({ response: result.text, provider: result.provider });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Error";
    console.error("[/api/voz] Error:", msg);
    return NextResponse.json(
      { error: "Logan no está disponible en este momento", response: "Disculpa, no pude procesar eso. Intenta de nuevo." },
      { status: 503 }
    );
  }
}
