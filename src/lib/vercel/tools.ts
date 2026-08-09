// LOGAN Vercel tools — the 3 tool implementations with safety checks.
//
// Safety invariants enforced HERE (the last line of defense before the
// Vercel API call). Core's system-prompt also instructs the LLM, but the
// LLM is not trusted to police itself — these checks are non-negotiable.
//
//   vercel_check_status:
//     - Read-only. Validates projectName format (lowercase, hyphens, 3-40).
//
//   vercel_create_project:
//     - repo MUST be in LOGAN_ALLOWED_REPOS (reuse isRepoAllowed from git).
//     - projectName MUST be valid (lowercase, hyphens, 3-40 chars).
//     - rootDirectory (if set) MUST be a relative path with no ".." traversal.
//
//   vercel_deploy:
//     - projectName MUST already exist (we call check_status first).
//     - target="production" requires the caller to pass production=true
//       explicitly. Default is "preview" UNLESS branch is "main" AND the
//       user explicitly asked for production (Art. IX — the human decides).
//
// What LOGAN CANNOT do:
//   ❌ Delete Vercel projects (no vercel_delete tool — Art. IX).
//   ❌ Modify env vars whose name contains KEY | TOKEN | SECRET | PASSWORD.
//   ❌ Promote to production without an explicit user request.

import { vercelFetch } from "@/lib/vercel/client";
import { isRepoAllowed, getOwner, listAllowedRepos } from "@/lib/git/github-client";
import type {
  VercelApiProject, VercelApiDeployment,
  VercelCheckStatusInput, VercelCheckStatusResult,
  VercelCreateProjectInput, VercelCreateProjectResult,
  VercelDeployInput, VercelDeployResult,
} from "@/lib/vercel/types";

// ─── Safety constants ────────────────────────────────────────────────────────

const PROJECT_NAME_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

/** Env-var name pattern that is protected from modification by LOGAN. */
export const PROTECTED_ENV_PATTERNS = [/KEY/i, /TOKEN/i, /SECRET/i, /PASSWORD/i];

export function isValidProjectName(name: string): boolean {
  if (typeof name !== "string") return false;
  if (!PROJECT_NAME_RE.test(name)) return false;
  // Reject names with consecutive hyphens or trailing/leading hyphens (already
  // enforced by the regex, but be explicit).
  if (name.includes("--")) return false;
  return true;
}

export function isEnvVarProtected(name: string): boolean {
  return PROTECTED_ENV_PATTERNS.some((re) => re.test(name));
}

function validateRootDirectory(root: string | undefined): string {
  if (!root) return ".";
  const trimmed = root.trim();
  if (!trimmed) return ".";
  // Reject absolute paths or any ".." segment (path traversal).
  if (trimmed.startsWith("/")) throw new Error("rootDirectory no puede ser absoluto.");
  if (trimmed.startsWith("..")) throw new Error("rootDirectory no puede contener '..'.");
  if (trimmed.split("/").some((seg) => seg === "..")) {
    throw new Error("rootDirectory no puede contener segmentos '..'.");
  }
  return trimmed;
}

// ─── Tool 1: vercel_check_status ─────────────────────────────────────────────

export async function vercelCheckStatus(
  input: VercelCheckStatusInput,
): Promise<VercelCheckStatusResult> {
  const projectName = (input.projectName || "").trim().toLowerCase();
  if (!isValidProjectName(projectName)) {
    throw new Error(
      `projectName inválido: "${projectName}". Debe tener 3-40 caracteres, solo minúsculas y guiones.`,
    );
  }

  // GET /v9/projects/{name} returns the project (or 404 if it doesn't exist).
  let project: VercelApiProject | null = null;
  try {
    project = await vercelFetch<VercelApiProject>(`/v9/projects/${encodeURIComponent(projectName)}`);
  } catch (e) {
    // 404 = project doesn't exist — return a clean "exists:false" result.
    const msg = (e as Error).message || "";
    if (msg.includes("Vercel API 404")) {
      return { projectName, exists: false };
    }
    throw e;
  }

  if (!project?.id) {
    return { projectName, exists: false };
  }

  // Build the alias URL (production *.vercel.app URL).
  const alias = project.aliases?.find((a) => a?.alias)?.alias || "";
  const lastDeploy = project.latestDeployments?.[0];

  return {
    projectName,
    exists: true,
    projectId: project.id,
    url: alias ? `https://${alias}` : undefined,
    productionDomain: alias || null,
    lastDeploy: lastDeploy
      ? {
          state: lastDeploy.readyState || lastDeploy.state || "UNKNOWN",
          createdAt: lastDeploy.createdAt
            ? new Date(lastDeploy.createdAt).toISOString()
            : "",
          url: lastDeploy.url ? `https://${lastDeploy.url}` : "",
          target: lastDeploy.target ?? undefined,
        }
      : null,
  };
}

