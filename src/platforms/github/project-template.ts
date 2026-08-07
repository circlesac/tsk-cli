import { readFile } from "node:fs/promises";
import type { GitHubCookies, ViewConfig, ViewLayout } from "./types.js";
import {
  createSingleSelectField,
  createTextField,
  createView,
  getProject,
  listProjectFields,
  listProjectViews,
  markProjectAsTemplate,
  setFieldOptions,
  updateProjectMetadata,
  updateView,
  type Color,
  type ProjectField,
} from "./api.js";

const COLORS = new Set<Color>(["GRAY", "BLUE", "GREEN", "YELLOW", "ORANGE", "RED", "PINK", "PURPLE"]);
const LAYOUTS: Record<string, ViewLayout> = {
  TABLE_LAYOUT: "table_layout",
  BOARD_LAYOUT: "board_layout",
  ROADMAP_LAYOUT: "roadmap_layout",
  table_layout: "table_layout",
  board_layout: "board_layout",
  roadmap_layout: "roadmap_layout",
};

export interface ProjectTemplateManifest {
  version: number;
  template?: {
    title?: string;
    shortDescription?: string;
    readme?: string;
  };
  fields: Array<{
    name: string;
    dataType: "SINGLE_SELECT" | "TEXT";
    options?: Array<{ name: string; color: Color; description: string }>;
  }>;
  views: Array<{
    name: string;
    layout: "TABLE_LAYOUT" | "BOARD_LAYOUT" | "ROADMAP_LAYOUT";
    filter: string | null;
    visibleFields: string[];
    sliceByField?: string | null;
    sliceByReviewTypes?: string[];
  }>;
}

export interface ProjectTemplateSyncSummary {
  project: number;
  title: string;
  template: true;
  fieldsCreated: string[];
  fieldsUpdated: string[];
  viewsCreated: string[];
  viewsUpdated: string[];
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Project template must be a JSON object");
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value;
}

export function parseProjectTemplate(value: unknown): ProjectTemplateManifest {
  const root = record(value);
  if (!Number.isInteger(root.version) || Number(root.version) < 1) {
    throw new Error("version must be a positive integer");
  }
  if (!Array.isArray(root.fields) || !Array.isArray(root.views)) {
    throw new Error("fields and views must be arrays");
  }
  const template = root.template === undefined ? undefined : record(root.template);
  const fields = root.fields.map((value, index) => {
    const field = record(value);
    const dataType = nonEmptyString(field.dataType, `fields[${index}].dataType`) as "SINGLE_SELECT" | "TEXT";
    if (dataType !== "SINGLE_SELECT" && dataType !== "TEXT") {
      throw new Error(`fields[${index}].dataType must be SINGLE_SELECT or TEXT`);
    }
    const options = field.options === undefined ? undefined : (field.options as unknown[]).map((value, optionIndex) => {
      const option = record(value);
      const color = nonEmptyString(option.color, `fields[${index}].options[${optionIndex}].color`) as Color;
      if (!COLORS.has(color)) throw new Error(`Unsupported color: ${color}`);
      return {
        name: nonEmptyString(option.name, `fields[${index}].options[${optionIndex}].name`),
        color,
        description: typeof option.description === "string" ? option.description : "",
      };
    });
    if (dataType === "SINGLE_SELECT" && (!options || options.length === 0)) {
      throw new Error(`fields[${index}].options must be non-empty for SINGLE_SELECT`);
    }
    return {
      name: nonEmptyString(field.name, `fields[${index}].name`),
      dataType,
      options,
    };
  });
  const views = root.views.map((value, index) => {
    const view = record(value);
    const layout = nonEmptyString(view.layout, `views[${index}].layout`);
    if (!(layout in LAYOUTS)) throw new Error(`Unsupported view layout: ${layout}`);
    if (!Array.isArray(view.visibleFields) || !view.visibleFields.every((field) => typeof field === "string")) {
      throw new Error(`views[${index}].visibleFields must be a string array`);
    }
    if (view.sliceByReviewTypes !== undefined
      && (!Array.isArray(view.sliceByReviewTypes) || !view.sliceByReviewTypes.every((reviewType) => typeof reviewType === "string"))) {
      throw new Error(`views[${index}].sliceByReviewTypes must be a string array`);
    }
    return {
      name: nonEmptyString(view.name, `views[${index}].name`),
      layout: layout as ProjectTemplateManifest["views"][number]["layout"],
      filter: typeof view.filter === "string" ? view.filter : null,
      visibleFields: view.visibleFields as string[],
      sliceByField: typeof view.sliceByField === "string" ? view.sliceByField : null,
      sliceByReviewTypes: view.sliceByReviewTypes as string[] | undefined,
    };
  });
  return {
    version: Number(root.version),
    template: template === undefined ? undefined : {
      title: typeof template.title === "string" ? template.title : undefined,
      shortDescription: typeof template.shortDescription === "string" ? template.shortDescription : undefined,
      readme: typeof template.readme === "string" ? template.readme : undefined,
    },
    fields,
    views,
  };
}

