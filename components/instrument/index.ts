/**
 * The controls kit. Every control is a styled native element underneath, so
 * keyboard, touch and screen-reader behaviour stay the browser's own, and
 * every browser check that reaches a native control still reaches these.
 *
 *   Knob        rotary, a range input under a dial (drag, focused wheel, keys)
 *   Slider      linear, a range input with its track and thumb redrawn
 *   Segmented   one of a few, a radiogroup of native radios
 *   Toggle      on or off, a button with role="switch"
 *   DropSlot    file intake, a label over a native file input; useIntake
 *               makes any element (the whole stage) a drop target
 *   FilePicker  one extra picker inside a DropSlot (a folder picker)
 *   ExportBar   labelled download buttons with drawn format glyphs
 *   DateRange   presets plus two thumbs; replaces stock date inputs
 *   Select      a styled native select, for lists too long for Segmented
 *
 * Words the kit says itself live in `content/tool-workbench.ts`
 * (`instrumentCopy`); labels are always the tool's. Arithmetic lives in
 * `lib/instrument/`. Styles live in `./instrument.css` and read only the
 * shell's tokens, so all three themes follow.
 */
export { default as Knob, type KnobProps } from "./Knob";
export { default as Slider, type SliderProps } from "./Slider";
export { default as Segmented, type SegmentedOption, type SegmentedProps } from "./Segmented";
export { default as Toggle, type ToggleProps } from "./Toggle";
export {
  default as DropSlot,
  FilePicker,
  useIntake,
  type DropSlotProps,
  type FilePickerProps,
  type Intake,
  type IntakeOptions,
} from "./DropSlot";
export { default as ExportBar, type ExportAction, type ExportKind } from "./ExportBar";
export { default as DateRange } from "./DateRange";
export { default as Select } from "./Select";
