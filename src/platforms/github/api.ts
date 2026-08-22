import { execSync } from "node:child_process";
import { loadCookies } from "./credentials.js";
import type { GitHubCookies, ViewConfig, FullView } from "./types.js";

const GITHUB = "https://github.com";
const GH_API = "https://api.github.com";

let cachedToken: string | undefined | null = null;

async function getApiToken(): Promise<string> {
  if (cachedToken !== null) {
    if (!cachedToken) {
      throw new Error(
        "No GitHub API token stored. Run `tsk github auth login` (after `gh auth login` or with --gh-token PAT).",
      );
    }
    return cachedToken;
  }
  const creds = await loadCookies();
  cachedToken = creds?.ghToken ?? undefined;
  if (!cachedToken) {
    throw new Error(
      "No GitHub API token stored. Run `tsk github auth login` (after `gh auth login` or with --gh-token PAT).",
    );
  }
  return cachedToken;
}

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
  // User-owned Projects live under /users/<login>/, org-owned under /orgs/<login>/.
  const ownerSegment = getOwnerKind(org) === "organization" ? "orgs" : "users";
  const url = `${GITHUB}/${ownerSegment}/${org}/projects/${projectNumber}/views/${viewNumber}`;
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
 * Resolve whether a login is an organization or a user. Cached per process.
 * GraphQL has separate roots — `organization(login:X)` vs `user(login:X)`.
 */
const ownerKindCache = new Map<string, "organization" | "user">();

export function getOwnerKind(login: string): "organization" | "user" {
  const cached = ownerKindCache.get(login);
  if (cached) return cached;
  // Probe via gh api — fast and works with PAT
  try {
    const out = execSync(`gh api users/${login} --jq '.type'`, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
    const kind = out.trim() === "Organization" ? "organization" : "user";
    ownerKindCache.set(login, kind);
    return kind;
  } catch {
    throw new Error(`Could not resolve owner '${login}' — does it exist?`);
  }
}

/**
 * Inline GraphQL root with a stable alias `owner` so response handlers don't care
 * about org vs user. Use in queries as: `query { ${ownerRoot(login)} { projectV2(...) { ... } } }`
 * and read response at `data.owner.projectV2.*`.
 */
export function ownerRoot(login: string): string {
  return `owner: ${getOwnerKind(login)}(login:"${login}")`;
}

/**
 * Direct fetch to api.github.com/graphql with Bearer auth.
 * Token captured by `tsk github auth login` (one-time, stored in credentials).
 */
async function ghGraphQL<T>(query: string): Promise<T> {
  const token = await getApiToken();
  const resp = await fetch(`${GH_API}/graphql`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "tsk-cli",
    },
    body: JSON.stringify({ query }),
  });

  if (resp.status === 401) {
    throw new Error(
      "GitHub API rejected token (401). Token may be expired/revoked. Re-run `tsk github auth login`.",
    );
  }
  if (resp.status !== 200) {
    const text = await resp.text().catch(() => "");
    throw new Error(`GitHub GraphQL failed (HTTP ${resp.status}): ${text.slice(0, 200)}`);
  }
  const parsed = (await resp.json()) as { data?: T; errors?: Array<{ message: string }> };
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
  type Resp = { owner?: { projectV2?: { fullDatabaseId: number } } };
  const data = await ghGraphQL<Resp>(
    `query { ${ownerRoot(org)} { projectV2(number:${projectNumber}) { fullDatabaseId } } }`,
  );
  const id = data.owner?.projectV2?.fullDatabaseId;
  if (!id) {
    throw new Error(`Project ${org}/projects/${projectNumber} not found or inaccessible`);
  }
  const page = await fetchPageState(creds, org, projectNumber);
  return { projectId: id, page };
}

/**
 * Internal helper — fetch current view state so `update` can preserve fields
 * the user didn't override (PUT is full replacement, not patch).
 *
 * Returns groupBy/sortBy/verticalGroupBy/visibleFields with **integer field IDs**
 * (databaseId), ready to round-trip through /memexes/ PUT.
 *
 * Caveat: sliceBy / layoutSettings / aggregationSettings are not exposed via
 * GraphQL read; callers must re-specify if they want to preserve those.
 */
export interface ViewStateFull {
  number: number;
  name: string;
  layout: string;
  filter: string;
  groupBy: number[];
  sortBy: [number, "asc" | "desc"][];
  verticalGroupBy: number[];
  visibleFields: number[];
}

export async function getViewStateFull(
  org: string,
  projectNumber: number,
  viewNumber: number,
): Promise<ViewStateFull> {
  type Node = {
    number: number;
    name: string;
    layout: string;
    filter: string | null;
    groupByFields?: { nodes?: Array<{ databaseId: number }> };
    sortByFields?: { nodes?: Array<{ direction: "ASC" | "DESC"; field: { databaseId: number } }> };
    verticalGroupByFields?: { nodes?: Array<{ databaseId: number }> };
    fields?: { nodes?: Array<{ databaseId: number }> };
  };
  type Resp = { owner?: { projectV2?: { views?: { nodes?: Node[] } } } };
  const data = await ghGraphQL<Resp>(
    `query { ${ownerRoot(org)} { projectV2(number:${projectNumber}) { views(first:50) { nodes { number name layout filter groupByFields(first:10) { nodes { ... on ProjectV2FieldCommon { databaseId } } } sortByFields(first:10) { nodes { direction field { ... on ProjectV2FieldCommon { databaseId } } } } verticalGroupByFields(first:10) { nodes { ... on ProjectV2FieldCommon { databaseId } } } fields(first:50) { nodes { ... on ProjectV2FieldCommon { databaseId } } } } } } } }`,
  );
  const views = data.owner?.projectV2?.views?.nodes ?? [];
  const found = views.find((v) => v.number === viewNumber);
  if (!found) {
    throw new Error(`View #${viewNumber} not found in ${org}/projects/${projectNumber}`);
  }
  return {
    number: found.number,
    name: found.name,
    layout: found.layout,
    filter: found.filter ?? "",
    groupBy: (found.groupByFields?.nodes ?? []).map((n) => n.databaseId),
    verticalGroupBy: (found.verticalGroupByFields?.nodes ?? []).map((n) => n.databaseId),
    sortBy: (found.sortByFields?.nodes ?? []).map((n) => [n.field.databaseId, n.direction.toLowerCase() as "asc" | "desc"]),
    visibleFields: (found.fields?.nodes ?? []).map((n) => n.databaseId),
  };
}

