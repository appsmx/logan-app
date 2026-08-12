// LOGAN Vercel tools — executor that persists VercelAction rows.
//
// Mirrors `execute-git-actions.ts`. For each `vercel_*` action Core proposes:
//   1. Persist a VercelAction row with status="pendiente".
//   2. Run the safety-checked tool (types.ts → tools.ts → client.ts → Vercel API).
//   3. Update the row to status="creado" (with deployUrl/projectName/repo) or
//      status="fallido" (with the error message).
//   4. Return the ActionTaken entry Core/the UI consumes.
//
// The executor is the LAST line of defense. Even if Core produces an unsafe
// action (e.g. vercel_deploy to a project that doesn't exist), the tool will
// throw and we persist status="fallido".

import { db } from "@/lib/db";
import type { ActionTaken, CoreAction } from "@/lib/core/types";
import {
  vercelCheckStatus,
  vercelCreateProject,
  vercelDeploy,
} from "@/lib/vercel/tools";

// ─── Public API ──────────────────────────────────────────────────────────────

export async function executeVercelActions(
  projectId: string,
  actions: CoreAction[],
): Promise<ActionTaken[]> {
  const results: ActionTaken[] = [];
  for (const action of actions) {
    if (!action.type.startsWith("vercel_")) continue;
    const r = await executeOneVercelAction(projectId, action);
    if (r) results.push(r);
  }
  return results;
}

// ─── Per-action dispatch ─────────────────────────────────────────────────────

async function executeOneVercelAction(
  projectId: string,
  action: CoreAction,
): Promise<ActionTaken | null> {
  if (action.type === "vercel_check_status") {
    return executeCheckStatus(projectId, action);
  }
  if (action.type === "vercel_create_project") {
    return executeCreateProject(projectId, action);
  }
  if (action.type === "vercel_deploy") {
    return executeDeploy(projectId, action);
  }
  return null;
}

// ─── vercel_check_status ──────────────────────────────────────────────────────

async function executeCheckStatus(
  projectId: string,
  action: Extract<CoreAction, { type: "vercel_check_status" }>,
): Promise<ActionTaken> {
  const projectName = (action.projectName || "").trim().toLowerCase();

  let vercelAction = await safeCreateVercelAction({
    projectId,
    tool: "vercel_check_status",
    projectName,
    status: "pendiente",
  });
  const vercelActionId = vercelAction?.id || "";

  try {
    const result = await vercelCheckStatus({ projectName });
    await safeUpdateVercelAction(vercelActionId, {
      status: "creado",
      ...(result.projectId ? { projectId } : {}), //projectId is set by db row; we set deployUrl for url
      ...(result.url ? { deployUrl: result.url } : {}),
    });
    return {
      type: "vercel_check_status",
      projectName: result.projectName,
      exists: result.exists,
      url: result.url,
      lastDeploy: result.lastDeploy,
      productionDomain: result.productionDomain,
      vercelActionId,
      status: "creado",
    };
  } catch (e) {
    const error = (e as Error).message || String(e);
    await safeUpdateVercelAction(vercelActionId, { status: "fallido", error });
    return {
      type: "vercel_check_status",
      projectName,
      exists: false,
      vercelActionId,
      status: "fallido",
    };
  }
}

// ─── vercel_create_project ───────────────────────────────────────────────────

async function executeCreateProject(
  projectId: string,
  action: Extract<CoreAction, { type: "vercel_create_project" }>,
): Promise<ActionTaken> {
  const projectName = (action.projectName || "").trim().toLowerCase();
  const repo = (action.repo || "").trim();
  const rootDirectory = action.rootDirectory;

  let vercelAction = await safeCreateVercelAction({
    projectId,
    tool: "vercel_create_project",
    projectName,
    repo,
    status: "pendiente",
  });
  const vercelActionId = vercelAction?.id || "";

  try {
    const result = await vercelCreateProject({ projectName, repo, rootDirectory });
    await safeUpdateVercelAction(vercelActionId, {
      status: "creado",
      ...(result.url ? { deployUrl: result.url } : {}),
    });
    return {
      type: "vercel_create_project",
      projectName: result.projectName,
      projectId: result.projectId,
      url: result.url,
      repo: result.repo,
      vercelActionId,
      status: "creado",
    };
  } catch (e) {
    const error = (e as Error).message || String(e);
    await safeUpdateVercelAction(vercelActionId, { status: "fallido", error });
    return {
      type: "vercel_create_project",
      projectName,
      repo,
      vercelActionId,
      status: "fallido",
    };
  }
}

// ─── vercel_deploy ───────────────────────────────────────────────────────────

async function executeDeploy(
  projectId: string,
  action: Extract<CoreAction, { type: "vercel_deploy" }>,
): Promise<ActionTaken> {
  const projectName = (action.projectName || "").trim().toLowerCase();
  const branch = action.branch;
  const production = action.production === true;

  let vercelAction = await safeCreateVercelAction({
    projectId,
    tool: "vercel_deploy",
    projectName,
    status: "pendiente",
  });
  const vercelActionId = vercelAction?.id || "";

  try {
    const result = await vercelDeploy({ projectName, branch, production });
    await safeUpdateVercelAction(vercelActionId, {
      status: "creado",
      deployUrl: result.deployUrl,
    });
    return {
      type: "vercel_deploy",
      projectName: result.projectName,
      deploymentId: result.deploymentId,
      deployUrl: result.deployUrl,
      inspectorUrl: result.inspectorUrl,
      target: result.target,
      vercelActionId,
      status: "creado",
    };
  } catch (e) {
    const error = (e as Error).message || String(e);
    await safeUpdateVercelAction(vercelActionId, { status: "fallido", error });
    return {
      type: "vercel_deploy",
      projectName,
      vercelActionId,
      status: "fallido",
    };
  }
}

// ─── DB helpers (never throw — the executor is best-effort) ───────────────────

type CreateVercelActionInput = {
  projectId: string;
  tool: string;
  projectName: string;
  repo?: string;
  status: string;
};

async function safeCreateVercelAction(input: CreateVercelActionInput) {
  try {
    return await db.vercelAction.create({
      data: {
        projectId: input.projectId,
        tool: input.tool,
        projectName: input.projectName,
        ...(input.repo ? { repo: input.repo } : {}),
        status: input.status,
      },
    });
  } catch (e) {
    console.error("[vercel] safeCreateVercelAction failed:", (e as Error).message);
    return null;
  }
}

type UpdateVercelActionInput = {
  status: string;
  error?: string;
  deployUrl?: string;
  projectId?: string; // ignored — the projectId is the FK on the row, not the Vercel project ID
};

async function safeUpdateVercelAction(vercelActionId: string, input: UpdateVercelActionInput) {
  if (!vercelActionId) return;
  try {
    await db.vercelAction.update({
      where: { id: vercelActionId },
      data: {
        status: input.status,
        ...(input.error !== undefined ? { error: input.error } : {}),
        ...(input.deployUrl !== undefined ? { deployUrl: input.deployUrl } : {}),
      },
    });
  } catch (e) {
    console.error("[vercel] safeUpdateVercelAction failed:", (e as Error).message);
  }
}
