import { execSync } from "node:child_process";
import type { GitHubCookies, ViewConfig, FullView } from "./types.js";

const GITHUB = "https://github.com";

function buildCookieHeader(creds: GitHubCookies, freshGhSess?: string): string {
  const sess = freshGhSess ?? creds.ghSess;
  return `user_session=${creds.userSession}; _gh_sess=${sess}; dotcom_user=${creds.dotcomUser}; logged_in=yes`;
}

interface PageState {
  nonce: string;
  ghSess: string;
}

async function fetchPageState(
  creds: GitHubCookies,
  org: string,
  projectNumber: number,
  viewNumber: number = 1,
): Promise<PageState> {
  const url = `${GITHUB}/orgs/${org}/projects/${projectNumber}/views/${viewNumber}`;
  const resp = await fetch(url, {
    headers: {
      Cookie: buildCookieHeader(creds),
      "User-Agent": "tsk-cli",
      Accept: "text/html",
    },
  });

  if (resp.status === 302 || resp.status === 301) {
    throw new Error(
      "GitHub redirected the page fetch — session likely expired. Re-run `tsk github auth login` after logging back in to github.com.",
    );
  }

  if (resp.status !== 200) {
    throw new Error(
      `Failed to fetch project page (${resp.status}). Check that the org/project number exist and you have access.`,
    );
  }

  const html = await resp.text();
  const match = html.match(/<meta\s+name="fetch-nonce"\s+content="([^"]+)"/);
  if (!match?.[1]) {
    throw new Error("Could not extract fetch-nonce from page HTML. GitHub UI may have changed.");
  }

  const setCookies = resp.headers.getSetCookie?.() ?? [];
  let ghSess = creds.ghSess;
  for (const c of setCookies) {
    const m = c.match(/^_gh_sess=([^;]+)/);
    if (m?.[1]) ghSess = m[1];
  }

  return { nonce: match[1], ghSess };
}

async function memexCall(
  creds: GitHubCookies,
  projectId: number,
  method: "POST" | "PUT" | "DELETE",
  body: unknown,
  page: PageState,
): Promise<{ status: number; data: unknown }> {
  const url = `${GITHUB}/memexes/${projectId}/views`;
  const resp = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "github-verified-fetch": "true",
      "x-requested-with": "XMLHttpRequest",
      "x-fetch-nonce": page.nonce,
      Cookie: buildCookieHeader(creds, page.ghSess),
      "User-Agent": "tsk-cli",
      Origin: GITHUB,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let data: unknown = null;
  const text = await resp.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = text.slice(0, 500); }
  }

  if (resp.status >= 400) {
    const msg = typeof data === "string" ? data.slice(0, 200) : JSON.stringify(data).slice(0, 200);
    throw new Error(`Memex API ${method} failed (HTTP ${resp.status}). ${msg}`);
  }

  return { status: resp.status, data };
}

/**
 * Use `gh api graphql` for reads — the public GraphQL works with PAT auth,
 * and gh2/tsk doesn't need to reimplement what `gh` already provides.
 */
function ghGraphQL<T>(query: string): T {
  let out: string;
  try {
    out = execSync(`gh api graphql -f query=${JSON.stringify(query)}`, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    const e = err as { stderr?: Buffer; message?: string };
    const stderr = e.stderr?.toString() ?? "";
    if (/not.*logged.*in|no.*authentication/i.test(stderr)) {
      throw new Error('Read operations need `gh` CLI auth (PAT). Run `gh auth login` first.');
    }
    throw new Error(`gh api graphql failed: ${stderr || e.message}`);
  }
  const parsed = JSON.parse(out) as { data?: T; errors?: Array<{ message: string }> };
  if (parsed.errors?.length) {
    throw new Error(`GraphQL errors: ${parsed.errors.map((e) => e.message).join("; ")}`);
  }
  if (!parsed.data) throw new Error("GraphQL returned no data");
  return parsed.data;
}

async function resolveProject(
  creds: GitHubCookies,
  org: string,
  projectNumber: number,
): Promise<{ projectId: number; page: PageState }> {
  type Resp = { organization?: { projectV2?: { fullDatabaseId: number } } };
  const data = ghGraphQL<Resp>(
    `query { organization(login:"${org}") { projectV2(number:${projectNumber}) { fullDatabaseId } } }`,
  );
  const id = data.organization?.projectV2?.fullDatabaseId;
  if (!id) {
    throw new Error(`Project ${org}/projects/${projectNumber} not found or inaccessible`);
  }
  const page = await fetchPageState(creds, org, projectNumber);
  return { projectId: id, page };
}

/**
 * Internal helper — fetch current view state so `update` can preserve fields
 * the user didn't override (PUT is full replacement, not patch).
 */
export function getViewState(
  org: string,
  projectNumber: number,
  viewNumber: number,
): { number: number; name: string; layout: string; filter: string | null } {
  type Resp = {
    organization?: {
      projectV2?: {
        views?: { nodes?: Array<{ number: number; name: string; layout: string; filter: string | null }> };
      };
    };
  };
  const data = ghGraphQL<Resp>(
    `query { organization(login:"${org}") { projectV2(number:${projectNumber}) { views(first:50) { nodes { number name layout filter } } } } }`,
  );
  const views = data.organization?.projectV2?.views?.nodes ?? [];
  const found = views.find((v) => v.number === viewNumber);
  if (!found) {
    throw new Error(`View #${viewNumber} not found in ${org}/projects/${projectNumber}`);
  }
  return found;
}

export async function createView(
  creds: GitHubCookies,
  org: string,
  projectNumber: number,
  view: ViewConfig,
): Promise<FullView> {
  const { projectId, page } = await resolveProject(creds, org, projectNumber);
  const result = await memexCall(creds, projectId, "POST", { view }, page);
  return (result.data as { view: FullView }).view;
}

export async function updateView(
  creds: GitHubCookies,
  org: string,
  projectNumber: number,
  viewNumber: number,
  view: ViewConfig,
): Promise<FullView> {
  const { projectId, page } = await resolveProject(creds, org, projectNumber);
  const result = await memexCall(creds, projectId, "PUT", { viewNumber, view }, page);
  return (result.data as { view: FullView }).view;
}

export async function deleteView(
  creds: GitHubCookies,
  org: string,
  projectNumber: number,
  viewNumber: number,
): Promise<void> {
  const { projectId, page } = await resolveProject(creds, org, projectNumber);
  await memexCall(creds, projectId, "DELETE", { viewNumber }, page);
}
