import type { ReactNode } from "react";
import type { AssessmentImage } from "@/lib/assessment-image";
import { contentMedia } from "@/lib/public-content-api";

export function AssessmentContent({ content, children }: { content: AssessmentImage; children: ReactNode }) {
  const url = content.image_resolved_url === null ? "" : contentMedia(content.image, content.image_resolved_url);
  if (!url && !content.image) return <>{children}</>;
  // ponytail: native img skips image optimization; use Next Image when remote media hosts are configured.
  // eslint-disable-next-line @next/next/no-img-element
  const image = url ? <img className="assessment-content-image" src={url} alt={content.image_alt ?? ""} style={{ maxWidth: "100%", height: "auto" }} /> : <p role="status">Gambar tidak tersedia.</p>;
  return content.image_position === "after" ? <>{children}{image}</> : <>{image}{children}</>;
}
