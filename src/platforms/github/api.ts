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

export function getOrgId(org: string): string {
  type Resp = { organization?: { id: string } };
  const data = ghGraphQL<Resp>(`query { organization(login:"${org}") { id } }`);
  if (!data.organization?.id) throw new Error(`Organization '${org}' not found`);
  return data.organization.id;
}

export function listIssueTypes(org: string): IssueType[] {
  type Resp = { organization?: { issueTypes?: { nodes?: IssueType[] } } };
  const data = ghGraphQL<Resp>(
    `query { organization(login:"${org}") { issueTypes(first:50) { nodes { id name description color isEnabled } } } }`,
  );
  return data.organization?.issueTypes?.nodes ?? [];
}

export function findIssueType(org: string, name: string): IssueType {
  const types = listIssueTypes(org);
  const found = types.find((t) => t.name.toLowerCase() === name.toLowerCase());
  if (!found) {
    throw new Error(
      `Issue Type '${name}' not found in ${org}. Available: ${types.map((t) => t.name).join(", ")}`,
    );
  }
  return found;
}

export function createIssueType(
  org: string,
  args: { name: string; description?: string; color?: Color; isEnabled?: boolean },
): IssueType {
  const ownerId = getOrgId(org);
  const desc = args.description ?? "";
  const color = args.color ?? "GRAY";
  const enabled = args.isEnabled ?? true;
  type Resp = { createIssueType?: { issueType: IssueType } };
  const data = ghGraphQL<Resp>(
    `mutation { createIssueType(input: {ownerId: "${ownerId}", name: "${args.name}", description: "${desc}", color: ${color}, isEnabled: ${enabled}}) { issueType { id name description color isEnabled } } }`,
  );
  if (!data.createIssueType?.issueType) throw new Error("createIssueType returned no issueType");
  return data.createIssueType.issueType;
}

export function updateIssueType(
  org: string,
  name: string,
  changes: { name?: string; description?: string; color?: Color; isEnabled?: boolean },
): IssueType {
  const t = findIssueType(org, name);
  const parts: string[] = [`issueTypeId: "${t.id}"`];
  if (changes.name !== undefined) parts.push(`name: "${changes.name}"`);
  if (changes.description !== undefined) parts.push(`description: "${changes.description}"`);
  if (changes.color !== undefined) parts.push(`color: ${changes.color}`);
  if (changes.isEnabled !== undefined) parts.push(`isEnabled: ${changes.isEnabled}`);
  type Resp = { updateIssueType?: { issueType: IssueType } };
  const data = ghGraphQL<Resp>(
    `mutation { updateIssueType(input: {${parts.join(", ")}}) { issueType { id name description color isEnabled } } }`,
  );
  if (!data.updateIssueType?.issueType) throw new Error("updateIssueType returned no issueType");
  return data.updateIssueType.issueType;
}

