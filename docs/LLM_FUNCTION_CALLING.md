# Function Calling en el proxy LLM de LOGAN

**Estado:** Oficial
**Propósito:** Documentar cómo cualquier proyecto del ecosistema LOGAN da a su
agente de IA la capacidad de **ejecutar acciones** (no solo conversar) usando el
proxy central `/api/llm`, sin reimplementar la mecánica de function calling ni
manejar API keys propias.
**Fecha:** 2026-09-06

---

## 1. Qué es y por qué está en LOGAN

El **function calling** (o "tools") permite que el modelo, en medio de una
conversación, decida invocar una función definida por tu proyecto —por ejemplo
`crear_pedido`, `agendar_cita`, `consultar_estado`— y que tu código la ejecute
de verdad. El modelo no ejecuta nada por sí mismo: **propone** una llamada con
argumentos estructurados; tu servidor la ejecuta y le devuelve el resultado para
que redacte la respuesta final al usuario.

Siguiendo el Artículo I (el conocimiento es un activo) y la independencia de
proveedor (DEC-LOGAN-006), esta capacidad vive **una sola vez en el proxy**
(`/api/llm`), no en cada proyecto. El proxy traduce el formato de tools al de
cada proveedor de la cascada (OpenAI-compatibles y Gemini), de modo que tu
proyecto usa un único contrato sin importar qué modelo responda.

**Retrocompatibilidad:** si tu petición no incluye `tools`, el proxy se comporta
exactamente como siempre (solo texto). No hay que cambiar nada en proyectos que
no usen tools.

---

## 2. El contrato

### Request (campos nuevos, ambos opcionales)

```jsonc
{
  "task": "assistant",
  "systemPrompt": "…",
  "userMessage": "…",
  "history": [ /* mensajes previos, ver §4 */ ],
  "tools": [ /* LLMTool[], ver abajo */ ],
  "toolChoice": "auto"   // "auto" (default) | "none" | { type:"function", function:{ name } }
}
```

Una **tool** se define en formato OpenAI (el proxy lo traduce a Gemini solo):

```jsonc
{
  "type": "function",
  "function": {
    "name": "crear_pedido",
    "description": "Cuándo usarla y qué hace. Sé explícito: el modelo decide con esto.",
    "parameters": {
      "type": "object",
      "properties": {
        "customerName": { "type": "string", "description": "…" },
        "items": {
          "type": "array",
          "items": { "type": "object", "properties": { /* … */ }, "required": ["…"] }
        }
      },
      "required": ["customerName", "items"]
    }
  }
}
```

### Response (campo nuevo)

Cuando el modelo decide invocar una tool, la respuesta incluye `toolCalls` (y
`text` puede venir vacío):

```jsonc
{
  "text": "",
  "provider": "gemini",
  "model": "gemini-2.5-flash",
  "toolCalls": [
    {
      "id": "call_abc123",
      "type": "function",
      "function": {
        "name": "crear_pedido",
        "arguments": "{\"customerName\":\"Julián\",\"items\":[…]}"  // string JSON
      }
    }
  ]
}
```

> `arguments` siempre es un **string JSON**: parséalo con `JSON.parse` y valida.

---

## 3. El bucle de ejecución (lado del proyecto)

El patrón son **dos llamadas** al proxy:

1. **Decidir:** mandas `systemPrompt + history + userMessage + tools`.
   - Si vuelve solo `text` → es la respuesta al usuario. Fin.
   - Si vuelve `toolCalls` → ve al paso 2.
2. **Ejecutar y redactar:** por cada tool call, ejecutas tu función y agregas al
   `history`: (a) el turno `assistant` con `tool_calls`, y (b) un turno
   `role: "tool"` con el resultado. Luego llamas al proxy **de nuevo** (esta vez
   normalmente sin `tools`) para que redacte el mensaje final al usuario.

Pseudocódigo:

```ts
const first = await callLLM({ systemPrompt, history, userMessage, tools });

if (first.toolCalls?.length) {
  const messages = [
    ...history,
    { role: "user", content: userMessage },
    { role: "assistant", content: first.text || "", tool_calls: first.toolCalls },
  ];

  for (const tc of first.toolCalls) {
    const args = JSON.parse(tc.function.arguments || "{}");
    const result = await ejecutarTool(tc.function.name, args); // TU lógica
    messages.push({
      role: "tool",
      tool_call_id: tc.id,
      name: tc.function.name,
      content: result, // string con el resultado (ej. "Pedido MEJ-2026-0042 creado")
    });
  }

  const final = await callLLM({ systemPrompt, history: messages }); // sin tools
  return final.text;
}

return first.text;
```

---

## 4. Formato de los mensajes de historial

Para que el modelo entienda la ronda de tools, el `history` admite estos roles:

| role        | campos                                   | significado                              |
|-------------|------------------------------------------|------------------------------------------|
| `user`      | `content`                                | mensaje del usuario                      |
| `assistant` | `content`                                | respuesta de texto del modelo            |
| `assistant` | `content` + `tool_calls`                 | el modelo pidió ejecutar herramientas    |
| `tool`      | `content` + `tool_call_id` + `name`      | resultado que TU código devuelve         |

El proxy traduce esto al formato de cada proveedor (en Gemini: `functionCall` /
`functionResponse` con rol `model` / `function`).

---

## 5. Reglas de diseño (aprendidas en Mariscos Quiroa)

1. **El servidor manda, no el modelo.** Datos sensibles —precios, totales,
   stock— se resuelven en TU código desde la fuente de verdad (BD/catálogo),
   nunca a partir de lo que el modelo escriba en los argumentos. En
   `crear_pedido`, el modelo solo aporta producto/presentación/cantidad; el
   precio y el total los calcula el servidor.
2. **Descripciones explícitas de cuándo usar la tool.** El `description` de la
   función es lo que usa el modelo para decidir. Di claramente cuándo SÍ y
   cuándo NO (ej. "solo cuando el cliente CONFIRME; no para cotizar").
3. **Confirma con datos reales.** Tras ejecutar, devuelve al modelo el
   identificador real (ej. el código `MEJ-2026-XXXX`) e instrúyelo a usar ESE,
   nunca a inventarlo.
4. **Degradación segura.** Si el proveedor no soporta tools o el proxy las
   ignora, tu código debe seguir funcionando como chat de solo texto. El
   fallback local debe recibir el historial y, ante una confirmación, derivar a
   un humano en vez de fingir amnesia.
5. **Cuida el tiempo.** Function calling son **dos llamadas LLM secuenciales**.
   En webhooks serverless (Vercel), sube `maxDuration` con holgura y mantén el
   timeout individual de cada llamada por debajo del total.
6. **Proveedores que las soportan.** El proxy salta automáticamente los
   proveedores sin soporte fiable de tools cuando la petición las trae. Si tu
   caso es crítico, prioriza un `task` cuyo primario soporte tools.

---

## 6. Ejemplo de referencia

La primera implementación real de este patrón es la tool **`crear_pedido`** del
agente de Mariscos Quiroa (repo `appsmx/mariscosquiroa`, `src/lib/ai-agent.ts`),
que registra pedidos reales desde WhatsApp, Messenger, Instagram y la web. Úsala
como plantilla para nuevas tools en otros proyectos (restaurant-pos, etc.).
