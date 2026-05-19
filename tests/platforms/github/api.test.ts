// API-level tests with `fetch` mocked (and execSync mocked for owner-kind probe).
// These cover the body shapes our code sends to GitHub — the most likely
// regression source if GitHub schemas drift.

import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock execSync (only used by getOwnerKind probe) BEFORE importing api.ts
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

// Mock credentials.loadCookies so getApiToken returns our test ghToken
vi.mock("../../../src/platforms/github/credentials.js", () => ({
  loadCookies: vi.fn(async () => ({
    userSession: "us123",
    ghSess: "gh123",
    dotcomUser: "test-user",
    browser: "Chrome",
    storedAt: 1700000000,
    ghToken: "test-token",
  })),
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
  ghToken: "test-token",
};

// Unified fetch mock — handles both api.github.com/graphql and github.com/memexes/...
interface FetchCall {
  url: string;
  method: string;
  body?: string;
  headers: Record<string, string>;
}

interface QueuedResponse {
  status: number;
  body?: unknown;
  setCookie?: string[];
  text?: string;
}

let fetchCalls: FetchCall[] = [];
let fetchQueue: QueuedResponse[] = [];

function setupFetch() {
  fetchCalls = [];
  fetchQueue = [];
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = typeof url === "string" ? url : url.toString();
    const method = init?.method ?? "GET";
    const body = init?.body as string | undefined;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    fetchCalls.push({ url: u, method, body, headers });
    const r = fetchQueue.shift() ?? { status: 200, body: {} };
    const noBodyStatus = r.status === 204 || r.status === 205 || r.status === 304;
    const responseBody = noBodyStatus ? null : (r.text ?? JSON.stringify(r.body ?? {}));
    return new Response(responseBody, {
      status: r.status,
      headers: r.setCookie ? { "set-cookie": r.setCookie.join(", ") } : {},
    }) as unknown as Response;
  }) as never;
  return fetchCalls;
}

function queueGraphQL(data: unknown) {
  fetchQueue.push({ status: 200, body: { data } });
}

function queuePage(nonce: string) {
  fetchQueue.push({
    status: 200,
    text: `<html><head><meta name="fetch-nonce" content="${nonce}"></head><body></body></html>`,
    setCookie: ["_gh_sess=rotated-sess-abc"],
  });
}

function queueResponse(r: QueuedResponse) {
  fetchQueue.push(r);
}

beforeEach(() => {
  mockedExecSync.mockReset();
  // getOwnerKind uses execSync to probe `gh api users/<login>`. Prime cache.
  mockedExecSync.mockImplementation(() => "Organization\n");
  api.getOwnerKind("testorg");
  api.getOwnerKind("owner"); // for setIssueType repo owner
  mockedExecSync.mockReset();
  setupFetch();
});

// Find the n-th GraphQL fetch call (URL = api.github.com/graphql)
function graphqlCalls(): FetchCall[] {
  return fetchCalls.filter((c) => c.url === "https://api.github.com/graphql");
}

// Find the n-th memex fetch call
function memexCalls(): FetchCall[] {
  return fetchCalls.filter((c) => c.url.startsWith("https://github.com/memexes/"));
}

