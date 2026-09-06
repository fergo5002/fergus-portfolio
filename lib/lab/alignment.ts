export type Answers = Record<string, string | number>;
export function compareAnswers(a: Answers, b: Answers) {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter((key) => a[key] !== b[key])
    .map((key) => ({
      key,
      a: a[key] ?? "Not answered",
      b: b[key] ?? "Not answered",
      distance:
        typeof a[key] === "number" && typeof b[key] === "number"
          ? Math.abs(Number(a[key]) - Number(b[key]))
          : 0,
    }))
    .sort((a, b) => b.distance - a.distance);
}
export function parseAnswerFile(text: string): {
  format: "same-page-v1";
  name: string;
  answers: Answers;
} {
  const v = JSON.parse(text);
  if (
    v?.format !== "same-page-v1" ||
    typeof v.name !== "string" ||
    !v.answers ||
    Array.isArray(v.answers) ||
    typeof v.answers !== "object" ||
    Object.values(v.answers).some(
      (x) =>
        typeof x !== "string" && (typeof x !== "number" || !Number.isFinite(x)),
    )
  )
    throw new Error("Use a Same Page answer file.");
  return v;
}
