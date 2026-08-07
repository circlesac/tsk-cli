import { describe, expect, it } from "vitest";
import { parseProjectTemplate, projectTemplateViewConfig } from "../../../src/platforms/github/project-template.js";

describe("parseProjectTemplate", () => {
  it("accepts metadata, fields, and file-defined Slice by views", () => {
    const template = parseProjectTemplate({
      version: 6,
      template: { title: "DV Review · UART", shortDescription: "Review workflow" },
      fields: [{
        name: "Gap class",
        dataType: "SINGLE_SELECT",
        options: [{ name: "source_gap", color: "RED", description: "Source gap" }],
      }, { name: "Subject", dataType: "TEXT" }],
      views: [{
        name: "Overview",
        layout: "TABLE_LAYOUT",
        filter: null,
        visibleFields: ["Title", "Gap class", "Subject"],
        sliceByField: "Gap class",
        sliceByReviewTypes: ["gap_finding"],
      }],
    });
    expect(template.template?.title).toBe("DV Review · UART");
    expect(template.fields[0]?.options?.[0]?.color).toBe("RED");
    expect(template.views[0]?.sliceByField).toBe("Gap class");
    expect(template.views[0]?.sliceByReviewTypes).toEqual(["gap_finding"]);
    expect(projectTemplateViewConfig([
      { id: "field", databaseId: 1, name: "Gap class", dataType: "SINGLE_SELECT", options: [] },
      { id: "subject", databaseId: 2, name: "Subject", dataType: "TEXT" },
      { id: "title", databaseId: 3, name: "Title", dataType: "TITLE" },
    ], template.views[0]!)).not.toHaveProperty("sliceBy");
  });

  it("rejects a single-select field without options", () => {
    expect(() => parseProjectTemplate({
      version: 1,
      fields: [{ name: "Gap class", dataType: "SINGLE_SELECT" }],
      views: [],
    })).toThrow(/options must be non-empty/);
  });
});
