# LOGAN OS

**Sistema operativo de IA que coordina múltiples agentes especializados para crear, administrar y hacer crecer empresas digitales.**

LOGAN evolucionó de una metodología (`LOGAN.md`, v1.0, la Constitución) a un sistema operativo de agentes: Core (orquesta), Memory (prepara contexto) y 7 especialistas (Marketing, Dev, Design, Analytics, Finance, Legal, Support). Todos comparten una Constitución, una metodología y una sola voz frente al usuario.

> **El diferenciador:** toda decisión de un especialista deja constancia de *por qué* se tomó (una hipótesis verificable). Analytics verifica con el tiempo. Si se refuta, LOGAN aprende y actualiza su estrategia. El activo acumulado con los años son las hipótesis verificadas, no el código.

> **Estado actual (v0.2.1):** LOGAN OS v1.1 — completo y en producción en `logancorp.vercel.app`. 9/9 roles activos + multi-provider LLM (GLM-5.2/5.1/5-turbo vía Z.ai, Gemini fallback) + Neon Postgres + integraciones GitHub (4 tools) y Vercel (3 tools).

## Estructura del repositorio

```
logan-app/
├── docs/
│   ├── LOGAN.md                  ← la Constitución (10 artículos — máxima autoridad)
│   ├── LOGAN_OS_v0.1.md          ← el diseño de LOGAN OS (decisiones estratégicas)
│   └── SESSION_CONTEXT.md        ← estado de la sesión actual (PCS, LOGAN §10)
├── prisma/schema.prisma          ← 16 modelos: Project, Vision, Decision, Hypothesis,
│                                    SessionContext, PhaseProgress, Audit, Discovery,
│                                    MemoryEntry, GitAction, VercelAction + 6 *Asset
├── src/
│   ├── app/
│   │   ├── page.tsx              ← la app LOGAN OS (20 secciones navegable)
│   │   ├── showcase/             ← página pública de marketing (/showcase)
│   │   ├── layout.tsx            ← root layout con ThemeProvider + Toaster
│   │   └── api/                  ← ~30 endpoints REST + SSE
│   ├── components/
│   │   ├── logan/                ← Sidebar, Header, ChatSection, 20 secciones
│   │   └── ui/                   ← ~50 componentes shadcn/ui (Radix)
│   └── lib/
│       ├── core/                 ← run-turn, system-prompt, memory-report,
│       │                            constitutional-validator, execute-actions
│       ├── {marketing,dev,design,analytics,finance,legal,support}/  ← 7 especialistas
│       ├── assistant/            ← bot customer-facing WhatsApp (DEC-LOGAN-011)
│       ├── showcase/              ← chat limitado del showcase público
│       ├── scaffold/              ← creación de productos end-to-end
│       ├── git/                   ← 4 tools GitHub (create_branch, write_file, create_pr, get_status)
│       ├── vercel/                ← 3 tools Vercel (check_status, create_project, deploy)
│       ├── llm/                   ← cliente LLM agnóstico (Z.ai + Gemini)
│       └── logan-os-data.ts      ← Constitución + manual OS + roles + fases (estático)
├── examples/websocket/           ← demo genérico Socket.IO (no usado por la app)
└── worklog.md                    ← historial de construcción (34 tasks)
```

## Cómo correrlo en local

```bash
bun install
cp .env.example .env
# editar .env con ZAI_API_KEY, GEMINI_API_KEY, GITHUB_TOKEN, DATABASE_URL, etc.
bun run db:push     # sincroniza el schema con tu Postgres/SQLite
bun run dev          # http://localhost:3000
```

> **DB:** el `.env.example` sugiere `DATABASE_URL="file:./db/custom.db"` para dev local (SQLite). En producción usamos Postgres en Neon.

## Cómo hablar con LOGAN Core

Desde la app: selecciona/crea un proyecto → sección "Hablar con LOGAN".

Desde curl (con SSE streaming, recomendado):
```bash
PROJECT_ID=$(curl -s http://localhost:3000/api/projects | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
curl -N -X POST http://localhost:3000/api/core/stream \
  -H 'Content-Type: application/json' \
  -H 'Accept: text/event-stream' \
  -d "{\"projectId\":\"$PROJECT_ID\",\"message\":\"Hola LOGAN. ¿Qué eres?\"}"
```

