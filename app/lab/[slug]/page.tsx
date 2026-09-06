import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import ToolPage from "@/components/tools/ToolPage";
import Workbench from "@/components/lab/Workbench";
import { ReviewControls } from "@/components/lab/Review";
import { labTools, labCopy } from "@/content/lab";
export default async function PrototypePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (slug === "code-atlas") redirect("/lab/atlas");
  const index = labTools.findIndex((t) => t.slug === slug),
    tool = labTools[index];
  if (!tool) notFound();
  return (
    <>
      <div className="lab-top">
        <span>{labCopy.badge}</span>
        <span>
          {index + 1} / {labTools.length}
        </span>
      </div>
      <ToolPage tool={tool} localReview>
        <Workbench slug={slug} />
      </ToolPage>
      <ReviewControls slug={slug} />
      <nav className="lab-actions lab-next" aria-label={labCopy.back}>
        <Link
          href={`/lab/${labTools[(index + labTools.length - 1) % labTools.length].slug}`}
        >
          {labCopy.previous}:{" "}
          {labTools[(index + labTools.length - 1) % labTools.length].name}
        </Link>
        <Link href={`/lab/${labTools[(index + 1) % labTools.length].slug}`}>
          {labCopy.next}: {labTools[(index + 1) % labTools.length].name}
        </Link>
      </nav>
    </>
  );
}
