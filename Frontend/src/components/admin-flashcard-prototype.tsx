"use client";

import { AdminShell } from "@/components/admin-primitives";
import { AdminCanonicalCurriculum } from "@/components/admin-canonical-curriculum";

export function AdminFlashcardPrototype() {
  return <AdminShell current="/admin/flashcard"><main className="admin-public-prototype"><AdminCanonicalCurriculum flashcards /></main></AdminShell>;
}
