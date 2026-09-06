"use client";
import {
  cloneElement,
  useId,
  useState,
  type ReactNode,
  type ReactElement,
} from "react";
import { common } from "@/content/lab/copy";
export function Button({
  children,
  onClick,
  disabled = false,
  primary = false,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      className={`bench-button ${primary ? "bench-button--primary" : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactElement<{ id?: string }>;
}) {
  const id = useId();
  return (
    <div className="lab-field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, { id })}
    </div>
  );
}
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        value={Number.isFinite(value) ? value : ""}
        min={min}
        max={max}
        step={step}
        onChange={(e) =>
          onChange(e.target.value === "" ? NaN : Number(e.target.value))
        }
      />
    </Field>
  );
}
export function ErrorMessage({ error }: { error: string }) {
  return error ? (
    <p role="alert" className="lab-error">
      {error}
    </p>
  ) : null;
}
export function useAction() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function act(fn: () => void | Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return { error, busy, act, setError };
}
export function FileInput({
  label,
  accept,
  onFile,
  disabled = false,
}: {
  label: string;
  accept: string;
  onFile: (file: File) => void;
  disabled?: boolean;
}) {
  return (
    <Field label={label}>
      <input
        disabled={disabled}
        type="file"
        accept={accept}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
    </Field>
  );
}
export async function readText(file: File, max = 5_000_000) {
  if (file.size > max)
    throw new Error(`File exceeds the ${max / 1_000_000} MB limit.`);
  return file.text();
}
export function download(
  name: string,
  data: string | Blob,
  type = "application/json",
) {
  const blob = typeof data === "string" ? new Blob([data], { type }) : data,
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function jsonDownload(name: string, data: unknown) {
  download(name, JSON.stringify(data, null, 2));
}
export function csvCell(v: unknown) {
  const text = String(v ?? "");
  return `"${(/^[=+\-@\t\r]/.test(text) ? "'" : "") + text.replaceAll('"', '""')}"`;
}
export function Metrics({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="lab-metrics">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
export function Bars({
  title,
  items,
}: {
  title: string;
  items: { label: string; value: number }[];
}) {
  const max = Math.max(1, ...items.map((i) => Math.abs(i.value)));
  return (
    <section className="lab-chart">
      <h3>{title}</h3>
      <div className="lab-bars">
        {items.map((i, n) => (
          <div className="lab-bar" key={n}>
            <span title={i.label}>{i.label}</span>
            <div>
              <i
                style={{
                  width: `${Math.max(0, (Math.abs(i.value) / max) * 100)}%`,
                }}
              />
            </div>
            <b>{Number(i.value.toFixed(1)).toLocaleString("en-GB")}</b>
          </div>
        ))}
      </div>
    </section>
  );
}
export function LineChart({
  title,
  values,
  baseline,
  axis,
}: {
  title: string;
  values: number[];
  baseline?: number[];
  axis?: string;
}) {
  const id = useId(),
    max = Math.max(1, ...values, ...(baseline ?? [])),
    points = (v: number[]) =>
      v
        .map(
          (y, i) =>
            `${40 + (i / (Math.max(values.length, baseline?.length ?? 0) - 1 || 1)) * 700},${190 - (y / max) * 160}`,
        )
        .join(" ");
  return (
    <figure className="lab-chart">
      <figcaption id={id}>{title}</figcaption>
      <svg viewBox="0 0 780 240" role="img" aria-labelledby={id}>
        <path
          d="M40 20V190H750"
          fill="none"
          stroke="currentColor"
          opacity=".4"
        />
        {baseline && (
          <polyline
            points={points(baseline)}
            fill="none"
            stroke="var(--amber)"
            strokeWidth="2"
          />
        )}
        <polyline
          points={points(values)}
          fill="none"
          stroke="var(--green-bright)"
          strokeWidth="3"
        />
        <text x="4" y="35">
          {Math.ceil(max)}
        </text>
        <text x="18" y="194">
          0
        </text>
        <text x="300" y="228">
          {axis ?? common.count}
        </text>
      </svg>
    </figure>
  );
}
export const fmt = (n: number, digits = 1) =>
  n.toLocaleString("en-GB", { maximumFractionDigits: digits });
export const dateTime = (n: number) =>
  new Date(n).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
export function xml(text: string) {
  return text.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
}