// ─── Tool 2: vercel_create_project ────────────────────────────────────────────

export async function vercelCreateProject(
  input: VercelCreateProjectInput,
): Promise<VercelCreateProjectResult> {
  const projectName = (input.projectName || "").trim().toLowerCase();
  const repo = (input.repo || "").trim();
  const rootDirectory = validateRootDirectory(input.rootDirectory);

  if (!isValidProjectName(projectName)) {
    throw new Error(
      `projectName inválido: "${projectName}". Debe tener 3-40 caracteres, solo minúsculas y guiones.`,
    );
  }
  if (!isRepoAllowed(repo)) {
    throw new Error(
      `Repositorio "${repo}" no permitido. LOGAN solo puede crear proyectos de Vercel para: ${listAllowedReposJoined()}.`,
    );
  }

  // Check if the project already exists (idempotent — return existing if so).
  try {
    const existing = await vercelFetch<VercelApiProject>(
      `/v9/projects/${encodeURIComponent(projectName)}`,
    );
    if (existing?.id) {
      const alias = existing.aliases?.find((a) => a?.alias)?.alias;
      return {
        projectName,
        projectId: existing.id,
        url: alias ? `https://${alias}` : undefined,
        repo,
      };
    }
  } catch (e) {
    const msg = (e as Error).message || "";
    if (!msg.includes("Vercel API 404")) {
      // Any error other than 404 is a real failure — surface it.
      throw e;
    }
  }

  // Create the project via POST /v10/projects.
  // Vercel rejects rootDirectory="." — only send the field if it's a real
  // subdirectory (e.g. "apps/web"). Default (no field) = repo root.
  const fullRepo = `${getOwner()}/${repo}`;
  const body: Record<string, unknown> = {
    name: projectName,
    gitRepository: {
      type: "github",
      repo: fullRepo,
    },
  };
  if (rootDirectory && rootDirectory !== ".") {
    body.rootDirectory = rootDirectory;
  }

  const created = await vercelFetch<VercelApiProject>(`/v10/projects`, {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!created?.id) {
    throw new Error("Vercel no devolvió el ID del proyecto creado.");
  }

  // The first alias (production *.vercel.app URL) may or may not exist yet.
  const alias = created.aliases?.find((a) => a?.alias)?.alias;
  const lastDeploy = created.latestDeployments?.[0];
  return {
    projectName,
    projectId: created.id,
    url: alias ? `https://${alias}` : (lastDeploy?.url ? `https://${lastDeploy.url}` : undefined),
    repo,
  };
}

// ─── Tool 3: vercel_deploy ────────────────────────────────────────────────────

export async function vercelDeploy(input: VercelDeployInput): Promise<VercelDeployResult> {
  const projectName = (input.projectName || "").trim().toLowerCase();
  const branch = (input.branch || "main").trim();
  const production = input.production === true;

  if (!isValidProjectName(projectName)) {
    throw new Error(
      `projectName inválido: "${projectName}". Debe tener 3-40 caracteres, solo minúsculas y guiones.`,
    );
  }

  // Verify the project exists first (Art. IX — fail loud, never deploy to a typo).
  const status = await vercelCheckStatus({ projectName });
  if (!status.exists) {
    throw new Error(
      `El proyecto de Vercel "${projectName}" no existe. Créalo primero con vercel_create_project.`,
    );
  }

  // Determine target: production ONLY if user explicitly opted in. Otherwise preview.
  // Note: branch=="main" + production==true → production. branch!="main" → always preview
  // regardless of `production` flag (Vercel requires production deploys from main).
  const target = production && branch === "main" ? "production" : "preview";

  const body: Record<string, unknown> = {
    name: projectName,
    target: target === "production" ? "production" : undefined,
    gitSource: {
      type: "github",
      ref: branch,
      repoId: undefined, // Vercel resolves the repo from the project's link
    },
  };

  // POST /v13/deployments. The deployment is queued immediately.
  const dep = await vercelFetch<VercelApiDeployment>(`/v13/deployments`, {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!dep?.id || !dep?.url) {
    throw new Error("Vercel no devolvió el ID/URL del deployment.");
  }

  return {
    projectName,
    deploymentId: dep.id,
    deployUrl: `https://${dep.url}`,
    inspectorUrl: dep.inspectorUrl || "",
    target,
  };
}

// ─── Utils ───────────────────────────────────────────────────────────────────

function listAllowedReposJoined(): string {
  const list = listAllowedRepos().filter((r) => r.toLowerCase() !== "logan");
  return list.length > 0 ? list.join(", ") : "(ninguno configurado)";
}

// Re-export safety helpers for tests / external callers.
export { PROTECTED_ENV_PATTERNS as _PROTECTED_ENV_PATTERNS };
