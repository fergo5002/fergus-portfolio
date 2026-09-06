export type Snapshot = {
  format: "code-atlas-v1";
  files: { path: string; lines: number; bytes: number }[];
};
export function safePath(path: string) {
  if (
    path.includes("\\") ||
    path.startsWith("/") ||
    path.split("/").includes("..") ||
    path.includes("\0")
  )
    throw new Error("Unsafe archive path.");
  return path;
}
export function analyseFiles(
  files: { path: string; text: string }[],
): Snapshot {
  return {
    format: "code-atlas-v1",
    files: files
      .filter((f) => {
        safePath(f.path);
        return (
          !/(^|\/)(node_modules|\.git|\.next|dist|build|vendor)(\/|$)|(?:package-lock|yarn\.lock|pnpm-lock)|\.min\./.test(
            f.path,
          ) && !f.text.includes("\0")
        );
      })
      .map((f) => ({
        path: f.path,
        lines: f.text ? f.text.replace(/\n$/, "").split("\n").length : 0,
        bytes: new TextEncoder().encode(f.text).length,
      }))
      .sort((a, b) => a.path.localeCompare(b.path)),
  };
}
export function parseSnapshot(text: string): Snapshot {
  const v = JSON.parse(text);
  if (
    v?.format !== "code-atlas-v1" ||
    !Array.isArray(v.files) ||
    v.files.length > 5000 ||
    v.files.some(
      (f: Snapshot["files"][number]) =>
        typeof f.path !== "string" ||
        !Number.isInteger(f.lines) ||
        f.lines < 0 ||
        !Number.isFinite(f.bytes) ||
        f.bytes < 0,
    )
  )
    throw new Error("Invalid Code Atlas snapshot.");
  v.files.forEach((f: Snapshot["files"][number]) => safePath(f.path));
  return v;
}
export function compareSnapshots(before: Snapshot, after: Snapshot) {
  const a = new Map(before.files.map((f) => [f.path, f.lines])),
    b = new Map(after.files.map((f) => [f.path, f.lines]));
  return [...new Set([...a.keys(), ...b.keys()])]
    .map((path) => ({
      path,
      before: a.get(path) ?? 0,
      after: b.get(path) ?? 0,
      delta: (b.get(path) ?? 0) - (a.get(path) ?? 0),
    }))
    .filter((f) => f.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}
