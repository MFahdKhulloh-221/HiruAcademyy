export type AssessmentPassageBlock =
  | { type: "text"; text: string }
  | { type: "image"; image: string; image_alt: string; image_resolved_url?: string | null };

export type AssessmentImage = {
  image?: string | null;
  image_alt?: string | null;
  image_position?: "before" | "after" | null;
  image_resolved_url?: string | null;
};
