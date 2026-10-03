import { notFound } from "next/navigation";
import { AdminPlaceholderPage } from "@/components/admin-placeholder-page";
import { AdminShowcasePrototype } from "@/components/admin-showcase-prototype";
import { adminPlaceholderPages } from "@/lib/admin-console";
import { AdminVideoPrototype } from "@/components/admin-video-prototype";
import { AdminModulePrototype } from "@/components/admin-module-prototype";
import { AdminFlashcardPrototype } from "@/components/admin-flashcard-prototype";
import { AdminAudioPrototype, AdminReadingPrototype } from "@/components/admin-learning-question-prototype";

import { AdminMiniCheckpointPrototype, AdminTryoutPrototype } from "@/components/admin-assessment-prototype";
import { AdminCertificatePrototype } from "@/components/admin-certificate-prototype";
import { AdminNotificationPrototype } from "@/components/admin-notification-prototype";

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(adminPlaceholderPages).map((section) => ({ section }));
}

export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!Object.prototype.hasOwnProperty.call(adminPlaceholderPages, section)) notFound();
  if (section === "showcase") return <AdminShowcasePrototype />;
  if (section === "video-lesson") return <AdminVideoPrototype />;
  if (section === "modul") return <AdminModulePrototype />;
  if (section === "flashcard") return <AdminFlashcardPrototype />;
  if (section === "audio-question") return <AdminAudioPrototype />;
  if (section === "reading-question") return <AdminReadingPrototype />;
  if (section === "mini-checkpoint") return <AdminMiniCheckpointPrototype />;
  if (section === "try-out") return <AdminTryoutPrototype />;
  if (section === "sertifikat") return <AdminCertificatePrototype />;
  if (section === "notifikasi") return <AdminNotificationPrototype />;
  const page = adminPlaceholderPages[section];

  return <AdminPlaceholderPage current={`/admin/${section}`} title={page.title} description={page.description} />;
}
