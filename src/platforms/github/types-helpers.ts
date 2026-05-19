// Local type shims for parsers.ts so it can stay decoupled from api.ts.
// These mirror the actual types in api.ts for testability.

export type Color =
  | "GRAY" | "BLUE" | "GREEN" | "YELLOW" | "ORANGE" | "RED" | "PINK" | "PURPLE";

export type ViewLayout = "table_layout" | "board_layout" | "roadmap_layout";

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

export type FieldValueInput =
  | { type: "singleSelect"; optionId: string }
  | { type: "text"; text: string }
  | { type: "number"; number: number }
  | { type: "date"; date: string }
  | { type: "iteration"; iterationId: string };
