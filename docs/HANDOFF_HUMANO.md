# Módulo de Handoff Humano (control bot/humano) — Guía técnica

**Referencia de decisión:** `DEC-LOGAN-021` (repo `logan`, `vision/VISION.md`).
**Qué es:** permitir que el negocio **apague el agente de IA y tome control manual** de una conversación con su cliente, en cualquier canal (web, WhatsApp, Instagram/Messenger), y lo vuelva a encender cuando quiera.

---

## 1. El concepto — "cerebro central"

El cliente NO le habla directo al bot. Le habla al **servidor de LOGAN**, que es el cerebro que decide quién responde:

```
      Cliente (web / WhatsApp / Instagram)
                    │
                    ▼
        ┌───────────────────────────┐
        │      SERVIDOR LOGAN         │
        │  estado de la conversación: │
        │     modo = "bot"  → IA      │
        │     modo = "humano" → panel │
        └───────────────────────────┘
             │                  │
      ┌──────▼──────┐    ┌──────▼───────────┐
      │  Agente IA  │    │  Panel del negocio │
      │  (/api/llm) │    │  (humano responde) │
      └─────────────┘    └────────────────────┘
```

- **`modo = bot`** → el servidor genera la respuesta con IA y la envía por el canal.
- **`modo = humano`** → el servidor NO llama a la IA; muestra el mensaje del cliente en el panel y espera que la persona escriba; su respuesta se envía por el mismo canal.

El "apagar/encender el agente" que ofrece la competencia **es exactamente este interruptor de estado**, guardado por conversación.

---

## 2. Cambio arquitectónico importante (vs. Asistente actual)

El Asistente IA actual (`src/lib/assistant/`) es **stateless**: guarda las sesiones **en memoria** (`session-store.ts`, un `Map`) y **no persiste nada** en la BD (por diseño — DEC-LOGAN-011).

El handoff **exige persistencia**, porque:
- El estado `bot/humano` debe sobrevivir entre requests y reinicios del servidor (en serverless, la memoria no se comparte entre invocaciones).
- El panel del negocio necesita **leer el historial** y ver "qué conversaciones están esperando atención humana".
- Varios agentes/humanos podrían atender.

Por eso `DEC-LOGAN-021` **autoriza persistencia acotada** al módulo de handoff (sin cambiar el resto del Asistente).

### Modelos nuevos (propuestos, Prisma)
```prisma
model Conversation {
  id         String   @id @default(cuid())
  projectId  String                 // multi-tenant: a qué proyecto/cliente pertenece
  channel    String                 // "web" | "whatsapp" | "instagram" | ...
  externalId String                 // id del cliente en ese canal (ej. su número E.164 en WhatsApp)
  mode       ConvMode @default(BOT)  // el INTERRUPTOR: BOT o HUMAN
  status     ConvStatus @default(OPEN)
  lastMessageAt DateTime @default(now())   // clave para la ventana de 24h de WhatsApp
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  messages   Message[]

  @@unique([projectId, channel, externalId])
  @@index([projectId, status])
}

model Message {
  id             String   @id @default(cuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id])
  sender         Sender   // CUSTOMER | BOT | HUMAN
  content        String
  createdAt      DateTime @default(now())

  @@index([conversationId, createdAt])
}

enum ConvMode   { BOT  HUMAN }
enum ConvStatus { OPEN  CLOSED  WAITING_HUMAN }
enum Sender     { CUSTOMER  BOT  HUMAN }
```
> ⚠️ Multi-tenant: al persistir con la extensión de Prisma (ver aprendizaje de restaurant-pos), inyectar `tenantId`/`projectId` en creates de nivel superior y **evitar nested creates** sobre tablas tenant-scoped.

---

## 3. Flujo por canal (mismo núcleo, distinto conector)

### 3.1 Chat web (Fase 1 — el más simple)
1. El widget manda `POST /api/handoff/message` con `{ projectId, externalId, text }`.
2. El servidor: busca/crea la `Conversation`, guarda el `Message` del CUSTOMER.
3. Si `mode = BOT` → llama a `/api/llm`, guarda y devuelve la respuesta del BOT.
4. Si `mode = HUMAN` → NO llama a la IA; marca `status = WAITING_HUMAN` y responde "en espera". El widget hace *polling* (o SSE/websocket) para recibir la respuesta del humano cuando llegue.
5. El panel del negocio:
   - Lista conversaciones (`GET /api/handoff/conversations?projectId=...`).
   - Alterna el interruptor (`PATCH /api/handoff/conversations/:id { mode }`).
   - Envía respuesta humana (`POST /api/handoff/conversations/:id/reply { text }`) → guarda `Message` HUMAN y lo entrega al cliente.

