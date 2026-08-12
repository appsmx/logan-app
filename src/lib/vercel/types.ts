// LOGAN Vercel tools — shared types.
//
// Task 32: gives LOGAN Core the ability to (1) check the status of a Vercel
// project, (2) create a new Vercel project linked to an allowed GitHub repo,
// and (3) trigger a production or preview deploy. Mirror of the git tools
// pattern (Task 23) with the same safety-first philosophy.
//
// 3 tools, no more (Art. III — simplicidad):
//   vercel_check_status   — read-only
//   vercel_create_project — creates a project for an ALLOWED repo
//   vercel_deploy         — triggers a deploy (production requires explicit ask)
//
// LOGAN NEVER deletes Vercel projects (Art. IX — the human decides). There
// is intentionally NO `vercel_delete` tool.

/** Input shape for vercel_check_status (read-only). */
export type VercelCheckStatusInput = {
  projectName: string;
};

/** Input shape for vercel_create_project. */
export type VercelCreateProjectInput = {
  projectName: string;
  repo: string;          // repo name under appsmx/ — MUST be in allowed list
  rootDirectory?: string; // default "." (root of the repo)
};

/** Input shape for vercel_deploy. */
export type VercelDeployInput = {
  projectName: string;
  branch?: string;       // default "main"; if != "main" → target="preview"
  production?: boolean;  // explicit opt-in for production target (Art. IX)
};

/** Result of vercel_check_status. */
export type VercelCheckStatusResult = {
  projectName: string;
  exists: boolean;
  projectId?: string;
  url?: string;           // *.vercel.app alias URL
  productionDomain?: string | null;
  lastDeploy?: {
    state: string;        // READY | ERROR | BUILDING | QUEUED | INITIALIZING | CANCELED
    createdAt: string;
    url: string;          // https://*.vercel.app
    target?: string;       // production | preview
  } | null;
};

/** Result of vercel_create_project. */
export type VercelCreateProjectResult = {
  projectName: string;
  projectId: string;
  url?: string;           // the *.vercel.app URL of the first auto-deploy if any
  repo: string;
};

/** Result of vercel_deploy. */
export type VercelDeployResult = {
  projectName: string;
  deploymentId: string;
  deployUrl: string;       // https://logan-app-xxx.vercel.app (deployment-specific)
  inspectorUrl: string;    // https://vercel.com/.../inspect/...
  target: string;          // production | preview
};

/** Union of all Vercel tool results. */
export type VercelToolResult =
  | ({ tool: "vercel_check_status" } & VercelCheckStatusResult)
  | ({ tool: "vercel_create_project" } & VercelCreateProjectResult)
  | ({ tool: "vercel_deploy" } & VercelDeployResult);

/** Discriminated union of all Vercel tool inputs (for the executor). */
export type VercelToolInput =
  | ({ tool: "vercel_check_status" } & VercelCheckStatusInput)
  | ({ tool: "vercel_create_project" } & VercelCreateProjectInput)
  | ({ tool: "vercel_deploy" } & VercelDeployInput);

// ─── Vercel API raw shapes (subset we use) ───────────────────────────────────

export type VercelApiProject = {
  id: string;
  name: string;
  targets?: Record<string, unknown>;
  latestDeployments?: Array<{
    uid: string;
    state?: string;
    createdAt?: number;
    url?: string;
    target?: string | null;
    readyState?: string;
    inspectorUrl?: string;
  }>;
  aliases?: Array<{ alias?: string; domain?: string }>;
  link?: {
    repo?: string;
    type?: string;
  };
};

export type VercelApiDeployment = {
  id: string;
  url: string;
  readyState?: string;
  target?: string | null;
  inspectorUrl?: string;
  createdAt?: number;
};
