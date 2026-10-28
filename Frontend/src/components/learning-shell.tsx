import Link from "next/link";
import type { ReactNode } from "react";
import { StudentHeaderActions } from "@/components/student-header-actions";
import { StudentBreadcrumb } from "@/components/student-breadcrumb";
import { StudentNavigation } from "@/components/student-navigation";
import type { Membership } from "@/lib/dashboard-mock";

export function LearningShell({ membership, level, chapter, current, breadcrumbLabel, children }: { membership: Membership; level: string; chapter: string; current: "overview" | "video" | "document" | "flashcards" | "audio" | "reading"; breadcrumbLabel: string; children: ReactNode }) {
  const query = `?membership=${membership}`;
  const journeyHref = `/journey/${level}${query}`;
  const levelLabel = level === "dasar" ? "Dasar Bahasa Jepang" : level === "ssw-pengolahan-makanan" ? "SSW Pengolahan Makanan" : level === "interview" ? "Interview" : level.toUpperCase();
  const chapterLabel = `Chapter ${chapter.replace(/^chapter-/, "")}`;
  const breadcrumbs = [
    { label: "Perjalanan Belajar", href: `/journey${query}` },
    { label: levelLabel, href: journeyHref },
    ...(current === "overview" ? [] : [{ label: chapterLabel, href: `/learn/${level}/${chapter}${query}` }]),
    { label: breadcrumbLabel },
  ];
  return (
    <div className="learning-shell student-shell">
      <StudentNavigation membership={membership} />
      <div className="learning-main"><header className="learning-topbar"><Link href={journeyHref}>← Journey</Link><StudentHeaderActions membership={membership} /></header><main className={current === "flashcards" ? "learning-content flashcard-page" : "learning-content"}><StudentBreadcrumb items={breadcrumbs} />{children}</main></div>
    </div>
  );
}
