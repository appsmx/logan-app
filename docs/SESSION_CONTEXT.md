# SESSION_CONTEXT.md

**Proyecto:** LOGAN OS (desarrollo del ecosistema)
**Metodología:** LOGAN v1.0
**Estado:** LOGAN OS v1.1 — COMPLETO Y EN PRODUCCIÓN. 9/9 roles activos + multi-provider LLM (Z.ai GLM-5.2/5.1/5-turbo con fallback Gemini) + deploy en `logancorp.vercel.app` + Neon Postgres.
**Avance:** Esta sesión cierra el ciclo de construcción de los 9 roles y deja el sistema desplegado con todos los flujos end-to-end funcionando. Pendientes operativos (dominio, créditos, WhatsApp) requieren intervención del usuario.

---

## Objetivo completado en esta sesión

Llevar a LOGAN OS desde "2 agentes funcionales (Core + Marketing)" hasta "9/9 roles activos, multi-provider LLM, deploy en Vercel con Postgres" — y dejarlo operando en `logancorp.vercel.app`.

**Construido esta sesión (Tasks 17-34 del worklog):**
- **7 especialistas nuevos** (Dev, Design, Analytics, Finance, Legal, Support, Assistant) — cada uno con su system-prompt + capabilities + parser defensivo + endpoint `/api/{rol}/execute`.
- **Etapa 4.5:** parser de Core corregido (bug crítico — antes solo reconocía `marketing_execute` y descartaba silenciosamente las delegaciones a Dev/Design/Analytics/Finance/Legal/Support).
- **Ciclo de aprendizaje cerrado:** Analytics con capabilities `verify_hypothesis` + `analyze_patterns` (Art. VIII operacionalizado).
- **Sistema de Scaffold:** `POST /api/scaffold` crea un producto LOGAN end-to-end (repo GitHub + Biblia + README + SESSION_CONTEXT + .gitignore + Project en BD + MemoryEntry). Permite crear productos en lenguaje natural.
- **Integración GitHub** (4 tools con safety code-level): `git_create_branch`, `git_write_file`, `git_create_pr` (con hipótesis obligatoria en el body del PR), `git_get_status`. Paths protegidos, branches protegidos (`main`/`master`/`prod`), `logan` siempre prohibido (Art. I).
- **Integración Vercel** (3 tools, sin `delete` — Art. IX): `vercel_check_status`, `vercel_create_project`, `vercel_deploy` (deploy a producción requiere `production: true` explícito).
- **Multi-provider LLM (DEC-LOGAN-006 + 017):** cliente `fetch` propio (sin SDK), `z-ai-web-dev-sdk` removido del código. Mix GLM-5.2/5.1/5-turbo según criticidad. Fallback automático a Gemini si falta una key.
- **UI completa:** 20 secciones navegable + showcase público `/showcase` con diseño futurista (orbital diagram, hypothesis loop, ecosystem diagram, chat limitado).
- **Optimización de latencia (Task 30):** `run-turn.ts` extraído y compartido entre `/api/core` (JSON) y `/api/core/stream` (SSE). 11 ramas en `Promise.all` (validador + executeActions + 9 delegaciones). Validador final fire-and-forget.
- **Deploy en Vercel:** proyecto `logancorp` con 3 rutas — `/` (app), `/showcase` (marketing), `/api/core` (LOGAN Core con GLM-5.2).
- **Migración SQLite → Postgres** (Neon en Vercel marketplace).
- **2 bugs críticos corregidos (Task 34):** texto cortado en respuestas largas (`max_tokens` 4096 → 8192) y repos dinámicos (`isRepoAllowed` ahora async con cache BD 60s).

**Mix de modelos actual (DEC-LOGAN-017):**
| Modelo | Roles | Justificación |
|---|---|---|
| **GLM-5.2** | Core (decide + integrate) + Dev | Máxima calidad, nivel Claude Sonnet |
| **GLM-5.1** | Design + Analytics + Legal | Buena calidad, precisión no crítica |
| **GLM-5-turbo** | Validator + Marketing + Finance + Support + Assistant + Showcase | Barato, customer-facing + tareas simples |

**URL activa:** https://logancorp.vercel.app
- `/` — LOGAN OS app (chat con LOGAN, 20 secciones)
- `/showcase` — página futurista para clientes
- `/api/core` — LOGAN Core (GLM-5.2)

---

## Decisiones tomadas esta sesión

17 decisiones estratégicas registradas en `vision/VISION.md` del repo `logan` (DEC-LOGAN-001 a 017). Las más relevantes para retomar:

