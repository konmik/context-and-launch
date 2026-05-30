import { describe, it, expect } from "vitest";
import {
  isImage, isText, activeFileLabel, isActiveFileMatch,
  buildContextOptions, buildFileEntryOptions, buildReferenceOptions,
  buildAllFileOptions, isReadOnly, checkReferenceStale,
  hasUnsavedEditorChanges, normalizeLineEndings, slugifyFileName,
  wouldOverwrite, ticketApiUrl, resolveFileViewMode, showSaveButton,
} from "./ticket-detail-pure.js";

describe("isImage", () => {
  it("recognizes png", () => expect(isImage("photo.png")).toBe(true));
  it("recognizes jpg", () => expect(isImage("photo.JPG")).toBe(true));
  it("rejects txt", () => expect(isImage("file.txt")).toBe(false));
  it("rejects no extension", () => expect(isImage("readme")).toBe(false));
});

describe("isText", () => {
  it("recognizes md", () => expect(isText("notes.md")).toBe(true));
  it("recognizes txt", () => expect(isText("log.txt")).toBe(true));
  it("rejects png", () => expect(isText("photo.png")).toBe(false));
});

describe("activeFileLabel", () => {
  it("adds .md for context files", () => {
    expect(activeFileLabel({ type: "context", name: "to-do" })).toBe("to-do.md");
  });
  it("returns name for file entries", () => {
    expect(activeFileLabel({ type: "file", name: "data.json" })).toBe("data.json");
  });
  it("extracts basename for reference with forward slashes", () => {
    expect(activeFileLabel({ type: "reference", path: "/home/user/file.ts" })).toBe("file.ts");
  });
  it("extracts basename for reference with backslashes", () => {
    expect(activeFileLabel({ type: "reference", path: "C:\\Users\\file.ts" })).toBe("file.ts");
  });
  it("falls back to full path if basename is empty", () => {
    expect(activeFileLabel({ type: "reference", path: "/" })).toBe("/");
  });
});

describe("isActiveFileMatch", () => {
  it("matches context files by name", () => {
    expect(isActiveFileMatch(
      { type: "context", name: "to-do" },
      { type: "context", name: "to-do" },
    )).toBe(true);
  });
  it("does not match different context names", () => {
    expect(isActiveFileMatch(
      { type: "context", name: "to-do" },
      { type: "context", name: "prd" },
    )).toBe(false);
  });
  it("matches file entries by name", () => {
    expect(isActiveFileMatch(
      { type: "file", name: "data.json" },
      { type: "file", name: "data.json" },
    )).toBe(true);
  });
  it("matches references by path", () => {
    expect(isActiveFileMatch(
      { type: "reference", path: "/a/b" },
      { type: "reference", path: "/a/b" },
    )).toBe(true);
  });
  it("does not match different types", () => {
    expect(isActiveFileMatch(
      { type: "context", name: "to-do" },
      { type: "file", name: "to-do" },
    )).toBe(false);
  });
});

describe("buildContextOptions", () => {
  it("includes defaults and deduplicates existing/extra", () => {
    const result = buildContextOptions(
      ["to-do", "prd"],
      ["to-do", "notes"],
      ["design"],
    );
    expect(result).toEqual([
      { type: "context", name: "to-do" },
      { type: "context", name: "prd" },
      { type: "context", name: "notes" },
      { type: "context", name: "design" },
    ]);
  });
});

describe("buildFileEntryOptions", () => {
  it("filters out .md and status.json", () => {
    const result = buildFileEntryOptions(["data.json", "notes.md", "status.json", "image.png"]);
    expect(result).toEqual([
      { type: "file", name: "data.json" },
      { type: "file", name: "image.png" },
    ]);
  });
});

describe("buildReferenceOptions", () => {
  it("maps references to ActiveFile", () => {
    const result = buildReferenceOptions([
      { path: "/a/b.ts", exists: true },
      { path: "/c/d.ts", exists: false },
    ]);
    expect(result).toEqual([
      { type: "reference", path: "/a/b.ts" },
      { type: "reference", path: "/c/d.ts" },
    ]);
  });
});

describe("buildAllFileOptions", () => {
  it("concatenates all option types", () => {
    const ctx = [{ type: "context" as const, name: "a" }];
    const files = [{ type: "file" as const, name: "b" }];
    const refs = [{ type: "reference" as const, path: "/c" }];
    expect(buildAllFileOptions(ctx, files, refs)).toEqual([...ctx, ...files, ...refs]);
  });
});