export function deleteIssueType(org: string, name: string): void {
  const t = findIssueType(org, name);
  ghGraphQL<{ deleteIssueType?: unknown }>(
    `mutation { deleteIssueType(input: {issueTypeId: "${t.id}"}) { clientMutationId } }`,
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Issue Type assignment to issues
// ────────────────────────────────────────────────────────────────────────────

function getIssueId(owner: string, repo: string, number: number): string {
  type Resp = { repository?: { issue?: { id: string } } };
  const data = ghGraphQL<Resp>(
    `query { repository(owner:"${owner}", name:"${repo}") { issue(number:${number}) { id } } }`,
  );
  if (!data.repository?.issue?.id) {
    throw new Error(`Issue ${owner}/${repo}#${number} not found`);
  }
  return data.repository.issue.id;
}

export function setIssueType(
  org: string,
  owner: string,
  repo: string,
  number: number,
  typeName: string,
): void {
  const t = findIssueType(org, typeName);
  const id = getIssueId(owner, repo, number);
  ghGraphQL<{ updateIssue?: unknown }>(
    `mutation { updateIssue(input: {id: "${id}", issueTypeId: "${t.id}"}) { issue { number } } }`,
  );
}

export function listRepoIssues(
  owner: string,
  repo: string,
  filter: { state?: "OPEN" | "CLOSED" | "ALL"; milestone?: number; label?: string } = {},
): Array<{ id: string; number: number; title: string }> {
  const stateClause = filter.state && filter.state !== "ALL" ? `, states: [${filter.state}]` : "";
  const labelClause = filter.label ? `, filterBy: {labels: ["${filter.label}"]}` : "";
  type Resp = {
    repository?: {
      issues?: { nodes?: Array<{ id: string; number: number; title: string; milestone: { number: number } | null }> };
    };
  };
  const data = ghGraphQL<Resp>(
    `query { repository(owner:"${owner}", name:"${repo}") { issues(first:100${stateClause}${labelClause}, orderBy:{field:CREATED_AT, direction:ASC}) { nodes { id number title milestone { number } } } } }`,
  );
  let issues = data.repository?.issues?.nodes ?? [];
  if (filter.milestone !== undefined) {
    issues = issues.filter((i) => i.milestone?.number === filter.milestone);
  }
  return issues;
}

export function bulkSetIssueType(
  org: string,
  owner: string,
  repo: string,
  typeName: string,
  filter: { state?: "OPEN" | "CLOSED" | "ALL"; milestone?: number; label?: string } = {},
): { applied: number; skipped: number; total: number } {
  const t = findIssueType(org, typeName);
  const issues = listRepoIssues(owner, repo, filter);
  let applied = 0;
  let skipped = 0;
  for (const i of issues) {
    try {
      ghGraphQL<{ updateIssue?: unknown }>(
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
  name: string;
  dataType: string;
  options?: FieldOption[];
}

export function listProjectFields(org: string, projectNumber: number): ProjectField[] {
  type Resp = {
    organization?: {
      projectV2?: {
        fields?: {
          nodes?: Array<
            | { id: string; name: string; dataType: string }
            | { id: string; name: string; dataType: string; options: FieldOption[] }
          >;
        };
      };
    };
  };
  const data = ghGraphQL<Resp>(
    `query { organization(login:"${org}") { projectV2(number:${projectNumber}) { fields(first:50) { nodes { ... on ProjectV2FieldCommon { id name dataType } ... on ProjectV2SingleSelectField { id name dataType options { id name color description } } } } } } }`,
  );
  return (data.organization?.projectV2?.fields?.nodes ?? []) as ProjectField[];
}

export function findProjectField(org: string, projectNumber: number, name: string): ProjectField {
  const fields = listProjectFields(org, projectNumber);
  const found = fields.find((f) => f.name === name);
  if (!found) {
    throw new Error(
      `Field '${name}' not found in project. Available: ${fields.map((f) => f.name).join(", ")}`,
    );
  }
  return found;
}

export function updateFieldName(
  org: string,
  projectNumber: number,
  fieldName: string,
  newName: string,
): void {
  const field = findProjectField(org, projectNumber, fieldName);
  ghGraphQL<{ updateProjectV2Field?: unknown }>(
    `mutation { updateProjectV2Field(input: {fieldId: "${field.id}", name: "${newName}"}) { projectV2Field { ... on ProjectV2FieldCommon { id name } } } }`,
  );
}

/**
 * Replace ALL single-select options on a field. Caller passes the full new list.
 * Useful as building block for add/update/delete-one operations.
 */
export function setFieldOptions(
  org: string,
  projectNumber: number,
  fieldName: string,
  options: Array<{ id?: string; name: string; color: Color; description: string }>,
): void {
  const field = findProjectField(org, projectNumber, fieldName);
  if (!field.options) {
    throw new Error(`Field '${fieldName}' is not a single-select field`);
  }
  const optsLiteral = options.map((o) => {
    const idPart = o.id ? `id: "${o.id}", ` : "";
    return `{${idPart}name: "${o.name}", color: ${o.color}, description: "${o.description}"}`;
  }).join(", ");
  ghGraphQL<{ updateProjectV2Field?: unknown }>(
    `mutation { updateProjectV2Field(input: {fieldId: "${field.id}", singleSelectOptions: [${optsLiteral}]}) { projectV2Field { ... on ProjectV2SingleSelectField { id name } } } }`,
  );
}

export function addFieldOption(
  org: string,
  projectNumber: number,
  fieldName: string,
  optionName: string,
  color: Color = "GRAY",
  description: string = "",
): void {
  const field = findProjectField(org, projectNumber, fieldName);
  if (!field.options) throw new Error(`Field '${fieldName}' is not single-select`);
  if (field.options.some((o) => o.name === optionName)) {
    throw new Error(`Option '${optionName}' already exists on field '${fieldName}'`);
  }
  const next = [
    ...field.options.map((o) => ({ id: o.id, name: o.name, color: o.color, description: o.description ?? "" })),
    { name: optionName, color, description },
  ];
  setFieldOptions(org, projectNumber, fieldName, next);
}

export function updateFieldOption(
  org: string,
  projectNumber: number,
  fieldName: string,
  optionName: string,
  changes: { name?: string; color?: Color; description?: string },
): void {
  const field = findProjectField(org, projectNumber, fieldName);
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
  setFieldOptions(org, projectNumber, fieldName, next);
}

export function deleteFieldOption(
  org: string,
  projectNumber: number,
  fieldName: string,
  optionName: string,
): void {
  const field = findProjectField(org, projectNumber, fieldName);
  if (!field.options) throw new Error(`Field '${fieldName}' is not single-select`);
  const next = field.options
    .filter((o) => o.name !== optionName)
    .map((o) => ({ id: o.id, name: o.name, color: o.color, description: o.description ?? "" }));
  if (next.length === field.options.length) {
    throw new Error(`Option '${optionName}' not found on field '${fieldName}'`);
  }
  setFieldOptions(org, projectNumber, fieldName, next);
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

export function listProjectItems(org: string, projectNumber: number): ProjectItem[] {
  type Resp = {
    organization?: {
      projectV2?: {
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
  const data = ghGraphQL<Resp>(
    `query { organization(login:"${org}") { projectV2(number:${projectNumber}) { items(first:100) { nodes { id content { ... on Issue { number title } ... on PullRequest { number title } ... on DraftIssue { title } } fieldValues(first:30) { nodes { ... on ProjectV2ItemFieldSingleSelectValue { __typename name field { ... on ProjectV2SingleSelectField { name } } } ... on ProjectV2ItemFieldTextValue { __typename text field { ... on ProjectV2Field { name } } } ... on ProjectV2ItemFieldNumberValue { __typename number field { ... on ProjectV2Field { name } } } ... on ProjectV2ItemFieldDateValue { __typename date field { ... on ProjectV2Field { name } } } } } } } } } }`,
  );
  const items = data.organization?.projectV2?.items?.nodes ?? [];
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

export function getProjectId(org: string, projectNumber: number): string {
  type Resp = { organization?: { projectV2?: { id: string } } };
  const data = ghGraphQL<Resp>(
    `query { organization(login:"${org}") { projectV2(number:${projectNumber}) { id } } }`,
  );
  if (!data.organization?.projectV2?.id) {
    throw new Error(`Project ${org}/projects/${projectNumber} not found`);
  }
  return data.organization.projectV2.id;
}

/**
 * Set a single-select field value on one item.
 */
export function setItemSingleSelect(
  projectNodeId: string,
  itemId: string,
  fieldId: string,
  optionId: string,
): void {
  ghGraphQL<{ updateProjectV2ItemFieldValue?: unknown }>(
    `mutation { updateProjectV2ItemFieldValue(input: {projectId: "${projectNodeId}", itemId: "${itemId}", fieldId: "${fieldId}", value: {singleSelectOptionId: "${optionId}"}}) { projectV2Item { id } } }`,
  );
}

/**
 * Bulk set a single-select field value on items matching --where filter.
 * --where syntax: "FieldName=Value" (single condition).
 * Returns counts of applied/skipped.
 */
export function bulkSetSingleSelect(
  org: string,
  projectNumber: number,
  targetFieldName: string,
  targetValue: string,
  where: { field: string; value: string } | null,
): { applied: number; total: number; matched: number } {
  const projectNodeId = getProjectId(org, projectNumber);
  const targetField = findProjectField(org, projectNumber, targetFieldName);
  if (!targetField.options) {
    throw new Error(`Field '${targetFieldName}' is not single-select`);
  }
  const targetOpt = targetField.options.find((o) => o.name === targetValue);
  if (!targetOpt) {
    throw new Error(
      `Option '${targetValue}' not found on field '${targetFieldName}'. Available: ${targetField.options.map((o) => o.name).join(", ")}`,
    );
  }

  const items = listProjectItems(org, projectNumber);
  const matched = where
    ? items.filter((i) => i.fields[where.field] === where.value)
    : items;

  let applied = 0;
  for (const i of matched) {
    setItemSingleSelect(projectNodeId, i.itemId, targetField.id, targetOpt.id);
    applied++;
  }
  return { applied, total: items.length, matched: matched.length };
}
