"use client";
import {
  createContext,
  useContext,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import { labCopy as c } from "@/content/lab";
import { Field } from "./shared";
type ReviewState = {
  selected: string[];
  setSelected: Dispatch<SetStateAction<string[]>>;
  notes: Record<string, string>;
  setNotes: Dispatch<SetStateAction<Record<string, string>>>;
};
const Context = createContext<ReviewState | null>(null);
export function ReviewProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<string[]>([]),
    [notes, setNotes] = useState<Record<string, string>>({});
  return (
    <Context.Provider value={{ selected, setSelected, notes, setNotes }}>
      {children}
    </Context.Provider>
  );
}
export function useReview() {
  const state = useContext(Context);
  if (!state) throw new Error("Review controls need the local lab provider.");
  return state;
}
export function ReviewControls({ slug }: { slug: string }) {
  const { selected, setSelected, notes, setNotes } = useReview();
  return (
    <section className="lab-panel lab-review">
      <h2>{c.review}</h2>
      <p className="lab-note">{c.reviewNote}</p>
      <Field label={c.notes}>
        <textarea
          value={notes[slug] ?? ""}
          onChange={(e) => setNotes({ ...notes, [slug]: e.target.value })}
        />
      </Field>
      <div className="lab-actions">
        <button
          className="bench-button"
          aria-pressed={selected.includes(slug)}
          onClick={() =>
            setSelected((s) =>
              s.includes(slug) ? s.filter((x) => x !== slug) : [...s, slug],
            )
          }
        >
          {selected.includes(slug) ? c.selected : c.select}
        </button>
      </div>
    </section>
  );
}
