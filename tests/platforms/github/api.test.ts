// API-level tests with `fetch` and `execSync` mocked.
// These cover the body shapes our code sends to GitHub — the most likely
// regression source if GitHub schemas drift.

import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock execSync (gh CLI shell out) BEFORE importing api.ts
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

import { execSync } from "node:child_process";
import * as api from "../../../src/platforms/github/api.js";
import type { GitHubCookies } from "../../../src/platforms/github/types.js";

const mockedExecSync = vi.mocked(execSync);

const creds: GitHubCookies = {
  userSession: "us123",
  ghSess: "gh123",
  dotcomUser: "test-user",
  browser: "Chrome",
  storedAt: 1700000000,
};

// Fetch mock helper
interface FetchCall {
  url: string;
  method: string;
  body?: string;
  headers: Record<string, string>;
}

function setupFetchMock(responses: Array<{ status: number; body?: unknown; setCookie?: string[]; text?: string }>) {
  const calls: FetchCall[] = [];
  let idx = 0;
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = typeof url === "string" ? url : url.toString();
    const method = init?.method ?? "GET";
    const body = init?.body as string | undefined;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url: u, method, body, headers });
    const r = responses[idx++] ?? { status: 200, body: {} };
    // 204 (and 205, 304) must have empty body per Fetch spec
    const noBodyStatus = r.status === 204 || r.status === 205 || r.status === 304;
    const responseBody = noBodyStatus ? null : (r.text ?? JSON.stringify(r.body ?? {}));
    return new Response(responseBody, {
      status: r.status,
      headers: r.setCookie ? { "set-cookie": r.setCookie.join(", ") } : {},
    }) as unknown as Response;
  }) as never;
  return calls;
}

// Helper: queue up an execSync response (for ghGraphQL)
function queueGhResponse(data: unknown) {
  mockedExecSync.mockImplementationOnce(() => JSON.stringify({ data }));
}

// Helper for fetchPageState: returns project page HTML with a nonce
function pageHtmlWithNonce(nonce: string): { status: number; text: string; setCookie?: string[] } {
  return {
    status: 200,
    text: `<html><head><meta name="fetch-nonce" content="${nonce}"></head><body></body></html>`,
    setCookie: ["_gh_sess=rotated-sess-abc"],
  };
}

beforeEach(() => {
  mockedExecSync.mockReset();
  // ownerKindCache is module-scoped — clear by re-importing? Easier: pre-prime cache for our test org.
  // Use the helper directly since cache check happens first.
  mockedExecSync.mockImplementation(() => 'Organization\n');
  api.getOwnerKind("testorg"); // primes cache
  mockedExecSync.mockReset(); // now reset for actual test
});

// listViews command was removed (gh covers view listing). getViewStateFull
// (single view by number) covers the read path now.