### 3.2 WhatsApp (Fase 2 — Cloud API oficial de Meta)
- **Entrada:** Meta llama al webhook (`POST /api/handoff/whatsapp/webhook`) con cada mensaje entrante. Ahí se ejecuta el mismo flujo del punto 3.1 (paso 2-4).
- **Salida:** para enviar (bot o humano) se hace `POST https://graph.facebook.com/vXX.0/<PHONE_NUMBER_ID>/messages` con Bearer token.
- **Regla de la ventana de 24h (Meta):**
  - Dentro de 24h del último mensaje del cliente → se puede enviar **texto libre** (bot y humano).
  - Fuera de 24h → solo **plantillas pre-aprobadas**. `lastMessageAt` en `Conversation` sirve para saber en qué caso estás y evitar el error `131047` (mensaje libre fuera de ventana).
- **Costos:** Meta cobra por conversación/mensaje y **ha ido cambiando su modelo** (p.ej. anuncios de cobro por mensajes de servicio dentro de la ventana). El módulo NO debe hardcodear supuestos de precio.

### 3.3 Instagram / Messenger (Fase 3)
- Mismo patrón: webhook de Meta + envío por Graph API. Cambia el conector, no el núcleo.

---

## 4. Endpoints propuestos (núcleo, canal-agnóstico)

| Método | Ruta | Para qué |
|--------|------|----------|
| `POST` | `/api/handoff/message` | Entrada genérica (web). Ejecuta el flujo bot/humano. |
| `POST` | `/api/handoff/whatsapp/webhook` | Entrada de WhatsApp (Meta). Reusa el núcleo. |
| `GET`  | `/api/handoff/conversations` | Panel: lista conversaciones (filtra por estado/espera). |
| `GET`  | `/api/handoff/conversations/:id` | Panel: historial de una conversación. |
| `PATCH`| `/api/handoff/conversations/:id` | Panel: cambiar `mode` (bot↔humano) — el interruptor. |
| `POST` | `/api/handoff/conversations/:id/reply` | Panel: enviar respuesta humana. |

> El "cerebro" (decidir bot/humano, persistir, llamar a `/api/llm` o al conector de canal) vive en `src/lib/handoff/`. Los conectores de canal en `src/lib/handoff/channels/{web,whatsapp,instagram}.ts`. Así el núcleo se escribe una vez.

---

## 5. Notificaciones ("cliente esperando")

Cuando `mode = HUMAN` (o cuando el handoff inteligente escala), el panel debe avisar. Opciones incrementales:
- **Fase 1:** *badge*/contador en el panel vía polling (simple).
- **Después:** push/email/WhatsApp al dueño del negocio.

---

## 6. Handoff inteligente (Fase 4 — opcional avanzado)
La IA puede decidir escalar a humano cuando detecta: cliente molesto, intención de compra alta, o pregunta fuera de su alcance. Se implementa como una **tool** en el flujo de `/api/llm` (function calling — ya soportado): la IA llama `escalar_a_humano(motivo)` → el servidor pone `status = WAITING_HUMAN` y notifica.

---

## 7. Frontera y notas
- Multi-tenant y multicanal **desde el día uno** → reutilizable en todos los clientes.
- Respetar la ventana de 24h de WhatsApp y ser agnóstico a los costos de Meta.
- No romper el Asistente actual (stateless): el handoff es un módulo aparte con su propia persistencia.

---

## Fuentes (investigación)
- WhatsApp Cloud API — envío de mensajes y regla de la ventana de 24h: [chatarmin](https://chatarmin.com/en/blog/whats-app-api-send-messages), [lorikeetcx](https://www.lorikeetcx.ai/articles/how-to-run-whatsapp-first-support-with-ai).
- Error 131047 (mensaje libre fuera de la ventana de 24h): [helo.ai](https://helo.ai/resources/blog/whatsapp-api-error-131047).
- Cambios de cobro de Meta dentro de la ventana de 24h (a partir de oct-2026): [peppercloud](https://blog.peppercloud.com/whatsapp-api-pricing-everything-you-need-to-know/), [conferbot](https://www.conferbot.com/limits/whatsapp).
- Patrón de human handoff con auto-resume: [n8n](http://www.n8n.io/workflows/11648-ai-whatsapp-support-with-human-handoff-using-gemini-twilio-and-supabase-rag/).

*Contenido reformulado y resumido para cumplimiento de licencias. Verificar siempre la documentación oficial de Meta, que cambia con frecuencia.*
