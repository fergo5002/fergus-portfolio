"use client";
import "./instrument.css";
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { instrumentCopy as copy } from "@/content/tool-workbench";
import { acceptChips, screenFiles } from "@/lib/instrument/files";

/**
 * File intake, in two parts: `useIntake` owns the rule and the drop handling,
 * and `DropSlot` draws the designed control that replaces a stock
 * `<input type="file">`.
 *
 * **How a tool uses it**
 *
 * ```tsx
 * const intake = useIntake({ accept: ".txt,.json,.zip", onFiles: ([file]) => read(file) });
 *
 * <div className="studio" {...intake.stageProps}>       // the whole stage takes a drop
 *   <DropSlot intake={intake} id="lore-file" label="Import chat (.txt, .json, .zip)" />
 *   ...the instrument...
 * </div>
 * ```
 *
 * - `stageProps` go on whatever should accept a drop, usually the tool's root.
 *   While a file is held over it the element carries `data-drop="over"`,
 *   `instrument.css` draws the glow, and the slot's hint reads "Drop to open".
 * - The native input is still there, behind a `<label>` styled as the button:
 *   the label opens the picker with no script at all, the input keeps its
 *   `id` and its label, and a browser check still reaches it with
 *   `getByLabel(label).setInputFiles(...)`. Keyboard focus lands on the input
 *   and the label draws the focus ring.
 * - Everything, dropped or picked, goes through `screenFiles`
 *   (`lib/instrument/files.ts`). A refused file is named in a `role="alert"`
 *   line and never reaches `onFiles`.
 * - `onDrop` takes a drop raw instead, for a tool that needs the
 *   `DataTransfer` (Atlas walks dropped folders). Screening is then its job.
 * - Extra pickers (a folder picker) go in as children: `<FilePicker intake={intake} directory ... />`.
 * - On a touch screen there is nothing to drag, so the "or drop it here" hint
 *   is hidden and the button opens the phone's own file sheet.
 */
export type IntakeOptions = {
  accept?: string;
  multiple?: boolean;
  maxBytes?: number;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  onDrop?: (data: DataTransfer) => void;
};

type StageProps = {
  onDragEnter: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  "data-drop"?: "over";
};

export type Intake = {
  accept: string;
  multiple: boolean;
  disabled: boolean;
  over: boolean;
  refusal: string;
  pick: (files: File[]) => void;
  clear: () => void;
  stageProps: StageProps;
};

function carriesFiles(event: DragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

export function useIntake(options: IntakeOptions): Intake {
  const { accept = "", multiple = false, maxBytes, disabled = false } = options;
  const [over, setOver] = useState(false);
  const [refusal, setRefusal] = useState("");
  const depth = useRef(0);
  const latest = useRef(options);
  latest.current = options;

  function pick(files: File[]) {
    const now = latest.current;
    const screened = screenFiles(files, { accept: now.accept ?? "", multiple: now.multiple ?? false, maxBytes: now.maxBytes });
    const first = screened.rejected[0];
    if (!first) setRefusal("");
    else if (first.reason === "type")
      setRefusal(copy.refusedType(first.file.name, copy.list(acceptChips(now.accept ?? ""))));
    else if (first.reason === "size") setRefusal(copy.refusedSize(first.file.name, copy.megabytes(now.maxBytes ?? 0)));
    else setRefusal(copy.refusedCount(screened.accepted[0]?.name ?? ""));
    if (screened.accepted.length) now.onFiles(screened.accepted);
  }

  const stageProps: StageProps = {
    onDragEnter(event) {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth.current += 1;
      if (!latest.current.disabled) setOver(true);
    },
    onDragOver(event) {
      if (!carriesFiles(event)) return;
      // Cancelling dragover is what makes this a drop target at all. It is
      // cancelled even while disabled, so a file let go here is ignored
      // rather than opened by the browser in place of the page.
      event.preventDefault();
      event.dataTransfer.dropEffect = latest.current.disabled ? "none" : "copy";
    },
    onDragLeave(event) {
      if (!carriesFiles(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setOver(false);
    },
    onDrop(event) {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      // A slot inside a stage that also takes drops must not deliver twice.
      event.stopPropagation();
      depth.current = 0;
      setOver(false);
      const now = latest.current;
      if (now.disabled) return;
      if (now.onDrop) now.onDrop(event.dataTransfer);
      else pick([...event.dataTransfer.files]);
    },
    "data-drop": over && !disabled ? "over" : undefined,
  };

  return { accept, multiple, disabled, over, refusal, pick, clear: () => setRefusal(""), stageProps };
}

export type FilePickerProps = {
  intake: Intake;
  id: string;
  label: string;
  accept?: string;
  multiple?: boolean;
  directory?: boolean;
  disabled?: boolean;
  variant?: "primary" | "quiet";
  className?: string;
};

/** One designed picker button over one native file input. */
export function FilePicker({
  intake,
  id,
  label,
  accept,
  multiple,
  directory = false,
  disabled,
  variant = "primary",
  className = "",
}: FilePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Not a React prop, so set as an attribute. Safari and Chrome both honour it.
    if (directory) inputRef.current?.setAttribute("webkitdirectory", "");
  }, [directory]);
  return (
    <span className={`inst-picker inst-picker--${variant}`}>
      <input
        ref={inputRef}
        id={id}
        className="inst-picker__input"
        type="file"
        accept={directory ? undefined : (accept ?? intake.accept) || undefined}
        multiple={directory || (multiple ?? intake.multiple)}
        disabled={disabled ?? intake.disabled}
        onChange={(event) => {
          const list = [...(event.target.files ?? [])];
          event.target.value = "";
          if (list.length) intake.pick(list);
        }}
      />
      <label className={`inst-picker__button ${className}`.trim()} htmlFor={id}>
        <svg className="inst-picker__glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          {directory ? <path d="M1.5 4.5h4l1.5 1.5h7.5v7.5h-13z" /> : <path d="M8 11V2.5M4.5 6 8 2.5 11.5 6M2.5 10.5v3h11v-3" />}
        </svg>
        <span>{label}</span>
      </label>
    </span>
  );
}

export type DropSlotProps = {
  intake: Intake;
  id: string;
  label: string;
  hint?: string;
  /** Make the slot itself a drop target, for a slot that is not inside a stage that already is. */
  zone?: boolean;
  disabled?: boolean;
  /** Extra class for the picker button, for a tool whose stylesheet names it. */
  pickerClassName?: string;
  className?: string;
  children?: ReactNode;
};

export default function DropSlot({
  intake,
  id,
  label,
  hint,
  zone = false,
  disabled,
  pickerClassName,
  className = "",
  children,
}: DropSlotProps) {
  const chips = acceptChips(intake.accept);
  return (
    <div className={`inst-drop ${className}`.trim()} {...(zone ? intake.stageProps : {})}>
      <div className="inst-drop__row">
        <FilePicker intake={intake} id={id} label={label} disabled={disabled} className={pickerClassName} />
        {children}
        <span className="inst-drop__or">{intake.over ? copy.dropOver : intake.multiple ? copy.dropHintMany : copy.dropHint}</span>
        {chips.length ? (
          <span className="inst-drop__chips">
            {chips.map((chip) => (
              <span key={chip} className="inst-chip">
                {chip}
              </span>
            ))}
          </span>
        ) : null}
      </div>
      {hint ? <p className="inst-drop__hint">{hint}</p> : null}
      <p className="inst-drop__refusal" role="alert">
        {intake.refusal}
      </p>
    </div>
  );
}