// Back-compat shim
export async function getViewState(
  org: string,
  projectNumber: number,
  viewNumber: number,
): Promise<{ number: number; name: string; layout: string; filter: string | null }> {
  return await getViewStateFull(org, projectNumber, viewNumber);
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

// ────────────────────────────────────────────────────────────────────────────
// Issue Type (org-level)
// ────────────────────────────────────────────────────────────────────────────

export type Color =
  | "GRAY" | "BLUE" | "GREEN" | "YELLOW" | "ORANGE" | "RED" | "PINK" | "PURPLE";

export interface IssueType {
  id: string;
  name: string;
  description: string | null;
  color: Color;
  isEnabled: boolean;
}

export async function getOrgId(org: string): Promise<string> {
  // Issue types are org-only — explicitly use organization root.
  type Resp = { organization?: { id: string } };
  const data = await ghGraphQL<Resp>(`query { organization(login:"${org}") { id } }`);
  if (!data.organization?.id) throw new Error(`Organization '${org}' not found`);
  return data.organization.id;
}

export async function listIssueTypes(org: string): Promise<IssueType[]> {
  type Resp = { organization?: { issueTypes?: { nodes?: IssueType[] } } };
  const data = await ghGraphQL<Resp>(
    `query { organization(login:"${org}") { issueTypes(first:50) { nodes { id name description color isEnabled } } } }`,
  );
  return data.organization?.issueTypes?.nodes ?? [];
}

export async function findIssueType(org: string, name: string): Promise<IssueType> {
  const types = await listIssueTypes(org);
  const found = types.find((t) => t.name.toLowerCase() === name.toLowerCase());
  if (!found) {
    throw new Error(
      `Issue Type '${name}' not found in ${org}. Available: ${types.map((t) => t.name).join(", ")}`,
    );
  }
  return found;
}

export async function createIssueType(
  org: string,
  args: { name: string; description?: string; color?: Color; isEnabled?: boolean },
): Promise<IssueType> {
  const ownerId = await getOrgId(org);
  const desc = args.description ?? "";
  const color = args.color ?? "GRAY";
  const enabled = args.isEnabled ?? true;
  type Resp = { createIssueType?: { issueType: IssueType } };
  const data = await ghGraphQL<Resp>(
    `mutation { await createIssueType(input: {ownerId: "${ownerId}", name: "${args.name}", description: "${desc}", color: ${color}, isEnabled: ${enabled}}) { issueType { id name description color isEnabled } } }`,
  );
  if (!data.createIssueType?.issueType) throw new Error("createIssueType returned no issueType");
  return data.createIssueType.issueType;
}

export async function updateIssueType(
  org: string,
  name: string,
  changes: { name?: string; description?: string; color?: Color; isEnabled?: boolean },
): Promise<IssueType> {
  const t = await findIssueType(org, name);
  const parts: string[] = [`issueTypeId: "${t.id}"`];
  if (changes.name !== undefined) parts.push(`name: "${changes.name}"`);
  if (changes.description !== undefined) parts.push(`description: "${changes.description}"`);
  if (changes.color !== undefined) parts.push(`color: ${changes.color}`);
  if (changes.isEnabled !== undefined) parts.push(`isEnabled: ${changes.isEnabled}`);
  type Resp = { updateIssueType?: { issueType: IssueType } };
  const data = await ghGraphQL<Resp>(
    `mutation { await updateIssueType(input: {${parts.join(", ")}}) { issueType { id name description color isEnabled } } }`,
  );
  if (!data.updateIssueType?.issueType) throw new Error("updateIssueType returned no issueType");
  return data.updateIssueType.issueType;
}

export async function deleteIssueType(org: string, name: string): Promise<void> {
  const t = await findIssueType(org, name);
  await ghGraphQL<{ deleteIssueType?: unknown }>(
    `mutation { await deleteIssueType(input: {issueTypeId: "${t.id}"}) { clientMutationId } }`,
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Issue Type assignment to issues
// ────────────────────────────────────────────────────────────────────────────

async function getIssueId(owner: string, repo: string, number: number): Promise<string> {
  type Resp = { repository?: { issue?: { id: string } } };
  const data = await ghGraphQL<Resp>(
    `query { repository(owner:"${owner}", name:"${repo}") { issue(number:${number}) { id } } }`,
  );
  if (!data.repository?.issue?.id) {
    throw new Error(`Issue ${owner}/${repo}#${number} not found`);
  }
  return data.repository.issue.id;
}

export async function setIssueType(
  org: string,
  owner: string,
  repo: string,
  number: number,
  typeName: string,
): Promise<void> {
  const t = await findIssueType(org, typeName);
  const id = await getIssueId(owner, repo, number);
  await ghGraphQL<{ updateIssue?: unknown }>(
    `mutation { updateIssue(input: {id: "${id}", issueTypeId: "${t.id}"}) { issue { number } } }`,
  );
}

export async function listRepoIssues(
  owner: string,
  repo: string,
  filter: { state?: "OPEN" | "CLOSED" | "ALL"; milestone?: number; label?: string } = {},
): Promise<Array<{ id: string; number: number; title: string }>> {
  const stateClause = filter.state && filter.state !== "ALL" ? `, states: [${filter.state}]` : "";
  const labelClause = filter.label ? `, filterBy: {labels: ["${filter.label}"]}` : "";
  type Resp = {
    repository?: {
      issues?: { nodes?: Array<{ id: string; number: number; title: string; milestone: { number: number } | null }> };
    };
  };
  const data = await ghGraphQL<Resp>(
    `query { repository(owner:"${owner}", name:"${repo}") { issues(first:100${stateClause}${labelClause}, orderBy:{field:CREATED_AT, direction:ASC}) { nodes { id number title milestone { number } } } } }`,
  );
  let issues = data.repository?.issues?.nodes ?? [];
  if (filter.milestone !== undefined) {
    issues = issues.filter((i) => i.milestone?.number === filter.milestone);
  }
  return issues;
}

export async function bulkSetIssueType(
  org: string,
  owner: string,
  repo: string,
  typeName: string,
  filter: { state?: "OPEN" | "CLOSED" | "ALL"; milestone?: number; label?: string } = {},
): Promise<{ applied: number; skipped: number; total: number }> {
  const t = await findIssueType(org, typeName);
  const issues = await listRepoIssues(owner, repo, filter);
  let applied = 0;
  let skipped = 0;
  for (const i of issues) {
    try {
      await ghGraphQL<{ updateIssue?: unknown }>(
        `mutation { updateIssue(input: {id: "${i.id}", issueTypeId: "${t.id}"}) { issue { number } } }`,
      );
      applied++;
    } catch {
      skipped++;
    }
  }
  return { applied, skipped, total: issues.length };
}

// ────────────────────────────────────────────────────────────────────────────
// Project field
// ────────────────────────────────────────────────────────────────────────────

export interface FieldOption {
  id: string;
  name: string;
  color: Color;
  description: string | null;
}

export interface ProjectField {
  id: string;
  databaseId: number;
  name: string;
  dataType: string;
  options?: FieldOption[];
}

export async function listProjectFields(org: string, projectNumber: number): Promise<ProjectField[]> {
  type Resp = {
    owner?: { projectV2?: {
        fields?: {
          nodes?: Array<
            | { id: string; databaseId: number; name: string; dataType: string }
            | { id: string; databaseId: number; name: string; dataType: string; options: FieldOption[] }
          >;
        };
      };
    };
  };
  const data = await ghGraphQL<Resp>(
    `query { ${ownerRoot(org)} { projectV2(number:${projectNumber}) { fields(first:100) { nodes { ... on ProjectV2FieldCommon { id databaseId name dataType } ... on ProjectV2SingleSelectField { id databaseId name dataType options { id name color description } } } } } } }`,
  );
  return (data.owner?.projectV2?.fields?.nodes ?? []) as ProjectField[];
}

export async function findProjectField(org: string, projectNumber: number, name: string): Promise<ProjectField> {
  const fields = await listProjectFields(org, projectNumber);
  const found = fields.find((f) => f.name === name);
  if (!found) {
    throw new Error(
      `Field '${name}' not found in project. Available: ${fields.map((f) => f.name).join(", ")}`,
    );
  }
  return found;
}

export async function updateFieldName(
  org: string,
  projectNumber: number,
  fieldName: string,
  newName: string,
): Promise<void> {
  const field = await findProjectField(org, projectNumber, fieldName);
  await ghGraphQL<{ updateProjectV2Field?: unknown }>(
    `mutation { updateProjectV2Field(input: {fieldId: "${field.id}", name: "${newName}"}) { projectV2Field { ... on ProjectV2FieldCommon { id name } } } }`,
  );
}

/**
 * Replace ALL single-select options on a field. Caller passes the full new list.
 * Useful as building block for add/update/delete-one operations.
 */
export async function setFieldOptions(
  org: string,
  projectNumber: number,
  fieldName: string,
  options: Array<{ id?: string; name: string; color: Color; description: string }>,
): Promise<void> {
  const field = await findProjectField(org, projectNumber, fieldName);
  if (!field.options) {
    throw new Error(`Field '${fieldName}' is not a single-select field`);
  }
  const optsLiteral = options.map((o) => {
    const idPart = o.id ? `id: "${o.id}", ` : "";
    return `{${idPart}name: "${o.name}", color: ${o.color}, description: "${o.description}"}`;
  }).join(", ");
  await ghGraphQL<{ updateProjectV2Field?: unknown }>(
    `mutation { updateProjectV2Field(input: {fieldId: "${field.id}", singleSelectOptions: [${optsLiteral}]}) { projectV2Field { ... on ProjectV2SingleSelectField { id name } } } }`,
  );
}

export async function addFieldOption(
  org: string,
  projectNumber: number,
  fieldName: string,
  optionName: string,
  color: Color = "GRAY",
  description: string = "",
): Promise<void> {
  const field = await findProjectField(org, projectNumber, fieldName);
  if (!field.options) throw new Error(`Field '${fieldName}' is not single-select`);
  if (field.options.some((o) => o.name === optionName)) {
    throw new Error(`Option '${optionName}' already exists on field '${fieldName}'`);
  }
  const next = [
    ...field.options.map((o) => ({ id: o.id, name: o.name, color: o.color, description: o.description ?? "" })),
    { name: optionName, color, description },
  ];
  await setFieldOptions(org, projectNumber, fieldName, next);
}

export async function updateFieldOption(
  org: string,
  projectNumber: number,
  fieldName: string,
  optionName: string,
  changes: { name?: string; color?: Color; description?: string },
): Promise<void> {
  const field = await findProjectField(org, projectNumber, fieldName);
  if (!field.options) throw new Error(`Field '${fieldName}' is not single-select`);
  const next = field.options.map((o) => {
    if (o.name === optionName) {
      return {
        id: o.id,
        name: changes.name ?? o.name,
        color: changes.color ?? o.color,
        description: changes.description ?? o.description ?? "",
      };
    }
    return { id: o.id, name: o.name, color: o.color, description: o.description ?? "" };
  });
  if (!field.options.some((o) => o.name === optionName)) {
    throw new Error(`Option '${optionName}' not found on field '${fieldName}'`);
  }
  await setFieldOptions(org, projectNumber, fieldName, next);
}

export async function deleteFieldOption(
  org: string,
  projectNumber: number,
  fieldName: string,
  optionName: string,
): Promise<void> {
  const field = await findProjectField(org, projectNumber, fieldName);
  if (!field.options) throw new Error(`Field '${fieldName}' is not single-select`);
  const next = field.options
    .filter((o) => o.name !== optionName)
    .map((o) => ({ id: o.id, name: o.name, color: o.color, description: o.description ?? "" }));
  if (next.length === field.options.length) {
    throw new Error(`Option '${optionName}' not found on field '${fieldName}'`);
  }
  await setFieldOptions(org, projectNumber, fieldName, next);
}

// ────────────────────────────────────────────────────────────────────────────
// Project items + bulk field-set
// ────────────────────────────────────────────────────────────────────────────

export interface ProjectItem {
  itemId: string;
  contentNumber: number | null;
  contentTitle: string | null;
  fields: Record<string, string>; // field name → value (text representation)
}

export async function listProjectItems(org: string, projectNumber: number): Promise<ProjectItem[]> {
  type Resp = {
    owner?: { projectV2?: {
        items?: {
          nodes?: Array<{
            id: string;
            content: { number?: number; title?: string } | null;
            fieldValues: {
              nodes?: Array<{
                __typename?: string;
                name?: string;
                text?: string;
                number?: number;
                date?: string;
                field?: { name?: string } | null;
              }>;
            };
          }>;
        };
      };
    };
  };
  const data = await ghGraphQL<Resp>(
    `query { ${ownerRoot(org)} { projectV2(number:${projectNumber}) { items(first:100) { nodes { id content { ... on Issue { number title } ... on PullRequest { number title } ... on DraftIssue { title } } fieldValues(first:30) { nodes { ... on ProjectV2ItemFieldSingleSelectValue { __typename name field { ... on ProjectV2SingleSelectField { name } } } ... on ProjectV2ItemFieldTextValue { __typename text field { ... on ProjectV2Field { name } } } ... on ProjectV2ItemFieldNumberValue { __typename number field { ... on ProjectV2Field { name } } } ... on ProjectV2ItemFieldDateValue { __typename date field { ... on ProjectV2Field { name } } } } } } } } } }`,
  );
  const items = data.owner?.projectV2?.items?.nodes ?? [];
  return items.map((i) => {
    const fields: Record<string, string> = {};
    for (const fv of i.fieldValues.nodes ?? []) {
      const fname = fv.field?.name;
      if (!fname) continue;
      const v = fv.name ?? fv.text ?? (fv.number !== undefined ? String(fv.number) : undefined) ?? fv.date;
      if (v !== undefined) fields[fname] = v;
    }
    return {
      itemId: i.id,
      contentNumber: i.content?.number ?? null,
      contentTitle: i.content?.title ?? null,
      fields,
    };
  });
}

export async function getProjectId(org: string, projectNumber: number): Promise<string> {
  type Resp = { owner?: { projectV2?: { id: string } } };
  const data = await ghGraphQL<Resp>(
    `query { ${ownerRoot(org)} { projectV2(number:${projectNumber}) { id } } }`,
  );
  if (!data.owner?.projectV2?.id) {
    throw new Error(`Project ${org}/projects/${projectNumber} not found`);
  }
  return data.owner?.projectV2.id;
}

export interface ProjectInfo {
  id: string;
  number: number;
  title: string;
  shortDescription: string | null;
  readme: string | null;
  template: boolean;
}

export interface ProjectViewSummary {
  number: number;
  name: string;
  layout: string;
  filter: string | null;
}

export async function getProject(org: string, projectNumber: number): Promise<ProjectInfo> {
  type Resp = { owner?: { projectV2?: ProjectInfo } };
  const data = await ghGraphQL<Resp>(
    `query { ${ownerRoot(org)} { projectV2(number:${projectNumber}) { id number title shortDescription readme template } } }`,
  );
  if (!data.owner?.projectV2) {
    throw new Error(`Project ${org}/projects/${projectNumber} not found`);
  }
  return data.owner.projectV2;
}

export async function updateProjectMetadata(
  projectId: string,
  changes: { title?: string; shortDescription?: string; readme?: string },
): Promise<void> {
  const fields = Object.entries(changes).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  if (fields.length === 0) return;
  await ghGraphQL<{ updateProjectV2?: unknown }>(
    `mutation { updateProjectV2(input: {projectId: ${JSON.stringify(projectId)}, ${fields.join(", ")}}) { projectV2 { id } } }`,
  );
}

export async function markProjectAsTemplate(projectId: string): Promise<void> {
  await ghGraphQL<{ markProjectV2AsTemplate?: unknown }>(
    `mutation { markProjectV2AsTemplate(input: {projectId: ${JSON.stringify(projectId)}}) { projectV2 { id template } } }`,
  );
}

export async function listProjectViews(org: string, projectNumber: number): Promise<ProjectViewSummary[]> {
  type Resp = { owner?: { projectV2?: { views?: { nodes?: ProjectViewSummary[] } } } };
  const data = await ghGraphQL<Resp>(
    `query { ${ownerRoot(org)} { projectV2(number:${projectNumber}) { views(first:100) { nodes { number name layout filter } } } } }`,
  );
  return data.owner?.projectV2?.views?.nodes ?? [];
}

export async function createSingleSelectField(
  org: string,
  projectNumber: number,
  name: string,
  options: Array<{ name: string; color: Color; description: string }>,
): Promise<{ id: string; databaseId: number }> {
  const projectId = await getProjectId(org, projectNumber);
  const optionLiteral = options.map((option) => (
    `{name: ${JSON.stringify(option.name)}, color: ${option.color}, description: ${JSON.stringify(option.description)}}`
  )).join(", ");
  type Resp = { createProjectV2Field?: { projectV2Field: { id: string; databaseId: number } } };
  const data = await ghGraphQL<Resp>(
    `mutation { createProjectV2Field(input: {projectId: ${JSON.stringify(projectId)}, dataType: SINGLE_SELECT, name: ${JSON.stringify(name)}, singleSelectOptions: [${optionLiteral}]}) { projectV2Field { ... on ProjectV2FieldCommon { id databaseId } } } }`,
  );
  if (!data.createProjectV2Field?.projectV2Field) throw new Error("createProjectV2Field returned no field");
  return data.createProjectV2Field.projectV2Field;
}

/**
 * Set a single-select field value on one item.
 */
export async function setItemSingleSelect(
  projectNodeId: string,
  itemId: string,
  fieldId: string,
  optionId: string,
): Promise<void> {
  await ghGraphQL<{ updateProjectV2ItemFieldValue?: unknown }>(
    `mutation { updateProjectV2ItemFieldValue(input: {projectId: "${projectNodeId}", itemId: "${itemId}", fieldId: "${fieldId}", value: {singleSelectOptionId: "${optionId}"}}) { projectV2Item { id } } }`,
  );
}

/**
 * Bulk set a single-select field value on items matching --where filter.
 */
export async function bulkSetSingleSelect(
  org: string,
  projectNumber: number,
  targetFieldName: string,
  targetValue: string,
  where: { field: string; value: string } | null,
): Promise<{ applied: number; total: number; matched: number }> {
  const projectNodeId = await getProjectId(org, projectNumber);
  const targetField = await findProjectField(org, projectNumber, targetFieldName);
  if (!targetField.options) {
    throw new Error(`Field '${targetFieldName}' is not single-select`);
  }
  const targetOpt = targetField.options.find((o) => o.name === targetValue);
  if (!targetOpt) {
    throw new Error(
      `Option '${targetValue}' not found on field '${targetFieldName}'. Available: ${targetField.options.map((o) => o.name).join(", ")}`,
    );
  }

  const items = await listProjectItems(org, projectNumber);
  const matched = where
    ? items.filter((i) => i.fields[where.field] === where.value)
    : items;

  let applied = 0;
  for (const i of matched) {
    await setItemSingleSelect(projectNodeId, i.itemId, targetField.id, targetOpt.id);
    applied++;
  }
  return { applied, total: items.length, matched: matched.length };
}

// ────────────────────────────────────────────────────────────────────────────
// Field option bulk recolor
// ────────────────────────────────────────────────────────────────────────────

/**
 * Update colors of multiple options on a single-select field in one call.
 * Options not in the map keep their current color.
 */
export async function recolorOptions(
  org: string,
  projectNumber: number,
  fieldName: string,
  colorMap: Record<string, Color>,
): Promise<{ changed: number; skipped: string[] }> {
  const field = await findProjectField(org, projectNumber, fieldName);
  if (!field.options) throw new Error(`Field '${fieldName}' is not single-select`);
  const skipped: string[] = [];
  let changed = 0;
  const next = field.options.map((o) => {
    const newColor = colorMap[o.name];
    if (newColor && newColor !== o.color) {
      changed++;
      return { id: o.id, name: o.name, color: newColor, description: o.description ?? "" };
    }
    return { id: o.id, name: o.name, color: o.color, description: o.description ?? "" };
  });
  // Track unknown option names from the map
  for (const name of Object.keys(colorMap)) {
    if (!field.options.some((o) => o.name === name)) skipped.push(name);
  }
  if (changed > 0) await setFieldOptions(org, projectNumber, fieldName, next);
  return { changed, skipped };
}

// ────────────────────────────────────────────────────────────────────────────
// Item bulk operations: field-set extended types, field-clear, archive, move
// ────────────────────────────────────────────────────────────────────────────

export type FieldValueInput =
  | { type: "singleSelect"; optionId: string }
  | { type: "text"; text: string }
  | { type: "number"; number: number }
  | { type: "date"; date: string }     // YYYY-MM-DD
  | { type: "iteration"; iterationId: string };

async function setItemFieldValue(
  projectNodeId: string,
  itemId: string,
  fieldId: string,
  value: FieldValueInput,
): Promise<void> {
  let valLiteral: string;
  switch (value.type) {
    case "singleSelect": valLiteral = `{singleSelectOptionId: "${value.optionId}"}`; break;
    case "text":         valLiteral = `{text: ${JSON.stringify(value.text)}}`; break;
    case "number":       valLiteral = `{number: ${value.number}}`; break;
    case "date":         valLiteral = `{date: "${value.date}"}`; break;
    case "iteration":    valLiteral = `{iterationId: "${value.iterationId}"}`; break;
  }
  await ghGraphQL<{ updateProjectV2ItemFieldValue?: unknown }>(
    `mutation { updateProjectV2ItemFieldValue(input: {projectId: "${projectNodeId}", itemId: "${itemId}", fieldId: "${fieldId}", value: ${valLiteral}}) { projectV2Item { id } } }`,
  );
}

/**
 * Bulk set any-typed field value. For single-select pass option name as value.
 * For text/number/date, pass the raw value.
 */
export async function bulkSetField(
  org: string,
  projectNumber: number,
  fieldName: string,
  rawValue: string,
  where: { field: string; value: string } | null,
): Promise<{ applied: number; total: number; matched: number; valueType: string }> {
  const projectNodeId = await getProjectId(org, projectNumber);
  const field = await findProjectField(org, projectNumber, fieldName);

  let value: FieldValueInput;
  let valueType: string;
  if (field.dataType === "SINGLE_SELECT") {
    if (!field.options) throw new Error(`Field '${fieldName}' missing options`);
    const opt = field.options.find((o) => o.name === rawValue);
    if (!opt) {
      throw new Error(
        `Option '${rawValue}' not found on '${fieldName}'. Available: ${field.options.map((o) => o.name).join(", ")}`,
      );
    }
    value = { type: "singleSelect", optionId: opt.id };
    valueType = "single-select";
  } else if (field.dataType === "TEXT") {
    value = { type: "text", text: rawValue };
    valueType = "text";
  } else if (field.dataType === "NUMBER") {
    const n = Number(rawValue);
    if (Number.isNaN(n)) throw new Error(`Field '${fieldName}' is NUMBER but value '${rawValue}' isn't numeric`);
    value = { type: "number", number: n };
    valueType = "number";
  } else if (field.dataType === "DATE") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
      throw new Error(`Field '${fieldName}' is DATE; expected YYYY-MM-DD, got '${rawValue}'`);
    }
    value = { type: "date", date: rawValue };
    valueType = "date";
  } else {
    throw new Error(`Unsupported field dataType: ${field.dataType}. Use single-select, text, number, or date fields.`);
  }

  const items = await listProjectItems(org, projectNumber);
  const matched = where ? items.filter((i) => i.fields[where.field] === where.value) : items;

  let applied = 0;
  for (const i of matched) {
    await setItemFieldValue(projectNodeId, i.itemId, field.id, value);
    applied++;
  }
  return { applied, total: items.length, matched: matched.length, valueType };
}

/**
 * Bulk clear a field value (returns it to unset).
 */
export async function bulkClearField(
  org: string,
  projectNumber: number,
  fieldName: string,
  where: { field: string; value: string } | null,
): Promise<{ applied: number; total: number; matched: number }> {
  const projectNodeId = await getProjectId(org, projectNumber);
  const field = await findProjectField(org, projectNumber, fieldName);

  const items = await listProjectItems(org, projectNumber);
  const matched = where ? items.filter((i) => i.fields[where.field] === where.value) : items;

  let applied = 0;
  for (const i of matched) {
    await ghGraphQL<{ clearProjectV2ItemFieldValue?: unknown }>(
      `mutation { clearProjectV2ItemFieldValue(input: {projectId: "${projectNodeId}", itemId: "${i.itemId}", fieldId: "${field.id}"}) { projectV2Item { id } } }`,
    );
    applied++;
  }
  return { applied, total: items.length, matched: matched.length };
}

export async function bulkArchive(
  org: string,
  projectNumber: number,
  where: { field: string; value: string } | null,
): Promise<{ applied: number; total: number; matched: number }> {
  const projectNodeId = await getProjectId(org, projectNumber);
  const items = await listProjectItems(org, projectNumber);
  const matched = where ? items.filter((i) => i.fields[where.field] === where.value) : items;
  let applied = 0;
  for (const i of matched) {
    await ghGraphQL<{ archiveProjectV2Item?: unknown }>(
      `mutation { archiveProjectV2Item(input: {projectId: "${projectNodeId}", itemId: "${i.itemId}"}) { item { id } } }`,
    );
    applied++;
  }
  return { applied, total: items.length, matched: matched.length };
}

/**
 * Unarchive items by explicit node IDs.
 *
 * Note: GraphQL projectV2.items() doesn't expose archived items — neither via
 * a query filter nor via a separate connection. To find archived item IDs,
 * use the web UI's archived view (filterQuery=is:archived) URL or capture via
 * the page HTML. Callers must pass IDs.
 */
export async function bulkUnarchive(
  org: string,
  projectNumber: number,
  itemNodeIds: string[],
): Promise<{ applied: number }> {
  const projectNodeId = await getProjectId(org, projectNumber);
  let applied = 0;
  for (const id of itemNodeIds) {
    await ghGraphQL<{ unarchiveProjectV2Item?: unknown }>(
      `mutation { unarchiveProjectV2Item(input: {projectId: "${projectNodeId}", itemId: "${id}"}) { item { id } } }`,
    );
    applied++;
  }
  return { applied };
}

export async function moveItem(
  projectNodeId: string,
  itemId: string,
  afterItemId: string | null,
): Promise<void> {
  const afterClause = afterItemId ? `, afterId: "${afterItemId}"` : "";
  await ghGraphQL<{ updateProjectV2ItemPosition?: unknown }>(
    `mutation { updateProjectV2ItemPosition(input: {projectId: "${projectNodeId}", itemId: "${itemId}"${afterClause}}) { items(first:1) { nodes { id } } } }`,
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Field create (extended types)
// ────────────────────────────────────────────────────────────────────────────

export async function createTextField(org: string, projectNumber: number, name: string): Promise<{ id: string; databaseId: number }> {
  const projectId = await getProjectId(org, projectNumber);
  type Resp = { createProjectV2Field?: { projectV2Field: { id: string; databaseId: number } } };
  const data = await ghGraphQL<Resp>(
    `mutation { createProjectV2Field(input: {projectId: "${projectId}", dataType: TEXT, name: "${name}"}) { projectV2Field { ... on ProjectV2FieldCommon { id databaseId } } } }`,
  );
  if (!data.createProjectV2Field?.projectV2Field) throw new Error("createProjectV2Field returned no field");
  return data.createProjectV2Field.projectV2Field;
}

export async function createNumberField(org: string, projectNumber: number, name: string): Promise<{ id: string; databaseId: number }> {
  const projectId = await getProjectId(org, projectNumber);
  type Resp = { createProjectV2Field?: { projectV2Field: { id: string; databaseId: number } } };
  const data = await ghGraphQL<Resp>(
    `mutation { createProjectV2Field(input: {projectId: "${projectId}", dataType: NUMBER, name: "${name}"}) { projectV2Field { ... on ProjectV2FieldCommon { id databaseId } } } }`,
  );
  if (!data.createProjectV2Field?.projectV2Field) throw new Error("createProjectV2Field returned no field");
  return data.createProjectV2Field.projectV2Field;
}

export async function createDateField(org: string, projectNumber: number, name: string): Promise<{ id: string; databaseId: number }> {
  const projectId = await getProjectId(org, projectNumber);
  type Resp = { createProjectV2Field?: { projectV2Field: { id: string; databaseId: number } } };
  const data = await ghGraphQL<Resp>(
    `mutation { createProjectV2Field(input: {projectId: "${projectId}", dataType: DATE, name: "${name}"}) { projectV2Field { ... on ProjectV2FieldCommon { id databaseId } } } }`,
  );
  if (!data.createProjectV2Field?.projectV2Field) throw new Error("createProjectV2Field returned no field");
  return data.createProjectV2Field.projectV2Field;
}

/**
 * Iteration field — needs startDate + duration. iterations array auto-populated by GitHub.
 */
export async function createIterationField(
  org: string,
  projectNumber: number,
  name: string,
  startDate: string,
  duration: number,
): Promise<{ id: string; databaseId: number }> {
  const projectId = await getProjectId(org, projectNumber);
  type Resp = { createProjectV2Field?: { projectV2Field: { id: string; databaseId: number } } };
  const data = await ghGraphQL<Resp>(
    `mutation { createProjectV2Field(input: {projectId: "${projectId}", dataType: ITERATION, name: "${name}", iterationConfiguration: {startDate: "${startDate}", duration: ${duration}, iterations: []}}) { projectV2Field { ... on ProjectV2FieldCommon { id databaseId } } } }`,
  );
  if (!data.createProjectV2Field?.projectV2Field) throw new Error("createProjectV2Field returned no field");
  return data.createProjectV2Field.projectV2Field;
}

// ────────────────────────────────────────────────────────────────────────────
// Project Status Updates
// ────────────────────────────────────────────────────────────────────────────

export type StatusUpdateStatus = "INACTIVE" | "ON_TRACK" | "AT_RISK" | "OFF_TRACK" | "COMPLETE";

export interface StatusUpdate {
  id: string;
  fullDatabaseId: number;
  body: string;
  status: StatusUpdateStatus | null;
  startDate: string | null;
  targetDate: string | null;
  createdAt: string;
}

export async function listStatusUpdates(org: string, projectNumber: number): Promise<StatusUpdate[]> {
  type Resp = {
    owner?: { projectV2?: {
        statusUpdates?: { nodes?: StatusUpdate[] };
      };
    };
  };
  const data = await ghGraphQL<Resp>(
    `query { ${ownerRoot(org)} { projectV2(number:${projectNumber}) { statusUpdates(first:50) { nodes { id fullDatabaseId body status startDate targetDate createdAt } } } } }`,
  );
  return data.owner?.projectV2?.statusUpdates?.nodes ?? [];
}

export async function createStatusUpdate(
  org: string,
  projectNumber: number,
  body: string,
  opts: { status?: StatusUpdateStatus; startDate?: string; targetDate?: string } = {},
): Promise<StatusUpdate> {
  const projectId = await getProjectId(org, projectNumber);
  const parts: string[] = [`projectId: "${projectId}"`, `body: ${JSON.stringify(body)}`];
  if (opts.status) parts.push(`status: ${opts.status}`);
  if (opts.startDate) parts.push(`startDate: "${opts.startDate}"`);
  if (opts.targetDate) parts.push(`targetDate: "${opts.targetDate}"`);
  type Resp = { createProjectV2StatusUpdate?: { statusUpdate: StatusUpdate } };
  const data = await ghGraphQL<Resp>(
    `mutation { createProjectV2StatusUpdate(input: {${parts.join(", ")}}) { statusUpdate { id fullDatabaseId body status startDate targetDate createdAt } } }`,
  );
  if (!data.createProjectV2StatusUpdate?.statusUpdate) throw new Error("createProjectV2StatusUpdate returned no update");
  return data.createProjectV2StatusUpdate.statusUpdate;
}

export async function updateStatusUpdate(
  statusUpdateId: string,
  changes: { body?: string; status?: StatusUpdateStatus; startDate?: string; targetDate?: string },
): Promise<StatusUpdate> {
  const parts: string[] = [`statusUpdateId: "${statusUpdateId}"`];
  if (changes.body !== undefined) parts.push(`body: ${JSON.stringify(changes.body)}`);
  if (changes.status !== undefined) parts.push(`status: ${changes.status}`);
  if (changes.startDate !== undefined) parts.push(`startDate: "${changes.startDate}"`);
  if (changes.targetDate !== undefined) parts.push(`targetDate: "${changes.targetDate}"`);
  type Resp = { updateProjectV2StatusUpdate?: { statusUpdate: StatusUpdate } };
  const data = await ghGraphQL<Resp>(
    `mutation { updateProjectV2StatusUpdate(input: {${parts.join(", ")}}) { statusUpdate { id fullDatabaseId body status startDate targetDate createdAt } } }`,
  );
  if (!data.updateProjectV2StatusUpdate?.statusUpdate) throw new Error("updateProjectV2StatusUpdate returned no update");
  return data.updateProjectV2StatusUpdate.statusUpdate;
}

export async function deleteStatusUpdate(statusUpdateId: string): Promise<void> {
  await ghGraphQL<{ deleteProjectV2StatusUpdate?: unknown }>(
    `mutation { deleteProjectV2StatusUpdate(input: {statusUpdateId: "${statusUpdateId}"}) { clientMutationId } }`,
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Workflows & Charts (discovered via Playwright on web UI)
//
// Endpoints found:
//   GET  /memexes/<id>/workflows           — list all workflows ✅
//   GET  /memexes/<id>/charts              — list charts ✅
//   GET  /memexes/<id>/charts/query?...    — fetch chart data ✅
//   ?    /memexes/<id>/workflows/<n>       — PATCH/PUT shape TBD (returns 422 without right body)
//   ?    /memexes/<id>/charts              — POST shape TBD (returns 400 without right body)
//
// Body shapes for write ops require driving the web UI to toggle/create and
// capture exact payloads. Currently read-only here.
// ────────────────────────────────────────────────────────────────────────────

export interface Workflow {
  id: number;
  name: string;
  number: number;
  triggerType: string;
  contentTypes: string[];
  enabled: boolean;
  actions: Array<{ id: number; actionType: string; arguments: Record<string, unknown> }>;
}

export async function listWorkflows(
  creds: GitHubCookies,
  org: string,
  projectNumber: number,
): Promise<Workflow[]> {
  const { projectId, page } = await resolveProject(creds, org, projectNumber);
  const url = `${GITHUB}/memexes/${projectId}/workflows`;
  const resp = await fetch(url, {
    headers: {
      Cookie: buildCookieHeader(creds, page.ghSess),
      Accept: "application/json",
      "github-verified-fetch": "true",
      "x-requested-with": "XMLHttpRequest",
      "x-fetch-nonce": page.nonce,
      "User-Agent": "tsk-cli",
    },
  });
  if (resp.status !== 200) {
    throw new Error(`workflow list failed (HTTP ${resp.status})`);
  }
  const data = (await resp.json()) as { workflows: Workflow[] };
  return data.workflows ?? [];
}

export interface Chart {
  // Shape TBD — empty when no charts exist
  [key: string]: unknown;
}

export async function listCharts(
  creds: GitHubCookies,
  org: string,
  projectNumber: number,
): Promise<Chart[]> {
  const { projectId, page } = await resolveProject(creds, org, projectNumber);
  const url = `${GITHUB}/memexes/${projectId}/charts`;
  const resp = await fetch(url, {
    headers: {
      Cookie: buildCookieHeader(creds, page.ghSess),
      Accept: "application/json",
      "github-verified-fetch": "true",
      "x-requested-with": "XMLHttpRequest",
      "x-fetch-nonce": page.nonce,
      "User-Agent": "tsk-cli",
    },
  });
  if (resp.status !== 200) {
    throw new Error(`chart list failed (HTTP ${resp.status})`);
  }
  const data = (await resp.json()) as { charts: Chart[] };
  return data.charts ?? [];
}

// ── workflow write ops (PUT same /workflows root with workflowNumber in body) ──

async function memexWorkflowCall(
  creds: GitHubCookies,
  projectId: number,
  method: "POST" | "PUT" | "DELETE",
  body: unknown,
  page: PageState,
): Promise<{ status: number; data: unknown }> {
  const url = `${GITHUB}/memexes/${projectId}/workflows`;
  const resp = await fetch(url, {
    method,
    headers: {
      Accept: "application/json", "Content-Type": "application/json",
      "github-verified-fetch": "true", "x-requested-with": "XMLHttpRequest",
      "x-fetch-nonce": page.nonce, Cookie: buildCookieHeader(creds, page.ghSess),
      "User-Agent": "tsk-cli", Origin: GITHUB,
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
    throw new Error(`workflow API ${method} failed (HTTP ${resp.status}). ${msg}`);
  }
  return { status: resp.status, data };
}

export async function toggleWorkflow(
  creds: GitHubCookies,
  org: string,
  projectNumber: number,
  workflowNumber: number,
  enabled: boolean,
): Promise<Workflow> {
  const { projectId, page } = await resolveProject(creds, org, projectNumber);
  // First fetch current state of all workflows
  const all = await listWorkflows(creds, org, projectNumber);
  const wf = all.find((w) => w.number === workflowNumber);
  if (!wf) throw new Error(`Workflow #${workflowNumber} not found`);
  const body = {
    workflowNumber: wf.number,
    name: wf.name,
    contentTypes: wf.contentTypes,
    enabled,
    actions: wf.actions,
  };
  const result = await memexWorkflowCall(creds, projectId, "PUT", body, page);
  return (result.data as { workflow: Workflow }).workflow ?? wf;
}

export async function updateWorkflow(
  creds: GitHubCookies,
  org: string,
  projectNumber: number,
  workflowNumber: number,
  changes: { name?: string; enabled?: boolean; contentTypes?: string[]; actions?: Workflow["actions"] },
): Promise<Workflow> {
  const { projectId, page } = await resolveProject(creds, org, projectNumber);
  const all = await listWorkflows(creds, org, projectNumber);
  const wf = all.find((w) => w.number === workflowNumber);
  if (!wf) throw new Error(`Workflow #${workflowNumber} not found`);
  const body = {
    workflowNumber: wf.number,
    name: changes.name ?? wf.name,
    contentTypes: changes.contentTypes ?? wf.contentTypes,
    enabled: changes.enabled ?? wf.enabled,
    actions: changes.actions ?? wf.actions,
  };
  const result = await memexWorkflowCall(creds, projectId, "PUT", body, page);
  return (result.data as { workflow: Workflow }).workflow ?? wf;
}

// ── chart CRUD ──

export interface ChartConfiguration {
  filter?: string;
  type?: "column" | "line" | "bar";
  xAxis?: { dataSource: { column: number | string } };
  yAxis?: { aggregate: { operation: "count" | string } };
  time?: { period: string };
}

export interface ChartFull {
  name: string;
  number: number;
  configuration: ChartConfiguration;
}

async function memexChartCall(
  creds: GitHubCookies,
  projectId: number,
  method: "POST" | "PUT" | "DELETE",
  body: unknown,
  page: PageState,
): Promise<{ status: number; data: unknown }> {
  const url = `${GITHUB}/memexes/${projectId}/charts`;
  const resp = await fetch(url, {
    method,
    headers: {
      Accept: "application/json", "Content-Type": "application/json",
      "github-verified-fetch": "true", "x-requested-with": "XMLHttpRequest",
      "x-fetch-nonce": page.nonce, Cookie: buildCookieHeader(creds, page.ghSess),
      "User-Agent": "tsk-cli", Origin: GITHUB,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: unknown = null;
  const text = await resp.text();
  if (text) { try { data = JSON.parse(text); } catch { data = text.slice(0, 500); } }
  if (resp.status >= 400) {
    const msg = typeof data === "string" ? data.slice(0, 200) : JSON.stringify(data).slice(0, 200);
    throw new Error(`chart API ${method} failed (HTTP ${resp.status}). ${msg}`);
  }
  return { status: resp.status, data };
}

export async function createChart(
  creds: GitHubCookies,
  org: string,
  projectNumber: number,
  config: ChartConfiguration,
): Promise<ChartFull> {
  const { projectId, page } = await resolveProject(creds, org, projectNumber);
  const result = await memexChartCall(creds, projectId, "POST", { chart: { configuration: config } }, page);
  return (result.data as { chart: ChartFull }).chart;
}

export async function updateChart(
  creds: GitHubCookies,
  org: string,
  projectNumber: number,
  chartNumber: number,
  changes: { name?: string; configuration?: ChartConfiguration },
): Promise<ChartFull> {
  const { projectId, page } = await resolveProject(creds, org, projectNumber);
  const result = await memexChartCall(creds, projectId, "PUT", { chartNumber, chart: changes }, page);
  return (result.data as { chart: ChartFull }).chart;
}

export async function deleteChart(
  creds: GitHubCookies,
  org: string,
  projectNumber: number,
  chartNumber: number,
): Promise<void> {
  const { projectId, page } = await resolveProject(creds, org, projectNumber);
  await memexChartCall(creds, projectId, "DELETE", { chartNumber }, page);
}