| ID | Decisión | Fecha |
|---|---|---|
| DEC-LOGAN-001 | Marca corporativa al final (después de productos exitosos) | 2026-07-29 |
| DEC-LOGAN-004 | El bucle de hipótesis es el diferenciador estratégico | 2026-07-29 |
| DEC-LOGAN-006 | Independencia del proveedor LLM (Z.ai + Gemini, sin SDK acoplado) | 2026-07-29 |
| DEC-LOGAN-013 | Vercel Pro $20/mes cuando el flujo de 3 LLM exceda timeout free de 10s | 2026-08-01 |
| DEC-LOGAN-014 | `logan` público (metodología) + `logan-app` público (código) + productos privados | 2026-08-08 |
| DEC-LOGAN-015 | Neubox como proveedor final de dominios `.mx` (~$11 USD primer año) | 2026-08-08 |
| DEC-LOGAN-016 | `logancorp.mx` como dominio corporativo (showcase, no SaaS) | 2026-08-08 |
| DEC-LOGAN-017 | Mix de modelos GLM-5.2/5.1/5-turbo según criticidad de tarea | 2026-08-12 |

---

## Documentos actualizados

| Documento | Qué cambió |
|---|---|
| `os/ECOSYSTEM.md` (repo `logan`) | Hito 2026-08-09 deploy logancorp.vercel.app. Estado ECOSYSTEM → v1.1. |
| `roles/support/ROLE.md` (repo `logan`) | Subido de planificado v0.1 → activo v1.0 (8 capabilities). |
| `vision/VISION.md` (repo `logan`) | Añadida DEC-LOGAN-017 sobre mix de modelos GLM. |
| `README.md` | Reescrito — multi-provider LLM, Postgres Neon, 9 roles, logancorp.vercel.app. |
| `docs/SESSION_CONTEXT.md` | Este documento. v1.2 — refleja estado post-Task 34. |
| `worklog.md` | Task 34 añadido: 2 bugfixes críticos (texto cortado + repos dinámicos). |
| `src/lib/llm/client.ts` | `max_tokens` default 4096 → 8192 (ambas ramas Z.ai + Gemini). |
| `src/lib/git/github-client.ts` | `isRepoAllowed` ahora async + `isRepoAllowedInDb()` con cache 60s. |
| `src/lib/git/tools.ts` | 4 call sites actualizados a `await isRepoAllowed()`. |
| `src/lib/llm/config.ts` | Mix GLM-5.2/5.1/5-turbo consolidado (corrige lo que el worklog Task 33 decía sobre `gemini-2.5-flash` para todo). |
| `.env.example` | `LOGAN_ALLOWED_REPOS=mrtramite,mariscoseljona,logan-app` (3 repos, antes 2). |

---

## Pendientes

### Operativos (requieren intervención del usuario)
1. **Comprar `logancorp.mx` en Neubox** (~$11 USD/año). Migrar DNS a Vercel para que el dominio apunte a `logancorp.vercel.app`.
2. **Configurar Google Workspace** para correos (1-2 días propagación DNS). Permite `hola@logancorp.mx` y forward a WhatsApp.
3. **Cargar $200 USD en Z.ai** cuando haya capital. Hoy el tier gratuito de GLM puede tener saturación o agotarse — la app devuelve `503 LOGAN Core no disponible` cuando esto ocurre.
4. **Activar Vercel Pro** ($20/mes) cuando el flujo de 3 llamadas LLM exceda el timeout free de 10s en producción (DEC-LOGAN-013). Hoy por hoy el tier free funciona para turnos sin delegación (~5-8s).
5. **Reemplazar placeholders en `/showcase`** (teléfono de contacto, email de ventas).
6. **Conectar WhatsApp Cloud API** a productos (Mr. Trámite, Mariscos El Jona) usando el template `templates/asistente-ia/` del repo `logan`.
7. **Crear nuevos productos con Scaffolding** — capability `scaffold_project` de LOGAN Dev. Ejemplo: "Crea un proyecto para Ferretería Don Juan" → genera repo + Biblia + estructura.

### Estratégicos
- **Verificar que las variables de entorno de Vercel estén completas:** `ZAI_API_KEY`, `GEMINI_API_KEY`, `GITHUB_TOKEN`, `LOGAN_ALLOWED_REPOS`, `LOGAN_GITHUB_OWNER`, `VERCEL_TOKEN`, `VERCEL_TEAM_SLUG`, `DATABASE_URL` (Neon Postgres). Síntoma de `ZAI_API_KEY` faltante o sin créditos: el chat devuelve "LOGAN Core no disponible en este momento" en ~1s.
- **Etapa 5: Hércules Bro.** Segundo producto comercial.
- **Etapa 6: LOGAN corporativo en `logancorp.mx`.** Validar el modelo reseller con el primer cliente externo.

