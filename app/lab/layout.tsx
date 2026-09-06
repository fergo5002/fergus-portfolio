import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import "./lab.css";
import { ReviewProvider } from "@/components/lab/Review";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Local tool lab",
  robots: { index: false, follow: false },
};
export default function LabLayout({ children }: { children: ReactNode }) {
  if (process.env.FERGUSOS_LAB !== "1") notFound();
  return (
    <ReviewProvider>
      <div className="lab">{children}</div>
    </ReviewProvider>
  );
}
