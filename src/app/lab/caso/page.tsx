import { Suspense } from "react";
import { CaseView } from "@/features/lab/CaseView";

export default function CasePage() {
  return (
    <Suspense fallback={<div className="h-72 animate-pulse rounded-xl bg-surface" />}>
      <CaseView />
    </Suspense>
  );
}
