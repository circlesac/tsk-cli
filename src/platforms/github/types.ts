export interface GitHubCookies {
  userSession: string;
  ghSess: string;
  dotcomUser: string;
  browser: string;
  storedAt: number;
  /**
   * GitHub PAT or OAuth token, used for api.github.com (Bearer auth).
   * Captured during `tsk github auth login` from gh CLI's stored token
   * (or via --gh-token flag). The /memexes/ endpoints don't accept Bearer
   * so we keep both this token and the browser session cookie.
   */
  ghToken?: string;
}

export type ViewLayout = "table_layout" | "board_layout" | "roadmap_layout";

export interface ViewConfig {
  name: string;
  layout: ViewLayout;
  filter?: string;
  groupBy?: number[];
  verticalGroupBy?: number[];
  sortBy?: [number, "asc" | "desc"][];
  visibleFields?: number[];
  sliceBy?: { field: number; filter: string };
  aggregationSettings?: { hideItemsCount: boolean; sum: number[] };
  layoutSettings?: Record<string, unknown>;
}

export interface FullView extends ViewConfig {
  id: number;
  number: number;
  priority: number;
  createdAt: string;
  updatedAt: string;
}
