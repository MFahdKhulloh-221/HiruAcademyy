import Link from "next/link";
import type { ReactNode } from "react";
import { StudentTopbar } from "@/components/student-topbar";
import { StudentBreadcrumb } from "@/components/student-breadcrumb";
import { StudentNavigation } from "@/components/student-navigation";
import videoStyles from "./learning-video.module.css";
import flashcardStyles from "./flashcard-session.module.css";
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
      <div className="learning-main"><StudentTopbar membership={membership}><Link href={journeyHref}>← {current === "video" ? "Perjalanan Belajar" : "Journey"}</Link></StudentTopbar><main className={current === "flashcards" ? `learning-content flashcard-page ${flashcardStyles.content}` : current === "video" ? `learning-content ${videoStyles.content}` : "learning-content"}>{current !== "flashcards" && <StudentBreadcrumb items={breadcrumbs} />}{children}</main></div>
    </div>
  );
}
