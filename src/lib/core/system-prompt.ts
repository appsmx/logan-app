// LOGAN Core — system prompt builder (optimizado para reducir tokens).
// Versión reducida: solo lo esencial para funcionar bien.
// Ahorro: ~70% tokens vs versión completa.

import { CONSTITUTION_ARTICLES, ROLES, AUTHORITY_HIERARCHY } from "@/lib/logan-os-data";
import { listAllowedRepos } from "@/lib/git/github-client";
import type { ProjectBibliaContext } from "./types";

function parseUsers(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
    return [];
  } catch { return []; }
}

// Constitución resumida — solo el título + 1 frase de cada artículo
function renderConstitutionSummary(): string {
  const lines: string[] = ["## Constitución de LOGAN (resumen)", ""];
  for (const a of CONSTITUTION_ARTICLES) {
    lines.push(`**Art. ${a.roman}:** ${a.title}`);
  }
  lines.push("", "Regla clave: la documentación precede al desarrollo (Art. II). La simplicidad tiene prioridad (Art. III). La IA propone, el humano decide (Art. IX).");
  return lines.join("\n");
}

// Roles resumidos — solo nombre + tagline
function renderRolesSummary(): string {
  const lines: string[] = ["## Roles disponibles", ""];
  for (const r of ROLES) {
    lines.push(`- **${r.name}** (${r.status}): ${r.tagline}`);
  }
  return lines.join("\n");
}

const STATIC_HEADER = [
  "# LOGAN Core — Orquestador",
  "",
  "Eres LOGAN Core, el orquestador del ecosistema LOGAN OS. Tu trabajo: comprender la solicitud del usuario, decidir qué hacer, delegar a especialistas cuando sea necesario, e integrar resultados en una sola voz coherente.",
  "",
  "**Reglas:**",
  "- Respondes en español.",
  "- El usuario siempre habla con LOGAN (una sola voz).",
  "- No ejecutas trabajo especializado — delegas.",
  "- Toda decisión importante se registra (DEC-XXX).",
  "- Toda salida de especialista lleva hipótesis verificable.",
  "- Si la solicitud viola la Constitución, señálalo (Art. VII).",
  "- Eres honesto: si no sabes algo, dilo.",
  "",
].join("\n");

const STATIC_CONSTITUTION = renderConstitutionSummary();
const STATIC_ROLES = renderRolesSummary();

function renderBiblia(project: ProjectBibliaContext): string {
  const users = parseUsers(project.users);
  const repoLine = project.repo
    ? `**Repositorio:** ${project.repo}`
    : "**Repositorio:** (no configurado)";

  const lines: string[] = [
    `## Proyecto activo: ${project.name}`,
    "",
    repoLine,
    "",
  ];
  if (project.vision?.trim()) lines.push(`**Visión:** ${project.vision.trim()}`, "");
  if (users.length > 0) {
    lines.push("**Usuarios objetivo:**");
    for (const u of users) lines.push(`- ${u}`);
    lines.push("");
  }
  lines.push(`**Estado:** ${project.status} | **Fase:** ${project.currentPhase}/8 | **Modo:** ${project.currentMode}`, "");
  return lines.join("\n");
}

function renderResponseFormat(project: ProjectBibliaContext): string {
  const repoExample = project.repo || "mrtramite";
  const allowedList = listAllowedRepos().join(", ") || "mrtramite";

  return [
    "## Formato de respuesta (OBLIGATORIO)",
    "",
    "Responde SOLO con un JSON válido (sin markdown, sin texto fuera del JSON):",
    "```json",
    "{",
    '  "response": "Tu respuesta al usuario en español, voz LOGAN.",',
    '  "actions": [',
    "    { \"type\": \"register_decision\", \"roleId\": \"core\", \"title\": \"...\", \"problem\": \"...\", \"alternatives\": [\"...\", \"...\"], \"decision\": \"...\", \"justification\": \"...\", \"consequences\": \"...\", \"status\": \"aprobada\" },",
    "    { \"type\": \"register_hypothesis\", \"roleId\": \"...\", \"context\": \"...\", \"hypothesis\": \"...\", \"prediction\": \"...\" },",
    `    { \"type\": \"marketing_execute\", \"capability\": \"create_meta_campaigns\", \"brief\": \"...\" },`,
    `    { \"type\": \"dev_execute\", \"capability\": \"...\", \"brief\": \"...\" },`,
    `    { \"type\": \"git_create_branch\", \"repo\": \"${repoExample}\", \"branchName\": \"feature/...\", \"fromBranch\": \"main\" },`,
    `    { \"type\": \"git_write_file\", \"repo\": \"${repoExample}\", \"branch\": \"feature/...\", \"path\": \"...\", \"content\": \"...\", \"commitMessage\": \"feat: ...\" },`,
    `    { \"type\": \"git_create_pr\", \"repo\": \"${repoExample}\", \"branch\": \"feature/...\", \"title\": \"...\", \"body\": \"...\", \"hypothesisContext\": \"...\", \"hypothesis\": \"...\", \"hypothesisPrediction\": \"...\" },`,
    `    { \"type\": \"scaffold_project\", \"productName\": \"...\", \"productSlug\": \"...\", \"vision\": \"...\", \"users\": [\"...\"], \"repoMode\": \"existing\", \"repoName\": \"...\" }`,
    "  ],",
    '  "constitutional_check": { "approved": true, "violated_article": null, "note": "" },',
    '  "session_update": { "advance": "...", "pending": "...", "nextObjective": "...", "risks": "..." }',
    "}",
    "```",
    "",
    "**Reglas del formato:**",
    "- `actions` puede ser vacío `[]` si no hay decisión importante.",
    `- Repos permitidos: ${allowedList}`,
    "- NO modifiques el repo 'logan' (metodología).",
    "- NO escribas en main/master — siempre branch + PR.",
    "- Paths protegidos: LOGAN.md, README.md, .env, schema.prisma, os/, vision/, roles/.",
    "- Commits deben empezar con: feat:, fix:, docs:, chore:.",
    "- Branches deben empezar con: feature/, fix/, docs/.",
    "",
  ].join("\n");
}

export function buildSystemPrompt(
  biblia: ProjectBibliaContext,
  memoryReport: string,
): string {
  return [
    STATIC_HEADER,
    STATIC_CONSTITUTION,
    STATIC_ROLES,
    renderBiblia(biblia),
    "## Reporte de Memory",
    "",
    memoryReport,
    "",
    renderResponseFormat(biblia),
  ].join("\n");
}

// System prompt para la integración (segunda llamada de Core)
export const INTEGRATION_SYSTEM_PROMPT = [
  "Eres LOGAN Core. Recibiste el trabajo de especialistas y debes integrarlo",
  "en una respuesta coherente al usuario, en una sola voz LOGAN.",
  "",
  "Reglas:",
  "- Responde en español.",
  "- NO inventes información que no esté en el trabajo del especialista.",
  "- Si el especialista no lo mencionó, no lo agregues.",
  "- Mantén la respuesta concisa y directa.",
].join("\n");

export function buildIntegrationUserPrompt(
  userMessage: string,
  deliverables: { capabilityLabel: string; title: string; content: string }[],
): string {
  const parts = [
    `**Mensaje del usuario:** ${userMessage}`,
    "",
    "**Trabajo de especialistas:**",
  ];
  for (const d of deliverables) {
    parts.push(`### ${d.capabilityLabel}: ${d.title}`, "", d.content, "");
  }
  return parts.join("\n");
}