describe("getViewStateFull", () => {
  it("returns view state with integer databaseIds extracted from connections", () => {
    queueGhResponse({
      owner: {
        projectV2: {
          views: {
            nodes: [
              {
                number: 3,
                name: "Board",
                layout: "BOARD_LAYOUT",
                filter: "",
                groupByFields: { nodes: [] },
                sortByFields: { nodes: [{ direction: "ASC", field: { databaseId: 100 } }] },
                verticalGroupByFields: { nodes: [{ databaseId: 200 }] },
                fields: { nodes: [{ databaseId: 100 }, { databaseId: 200 }] },
              },
            ],
          },
        },
      },
    });

    const state = api.getViewStateFull("testorg", 3, 3);
    expect(state.name).toBe("Board");
    expect(state.layout).toBe("BOARD_LAYOUT");
    expect(state.sortBy).toEqual([[100, "asc"]]);
    expect(state.verticalGroupBy).toEqual([200]);
    expect(state.visibleFields).toEqual([100, 200]);
  });

  it("throws when view number not found", () => {
    queueGhResponse({ owner: { projectV2: { views: { nodes: [] } } } });
    expect(() => api.getViewStateFull("testorg", 3, 99)).toThrow(/View #99 not found/);
  });
});

describe("createView", () => {
  it("POSTs to /memexes/<id>/views with correct body shape and headers", async () => {
    queueGhResponse({ owner: { projectV2: { fullDatabaseId: 12345 } } });
    const calls = setupFetchMock([
      // fetchPageState
      pageHtmlWithNonce("v2:test-nonce"),
      // memex POST
      { status: 201, body: { view: { id: 1, number: 4, name: "Roadmap", layout: "roadmap_layout", priority: 0, createdAt: "x", updatedAt: "x", configuration: {} } } },
    ]);

    const v = await api.createView(creds, "testorg", 3, {
      name: "Roadmap",
      layout: "roadmap_layout",
      filter: "type:Epic",
      groupBy: [],
      sortBy: [],
      visibleFields: [],
      verticalGroupBy: [],
    });

    expect(v.number).toBe(4);

    // Two fetch calls: page state, then POST
    expect(calls).toHaveLength(2);
    expect(calls[1]!.method).toBe("POST");
    expect(calls[1]!.url).toBe("https://github.com/memexes/12345/views");
    expect(calls[1]!.headers["x-fetch-nonce"]).toBe("v2:test-nonce");
    expect(calls[1]!.headers["github-verified-fetch"]).toBe("true");
    expect(calls[1]!.headers["x-requested-with"]).toBe("XMLHttpRequest");
    // Cookie header — fetch lowercases all header names internally but our test
    // captures whatever the init.headers was. We sent "Cookie" so look it up.
    const cookieHeader = calls[1]!.headers["Cookie"] ?? calls[1]!.headers["cookie"] ?? "";
    expect(cookieHeader).toContain("_gh_sess=rotated-sess-abc");
    const body = JSON.parse(calls[1]!.body!);
    expect(body).toEqual({
      view: {
        name: "Roadmap",
        layout: "roadmap_layout",
        filter: "type:Epic",
        groupBy: [],
        sortBy: [],
        visibleFields: [],
        verticalGroupBy: [],
      },
    });
  });
});

describe("updateView", () => {
  it("PUTs with viewNumber in body", async () => {
    queueGhResponse({ owner: { projectV2: { fullDatabaseId: 12345 } } });
    const calls = setupFetchMock([
      pageHtmlWithNonce("v2:nonce-update"),
      { status: 200, body: { view: { id: 1, number: 2, name: "Roadmap-Renamed", layout: "roadmap_layout", priority: 0, createdAt: "x", updatedAt: "y" } } },
    ]);

    await api.updateView(creds, "testorg", 3, 2, {
      name: "Roadmap-Renamed",
      layout: "roadmap_layout",
      filter: "type:Epic",
      groupBy: [],
      sortBy: [],
      visibleFields: [],
      verticalGroupBy: [],
    });

    expect(calls[1]!.method).toBe("PUT");
    const body = JSON.parse(calls[1]!.body!);
    expect(body.viewNumber).toBe(2);
    expect(body.view.name).toBe("Roadmap-Renamed");
  });
});

describe("deleteView", () => {
  it("DELETEs with viewNumber in body", async () => {
    queueGhResponse({ owner: { projectV2: { fullDatabaseId: 12345 } } });
    const calls = setupFetchMock([
      pageHtmlWithNonce("v2:nonce-del"),
      { status: 204, body: {} },
    ]);

    await api.deleteView(creds, "testorg", 3, 5);

    expect(calls[1]!.method).toBe("DELETE");
    expect(calls[1]!.url).toBe("https://github.com/memexes/12345/views");
    expect(JSON.parse(calls[1]!.body!)).toEqual({ viewNumber: 5 });
  });
});

describe("createChart", () => {
  it("POSTs configuration body to /memexes/<id>/charts", async () => {
    queueGhResponse({ owner: { projectV2: { fullDatabaseId: 99 } } });
    const calls = setupFetchMock([
      pageHtmlWithNonce("v2:chart-nonce"),
      { status: 201, body: { chart: { number: 1, name: "Chart 1", configuration: {} } } },
    ]);

    await api.createChart(creds, "testorg", 3, {
      type: "column",
      xAxis: { dataSource: { column: 1234 } },
      yAxis: { aggregate: { operation: "count" } },
      filter: "",
    });

    expect(calls[1]!.method).toBe("POST");
    expect(calls[1]!.url).toBe("https://github.com/memexes/99/charts");
    expect(JSON.parse(calls[1]!.body!)).toEqual({
      chart: {
        configuration: {
          type: "column",
          xAxis: { dataSource: { column: 1234 } },
          yAxis: { aggregate: { operation: "count" } },
          filter: "",
        },
      },
    });
  });
});

describe("updateChart / deleteChart", () => {
  it("PUTs with chartNumber + partial chart in body", async () => {
    queueGhResponse({ owner: { projectV2: { fullDatabaseId: 99 } } });
    const calls = setupFetchMock([
      pageHtmlWithNonce("v2:n"),
      { status: 200, body: { chart: { number: 2, name: "Renamed", configuration: {} } } },
    ]);

    await api.updateChart(creds, "testorg", 3, 2, { name: "Renamed" });
    expect(calls[1]!.method).toBe("PUT");
    expect(JSON.parse(calls[1]!.body!)).toEqual({ chartNumber: 2, chart: { name: "Renamed" } });
  });

  it("DELETEs with chartNumber", async () => {
    queueGhResponse({ owner: { projectV2: { fullDatabaseId: 99 } } });
    const calls = setupFetchMock([
      pageHtmlWithNonce("v2:n"),
      { status: 204, body: {} },
    ]);

    await api.deleteChart(creds, "testorg", 3, 2);
    expect(calls[1]!.method).toBe("DELETE");
    expect(JSON.parse(calls[1]!.body!)).toEqual({ chartNumber: 2 });
  });
});

describe("issue type CRUD", () => {
  it("createIssueType uses org node ID and PURPLE color enum", () => {
    queueGhResponse({ organization: { id: "ORG_NODE_ID" } });
    queueGhResponse({ createIssueType: { issueType: { id: "IT_X", name: "Epic", description: "", color: "PURPLE", isEnabled: true } } });

    const t = api.createIssueType("testorg", { name: "Epic", color: "PURPLE", description: "" });
    expect(t.name).toBe("Epic");

    // first call: getOrgId, second: createIssueType
    expect(mockedExecSync).toHaveBeenCalledTimes(2);
    const createCall = (mockedExecSync.mock.calls[1]?.[0] ?? "") as string;
    expect(createCall).toContain('ownerId: \\"ORG_NODE_ID\\"');
    expect(createCall).toContain("color: PURPLE");
    expect(createCall).toContain('name: \\"Epic\\"');
  });
});

describe("workflow toggle preserves all fields on PUT", () => {
  it("re-sends contentTypes and actions when only flipping enabled", async () => {
    // toggleWorkflow → resolveProject(GH) + listWorkflows(resolveProject + pageState + GET) + resolveProject(GH) + pageState + PUT
    // Order of GraphQL (execSync) calls: 2 resolveProject calls
    queueGhResponse({ owner: { projectV2: { fullDatabaseId: 99 } } }); // toggle → resolveProject (outer)
    queueGhResponse({ owner: { projectV2: { fullDatabaseId: 99 } } }); // listWorkflows → resolveProject

    const calls = setupFetchMock([
      pageHtmlWithNonce("v2:toggle-outer"), // pageState for toggleWorkflow's resolveProject
      pageHtmlWithNonce("v2:list"),         // pageState for listWorkflows's resolveProject
      { status: 200, body: { workflows: [{ id: 1, name: "WF1", number: 1, triggerType: "closed", contentTypes: ["Issue"], enabled: true, actions: [{ id: 99, actionType: "set_field", arguments: { fieldId: 7 } }] }] } },
      // PUT
      { status: 200, body: { workflow: { number: 1, name: "WF1", enabled: false } } },
    ]);

    await api.toggleWorkflow(creds, "testorg", 3, 1, false);

    // The PUT request (last call) should re-send all workflow fields
    const putCall = calls[calls.length - 1]!;
    expect(putCall.method).toBe("PUT");
    expect(putCall.url).toBe("https://github.com/memexes/99/workflows");
    const body = JSON.parse(putCall.body!);
    expect(body).toEqual({
      workflowNumber: 1,
      name: "WF1",
      contentTypes: ["Issue"],
      enabled: false,
      actions: [{ id: 99, actionType: "set_field", arguments: { fieldId: 7 } }],
    });
  });
});

describe("recolorOptions", () => {
  it("only changes options in map, preserves others, skips unknown names", async () => {
    // findProjectField → listProjectFields
    queueGhResponse({
      owner: {
        projectV2: {
          fields: {
            nodes: [
              {
                id: "FIELD_X",
                name: "Status",
                dataType: "SINGLE_SELECT",
                options: [
                  { id: "o1", name: "Todo", color: "GRAY", description: "" },
                  { id: "o2", name: "Done", color: "GREEN", description: "" },
                  { id: "o3", name: "Backlog", color: "GRAY", description: "" },
                ],
              },
            ],
          },
        },
      },
    });
    // setFieldOptions → findProjectField again (one more list)
    queueGhResponse({
      owner: {
        projectV2: {
          fields: {
            nodes: [
              {
                id: "FIELD_X",
                name: "Status",
                dataType: "SINGLE_SELECT",
                options: [
                  { id: "o1", name: "Todo", color: "GRAY", description: "" },
                  { id: "o2", name: "Done", color: "GREEN", description: "" },
                  { id: "o3", name: "Backlog", color: "GRAY", description: "" },
                ],
              },
            ],
          },
        },
      },
    });
    // updateProjectV2Field
    queueGhResponse({ updateProjectV2Field: { projectV2Field: { id: "FIELD_X", name: "Status" } } });

    const result = api.recolorOptions("testorg", 3, "Status", {
      Todo: "BLUE",
      Backlog: "PURPLE",
      Nonexistent: "RED",
    });

    expect(result.changed).toBe(2);
    expect(result.skipped).toEqual(["Nonexistent"]);

    // Inspect the mutation that was sent
    const mutationCall = (mockedExecSync.mock.calls[mockedExecSync.mock.calls.length - 1]?.[0] ?? "") as string;
    expect(mutationCall).toContain("updateProjectV2Field");
    expect(mutationCall).toContain('color: BLUE'); // Todo's new color
    expect(mutationCall).toContain('color: PURPLE'); // Backlog's new color
    expect(mutationCall).toContain('color: GREEN'); // Done preserved
  });
});

describe("setIssueType (single)", () => {
  it("calls updateIssue with resolved issue node ID and type ID", () => {
    // findIssueType: listIssueTypes
    queueGhResponse({
      organization: {
        issueTypes: { nodes: [{ id: "IT_EPIC", name: "Epic", color: "PURPLE", description: "", isEnabled: true }] },
      },
    });
    // getIssueId
    queueGhResponse({ repository: { issue: { id: "ISSUE_NODE_42" } } });
    // updateIssue
    queueGhResponse({ updateIssue: {} });

    api.setIssueType("testorg", "owner", "repo", 42, "Epic");

    const mutation = (mockedExecSync.mock.calls[2]?.[0] ?? "") as string;
    expect(mutation).toContain('updateIssue(input: {id: \\"ISSUE_NODE_42\\", issueTypeId: \\"IT_EPIC\\"})');
  });
});