export async function loadProjectTemplate(path: string): Promise<ProjectTemplateManifest> {
  return parseProjectTemplate(JSON.parse(await readFile(path, "utf8")) as unknown);
}

function optionsChanged(
  field: ProjectField,
  desired: NonNullable<ProjectTemplateManifest["fields"][number]["options"]>,
): boolean {
  const existing = field.options ?? [];
  return existing.length !== desired.length || desired.some((option, index) => {
    const current = existing[index];
    return current === undefined || current.name !== option.name || current.color !== option.color || (current.description ?? "") !== option.description;
  });
}

function resolveField(fields: ProjectField[], name: string): ProjectField {
  const field = fields.find((candidate) => candidate.name === name);
  if (!field) throw new Error(`Project template references missing field: ${name}`);
  return field;
}

export function projectTemplateViewConfig(
  fields: ProjectField[],
  view: ProjectTemplateManifest["views"][number],
): ViewConfig {
  const config: ViewConfig = {
    name: view.name,
    layout: LAYOUTS[view.layout]!,
    filter: view.filter ?? "",
    groupBy: [],
    verticalGroupBy: [],
    sortBy: [],
    visibleFields: view.visibleFields.map((name) => resolveField(fields, name).databaseId),
  };
  if (view.sliceByField && view.sliceByReviewTypes === undefined) {
    config.sliceBy = { field: resolveField(fields, view.sliceByField).databaseId, filter: "" };
  }
  return config;
}

export async function syncProjectTemplate(
  creds: GitHubCookies,
  owner: string,
  projectNumber: number,
  manifest: ProjectTemplateManifest,
): Promise<ProjectTemplateSyncSummary> {
  const project = await getProject(owner, projectNumber);
  const fieldsCreated: string[] = [];
  const fieldsUpdated: string[] = [];
  const viewsCreated: string[] = [];
  const viewsUpdated: string[] = [];
  const metadata = manifest.template ?? {};
  await updateProjectMetadata(project.id, {
    ...(metadata.title !== undefined && metadata.title !== project.title ? { title: metadata.title } : {}),
    ...(metadata.shortDescription !== undefined && metadata.shortDescription !== project.shortDescription
      ? { shortDescription: metadata.shortDescription }
      : {}),
    ...(metadata.readme !== undefined && metadata.readme !== project.readme ? { readme: metadata.readme } : {}),
  });

  let fields = await listProjectFields(owner, projectNumber);
  for (const desired of manifest.fields) {
    const existing = fields.find((field) => field.name === desired.name);
    if (!existing) {
      if (desired.dataType === "SINGLE_SELECT") {
        await createSingleSelectField(owner, projectNumber, desired.name, desired.options!);
      } else {
        await createTextField(owner, projectNumber, desired.name);
      }
      fieldsCreated.push(desired.name);
      continue;
    }
    if (existing.dataType !== desired.dataType) {
      throw new Error(`Field '${desired.name}' has type ${existing.dataType}, expected ${desired.dataType}`);
    }
    if (desired.dataType === "SINGLE_SELECT" && optionsChanged(existing, desired.options!)) {
      const idsByName = new Map((existing.options ?? []).map((option) => [option.name, option.id]));
      await setFieldOptions(owner, projectNumber, desired.name, desired.options!.map((option) => ({
        ...option,
        id: idsByName.get(option.name),
      })));
      fieldsUpdated.push(desired.name);
    }
  }

  fields = await listProjectFields(owner, projectNumber);
  const views = await listProjectViews(owner, projectNumber);
  for (const desired of manifest.views) {
    const existing = views.find((view) => view.name === desired.name);
    const config = projectTemplateViewConfig(fields, desired);
    if (existing) {
      await updateView(creds, owner, projectNumber, existing.number, config);
      viewsUpdated.push(desired.name);
    } else {
      await createView(creds, owner, projectNumber, config);
      viewsCreated.push(desired.name);
    }
  }
  if (!project.template) await markProjectAsTemplate(project.id);
  return {
    project: projectNumber,
    title: metadata.title ?? project.title,
    template: true,
    fieldsCreated,
    fieldsUpdated,
    viewsCreated,
    viewsUpdated,
  };
}
