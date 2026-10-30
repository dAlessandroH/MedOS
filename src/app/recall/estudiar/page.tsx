import { Suspense } from "react";
import { StudySession } from "@/features/recall/StudySession";

export default function StudyPage() {
  return (
    <Suspense fallback={<div className="h-72 animate-pulse rounded-xl bg-surface" />}>
      <StudySession />
    </Suspense>
  );
}
