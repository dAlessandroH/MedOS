import { Suspense } from "react";
import { DeckView } from "@/features/recall/DeckView";

export default function DeckPage() {
  return (
    <Suspense fallback={<div className="h-60 animate-pulse rounded-xl bg-surface" />}>
      <DeckView />
    </Suspense>
  );
}
