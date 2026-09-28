import { describe, expect, it } from "vitest";
import { acceptChips, acceptsFile, extensionOf, parseAccept, screenFiles } from "./files";

/**
 * File intake for `DropSlot`. A drop bypasses the native picker's `accept`
 * filter entirely, so the same rule has to be applied by hand, and a file the
 * tool cannot read must be refused out loud rather than handed on.
 */

const file = (name: string, type = "", size = 10) => ({ name, type, size });

describe("extensionOf", () => {
  it("reads the last extension, lower-cased, with its dot", () => {
    expect(extensionOf("Connections.CSV")).toBe(".csv");
    expect(extensionOf("archive.tar.gz")).toBe(".gz");
  });

  it("returns nothing for a name with no extension or a dotfile", () => {
    expect(extensionOf("README")).toBe("");
    expect(extensionOf(".env")).toBe("");
  });
});

describe("parseAccept", () => {
  it("splits extensions, exact types and wildcards", () => {
    expect(parseAccept(".csv, text/csv, image/*")).toEqual({
      extensions: [".csv"],
      types: ["text/csv"],
      wildcards: ["image/"],
    });
  });

  it("normalises case and ignores empty entries", () => {
    expect(parseAccept(" .PDF,,.Png ")).toEqual({ extensions: [".pdf", ".png"], types: [], wildcards: [] });
  });
});

describe("acceptsFile", () => {
  it("accepts anything when there is no rule", () => {
    expect(acceptsFile(file("anything.bin"), "")).toBe(true);
  });

  it("matches on the extension whatever the browser says the type is", () => {
    // Windows with Excel installed calls a CSV application/vnd.ms-excel.
    expect(acceptsFile(file("export.csv", "application/vnd.ms-excel"), ".csv,text/csv")).toBe(true);
  });

  it("matches on an exact type and on a wildcard type", () => {
    expect(acceptsFile(file("data", "text/csv"), ".csv,text/csv")).toBe(true);
    expect(acceptsFile(file("photo.heic", "image/heic"), "image/*")).toBe(true);
  });

  it("refuses a file that matches nothing", () => {
    expect(acceptsFile(file("notes.docx", "application/vnd.openxmlformats"), ".txt,.json,.zip")).toBe(false);
    expect(acceptsFile(file("chat"), ".txt,.json,.zip")).toBe(false);
  });
});

describe("acceptChips", () => {
  it("turns an accept rule into short upper-case labels, one per format", () => {
    expect(acceptChips(".txt,.json,.zip")).toEqual(["TXT", "JSON", "ZIP"]);
  });

  it("folds a type into the extension that names the same format", () => {
    expect(acceptChips(".csv,text/csv")).toEqual(["CSV"]);
  });

  it("folds JPEG into JPG, so one format is one chip", () => {
    expect(acceptChips(".pdf,.png,.jpg,.jpeg")).toEqual(["PDF", "PNG", "JPG"]);
  });

  it("names a wildcard by its family", () => {
    expect(acceptChips("image/*")).toEqual(["IMAGE"]);
  });

  it("has no chips when anything is accepted", () => {
    expect(acceptChips("")).toEqual([]);
  });
});

describe("screenFiles", () => {
  it("passes the readable files and names the refused ones with a reason", () => {
    const result = screenFiles([file("a.csv"), file("b.docx"), file("c.csv", "", 900)], {
      accept: ".csv",
      maxBytes: 500,
      multiple: true,
    });
    expect(result.accepted.map((f) => f.name)).toEqual(["a.csv"]);
    expect(result.rejected).toEqual([
      { file: file("b.docx"), reason: "type" },
      { file: file("c.csv", "", 900), reason: "size" },
    ]);
  });

  it("keeps the first acceptable file for a single-file tool and refuses the rest as extra", () => {
    const result = screenFiles([file("x.docx"), file("a.csv"), file("b.csv")], { accept: ".csv", multiple: false });
    expect(result.accepted.map((f) => f.name)).toEqual(["a.csv"]);
    expect(result.rejected.map((r) => [r.file.name, r.reason])).toEqual([
      ["x.docx", "type"],
      ["b.csv", "count"],
    ]);
  });

  it("accepts everything when there is no rule and no size cap", () => {
    const all = [file("one.bin"), file("two")];
    expect(screenFiles(all, { multiple: true }).accepted).toEqual(all);
  });
});