Versión JSON simple (sin streaming):
```bash
curl -X POST http://localhost:3000/api/core \
  -H 'Content-Type: application/json' \
  -d "{\"projectId\":\"$PROJECT_ID\",\"message\":\"Hola LOGAN\"}" | python3 -m json.tool
```

Cada turno: Core lee la Constitución + la Biblia del proyecto + el reporte de Memory, responde en voz LOGAN, registra Decisiones/Hipótesis en la BD, y un **validador constitucional** (segunda llamada al LLM) verifica la respuesta contra los 10 artículos. Si detecta una posible violación, la marca en la respuesta — pero no la bloquea (Art. VII/IX: el humano decide).

## Stack

- **Framework:** Next.js 16.1.1 (App Router, standalone output) + React 19 + TypeScript (strict)
- **Estilos:** Tailwind CSS 4 + shadcn/ui (Radix UI) + framer-motion
- **BD/ORM:** Prisma 6.11 + PostgreSQL (Neon en producción, SQLite en dev local)
- **Estado:** Zustand (UI) + TanStack Query v5 (caché servidor) + next-themes (light/dark)
- **LLM:** Multi-provider vía `src/lib/llm/` (DEC-LOGAN-006):
  - **Z.ai primario** — GLM-5.2 (Core+Dev), GLM-5.1 (Design+Analytics+Legal), GLM-5-turbo (Validator+Marketing+Finance+Support+Assistant+Showcase) — ver DEC-LOGAN-017
  - **Gemini fallback** — `gemini-2.0-flash` (Google AI Studio free tier)
- **Otras deps:** react-markdown, react-syntax-highlighter, sonner (toasts), recharts, dnd-kit, cmdk, react-hook-form, zod
- **Runtime:** Bun (dev), Vercel (prod)
- **Proxy:** Caddy (puerto `:81` con patrón `?XTransformPort=N` para forward dinámico)

## Decisiones estratégicas

17 decisiones vigentes (DEC-LOGAN-001 a 017) registradas en `vision/VISION.md` del repo `logan`. Algunas relevantes:

- **DEC-LOGAN-001:** marca corporativa al final (después de productos exitosos).
- **DEC-LOGAN-004:** el bucle de hipótesis es el diferenciador estratégico.
- **DEC-LOGAN-006:** independencia del proveedor LLM (Z.ai + Gemini, sin SDK acoplado).
- **DEC-LOGAN-013:** Vercel Pro ($20/mes) cuando el flujo de 3 llamadas LLM exceda el timeout de 10s del tier free.
- **DEC-LOGAN-014:** repos separados — `logan` (metodología) público + `logan-app` (este repo) + productos privados.
- **DEC-LOGAN-016:** `logancorp.mx` como dominio corporativo (showcase ilustrativo, no SaaS).
- **DEC-LOGAN-017:** mix de modelos GLM-5.2/5.1/5-turbo según la criticidad de cada tarea.

## Estado

- ✅ Etapa 1 (LOGAN OS interno) — cerrada.
- ✅ Etapa 2 (LOGAN Core funcional) — cerrada.
- ✅ Etapa 3 (LOGAN Marketing funcional) — cerrada.
- ✅ Etapa 4-4.5 (Mr. Trámite + Dev/Design/Analytics/Finance/Legal/Support) — cerradas.
- ✅ Deploy en Vercel (`logancorp.vercel.app`) + Neon Postgres + multi-provider LLM.
- ⏳ Etapa 5 (Hércules Bro) — pendiente.
- ⏳ Etapa 6 (LOGAN corporativo en `logancorp.mx`) — pendiente (deploy del dominio).

## Fuente

- Constitución: `docs/LOGAN.md` (de https://github.com/appsmx/logan, v1.0, Oficial).
- Diseño LOGAN OS: `docs/LOGAN_OS_v0.1.md` + `vision/VISION.md` (repo `logan`).
- Estado de sesión: `docs/SESSION_CONTEXT.md`.

*LOGAN · Learning, Organization, Governance, Architecture & Navigation*