describe("getViewStateFull", () => {
  it("returns view state with integer databaseIds extracted from connections", async () => {
    queueGraphQL({
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

    const state = await api.getViewStateFull("testorg", 3, 3);
    expect(state.name).toBe("Board");
    expect(state.layout).toBe("BOARD_LAYOUT");
    expect(state.sortBy).toEqual([[100, "asc"]]);
    expect(state.verticalGroupBy).toEqual([200]);
    expect(state.visibleFields).toEqual([100, 200]);
  });

  it("throws when view number not found", async () => {
    queueGraphQL({ owner: { projectV2: { views: { nodes: [] } } } });
    await expect(api.getViewStateFull("testorg", 3, 99)).rejects.toThrow(/View #99 not found/);
  });
});

describe("createView", () => {
  it("POSTs to /memexes/<id>/views with correct body shape and headers", async () => {
    queueGraphQL({ owner: { projectV2: { fullDatabaseId: 12345 } } }); // resolveProject
    queuePage("v2:test-nonce");
    queueResponse({
      status: 201,
      body: {
        view: {
          id: 1, number: 4, name: "Roadmap", layout: "roadmap_layout",
          priority: 0, createdAt: "x", updatedAt: "x", configuration: {},
        },
      },
    });

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

    const mx = memexCalls();
    expect(mx).toHaveLength(1);
    expect(mx[0]!.method).toBe("POST");
    expect(mx[0]!.url).toBe("https://github.com/memexes/12345/views");
    expect(mx[0]!.headers["x-fetch-nonce"]).toBe("v2:test-nonce");
    expect(mx[0]!.headers["github-verified-fetch"]).toBe("true");
    expect(mx[0]!.headers["x-requested-with"]).toBe("XMLHttpRequest");
    const cookieHeader = mx[0]!.headers["Cookie"] ?? mx[0]!.headers["cookie"] ?? "";
    expect(cookieHeader).toContain("_gh_sess=rotated-sess-abc");
    const body = JSON.parse(mx[0]!.body!);
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
    queueGraphQL({ owner: { projectV2: { fullDatabaseId: 12345 } } });
    queuePage("v2:nonce-update");
    queueResponse({
      status: 200,
      body: {
        view: {
          id: 1, number: 2, name: "Roadmap-Renamed", layout: "roadmap_layout",
          priority: 0, createdAt: "x", updatedAt: "y",
        },
      },
    });

    await api.updateView(creds, "testorg", 3, 2, {
      name: "Roadmap-Renamed",
      layout: "roadmap_layout",
      filter: "type:Epic",
      groupBy: [],
      sortBy: [],
      visibleFields: [],
      verticalGroupBy: [],
    });

    const mx = memexCalls();
    expect(mx[0]!.method).toBe("PUT");
    const body = JSON.parse(mx[0]!.body!);
    expect(body.viewNumber).toBe(2);
    expect(body.view.name).toBe("Roadmap-Renamed");
  });
});

describe("deleteView", () => {
  it("DELETEs with viewNumber in body", async () => {
    queueGraphQL({ owner: { projectV2: { fullDatabaseId: 12345 } } });
    queuePage("v2:nonce-del");
    queueResponse({ status: 204 });

    await api.deleteView(creds, "testorg", 3, 5);

    const mx = memexCalls();
    expect(mx[0]!.method).toBe("DELETE");
    expect(mx[0]!.url).toBe("https://github.com/memexes/12345/views");
    expect(JSON.parse(mx[0]!.body!)).toEqual({ viewNumber: 5 });
  });
});

describe("createChart", () => {
  it("POSTs configuration body to /memexes/<id>/charts", async () => {
    queueGraphQL({ owner: { projectV2: { fullDatabaseId: 99 } } });
    queuePage("v2:chart-nonce");
    queueResponse({ status: 201, body: { chart: { number: 1, name: "Chart 1", configuration: {} } } });

    await api.createChart(creds, "testorg", 3, {
      type: "column",
      xAxis: { dataSource: { column: 1234 } },
      yAxis: { aggregate: { operation: "count" } },
      filter: "",
    });

    const mx = memexCalls();
    expect(mx[0]!.method).toBe("POST");
    expect(mx[0]!.url).toBe("https://github.com/memexes/99/charts");
    expect(JSON.parse(mx[0]!.body!)).toEqual({
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
    queueGraphQL({ owner: { projectV2: { fullDatabaseId: 99 } } });
    queuePage("v2:n");
    queueResponse({ status: 200, body: { chart: { number: 2, name: "Renamed", configuration: {} } } });

    await api.updateChart(creds, "testorg", 3, 2, { name: "Renamed" });
    const mx = memexCalls();
    expect(mx[0]!.method).toBe("PUT");
    expect(JSON.parse(mx[0]!.body!)).toEqual({ chartNumber: 2, chart: { name: "Renamed" } });
  });

  it("DELETEs with chartNumber", async () => {
    queueGraphQL({ owner: { projectV2: { fullDatabaseId: 99 } } });
    queuePage("v2:n");
    queueResponse({ status: 204 });

    await api.deleteChart(creds, "testorg", 3, 2);
    const mx = memexCalls();
    expect(mx[0]!.method).toBe("DELETE");
    expect(JSON.parse(mx[0]!.body!)).toEqual({ chartNumber: 2 });
  });
});

describe("issue type CRUD", () => {
  it("createIssueType uses org node ID and PURPLE color enum", async () => {
    queueGraphQL({ organization: { id: "ORG_NODE_ID" } });
    queueGraphQL({
      createIssueType: {
        issueType: { id: "IT_X", name: "Epic", description: "", color: "PURPLE", isEnabled: true },
      },
    });

    const t = await api.createIssueType("testorg", { name: "Epic", color: "PURPLE", description: "" });
    expect(t.name).toBe("Epic");

    const gq = graphqlCalls();
    expect(gq).toHaveLength(2);
    const createBody = JSON.parse(gq[1]!.body!);
    expect(createBody.query).toContain('ownerId: "ORG_NODE_ID"');
    expect(createBody.query).toContain("color: PURPLE");
    expect(createBody.query).toContain('name: "Epic"');
  });
});

describe("workflow toggle preserves all fields on PUT", () => {
  it("re-sends contentTypes and actions when only flipping enabled", async () => {
    // toggleWorkflow call order:
    // 1. resolveProject (outer): GraphQL + pageState
    // 2. listWorkflows → resolveProject (inner): GraphQL + pageState + GET /workflows
    // 3. PUT /workflows (uses outer page)
    queueGraphQL({ owner: { projectV2: { fullDatabaseId: 99 } } }); // outer resolveProject
    queuePage("v2:toggle-outer");                                   // outer pageState
    queueGraphQL({ owner: { projectV2: { fullDatabaseId: 99 } } }); // inner resolveProject
    queuePage("v2:list");                                           // inner pageState
    queueResponse({
      status: 200,
      body: {
        workflows: [{
          id: 1, name: "WF1", number: 1, triggerType: "closed",
          contentTypes: ["Issue"], enabled: true,
          actions: [{ id: 99, actionType: "set_field", arguments: { fieldId: 7 } }],
        }],
      },
    });
    queueResponse({ status: 200, body: { workflow: { number: 1, name: "WF1", enabled: false } } });

    await api.toggleWorkflow(creds, "testorg", 3, 1, false);

    const mx = memexCalls();
    // 1: listWorkflows GET, 2: toggle PUT
    const putCall = mx[mx.length - 1]!;
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
    // findProjectField → listProjectFields (1st)
    queueGraphQL({
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
    // setFieldOptions → findProjectField (2nd)
    queueGraphQL({
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
    queueGraphQL({ updateProjectV2Field: { projectV2Field: { id: "FIELD_X", name: "Status" } } });

    const result = await api.recolorOptions("testorg", 3, "Status", {
      Todo: "BLUE",
      Backlog: "PURPLE",
      Nonexistent: "RED",
    });

    expect(result.changed).toBe(2);
    expect(result.skipped).toEqual(["Nonexistent"]);

    const gq = graphqlCalls();
    const mutation = JSON.parse(gq[gq.length - 1]!.body!).query as string;
    expect(mutation).toContain("updateProjectV2Field");
    expect(mutation).toContain("color: BLUE"); // Todo's new color
    expect(mutation).toContain("color: PURPLE"); // Backlog's new color
    expect(mutation).toContain("color: GREEN"); // Done preserved
  });
});

describe("setIssueType (single)", () => {
  it("calls updateIssue with resolved issue node ID and type ID", async () => {
    // findIssueType: listIssueTypes
    queueGraphQL({
      organization: {
        issueTypes: { nodes: [{ id: "IT_EPIC", name: "Epic", color: "PURPLE", description: "", isEnabled: true }] },
      },
    });
    // getIssueId
    queueGraphQL({ repository: { issue: { id: "ISSUE_NODE_42" } } });
    // updateIssue
    queueGraphQL({ updateIssue: {} });

    await api.setIssueType("testorg", "owner", "repo", 42, "Epic");

    const gq = graphqlCalls();
    expect(gq).toHaveLength(3);
    const mutation = JSON.parse(gq[2]!.body!).query as string;
    expect(mutation).toContain('updateIssue(input: {id: "ISSUE_NODE_42", issueTypeId: "IT_EPIC"})');
  });
});
