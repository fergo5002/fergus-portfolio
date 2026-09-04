import ToolPage from "@/components/tools/ToolPage";
import { secondVisit as tool } from "@/content/tools/second-visit";

/** The full browser-only island is added after the model and its oracle exist. */
export default function SecondVisitPage() {
  return <ToolPage tool={tool}><div /></ToolPage>;
}
