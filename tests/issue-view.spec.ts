import { extractAdfText, formatValue } from "../src/platforms/jira/commands/issue.ts";

describe("formatValue", () => {
  it("returns primitives as strings", () => {
    expect(formatValue("hi")).toBe("hi");
    expect(formatValue(42)).toBe("42");
    expect(formatValue(true)).toBe("true");
  });

  it("returns empty string for null/undefined", () => {
    expect(formatValue(null)).toBe("");
    expect(formatValue(undefined)).toBe("");
  });

  it("prefers displayName for user objects", () => {
    expect(formatValue({ displayName: "Jey Lim", emailAddress: "jey@ex.com", accountId: "abc" })).toBe("Jey Lim");
  });

  it("prefers value for option objects", () => {
    expect(formatValue({ value: "Shome HMS", id: "10234" })).toBe("Shome HMS");
  });

  it("falls back to name when no value/displayName", () => {
    expect(formatValue({ name: "In Progress", id: "3" })).toBe("In Progress");
  });

  it("joins arrays with comma", () => {
    expect(formatValue([{ value: "A" }, { value: "B" }])).toBe("A, B");
    expect(formatValue(["tag1", "tag2"])).toBe("tag1, tag2");
  });

  it("filters empty values from arrays", () => {
    expect(formatValue([{ value: "A" }, null, { value: "B" }])).toBe("A, B");
  });

  it("extracts text from ADF objects", () => {
    const adf = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }],
    };
    expect(formatValue(adf)).toBe("hello");
  });

  it("falls back to JSON for unknown shapes", () => {
    expect(formatValue({ weird: { shape: 1 } })).toBe('{"weird":{"shape":1}}');
  });
});

describe("extractAdfText", () => {
  it("returns empty string for null/undefined", () => {
    expect(extractAdfText(null)).toBe("");
    expect(extractAdfText(undefined)).toBe("");
  });

  it("extracts text from a single paragraph", () => {
    const adf = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "hello world" }] }],
    };
    expect(extractAdfText(adf)).toBe("hello world");
  });

  it("preserves paragraph breaks", () => {
    const adf = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "line1" }] },
        { type: "paragraph", content: [{ type: "text", text: "line2" }] },
      ],
    };
    expect(extractAdfText(adf)).toBe("line1\nline2");
  });

  it("treats hardBreak as a newline within a paragraph", () => {
    const adf = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "a" },
            { type: "hardBreak" },
            { type: "text", text: "b" },
          ],
        },
      ],
    };
    expect(extractAdfText(adf)).toBe("a\nb");
  });

  it("renders mentions as @displayName", () => {
    const adf = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "cc " },
            { type: "mention", attrs: { id: "abc", text: "@Alice" } },
            { type: "text", text: " please" },
          ],
        },
      ],
    };
    expect(extractAdfText(adf)).toBe("cc @Alice please");
  });

  it("handles headings and list items", () => {
    const adf = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Title" }] },
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }] },
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "two" }] }] },
          ],
        },
      ],
    };
    const out = extractAdfText(adf);
    expect(out).toContain("Title");
    expect(out).toContain("one");
    expect(out).toContain("two");
  });

  it("collapses 3+ consecutive newlines to 2", () => {
    const adf = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "a" }] },
        { type: "paragraph", content: [] },
        { type: "paragraph", content: [] },
        { type: "paragraph", content: [{ type: "text", text: "b" }] },
      ],
    };
    expect(extractAdfText(adf)).not.toMatch(/\n{3,}/);
  });
});
