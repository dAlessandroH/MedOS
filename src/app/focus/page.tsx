import { Suspense } from "react";
import { FocusView } from "@/features/focus/FocusView";

export default function FocusPage() {
  return (
    <Suspense fallback={<div className="h-72 animate-pulse rounded-xl bg-surface" />}>
      <FocusView />
    </Suspense>
  );
}