describe("isReadOnly", () => {
  it("returns true for reference", () => {
    expect(isReadOnly({ type: "reference", path: "/a" })).toBe(true);
  });
  it("returns true for file", () => {
    expect(isReadOnly({ type: "file", name: "data.json" })).toBe(true);
  });
  it("returns false for context", () => {
    expect(isReadOnly({ type: "context", name: "to-do" })).toBe(false);
  });
});

describe("checkReferenceStale", () => {
  it("returns true when reference exists but file does not", () => {
    expect(checkReferenceStale(
      [{ path: "/a", exists: false }],
      "/a",
    )).toBe(true);
  });
  it("returns false when reference file exists", () => {
    expect(checkReferenceStale(
      [{ path: "/a", exists: true }],
      "/a",
    )).toBe(false);
  });
  it("returns false when reference path not found", () => {
    expect(checkReferenceStale([], "/missing")).toBe(false);
  });
});

describe("hasUnsavedEditorChanges", () => {
  it("returns true when on editor tab with changes", () => {
    expect(hasUnsavedEditorChanges("editor", "editor", false, "new", "old")).toBe(true);
  });
  it("returns false when content matches saved", () => {
    expect(hasUnsavedEditorChanges("editor", "editor", false, "same", "same")).toBe(false);
  });
  it("returns false when read-only", () => {
    expect(hasUnsavedEditorChanges("editor", "editor", true, "new", "old")).toBe(false);
  });
  it("returns false on launcher tab", () => {
    expect(hasUnsavedEditorChanges("launcher", "editor", false, "new", "old")).toBe(false);
  });
  it("returns false when viewing image", () => {
    expect(hasUnsavedEditorChanges("editor", "image", false, "new", "old")).toBe(false);
  });
});

describe("normalizeLineEndings", () => {
  it("converts CRLF to LF", () => {
    expect(normalizeLineEndings("a\r\nb\r\n")).toBe("a\nb\n");
  });
  it("preserves LF-only content", () => {
    expect(normalizeLineEndings("a\nb\n")).toBe("a\nb\n");
  });
  it("handles empty string", () => {
    expect(normalizeLineEndings("")).toBe("");
  });
  it("handles string without newlines", () => {
    expect(normalizeLineEndings("hello")).toBe("hello");
  });
});

describe("slugifyFileName", () => {
  it("slugifies normal input", () => {
    expect(slugifyFileName("My Design Notes")).toBe("my-design-notes");
  });
  it("returns empty for empty input", () => {
    expect(slugifyFileName("")).toBe("");
  });
  it("returns empty for whitespace-only", () => {
    expect(slugifyFileName("   ")).toBe("");
  });
  it("returns empty when slugified result is empty", () => {
    expect(slugifyFileName("!!!")).toBe("");
  });
  it("trims leading/trailing hyphens", () => {
    expect(slugifyFileName("--hello--")).toBe("hello");
  });
});

describe("wouldOverwrite", () => {
  it("returns true when file name matches existing file", () => {
    expect(wouldOverwrite("data.json", ["data.json"], [])).toBe(true);
  });
  it("returns true when file name matches context with .md", () => {
    expect(wouldOverwrite("to-do.md", [], ["to-do"])).toBe(true);
  });
  it("returns false when no match", () => {
    expect(wouldOverwrite("new.txt", ["data.json"], ["to-do"])).toBe(false);
  });
});

describe("ticketApiUrl", () => {
  it("builds the correct URL", () => {
    expect(ticketApiUrl("my-project", "001-ticket", "context/to-do"))
      .toBe("/api/projects/my-project/board/tickets/001-ticket/context/to-do");
  });
});

describe("resolveFileViewMode", () => {
  it("returns image for png", () => {
    expect(resolveFileViewMode("photo.png")).toBe("image");
  });
  it("returns editor for md", () => {
    expect(resolveFileViewMode("notes.md")).toBe("editor");
  });
  it("returns unsupported for unknown", () => {
    expect(resolveFileViewMode("data.bin")).toBe("unsupported");
  });
});

describe("showSaveButton", () => {
  it("returns true for editor tab with context file", () => {
    expect(showSaveButton("editor", "context")).toBe(true);
  });
  it("returns false for launcher tab", () => {
    expect(showSaveButton("launcher", "context")).toBe(false);
  });
  it("returns false for file type", () => {
    expect(showSaveButton("editor", "file")).toBe(false);
  });
});