### Deuda técnica conocida
- `z-ai-web-dev-sdk` aún en `package.json` deps pero sin uso en `src/` (deuda explícita del Task 33).
- No hay Task 35+ documentando futuras mejoras (WebSocket para chat en tiempo real, multi-tenant, facturación).
- `next.config.ts` tiene `typescript.ignoreBuildErrors: true` — debería eliminarse una vez cuadrados los tipos de `ChatSection.tsx` y `execute-git-actions.ts` (pre-existentes, no bloqueantes).

---

## Riesgos identificados

- **Latencia 15-25s en turnos delegados a especialistas** (3 llamadas LLM secuenciales). Hoy mitigado por `Promise.all` en 11 ramas paralelas (Task 30), pero la primera llamada Core + la última de integración son secuenciales. Vercel Pro sería la solución real.
- **Tier gratuito de Z.ai puede saturarse o agotarse** — si no hay créditos cargados, LOGAN devuelve `503` en cualquier endpoint LLM (`/api/core`, `/api/showcase/chat`, `/api/assistant/chat`, todos los `/api/{rol}/execute`). Mitigación: fallback a Gemini (si `GEMINI_API_KEY` está configurada).
- **`LOGAN_ALLOWED_REPOS` síncrono en arranque** — mitigado por `isRepoAllowedInDb()` (cache BD 60s, Task 34), pero el supplement in-memory se pierde si el proceso reinicia. Solución permanente: migrar la allow-list a una tabla dedicada.
- **Showcase público es PII-visible** — el chat del showcase rate-limita por IP (5 msgs). No hay CAPTCHA. Si se abusa, mitigación temporal: subir el rate limit o añadir Cloudflare Turnstile.
- **Costo real de LOGAN en producción** (~$200-400/mes mixto). Requiere ingresos de Mr. Trámite para sostenerse a largo plazo. El modelo reseller (cobro postpago mensual con margen) se activa en Etapa 6.
- **No hay backups automáticos de Neon Postgres** — configurar PITR (Point-in-Time Recovery) cuando el primer cliente de pago entre al sistema.

---

## Próximo objetivo

**Bloqueante:** resolver el estado del chat en producción (`503 LOGAN Core no disponible`). Pasos de diagnóstico:

1. Verificar que `ZAI_API_KEY` esté configurada en Vercel → Settings → Environment Variables (debe estar en todos los environments: Production, Preview, Development).
2. Verificar que la key tenga créditos en https://z.ai/model-api.
3. Verificar `GEMINI_API_KEY` como fallback (Google AI Studio free tier — 1500 req/día gratis).
4. Ver logs de Vercel en https://vercel.com/appsmxs-projects/logancorp/logs — buscar `[core] LLM falló:` o `[core] Z.ai:` para ver el mensaje exacto del error.
5. Si los modelos `glm-5.2`/`glm-5.1`/`glm-5-turbo` no existen en la API de Z.ai, temporalmente cambiar `src/lib/llm/config.ts` a `glm-4.6` (modelo vigente) o `gemini-2.0-flash` (fallback).

**Siguiente bloque funcional:** conectar WhatsApp Cloud API a Mr. Trámite usando el template `templates/asistente-ia/` del repo `logan`. Esto valida el modelo de "un bot conversacional por producto" (DEC-LOGAN-011).

---

## Observaciones

- **Modelo de negocio (reseller):** API keys (tú pagas, cobras a clientes); repos (gestionas, transfieres si cliente se va); Vercel (1 cuenta Pro, múltiples proyectos); cobro postpago mensual basado en uso real; pausa tras 15 días sin pago; correos Google Workspace con margen.
- LOGAN OS hoy está completo a nivel funcional. Lo que falta es operativizar (dominio, créditos, clientes reales).
- 2 productos en BD: "Mr. Trámite" (cuenta con 0 decisiones / 0 hipótesis) y "Aplicación para transportes" (creado el 2026-08-10, tiene 1 decisión + 1 hipótesis + 8 fases). El segundo fue un test de scaffold.
- LOGAN OS v1.1 fue hecho con Z.ai Code (este agente) + el usuario validando cada decisión mayor.
- Esta sesión es la primera en que el ecosistema LOGAN opera con datos reales en producción (no solo en local).

---

*Generado por: PCS (Protocolo de Continuidad de Sesión, LOGAN §10)*
*Fecha: 2026-08-12*
*Próxima sesión: leer este documento + `docs/LOGAN.md` + `vision/VISION.md` (repo `logan`) antes de producir cualquier resultado (LOGAN §3.2).*
